"""Regression checks for the teacher/admin issues reported in Issues.pdf."""

import json
from datetime import date

import pytest
import httpx
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.config import settings
from app.core.error_codes import ErrorCode
from app.core.pdf import render_result_card_pdf
from app.modules.messaging.models import MessageLog, MessageTemplate
from app.modules.messaging.routes import render_and_dispatch
from app.modules.auth.models import User, UserPermission, UserRole, UserStatus
from app.modules.finance.models import Donation, Donor, Payment, PaymentCategory
from app.modules.people.models import Guardian, StudentProfile


async def _grant_scoped(db_sessionmaker, seed, code: str, class_id) -> None:
    async with db_sessionmaker() as db:
        db.add(
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code=code,
                granted_by_id=seed.principal.id,
                scope_type="class",
                scope_id=class_id,
            )
        )
        await db.commit()


async def test_scoped_resource_grant_allows_category_and_in_scope_resource(
    teacher_client, seed, db_sessionmaker,
):
    await _grant_scoped(db_sessionmaker, seed, "resources.manage", seed.class_a.id)

    category_response = await teacher_client.post(
        "/api/v1/operations/resource-categories", json={"name": "Class A handouts"}
    )
    assert category_response.status_code == 200, category_response.text

    response = await teacher_client.post(
        "/api/v1/operations/resources",
        json={
            "category_id": category_response.json()["id"],
            "title": "Assigned section worksheet",
            "video_url": "https://example.com/lesson",
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    assert response.status_code == 200, response.text


async def test_scoped_form_grant_allows_in_scope_form(
    teacher_client, seed, db_sessionmaker,
):
    await _grant_scoped(db_sessionmaker, seed, "forms.create", seed.class_a.id)

    response = await teacher_client.post(
        "/api/v1/operations/forms",
        json={
            "title": "Assigned section survey",
            "fields": [{"key": "answer", "label": "Answer", "type": "text"}],
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    assert response.status_code == 200, response.text


async def test_walk_in_admission_requires_admissions_permission(teacher_client, seed):
    response = await teacher_client.post(
        "/api/v1/operations/admissions",
        json={
            "applicant_name": "Unprivileged applicant",
            "guardian_contact": "03001234567",
            "program_id": str(seed.program.id),
        },
    )
    assert response.status_code == 403


async def test_teacher_attendance_is_section_scoped(teacher_client, client, seed):
    profile = await teacher_client.get("/api/v1/auth/me")
    assert profile.status_code == 200, profile.text
    assert profile.json()["has_teaching_assignment"] is True

    choices = await teacher_client.get("/api/v1/attendance/classes")
    assert choices.status_code == 200, choices.text
    assert [row["id"] for row in choices.json()] == [str(seed.class_a.id)]
    assert [section["id"] for section in choices.json()[0]["sections"]] == [
        str(seed.sections.a1.id)
    ]

    assigned = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={"section_id": str(seed.sections.a1.id)},
    )
    assert assigned.status_code == 200, assigned.text
    assert {student["section_id"] for student in assigned.json()["students"]} == {
        str(seed.sections.a1.id)
    }

    denied = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={"section_id": str(seed.sections.a2.id)},
    )
    assert denied.status_code == 403

    unscoped_history = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/history"
    )
    assert unscoped_history.status_code == 403

    assigned_history = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/history",
        params={"section_id": str(seed.sections.a1.id)},
    )
    assert assigned_history.status_code == 200, assigned_history.text

    unscoped_student_history = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[1].id}/history"
    )
    assert unscoped_student_history.status_code == 403

    principal = await client.get("/api/v1/attendance/classes")
    principal_class = next(row for row in principal.json() if row["id"] == str(seed.class_a.id))
    assert {section["id"] for section in principal_class["sections"]} == {
        str(seed.sections.a1.id), str(seed.sections.a2.id)
    }


async def test_assigned_teacher_dashboard_loads_through_public_route(teacher_client, seed):
    response = await teacher_client.get("/api/v1/reporting/dashboard")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["role"] == "teacher"
    assert payload["my_classes"] == [
        {
            "class_id": str(seed.class_a.id),
            "course_id": str(seed.course.id),
            "section_id": str(seed.sections.a1.id),
            "class_name": "Class 1",
            "course_name": "Nazra",
            "section_name": "Alif",
        }
    ]


async def test_teacher_report_scope_matches_timetable_assignment(teacher_client, seed):
    assigned = await teacher_client.get(
        "/api/v1/reporting/reports/attendance",
        params={
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a1.id),
            "start_date": "2024-04-01",
            "end_date": "2024-04-30",
        },
    )
    assert assigned.status_code == 200, assigned.text

    outside_scope = await teacher_client.get(
        "/api/v1/reporting/reports/attendance",
        params={
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a2.id),
            "start_date": "2024-04-01",
            "end_date": "2024-04-30",
        },
    )
    assert outside_scope.status_code == 403
    assert outside_scope.json()["detail"] == "report_section_not_assigned"


async def test_course_names_are_unique_per_madrasa(client):
    first = await client.post("/api/v1/academics/courses", json={"name": "Tajweed"})
    assert first.status_code == 200, first.text

    duplicate = await client.post("/api/v1/academics/courses", json={"name": "  tajWEED  "})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "course_name_exists"


async def test_grading_scheme_and_exam_type_can_be_edited_and_deleted(client, seed):
    scheme = await client.post(
        "/api/v1/assessments/grading-schemes",
        json={"name": "Simple", "bands": [{"label": "Pass", "min_score": 0, "max_score": 100}]},
    )
    assert scheme.status_code == 200, scheme.text
    scheme_id = scheme.json()["id"]

    updated_scheme = await client.put(
        f"/api/v1/assessments/grading-schemes/{scheme_id}",
        json={"name": "Simple grading", "bands": [{"label": "Complete", "min_score": 0, "max_score": 100}]},
    )
    assert updated_scheme.status_code == 200, updated_scheme.text
    assert updated_scheme.json()["name"] == "Simple grading"

    exam = await client.post(
        "/api/v1/assessments/exam-types",
        json={
            "course_id": str(seed.course.id),
            "name": "Oral",
            "weightage": 40,
            "grading_scheme_id": scheme_id,
        },
    )
    assert exam.status_code == 200, exam.text
    exam_id = exam.json()["id"]

    updated_exam = await client.put(
        f"/api/v1/assessments/exam-types/{exam_id}",
        json={"name": "Oral assessment", "weightage": 50},
    )
    assert updated_exam.status_code == 200, updated_exam.text
    assert updated_exam.json()["weightage"] == 50

    deleted_exam = await client.delete(f"/api/v1/assessments/exam-types/{exam_id}")
    assert deleted_exam.status_code == 200, deleted_exam.text
    deleted_scheme = await client.delete(f"/api/v1/assessments/grading-schemes/{scheme_id}")
    assert deleted_scheme.status_code == 200, deleted_scheme.text


async def test_whatsapp_pdf_requires_direct_delivery_and_does_not_false_log(
    db_sessionmaker, seed, monkeypatch,
):
    monkeypatch.setattr(settings, "evolution_api_url", "")
    monkeypatch.setattr(settings, "evolution_api_key", "")
    monkeypatch.setattr(settings, "evolution_instance", "")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")
    async with db_sessionmaker() as db:
        db.add(MessageTemplate(
            madrasa_id=seed.madrasa.id,
            code="test_pdf",
            name="Test PDF",
            content={"en": "Report for {name}"},
        ))
        await db.commit()

        with pytest.raises(HTTPException) as exc_info:
            await render_and_dispatch(
                db,
                madrasa=seed.madrasa,
                current_user=seed.principal,
                template_code="test_pdf",
                language="en",
                variables={"name": "Student"},
                recipient_type="teacher",
                recipient_id=seed.teacher.id,
                phone_number=seed.teacher.whatsapp_number,
                attachment_bytes=b"%PDF-test",
            )
        assert exc_info.value.status_code == 503
        assert await db.scalar(select(func.count()).select_from(MessageLog)) == 0


async def test_whatsapp_pdf_reports_deleted_evolution_instance_as_unavailable(
    db_sessionmaker, seed, monkeypatch,
):
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "test-key")
    monkeypatch.setattr(settings, "evolution_instance", "deleted-instance")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/instance/connectionState/deleted-instance"
        return httpx.Response(
            404,
            request=request,
            json={
                "status": 404,
                "error": "Not Found",
                "response": {"message": ["The deleted-instance instance does not exist"]},
            },
        )

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_client(transport=transport, **kwargs),
    )

    async with db_sessionmaker() as db:
        db.add(MessageTemplate(
            madrasa_id=seed.madrasa.id,
            code="test_deleted_instance_pdf",
            name="Test deleted instance PDF",
            content={"en": "Report for {name}"},
        ))
        await db.commit()

        with pytest.raises(HTTPException) as exc_info:
            await render_and_dispatch(
                db,
                madrasa=seed.madrasa,
                current_user=seed.principal,
                template_code="test_deleted_instance_pdf",
                language="en",
                variables={"name": "Student"},
                recipient_type="teacher",
                recipient_id=seed.teacher.id,
                phone_number=seed.teacher.whatsapp_number,
                attachment_bytes=b"%PDF-test",
            )
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == ErrorCode.WHATSAPP_INSTANCE_UNAVAILABLE
        assert await db.scalar(select(func.count()).select_from(MessageLog)) == 0


async def test_whatsapp_pdf_cannot_use_another_tenants_instance(
    db_sessionmaker, seed, monkeypatch,
):
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "test-key")
    monkeypatch.setattr(settings, "evolution_instance", "suffa-ms")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "another-madrasa")

    async with db_sessionmaker() as db:
        db.add(MessageTemplate(
            madrasa_id=seed.madrasa.id,
            code="test_cross_tenant_pdf",
            name="Test cross-tenant PDF",
            content={"en": "Report for {name}"},
        ))
        await db.commit()

        with pytest.raises(HTTPException) as exc_info:
            await render_and_dispatch(
                db,
                madrasa=seed.madrasa,
                current_user=seed.principal,
                template_code="test_cross_tenant_pdf",
                language="en",
                variables={"name": "Student"},
                recipient_type="teacher",
                recipient_id=seed.teacher.id,
                phone_number=seed.teacher.whatsapp_number,
                attachment_bytes=b"%PDF-test",
            )
        assert exc_info.value.status_code == 403
        assert await db.scalar(select(func.count()).select_from(MessageLog)) == 0


async def test_independent_student_payment_receipt_sends_pdf_to_student_phone(
    client, seed, db_sessionmaker, monkeypatch,
):
    calls: list[tuple[str, str, dict]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}") if request.content else {}
        calls.append((request.method, request.url.path, body))
        if request.url.path == "/instance/connectionState/suffa-ms":
            return httpx.Response(200, request=request, json={"instance": {"instanceName": "suffa-ms", "state": "open"}})
        if request.url.path == "/message/sendMedia/suffa-ms":
            return httpx.Response(201, request=request, json={"status": "success"})
        return httpx.Response(404, request=request, json={"message": "unexpected endpoint"})

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(transport=transport, **kwargs))
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "test-key")
    monkeypatch.setattr(settings, "evolution_instance", "suffa-ms")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")

    async with db_sessionmaker() as db:
        student = await db.get(StudentProfile, seed.students[0].id)
        student.phone = "+923009876543"
        student.is_independent = True
        category = PaymentCategory(madrasa_id=seed.madrasa.id, name="Monthly fee")
        db.add(category)
        await db.flush()
        payment = Payment(
            madrasa_id=seed.madrasa.id,
            student_id=student.id,
            category_id=category.id,
            amount=1500,
            currency="PKR",
            payment_date=date(2026, 8, 8),
            note="August fee",
            recorded_by_id=seed.principal.id,
        )
        db.add(payment)
        db.add(
            MessageTemplate(
                madrasa_id=seed.madrasa.id,
                code="receipt",
                name="Receipt",
                content={"ur": "Receipt {receipt_no} for {payer_name}: {amount}"},
            )
        )
        await db.commit()
        payment_id = payment.id
        student_id = student.id

    response = await client.post(f"/api/v1/finance/payments/{payment_id}/receipt-share")

    assert response.status_code == 200, response.text
    assert response.json()["normalised_number"] == "923009876543"
    assert response.json()["direct_sent"] is True
    assert calls[0] == ("GET", "/instance/connectionState/suffa-ms", {})
    method, path, payload = calls[1]
    assert (method, path) == ("POST", "/message/sendMedia/suffa-ms")
    assert payload["number"] == "923009876543"
    assert payload["mediatype"] == "document"
    assert payload["mimetype"] == "application/pdf"
    assert payload["fileName"].startswith("receipt-")
    assert payload["media"]
    assert "Receipt" in payload["caption"]

    async with db_sessionmaker() as db:
        log = (await db.execute(select(MessageLog).where(MessageLog.recipient_id == student_id))).scalar_one()
        assert log.template_code == "receipt"
        assert log.recipient_type == "student"
        assert log.recipient_number == "923009876543"


async def test_donor_donation_receipt_sends_pdf_to_donor_contact(
    client, seed, db_sessionmaker, monkeypatch,
):
    calls: list[tuple[str, str, dict]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}") if request.content else {}
        calls.append((request.method, request.url.path, body))
        if request.url.path == "/instance/connectionState/suffa-ms":
            return httpx.Response(200, request=request, json={"instance": {"instanceName": "suffa-ms", "state": "open"}})
        if request.url.path == "/message/sendMedia/suffa-ms":
            return httpx.Response(201, request=request, json={"status": "success"})
        return httpx.Response(404, request=request, json={"message": "unexpected endpoint"})

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(transport=transport, **kwargs))
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "test-key")
    monkeypatch.setattr(settings, "evolution_instance", "suffa-ms")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")

    async with db_sessionmaker() as db:
        category = PaymentCategory(madrasa_id=seed.madrasa.id, name="Sadaqah")
        donor = Donor(madrasa_id=seed.madrasa.id, name="Receipt Donor", contact="+923001234999")
        db.add_all([category, donor])
        await db.flush()
        donation = Donation(
            madrasa_id=seed.madrasa.id,
            donor_id=donor.id,
            category_id=category.id,
            amount=5000,
            currency="PKR",
            donation_date=date(2026, 8, 8),
            note="Donation",
            recorded_by_id=seed.principal.id,
        )
        db.add(donation)
        db.add(
            MessageTemplate(
                madrasa_id=seed.madrasa.id,
                code="receipt",
                name="Receipt",
                content={"ur": "Receipt {receipt_no} for {payer_name}: {amount}"},
            )
        )
        await db.commit()
        donation_id = donation.id
        donor_id = donor.id

    response = await client.post(f"/api/v1/finance/donations/{donation_id}/receipt-share")

    assert response.status_code == 200, response.text
    assert response.json()["normalised_number"] == "923001234999"
    assert response.json()["direct_sent"] is True
    method, path, payload = calls[1]
    assert (method, path) == ("POST", "/message/sendMedia/suffa-ms")
    assert payload["number"] == "923001234999"
    assert payload["mediatype"] == "document"
    assert payload["fileName"].startswith("receipt-")

    async with db_sessionmaker() as db:
        log = (await db.execute(select(MessageLog).where(MessageLog.recipient_id == donor_id))).scalar_one()
        assert log.template_code == "receipt"
        assert log.recipient_type == "donor"
        assert log.recipient_number == "923001234999"


async def test_guardian_credentials_can_be_sent_to_selected_registered_phone(
    client, seed, db_sessionmaker, monkeypatch,
):
    calls: list[tuple[str, str, dict]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}") if request.content else {}
        calls.append((request.method, request.url.path, body))
        if request.url.path == "/instance/connectionState/suffa-ms":
            return httpx.Response(200, request=request, json={"instance": {"instanceName": "suffa-ms", "state": "open"}})
        if request.url.path == "/message/sendText/suffa-ms":
            return httpx.Response(201, request=request, json={"status": "success"})
        return httpx.Response(404, request=request, json={"message": "unexpected endpoint"})

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(transport=transport, **kwargs))
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "test-key")
    monkeypatch.setattr(settings, "evolution_instance", "suffa-ms")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")

    async with db_sessionmaker() as db:
        guardian_user = User(
            madrasa_id=seed.madrasa.id,
            username="guardian-credentials",
            password_hash="x",
            role=UserRole.parent,
            status=UserStatus.active,
        )
        db.add(guardian_user)
        await db.flush()
        guardian = Guardian(
            madrasa_id=seed.madrasa.id,
            user_id=guardian_user.id,
            name="Guardian Credentials",
            relationship="father",
            phone_numbers="+923001111111, +923002222222",
            preferred_language="en",
        )
        db.add_all([
            guardian,
            MessageTemplate(
                madrasa_id=seed.madrasa.id,
                code="credentials",
                name="Credentials",
                content={"en": "Login {username} at {setup_link}"},
            ),
        ])
        await db.commit()
        guardian_id = guardian.id

    response = await client.post(
        "/api/v1/messaging/send-credentials",
        json={
            "subject_type": "guardian",
            "subject_id": str(guardian_id),
            "set_password_url": "https://suffa.test/set-password?token=SECRET-GUARDIAN",
            "phone_number": "+923002222222",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["normalised_number"] == "923002222222"
    assert body["direct_sent"] is True
    assert body["url"] == ""
    assert calls == [
        ("GET", "/instance/connectionState/suffa-ms", {}),
        (
            "POST",
            "/message/sendText/suffa-ms",
            {"number": "923002222222", "text": "Login guardian-credentials at https://suffa.test/set-password?token=SECRET-GUARDIAN"},
        ),
    ]
    async with db_sessionmaker() as db:
        log = (await db.execute(select(MessageLog).where(MessageLog.recipient_id == guardian_id))).scalar_one()
        assert log.recipient_type == "guardian"
        assert log.recipient_number == "923002222222"
        assert "guardian-credentials" in log.content_sent
        assert "SECRET-GUARDIAN" not in log.content_sent
        assert "[setup-link-redacted]" in log.content_sent


async def test_student_credentials_can_be_sent_to_own_registered_phone(
    client, seed, db_sessionmaker, monkeypatch,
):
    calls: list[tuple[str, str, dict]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}") if request.content else {}
        calls.append((request.method, request.url.path, body))
        if request.url.path == "/instance/connectionState/suffa-ms":
            return httpx.Response(200, request=request, json={"instance": {"instanceName": "suffa-ms", "state": "open"}})
        if request.url.path == "/message/sendText/suffa-ms":
            return httpx.Response(201, request=request, json={"status": "success"})
        return httpx.Response(404, request=request, json={"message": "unexpected endpoint"})

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(transport=transport, **kwargs))
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "test-key")
    monkeypatch.setattr(settings, "evolution_instance", "suffa-ms")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")

    async with db_sessionmaker() as db:
        student = await db.get(StudentProfile, seed.students[0].id)
        student.phone = "+923009876543"
        student.is_independent = True
        db.add(
            MessageTemplate(
                madrasa_id=seed.madrasa.id,
                code="credentials",
                name="Credentials",
                content={"ur": "Login {username} at {setup_link}"},
            )
        )
        await db.commit()
        student_id = student.id

    response = await client.post(
        "/api/v1/messaging/send-credentials",
        json={
            "subject_type": "student",
            "subject_id": str(student_id),
            "set_password_url": "https://suffa.test/set-password?token=SECRET-STUDENT",
            "phone_number": "+923009876543",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["normalised_number"] == "923009876543"
    assert body["direct_sent"] is True
    assert calls == [
        ("GET", "/instance/connectionState/suffa-ms", {}),
        (
            "POST",
            "/message/sendText/suffa-ms",
            {"number": "923009876543", "text": "Login student1 at https://suffa.test/set-password?token=SECRET-STUDENT"},
        ),
    ]
    async with db_sessionmaker() as db:
        log = (await db.execute(select(MessageLog).where(MessageLog.recipient_id == student_id))).scalar_one()
        assert log.recipient_type == "student"
        assert log.recipient_number == "923009876543"
        assert "student1" in log.content_sent
        assert "SECRET-STUDENT" not in log.content_sent
        assert "[setup-link-redacted]" in log.content_sent


async def test_dependent_student_credentials_require_guardian_phone(
    client, seed, db_sessionmaker, monkeypatch,
):
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "test-key")
    monkeypatch.setattr(settings, "evolution_instance", "suffa-ms")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")

    async with db_sessionmaker() as db:
        student = await db.get(StudentProfile, seed.students[0].id)
        student.phone = "+923009876543"
        student.is_independent = False
        db.add(
            MessageTemplate(
                madrasa_id=seed.madrasa.id,
                code="credentials",
                name="Credentials",
                content={"ur": "Login {username} at {setup_link}"},
            )
        )
        await db.commit()
        student_id = student.id

    response = await client.post(
        "/api/v1/messaging/send-credentials",
        json={
            "subject_type": "student",
            "subject_id": str(student_id),
            "set_password_url": "https://suffa.test/set-password?token=SECRET-STUDENT",
            "phone_number": "+923009876543",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Dependent student has no guardian on file to message"


async def test_guardian_credentials_fail_when_direct_delivery_is_not_configured(
    client, seed, db_sessionmaker, monkeypatch,
):
    monkeypatch.setattr(settings, "evolution_api_url", "")
    monkeypatch.setattr(settings, "evolution_api_key", "")
    monkeypatch.setattr(settings, "evolution_instance", "")
    async with db_sessionmaker() as db:
        guardian_user = User(
            madrasa_id=seed.madrasa.id,
            username="guardian-no-evolution",
            password_hash="x",
            role=UserRole.parent,
            status=UserStatus.active,
        )
        db.add(guardian_user)
        await db.flush()
        guardian = Guardian(
            madrasa_id=seed.madrasa.id,
            user_id=guardian_user.id,
            name="Guardian No Evolution",
            relationship="father",
            phone_numbers="+923001111111",
            preferred_language="en",
        )
        db.add_all([
            guardian,
            MessageTemplate(
                madrasa_id=seed.madrasa.id,
                code="credentials",
                name="Credentials",
                content={"en": "Login {username} at {setup_link}"},
            ),
        ])
        await db.commit()
        guardian_id = guardian.id

    response = await client.post(
        "/api/v1/messaging/send-credentials",
        json={
            "subject_type": "guardian",
            "subject_id": str(guardian_id),
            "set_password_url": "https://suffa.test/set-password?token=SECRET-GUARDIAN",
            "phone_number": "+923001111111",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == ErrorCode.WHATSAPP_DELIVERY_NOT_CONFIGURED
    async with db_sessionmaker() as db:
        assert await db.scalar(select(func.count()).select_from(MessageLog).where(MessageLog.recipient_id == guardian_id)) == 0


async def test_guardian_credentials_reject_unregistered_phone_choice(
    client, seed, db_sessionmaker,
):
    async with db_sessionmaker() as db:
        guardian_user = User(
            madrasa_id=seed.madrasa.id,
            username="guardian-wrong-phone",
            password_hash="x",
            role=UserRole.parent,
            status=UserStatus.active,
        )
        db.add(guardian_user)
        await db.flush()
        guardian = Guardian(
            madrasa_id=seed.madrasa.id,
            user_id=guardian_user.id,
            name="Guardian Wrong Phone",
            relationship="mother",
            phone_numbers="+923001111111",
            preferred_language="en",
        )
        db.add_all([
            guardian,
            MessageTemplate(
                madrasa_id=seed.madrasa.id,
                code="credentials",
                name="Credentials",
                content={"en": "Login {username} at {setup_link}"},
            ),
        ])
        await db.commit()
        guardian_id = guardian.id

    response = await client.post(
        "/api/v1/messaging/send-credentials",
        json={
            "subject_type": "guardian",
            "subject_id": str(guardian_id),
            "set_password_url": "https://suffa.test/set-password?token=SECRET-GUARDIAN",
            "phone_number": "+923009999999",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == ErrorCode.WHATSAPP_PHONE_INVALID


async def test_form_label_becomes_internal_key_when_key_is_omitted(client):
    response = await client.post(
        "/api/v1/operations/forms",
        json={
            "title": "Label keyed form",
            "fields": [{"label": "Parent comments", "type": "textarea"}],
            "visibility_scope": {"all": True},
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["fields_definition"][0]["key"] == "Parent comments"


async def test_assignment_limit_applies_per_section_to_active_assignments(client, seed):
    configured = await client.put(
        f"/api/v1/academics/classes/{seed.class_a.id}",
        json={"assignment_limit": 1},
    )
    assert configured.status_code == 200, configured.text

    def payload(section_id, title):
        return {
            "class_id": str(seed.class_a.id),
            "course_id": str(seed.course.id),
            "section_ids": [str(section_id)],
            "title": title,
            "instructions": "Complete the exercise",
            "due_date": "2099-07-01T00:00:00Z",
        }

    first = await client.post(
        "/api/v1/assessments/assignments",
        json=payload(seed.sections.a1.id, "Alif one"),
    )
    blocked = await client.post(
        "/api/v1/assessments/assignments",
        json=payload(seed.sections.a1.id, "Alif two"),
    )
    class_wide = await client.post(
        "/api/v1/assessments/assignments",
        json={**payload(seed.sections.a1.id, "Whole class"), "section_ids": []},
    )
    other_section = await client.post(
        "/api/v1/assessments/assignments",
        json=payload(seed.sections.a2.id, "Bay one"),
    )

    assert first.status_code == 200, first.text
    assert blocked.status_code == 400
    assert "limit" in blocked.json()["detail"].lower()
    assert class_wide.status_code == 400
    assert other_section.status_code == 200, other_section.text


async def test_grading_scheme_can_toggle_assignment_marks(client):
    response = await client.post(
        "/api/v1/assessments/grading-schemes",
        json={
            "name": "Assignments included",
            "include_assignments": True,
            "bands": [{"label": "Complete", "min_score": 0, "max_score": 100}],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["include_assignments"] is True


def test_result_card_renders_in_selected_urdu_language():
    pdf = render_result_card_pdf(
        student_name="Student",
        admission_number="ADM-1",
        session_name="2026",
        gregorian_date="2026-07-21",
        hijri_date="6 Safar 1448 AH",
        course_rows=[["Quran", "90", "A"]],
        overall_score="90",
        published=True,
        language="ur",
    )
    assert pdf.startswith(b"%PDF")


async def test_attendance_pdf_uses_authenticated_users_saved_language(
    client, seed, db_sessionmaker, monkeypatch,
):
    async with db_sessionmaker() as db:
        principal = await db.get(User, seed.principal.id)
        principal.preferred_language = "ur"
        await db.commit()

    captured = {}

    def capture_pdf(title, subtitle, headers, rows, branding, *, language="en"):
        captured.update(title=title, subtitle=subtitle, headers=headers, language=language)
        return b"%PDF-localized"

    monkeypatch.setattr("app.modules.reporting.routes.render_table_pdf", capture_pdf)
    response = await client.get(
        "/api/v1/reporting/reports/attendance",
        params={
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a1.id),
            "start_date": "2024-04-01",
            "end_date": "2024-04-30",
            "format": "pdf",
        },
    )

    assert response.status_code == 200, response.text
    assert captured == {
        "title": "حاضری کا خلاصہ",
        "subtitle": "2024-04-01 تا 2024-04-30",
        "headers": ["داخلہ نمبر", "نام", "حاضر", "غیر حاضر", "رخصت", "تعطیلات"],
        "language": "ur",
    }

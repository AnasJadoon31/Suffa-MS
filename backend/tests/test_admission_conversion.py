"""HTTP-contract tests for admission snapshots and application conversion."""

from pathlib import Path
from sqlalchemy import func, select
from uuid import UUID

from app.modules.academics.models import Enrollment
from app.modules.academics.models import Madrasa
from app.modules.operations.models import AdmissionApplication, AdminNotification
from app.modules.operations.models import AdmissionForm
from app.modules.auth.models import UserPermission
from app.modules.people.models import Guardian, StudentAdmissionRecord, StudentGuardian, StudentProfile


def test_admission_conversion_migration_enables_rls_for_new_tenant_tables():
    migration = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "84d3b7e91a20_admission_conversion_records_notifications.py"
    ).read_text(encoding="utf-8")
    assert '_enable_tenant_rls("student_admission_records")' in migration
    assert '_enable_tenant_rls("admin_notifications")' in migration
    assert "FORCE ROW LEVEL SECURITY" in migration
    assert "WITH CHECK" in migration


async def _create_form(client, seed):
    response = await client.post(
        "/api/v1/operations/admission-forms",
        json={
            "program_id": str(seed.program.id),
            "title": "Hifz intake 2026",
            "fields": [
                {
                    "key": "previous_school",
                    "label": "Previous school",
                    "type": "text",
                    "required": True,
                    "options": [],
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_student_creators_can_list_both_open_and_closed_admission_templates(
    teacher_client, seed, db_sessionmaker
):
    denied = await teacher_client.get("/api/v1/operations/admission-forms")
    assert denied.status_code == 403

    async with db_sessionmaker() as db:
        db.add(
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code="students.add",
                granted_by_id=seed.principal.id,
            )
        )
        db.add_all(
            [
                AdmissionForm(
                    madrasa_id=seed.madrasa.id,
                    program_id=seed.program.id,
                    title="Open intake",
                    public_token="open-intake",
                    is_open=True,
                    created_by_id=seed.principal.id,
                ),
                AdmissionForm(
                    madrasa_id=seed.madrasa.id,
                    program_id=seed.program.id,
                    title="Closed intake",
                    public_token="closed-intake",
                    is_open=False,
                    created_by_id=seed.principal.id,
                ),
            ]
        )
        await db.commit()

    listed = await teacher_client.get("/api/v1/operations/admission-forms")
    assert listed.status_code == 200, listed.text
    assert {(row["title"], row["is_open"]) for row in listed.json()} == {
        ("Open intake", True),
        ("Closed intake", False),
    }


async def test_people_student_creation_saves_an_immutable_admission_form_snapshot(client, seed):
    form = await _create_form(client, seed)

    created = await client.post(
        "/api/v1/people/students",
        json={
            "username": "new.student",
            "name": "New Student",
            "date_of_birth": "2017-02-03",
            "admission_form_id": form["id"],
            "admission_answers": {"previous_school": "Al Noor School"},
        },
    )
    assert created.status_code == 200, created.text
    record = created.json()["admission_record"]
    assert record["form_title"] == "Hifz intake 2026"
    assert record["answers"] == {"previous_school": "Al Noor School"}
    assert record["fields_definition"][0]["label"] == "Previous school"

    # Later template edits must not rewrite the student's historical record.
    changed = await client.put(
        f"/api/v1/operations/admission-forms/{form['id']}",
        json={"title": "Renamed intake", "fields": []},
    )
    assert changed.status_code == 200
    fetched = await client.get(f"/api/v1/people/students/{created.json()['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["admission_record"] == record


async def test_admission_application_can_be_edited_and_status_is_reversible(client, seed):
    created = await client.post(
        "/api/v1/operations/admissions",
        json={"applicant_name": "Old Name", "guardian_contact": "+92000"},
    )
    application_id = created.json()["id"]

    edited = await client.put(
        f"/api/v1/operations/admissions/{application_id}",
        json={
            "applicant_name": "Correct Name",
            "guardian_contact": "+92111",
            "program_id": str(seed.program.id),
            "date_of_birth": "2017-01-02",
            "notes": "Bring documents",
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["applicant_name"] == "Correct Name"
    assert edited.json()["notes"] == "Bring documents"

    rejected = await client.post(
        f"/api/v1/operations/admissions/{application_id}/status",
        params={"status_value": "rejected"},
    )
    assert rejected.status_code == 200
    pending = await client.post(
        f"/api/v1/operations/admissions/{application_id}/status",
        params={"status_value": "pending"},
    )
    assert pending.status_code == 200
    assert pending.json()["status"] == "pending"
    history = await client.get(
        f"/api/v1/operations/admissions/{application_id}/status-history"
    )
    assert history.status_code == 200
    assert [event["status"] for event in history.json()] == ["pending", "rejected", "pending"]


async def test_accept_conversion_is_atomic_idempotent_and_notifies_admin(client, seed, db_sessionmaker):
    form = await _create_form(client, seed)
    submitted = await client.post(
        f"/api/v1/public/admission-forms/{form['public_token']}",
        json={
            "applicant_name": "Accepted Child",
            "guardian_contact": "+923001234567",
            "date_of_birth": "2017-04-05",
            "extra_data": {"previous_school": "Community School"},
        },
    )
    assert submitted.status_code == 200, submitted.text

    # Acceptance must use what the applicant actually saw, not a later edit.
    changed = await client.put(
        f"/api/v1/operations/admission-forms/{form['id']}",
        json={"title": "Later renamed intake", "fields": []},
    )
    assert changed.status_code == 200

    payload = {
        "student_username": "accepted.child",
        "guardian_username": "accepted.parent",
        "guardian_name": "Accepted Parent",
        "guardian_relationship": "father",
        "guardian_cnic": "42101-1234567-1",
        "session_id": str(seed.old_session.id),
        "class_id": str(seed.class_a.id),
        "section_id": str(seed.sections.a1.id),
    }
    converted = await client.post(
        f"/api/v1/operations/admissions/{submitted.json()['id']}/convert",
        json=payload,
    )
    assert converted.status_code == 200, converted.text
    body = converted.json()
    assert body["application"]["status"] == "accepted"
    assert body["application"]["status_history"][-1]["status"] == "accepted"
    assert body["student"]["name"] == "Accepted Child"
    assert body["guardian"]["name"] == "Accepted Parent"
    assert body["student"]["admission_record"]["form_title"] == "Hifz intake 2026"
    assert body["student"]["admission_record"]["fields_definition"][0]["key"] == "previous_school"
    assert body["student_set_password_url"].startswith("/set-password?")
    assert body["guardian_set_password_url"].startswith("/set-password?")
    assert body["already_converted"] is False

    repeated = await client.post(
        f"/api/v1/operations/admissions/{submitted.json()['id']}/convert",
        json=payload,
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["student"]["id"] == body["student"]["id"]
    assert repeated.json()["guardian"]["id"] == body["guardian"]["id"]
    assert repeated.json()["already_converted"] is True
    assert repeated.json()["student_set_password_url"] is None
    assert repeated.json()["guardian_set_password_url"] is None

    async with db_sessionmaker() as db:
        student_id = UUID(body["student"]["id"])
        assert await db.scalar(select(func.count()).select_from(StudentProfile).where(StudentProfile.id == student_id)) == 1
        assert await db.scalar(select(func.count()).select_from(Guardian)) == 1
        assert await db.scalar(select(func.count()).select_from(StudentGuardian)) == 1
        assert await db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.student_id == student_id)) == 1
        assert await db.scalar(select(func.count()).select_from(StudentAdmissionRecord).where(StudentAdmissionRecord.student_id == student_id)) == 1
        assert await db.scalar(select(func.count()).select_from(AdminNotification)) == 1

    notifications = await client.get("/api/v1/operations/admin-notifications")
    assert notifications.status_code == 200, notifications.text
    [notification] = notifications.json()
    assert notification["event_type"] == "admission.application_converted"
    assert notification["is_read"] is False

    marked = await client.post(
        f"/api/v1/operations/admin-notifications/{notification['id']}/read"
    )
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True


async def test_failed_conversion_rolls_back_all_provisioned_records(client, seed, db_sessionmaker):
    created = await client.post(
        "/api/v1/operations/admissions",
        json={
            "applicant_name": "Rollback Child",
            "guardian_contact": "+92300",
            "program_id": str(seed.program.id),
            "date_of_birth": "2017-04-05",
        },
    )
    application_id = created.json()["id"]

    failed = await client.post(
        f"/api/v1/operations/admissions/{application_id}/convert",
        json={
            "student_username": "rollback.child",
            "guardian_username": seed.principal.username,
            "guardian_name": "Rollback Parent",
            "guardian_relationship": "mother",
            "session_id": str(seed.old_session.id),
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a1.id),
        },
    )
    assert failed.status_code == 409

    async with db_sessionmaker() as db:
        application = await db.get(AdmissionApplication, UUID(application_id))
        assert application.status == "pending"
        assert application.converted_student_id is None
        assert await db.scalar(select(func.count()).select_from(StudentProfile).where(StudentProfile.name == "Rollback Child")) == 0
        assert await db.scalar(select(func.count()).select_from(Guardian).where(Guardian.name == "Rollback Parent")) == 0


async def test_admission_applications_and_notifications_do_not_cross_tenant_boundary(
    client, seed, db_sessionmaker
):
    async with db_sessionmaker() as db:
        other = Madrasa(name="Other", slug="admissions-other")
        db.add(other)
        await db.flush()
        application = AdmissionApplication(
            madrasa_id=other.id,
            applicant_name="Other Tenant Child",
            guardian_contact="+92000",
        )
        notification = AdminNotification(
            madrasa_id=other.id,
            event_type="admission.application_converted",
            title="Other notification",
            message="Must not leak",
            created_by_id=seed.principal.id,
        )
        db.add_all([application, notification])
        await db.commit()
        application_id = application.id

    edited = await client.put(
        f"/api/v1/operations/admissions/{application_id}",
        json={"applicant_name": "Leaked"},
    )
    assert edited.status_code == 404
    listed = await client.get("/api/v1/operations/admin-notifications")
    assert listed.status_code == 200
    assert all(row["title"] != "Other notification" for row in listed.json())

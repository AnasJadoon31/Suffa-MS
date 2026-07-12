"""Backend completion sweep: auth extras, holidays scope, leave filters,
public endpoints, timetable import, settings catalogue, reports, rollover
copy options, security headers."""
from datetime import date

from sqlalchemy import select

from app.core.security import hash_password, verify_password
from app.modules.auth.models import User, UserRole
from app.modules.operations.models import Holiday, Leave, TimetableSlot
from app.modules.people.models import Guardian


# ------------------------------------------------------------------ auth

async def test_change_password_flow(client, seed, db_sessionmaker):
    async with db_sessionmaker() as db:
        principal = await db.get(User, seed.principal.id)
        principal.password_hash = await hash_password("old-password")
        await db.commit()

    wrong = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "nope", "new_password": "brand-new-pass"},
    )
    assert wrong.status_code == 400

    ok = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "old-password", "new_password": "brand-new-pass"},
    )
    assert ok.status_code == 200
    async with db_sessionmaker() as db:
        principal = await db.get(User, seed.principal.id)
        assert await verify_password("brand-new-pass", principal.password_hash)


async def test_guardian_login_provision_and_reissue(client, seed, db_sessionmaker):
    async with db_sessionmaker() as db:
        guardian = Guardian(
            madrasa_id=seed.madrasa.id, name="Abu Student", relationship="father",
            phone_numbers="+92300", preferred_language="ur",
        )
        db.add(guardian)
        await db.commit()
        guardian_id = guardian.id

    missing_username = await client.post(f"/api/v1/people/guardians/{guardian_id}/credentials-link", json={})
    assert missing_username.status_code == 400

    first = await client.post(
        f"/api/v1/people/guardians/{guardian_id}/credentials-link", json={"username": "abu-student"}
    )
    assert first.status_code == 200
    assert first.json()["set_password_url"].startswith("/set-password?token=")

    async with db_sessionmaker() as db:
        stored = await db.get(Guardian, guardian_id)
        user = await db.get(User, stored.user_id)
        assert user.role == UserRole.parent

    again = await client.post(f"/api/v1/people/guardians/{guardian_id}/credentials-link", json={})
    assert again.status_code == 200
    assert again.json()["username"] == "abu-student"


# -------------------------------------------------------------- holidays

async def test_holiday_category_and_class_scope_filters(client, seed):
    await client.post(
        "/api/v1/operations/holidays",
        json={"name": "Eid", "category": "religious", "start_date": "2024-06-17", "end_date": "2024-06-19"},
    )
    scoped = await client.post(
        "/api/v1/operations/holidays",
        json={
            "name": "Class-1 exam break", "category": "exam",
            "start_date": "2024-07-01", "end_date": "2024-07-03",
            "class_ids": [str(seed.class_a.id)],
        },
    )
    assert scoped.status_code == 200
    assert scoped.json()["class_ids"] == [str(seed.class_a.id)]

    religious = await client.get("/api/v1/operations/holidays", params={"category": "religious"})
    assert {h["name"] for h in religious.json()} == {"Eid"}

    class_b_view = await client.get("/api/v1/operations/holidays", params={"class_id": str(seed.class_b.id)})
    assert {h["name"] for h in class_b_view.json()} == {"Eid"}  # scoped one filtered out

    class_a_view = await client.get("/api/v1/operations/holidays", params={"class_id": str(seed.class_a.id)})
    assert {h["name"] for h in class_a_view.json()} == {"Eid", "Class-1 exam break"}


# ----------------------------------------------------------------- leave

async def test_leave_person_type_and_status_filters(client, seed, db_sessionmaker):
    async with db_sessionmaker() as db:
        student_user = (await db.execute(select(User).where(User.username == "student1"))).scalar_one()
        db.add(Leave(madrasa_id=seed.madrasa.id, user_id=seed.teacher_user.id,
                     start_date=date(2024, 6, 1), end_date=date(2024, 6, 2), status="approved"))
        db.add(Leave(madrasa_id=seed.madrasa.id, user_id=student_user.id,
                     start_date=date(2024, 6, 3), end_date=date(2024, 6, 4), status="pending"))
        await db.commit()

    teachers_tab = await client.get("/api/v1/operations/leave", params={"person_type": "teacher"})
    assert [row["person_type"] for row in teachers_tab.json()] == ["teacher"]

    students_tab = await client.get(
        "/api/v1/operations/leave", params={"person_type": "student", "class_id": str(seed.class_a.id)}
    )
    assert [row["person_type"] for row in students_tab.json()] == ["student"]

    approved = await client.get("/api/v1/operations/leave", params={"status": "approved"})
    assert {row["status"] for row in approved.json()} == {"approved"}

    named = await client.get("/api/v1/operations/leave", params={"q": "ustad"})
    assert len(named.json()) == 1


# ---------------------------------------------------------------- public

async def test_public_contact_and_honeypot(client, seed, db_sessionmaker):
    async with db_sessionmaker() as db:
        madrasa = await db.get(type(seed.madrasa), seed.madrasa.id)
        public_key = madrasa.public_key

    ok = await client.post(
        f"/api/v1/public/contact/{public_key}",
        json={"name": "Visitor", "contact": "a@b.c", "message": "Salam"},
    )
    assert ok.status_code == 200

    bot = await client.post(
        f"/api/v1/public/contact/{public_key}",
        json={"name": "Bot", "contact": "x", "message": "spam", "website": "http://spam"},
    )
    assert bot.status_code == 200  # pretends success

    enquiries = await client.get("/api/v1/operations/enquiries")
    names = {e["name"] for e in enquiries.json()}
    assert "Visitor" in names and "Bot" not in names

    unknown = await client.post(
        "/api/v1/public/contact/not-a-key", json={"name": "X", "contact": "y", "message": "z"}
    )
    assert unknown.status_code == 404


async def test_public_admission_form_flow(client, seed):
    created = await client.post(
        "/api/v1/operations/admission-forms",
        json={"program_id": str(seed.program.id), "title": "Hifz admissions", "description": "2026 intake"},
    )
    assert created.status_code == 200, created.text
    token = created.json()["public_token"]
    assert created.json()["program_name"] == "Hifz"

    public_form = await client.get(f"/api/v1/public/admission-forms/{token}")
    assert public_form.status_code == 200
    assert public_form.json()["title"] == "Hifz admissions"

    submitted = await client.post(
        f"/api/v1/public/admission-forms/{token}",
        json={"applicant_name": "New Kid", "guardian_contact": "+92311", "date_of_birth": "2016-01-05",
              "extra_data": {"previous_school": "None"}},
    )
    assert submitted.status_code == 200
    assert submitted.json()["form_id"] == created.json()["id"]

    registrations = await client.get("/api/v1/operations/admissions")
    assert any(a["applicant_name"] == "New Kid" for a in registrations.json())

    closed = await client.put(
        f"/api/v1/operations/admission-forms/{created.json()['id']}", json={"is_open": False}
    )
    assert closed.status_code == 200
    rejected = await client.post(
        f"/api/v1/public/admission-forms/{token}",
        json={"applicant_name": "Late Kid", "guardian_contact": "+92312"},
    )
    assert rejected.status_code == 403


async def test_blog_update_and_delete(client, seed):
    post = (await client.post("/api/v1/operations/blog", json={"title": "T1", "body": "B1"})).json()
    updated = await client.put(f"/api/v1/operations/blog/{post['id']}", json={"title": "T2"})
    assert updated.status_code == 200
    assert updated.json()["title"] == "T2"
    deleted = await client.delete(f"/api/v1/operations/blog/{post['id']}")
    assert deleted.status_code == 200


# ------------------------------------------------------- timetable import

async def test_timetable_import_dry_run_and_commit(client, seed, db_sessionmaker):
    rows = [
        {"class_name": "Class 1", "section_name": "Alif", "course_name": "Nazra",
         "teacher_code": "T1", "day_of_week": 0, "start_time": "08:00", "end_time": "08:40"},
        {"class_name": "Class 1", "section_name": "Alif", "course_name": "Nazra",
         "teacher_code": "T1", "day_of_week": 0, "start_time": "08:40", "end_time": "09:20"},
        {"class_name": "Nope", "section_name": "Alif", "course_name": "Nazra",
         "teacher_code": "T1", "day_of_week": 0, "start_time": "09:20", "end_time": "10:00"},
    ]
    dry = await client.post("/api/v1/operations/timetable/import", json={"rows": rows, "dry_run": True})
    assert dry.status_code == 200
    body = dry.json()
    assert body["created"] == 0
    assert [r["ok"] for r in body["results"]] == [True, True, False]
    assert "Unknown class" in body["results"][2]["error"]

    # Nothing commits while any row is bad, even with dry_run=false.
    blocked = await client.post("/api/v1/operations/timetable/import", json={"rows": rows, "dry_run": False})
    assert blocked.json()["created"] == 0

    good = await client.post(
        "/api/v1/operations/timetable/import", json={"rows": rows[:2], "dry_run": False}
    )
    assert good.json()["created"] == 2
    async with db_sessionmaker() as db:
        stored = (await db.execute(select(TimetableSlot))).scalars().all()
        assert len(stored) == 2
        assert sorted(s.period for s in stored) == [1, 2]  # auto-derived


# ---------------------------------------------------------------- settings

async def test_settings_catalog_and_typed_validation(client):
    catalog = await client.get("/api/v1/operations/settings/catalog")
    assert catalog.status_code == 200
    by_key = {item["key"]: item for item in catalog.json()}
    assert by_key["finance.currency"]["value"] == "PKR"  # default
    assert by_key["madrasa.address"]["category"] == "profile"

    unknown = await client.put("/api/v1/operations/settings", json={"key": "no.such.key", "value": "x"})
    assert unknown.status_code == 400

    bad_type = await client.put(
        "/api/v1/operations/settings",
        json={"key": "security.idle_timeout_minutes_student", "value": "soon"},
    )
    assert bad_type.status_code == 400

    ok = await client.put(
        "/api/v1/operations/settings",
        json={"key": "security.idle_timeout_minutes_student", "value": "15"},
    )
    assert ok.status_code == 200

    catalog2 = await client.get("/api/v1/operations/settings/catalog")
    by_key2 = {item["key"]: item for item in catalog2.json()}
    assert by_key2["security.idle_timeout_minutes_student"]["value"] == "15"


# ----------------------------------------------------------------- reports

async def test_salary_and_donation_reports_return_csv(client):
    salary = await client.get(
        "/api/v1/reporting/reports/salary",
        params={"start_date": "2024-01-01", "end_date": "2024-12-31", "format": "csv"},
    )
    assert salary.status_code == 200
    assert salary.headers["content-type"].startswith("text/csv")

    donations = await client.get(
        "/api/v1/reporting/reports/donations",
        params={"start_date": "2024-01-01", "end_date": "2024-12-31", "format": "csv"},
    )
    assert donations.status_code == 200


# ---------------------------------------------------------------- rollover

async def test_rollover_copies_timetable_and_shifted_holidays(client, seed, db_sessionmaker):
    async with db_sessionmaker() as db:
        db.add(
            TimetableSlot(
                madrasa_id=seed.madrasa.id, session_id=seed.old_session.id,
                class_id=seed.class_a.id, section_id=seed.sections.a1.id,
                course_id=seed.course.id, teacher_id=seed.teacher.id,
                day_of_week=0, period=1, start_time="08:00", end_time="08:40",
            )
        )
        db.add(
            Holiday(
                madrasa_id=seed.madrasa.id, name="Eid", category="religious",
                start_date=date(2024, 6, 17), end_date=date(2024, 6, 19),
            )
        )
        await db.commit()

    response = await client.post(
        f"/api/v1/academics/sessions/{seed.old_session.id}/rollover",
        json={
            "name": "2025-26",
            "gregorian_start": "2025-04-01",
            "gregorian_end": "2026-03-31",
            "hijri_span": "1446-47",
            "class_mappings": [],
            "copy_timetable": True,
            "copy_holidays": True,
            "shift_holiday_dates": True,
        },
    )
    assert response.status_code == 200, response.text
    new_session_id = response.json()["id"]

    async with db_sessionmaker() as db:
        copied_slots = (
            await db.execute(select(TimetableSlot).where(TimetableSlot.session_id != seed.old_session.id))
        ).scalars().all()
        assert len(copied_slots) == 1
        assert str(copied_slots[0].session_id) == new_session_id

        holidays = (await db.execute(select(Holiday).order_by(Holiday.start_date))).scalars().all()
        assert len(holidays) == 2
        # 2024-04-01 → 2025-04-01 = 365 days; Eid copy lands one year later.
        assert holidays[1].start_date == date(2025, 6, 17)


# ---------------------------------------------------------------- security

async def test_security_headers_present(client):
    response = await client.get("/api/v1/operations/holidays")
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"

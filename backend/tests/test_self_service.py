"""Self-service portal endpoints for teachers/students: own salary view.

Teacher and student portals reuse the existing PATCH /auth/me and
POST /auth/change-password endpoints directly (already covered elsewhere);
this file covers the one new minimal addition — GET /finance/salary/me.
"""


async def test_teacher_sees_own_salary_record_and_payments(client, teacher_client, seed):
    # Principal sets the salary and records a payment...
    set_response = await client.put(
        f"/api/v1/finance/salary/{seed.teacher.id}",
        json={"amount": 45000, "currency": "PKR", "effective_from": "2024-04-01"},
    )
    assert set_response.status_code == 200, set_response.text

    payment_response = await client.post(
        f"/api/v1/finance/salary/{seed.teacher.id}/payments",
        json={
            "amount": 45000, "currency": "PKR", "payment_date": "2024-05-01",
            "period_covered": "April 2024", "method": "cash", "note": "",
        },
    )
    assert payment_response.status_code == 200, payment_response.text

    # ...and the teacher can read it back via the self-scoped endpoint,
    # without holding teachers.salary.manage.
    response = await teacher_client.get("/api/v1/finance/salary/me")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["record"]["amount"] == 45000.0
    assert len(body["payments"]) == 1
    assert body["payments"][0]["period_covered"] == "April 2024"


async def test_teacher_with_no_salary_record_gets_empty_response(client, teacher_client, seed):
    response = await teacher_client.get("/api/v1/finance/salary/me")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["record"] is None
    assert body["payments"] == []


async def test_teacher_cannot_read_another_teachers_salary_without_permission(teacher_client, seed):
    response = await teacher_client.get(f"/api/v1/finance/salary/{seed.teacher.id}")
    assert response.status_code == 403, response.text


async def test_non_teacher_account_is_rejected_from_my_salary(client, seed):
    # `client` is authenticated as the principal, who has no TeacherProfile.
    response = await client.get("/api/v1/finance/salary/me")
    assert response.status_code == 403, response.text

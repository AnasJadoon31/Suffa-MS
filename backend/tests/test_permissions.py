"""Permission catalogue growth + scoped grants (§3 of IMPLEMENT.md)."""
from uuid import uuid4

from sqlalchemy import select

from app.core.dependencies import user_has_permission, user_has_permission_scoped
from app.modules.academics.models import AcademicClass, Madrasa, Program
from app.modules.auth.models import UserPermission


async def test_grant_endpoint_accepts_scoped_grants(client, seed, db_sessionmaker):
    response = await client.put(
        "/api/v1/auth/permissions/grants",
        json={
            "user_id": str(seed.teacher_user.id),
            "grants": [
                {"code": "holidays.manage"},
                {"code": "students.attendance.manage", "scope_type": "class", "scope_id": str(seed.class_a.id)},
            ],
        },
    )
    assert response.status_code == 200
    assert len(response.json()["grants"]) == 2

    async with db_sessionmaker() as db:
        rows = (
            await db.execute(select(UserPermission).where(UserPermission.user_id == seed.teacher_user.id))
        ).scalars().all()
        by_code = {row.permission_code: row for row in rows}
        assert by_code["holidays.manage"].scope_type is None
        assert by_code["students.attendance.manage"].scope_type == "class"
        assert by_code["students.attendance.manage"].scope_id == seed.class_a.id


async def test_grant_endpoint_rejects_half_scoped_grant(client, seed):
    response = await client.put(
        "/api/v1/auth/permissions/grants",
        json={
            "user_id": str(seed.teacher_user.id),
            "grants": [{"code": "holidays.manage", "scope_type": "class"}],
        },
    )
    assert response.status_code == 400


async def test_grant_endpoint_rejects_unknown_code(client, seed):
    response = await client.put(
        "/api/v1/auth/permissions/grants",
        json={"user_id": str(seed.teacher_user.id), "permission_codes": ["no.such.permission"]},
    )
    assert response.status_code == 400


async def test_grant_endpoint_rejects_scope_for_global_only_permission(client, seed):
    response = await client.put(
        "/api/v1/auth/permissions/grants",
        json={
            "user_id": str(seed.teacher_user.id),
            "grants": [
                {"code": "holidays.manage", "scope_type": "class", "scope_id": str(seed.class_a.id)}
            ],
        },
    )

    assert response.status_code == 400
    assert "madrasa-wide" in response.json()["detail"]


async def test_grant_endpoint_rejects_scope_from_another_madrasa(
    client, seed, db_sessionmaker,
):
    async with db_sessionmaker() as db:
        other_madrasa = Madrasa(name="Other Madrasa", slug="other")
        db.add(other_madrasa)
        await db.flush()
        other_program = Program(madrasa_id=other_madrasa.id, name="Other program")
        db.add(other_program)
        await db.flush()
        other_class = AcademicClass(
            madrasa_id=other_madrasa.id,
            program_id=other_program.id,
            name="Other class",
        )
        db.add(other_class)
        await db.commit()

    response = await client.put(
        "/api/v1/auth/permissions/grants",
        json={
            "user_id": str(seed.teacher_user.id),
            "grants": [
                {
                    "code": "assignments.create",
                    "scope_type": "class",
                    "scope_id": str(other_class.id),
                }
            ],
        },
    )

    assert response.status_code == 400
    assert "active madrasa" in response.json()["detail"]


async def test_scoped_grant_does_not_satisfy_global_check(db_sessionmaker, seed):
    async with db_sessionmaker() as db:
        db.add(
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code="assignments.create",
                granted_by_id=seed.principal.id,
                scope_type="class",
                scope_id=seed.class_a.id,
            )
        )
        await db.commit()

        assert not await user_has_permission(seed.teacher_user, "assignments.create", db)
        assert await user_has_permission_scoped(
            seed.teacher_user, "assignments.create", db, class_id=seed.class_a.id
        )
        assert not await user_has_permission_scoped(
            seed.teacher_user, "assignments.create", db, class_id=seed.class_b.id
        )
        assert not await user_has_permission_scoped(
            seed.teacher_user, "assignments.create", db, class_id=None
        )


async def test_teacher_without_holidays_permission_gets_403(teacher_client):
    response = await teacher_client.post(
        "/api/v1/operations/holidays",
        json={"name": "Eid", "start_date": "2024-06-17", "end_date": "2024-06-19"},
    )
    assert response.status_code == 403


async def test_list_user_permissions_requires_principal_or_self(teacher_client, seed):
    other = await teacher_client.get(f"/api/v1/auth/users/{seed.principal.id}/permissions")
    assert other.status_code == 403

    own = await teacher_client.get(f"/api/v1/auth/users/{seed.teacher_user.id}/permissions")
    assert own.status_code == 200
    codes = [g["permission_code"] for g in own.json()]
    assert "attendance.take" in codes


async def test_list_user_permissions_unknown_user_404(client):
    response = await client.get(f"/api/v1/auth/users/{uuid4()}/permissions")
    assert response.status_code == 404

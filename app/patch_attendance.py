import re

with open('../backend/app/modules/attendance/routes.py', 'r') as f:
    content = f.read()

# Patch _require_student_attendance_access
content = re.sub(
    r'if current_user\.role == "teacher":\n\s*return',
    'if current_user.role in ("teacher", "parent"):\n        return',
    content
)

# Patch attendance_student_history
target = '    if section_id is not None:'
replacement = '''    if current_user.role == UserRole.parent:
        is_guardian = (
            await session.execute(
                select(StudentGuardian.id)
                .join(Guardian, Guardian.id == StudentGuardian.guardian_id)
                .where(
                    StudentGuardian.student_id == student_id,
                    Guardian.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        if not is_guardian:
            raise HTTPException(status_code=403, detail="Not authorized to view this student")

    if section_id is not None:'''

content = content.replace(target, replacement)

with open('../backend/app/modules/attendance/routes.py', 'w') as f:
    f.write(content)

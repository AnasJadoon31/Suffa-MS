import re

with open("backend/app/modules/assessments/routes.py", "r") as f:
    content = f.read()

import1 = """    students = (
        await session.execute(
            select(StudentProfile)
            .join(Enrollment, Enrollment.student_id == StudentProfile.id)
            .where(
                Enrollment.class_id == section.class_id,
                Enrollment.section_id == section.id,
                Enrollment.session_id == active_session_id,
                Enrollment.ended_on.is_(None),
                StudentProfile.madrasa_id == madrasa_id,
            )
            .order_by(StudentProfile.name)
        )
    ).scalars().all()"""

import2 = """    students = (
        await session.execute(
            select(StudentProfile)
            .join(Enrollment, Enrollment.student_id == StudentProfile.id)
            .where(
                Enrollment.class_id == section.class_id,
                Enrollment.section_id == section.id,
                Enrollment.session_id == active_session_id,
                Enrollment.ended_on.is_(None),
                StudentProfile.madrasa_id == madrasa_id,
            )
            .order_by(StudentProfile.name)
        )
    ).scalars().all()
    
    student_ids = [student.id for student in students]
    published_student_ids = set(
        (
            await session.execute(
                select(ResultPublication.student_id).where(
                    ResultPublication.session_id == active_session_id,
                    ResultPublication.student_id.in_(student_ids)
                )
            )
        ).scalars().all()
    ) if student_ids else set()"""

content = content.replace(import1, import2)

row1 = """                courses=cells,
                overall_score=round(sum(scored) / len(scored), 2) if scored else None,
            )"""

row2 = """                courses=cells,
                overall_score=round(sum(scored) / len(scored), 2) if scored else None,
                published=student.id in published_student_ids,
            )"""

content = content.replace(row1, row2)

with open("backend/app/modules/assessments/routes.py", "w") as f:
    f.write(content)

print("Patched routes.py")

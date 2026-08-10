"""Complete seed using ORM. All passwords = abcd1234."""
import asyncio, hashlib, random
from datetime import date, datetime, timedelta, time
from uuid import UUID

from sqlalchemy import text

from app.core.security import hash_password
from app.db import core_models  # ensure FileObject loaded for FK resolution
from app.db.session import SessionLocal
from app.modules.academics.models import AcademicSession, AcademicClass, Course, Enrollment, Madrasa, Program, ProgramCourse, ClassCourse, Section
from app.modules.auth.models import User, UserRole, UserStatus, PermissionRole, PermissionRoleGrant, UserRoleAssignment
from app.modules.people.models import TeacherProfile, StudentProfile, Guardian, StudentGuardian
from app.modules.finance.models import Donor, Donation, Payment, PaymentCategory, SalaryRecord, SalaryPayment
from app.modules.assessments.models import Assignment, GradingScheme, ExamType, Mark, ResultPublication, Submission
from app.modules.attendance.models import StudentAttendance, TeacherAttendance
from app.modules.operations.models import (
    AdmissionApplication,
    AdmissionForm,
    Announcement,
    BlogPost,
    ContactEnquiry,
    Form,
    FormResponse,
    Holiday,
    Leave,
    MadrasaSetting,
    Resource,
    ResourceCategory,
    TimetableSlot,
)
from app.modules.messaging.models import MessageLog, MessageTemplate
from app.modules.finance.models import Payment, SalaryRecord, SalaryPayment

PASSWORD = "abcd1234"
NOW = datetime.utcnow()
MID = UUID(hashlib.md5(b"madrasa").hexdigest())
DEFAULT_SCHOOL_DAY_INDEXES = {0, 1, 2, 3, 4, 5}
def uid(s): return UUID(hashlib.md5(s.encode()).hexdigest())

async def seed():
    async with SessionLocal() as db:
        print("Truncating…")
        try:
            await db.execute(text("TRUNCATE TABLE madaris CASCADE"))
            await db.commit()
            print("Truncated.")
        except Exception:
            await db.rollback()
            print("Truncate skipped (first run or constraint issue)")

        hashed = await hash_password(PASSWORD)

        madrasa = Madrasa(id=MID, slug="suffa", name="Suffa MS", content_language="ur", public_key="seed-pk", created_at=NOW, updated_at=NOW)
        db.add(madrasa)
        await db.flush()

        # Sessions
        s1 = AcademicSession(id=uid("s1"), madrasa_id=MID, name="1447 / 2025-26", gregorian_start=date(2025,6,1), gregorian_end=date(2026,5,31), hijri_span="1447", is_active=False, created_at=NOW, updated_at=NOW)
        s2 = AcademicSession(id=uid("s2"), madrasa_id=MID, name="1448 / 2026-27", gregorian_start=date(2026,6,1), gregorian_end=date(2027,5,31), hijri_span="1448", is_active=True, created_at=NOW, updated_at=NOW)
        db.add_all([s1, s2])
        await db.flush()

        # Programs
        progs = {}
        for name in ["Hifz-ul-Qur'an", "Nazra", "Alimiyya"]:
            p = Program(id=uid(f"p-{name}"), madrasa_id=MID, name=name, created_at=NOW, updated_at=NOW)
            progs[name] = p
            db.add(p)
        await db.flush()

        # Courses
        courses = {}
        for name in ["Qur'an", "Tajweed", "Fiqh", "Hadith", "Arabic Grammar", "Urdu"]:
            c = Course(id=uid(f"c-{name}"), madrasa_id=MID, name=name, created_at=NOW, updated_at=NOW)
            courses[name] = c
            db.add(c)
        await db.flush()

        # Program-Course links
        pc_map = {"Hifz-ul-Qur'an": ["Qur'an","Tajweed","Arabic Grammar"], "Nazra": ["Qur'an","Tajweed","Urdu"], "Alimiyya": ["Qur'an","Fiqh","Hadith","Arabic Grammar","Urdu"]}
        for pname, cnames in pc_map.items():
            for cn in cnames:
                db.add(ProgramCourse(id=uid(f"pc-{pname}-{cn}"), madrasa_id=MID, program_id=progs[pname].id, course_id=courses[cn].id, created_at=NOW, updated_at=NOW))
        await db.flush()

        # Classes & Sections
        class_map = {"Hifz A": "Hifz-ul-Qur'an", "Hifz B": "Hifz-ul-Qur'an", "Nazra A": "Nazra", "Nazra B": "Nazra", "Alim 1": "Alimiyya", "Alim 2": "Alimiyya"}
        cl_ids, sec_ids = {}, {}
        for cn, pname in class_map.items():
            cl = AcademicClass(id=uid(f"cl-{cn}"), madrasa_id=MID, program_id=progs[pname].id, name=cn, default_portal_enabled=True, created_at=NOW, updated_at=NOW)
            cl_ids[cn] = cl
            db.add(cl)
            await db.flush()
            for l in ["A","B"]:
                s = Section(id=uid(f"sec-{cn}-{l}"), madrasa_id=MID, class_id=cl.id, name=f"{cn}-{l}", created_at=NOW, updated_at=NOW)
                sec_ids[f"{cn}-{l}"] = s
                db.add(s)

        # Class-Course links
        for cn, pname in class_map.items():
            for cname in pc_map[pname]:
                db.add(ClassCourse(id=uid(f"cc-{cn}-{cname}"), madrasa_id=MID, class_id=cl_ids[cn].id, course_id=courses[cname].id, created_at=NOW, updated_at=NOW))
        await db.flush()

        # ---- Users & Profiles ----
        # Admin
        admin_u = User(id=uid("u-admin"), madrasa_id=MID, username="admin", password_hash=hashed, role=UserRole.principal, status=UserStatus.active, created_at=NOW, updated_at=NOW)
        db.add(admin_u)
        await db.flush()
        admin_tp = TeacherProfile(id=uid("tp-admin"), madrasa_id=MID, user_id=admin_u.id, employee_code="ADMIN", name="Admin Sahib", status="active", whatsapp_number="+923001111111", join_date=date(2020,1,1), is_principal_delegate=True, created_at=NOW, updated_at=NOW)
        db.add(admin_tp)
        await db.flush()

        # Teachers
        teacher_names = ["Molvi Abdul Rahman", "Qari Hafiz Saeed", "Allama Irfan Shah", "Mufti Tariq Masood", "Maulana Zubair Ahmed"]
        t_users, t_profiles = [], []
        for i, tn in enumerate(teacher_names):
            code = f"TCH-{i+1:04d}"
            u = User(id=uid(f"u-t{i}"), madrasa_id=MID, username=code, password_hash=hashed, role=UserRole.teacher, status=UserStatus.active, created_at=NOW, updated_at=NOW)
            t_users.append(u); db.add(u)
            await db.flush()
            tp = TeacherProfile(id=uid(f"tp-{i}"), madrasa_id=MID, user_id=u.id, employee_code=code, name=tn, status="active", whatsapp_number=f"+92300{1000000+i}", join_date=date(2020,6,1), cnic=f"35202-{1234567+i:07d}-{i%10}", qualifications=["MA Islamic Studies","Hafiz","Mufti","PhD Arabic","MPhil Urdu"][i], created_at=NOW, updated_at=NOW)
            t_profiles.append(tp); db.add(tp)

        await db.flush()

        # Students
        students = ["Muhammad Ali","Ahmed Hassan","Bilal Ahmed","Usman Ghani","Farooq Siddique","Abdullah Khan","Hamza Malik","Saad Iqbal","Yousuf Tariq","Hassan Raza","Imran Butt","Khalid Mehmood","Zain ul Abideen","Zubair Khalid","Ayesha Fatima","Maryam Noor","Fatima Zahra","Rukhsana Bibi","Saima Javed","Nusrat Bibi"]
        s_class = ["Hifz A"]*3+["Hifz B"]*2+["Nazra A"]*2+["Nazra B"]*2+["Alim 1"]*3+["Alim 2"]*2+["Hifz A","Hifz B","Nazra A","Nazra B","Alim 1","Alim 2"]
        sp_ids = []
        students_by_section = {}
        for i, (sn, sc) in enumerate(zip(students, s_class)):
            adm = f"ADM-{i+1:04d}"
            u = User(id=uid(f"u-s{i}"), madrasa_id=MID, username=adm, password_hash=hashed, role=UserRole.student, status=UserStatus.active, created_at=NOW, updated_at=NOW)
            db.add(u); await db.flush()
            is_independent = i in {10, 11}
            sp = StudentProfile(
                id=uid(f"sp-{i}"),
                madrasa_id=MID,
                user_id=u.id,
                name=sn,
                admission_number=adm,
                status="active",
                date_of_birth=date(2010+(i%8),(i%12)+1,(i%28)+1),
                phone=f"+92310{i+1000000:07d}" if is_independent else None,
                is_independent=is_independent,
                b_form_number=f"35202-{2234567+i:07d}-{i%10}",
                address=f"House {i+11}, Suffa Town, Lahore",
                created_at=NOW,
                updated_at=NOW,
            )
            sp_ids.append(sp); db.add(sp)
            await db.flush()
            sec = f"{sc}-{'A' if i%2==0 else 'B'}"
            db.add(Enrollment(
                id=uid(f"enr-{i}"),
                madrasa_id=MID,
                student_id=sp.id,
                class_id=cl_ids[sc].id,
                section_id=sec_ids[sec].id,
                program_id=progs[class_map[sc]].id,
                session_id=s2.id,
                started_on=s2.gregorian_start,
                created_at=NOW,
                updated_at=NOW,
            ))
            students_by_section.setdefault(sec_ids[sec].id, []).append(sp)
        await db.flush()

        # Guardians
        guardians = [("Haji Muhammad Siddique","father","+923001111222"),("Bashir Ahmad","father","+923001111333"),("Naseem Akhtar","uncle","+923001111444")]
        g_profiles = []
        for i,(gn,gr,gp) in enumerate(guardians):
            u = User(id=uid(f"u-g{i}"), madrasa_id=MID, username=f"GR-{i+1:04d}", password_hash=hashed, role=UserRole.parent, status=UserStatus.active, created_at=NOW, updated_at=NOW)
            db.add(u); await db.flush()
            g = Guardian(
                id=uid(f"guard-{i}"),
                madrasa_id=MID,
                user_id=u.id,
                name=gn,
                relationship=gr,
                phone_numbers=gp,
                cnic=f"35202-{3234567+i:07d}-{i%10}",
                address=f"Street {i+1}, Suffa Town, Lahore",
                created_at=NOW,
                updated_at=NOW,
            )
            g_profiles.append(g); db.add(g)
        await db.flush()

        for i, student in enumerate(sp_ids):
            if student.is_independent:
                continue
            guardian = g_profiles[i % len(g_profiles)]
            db.add(StudentGuardian(
                id=uid(f"sg-{i}"),
                madrasa_id=MID,
                student_id=student.id,
                guardian_id=guardian.id,
                relationship=guardian.relationship,
                is_primary=True,
                portal_access=True,
                created_at=NOW,
                updated_at=NOW,
            ))
        await db.flush()

        # Donors
        donors = [("Chaudhry Aslam","+923009876543"),("Haji Anwar","+923009876544"),("Sheikh Rasheed","+923009876545")]
        d_profiles = []
        for i,(dn,dc) in enumerate(donors):
            u = User(id=uid(f"u-d{i}"), madrasa_id=MID, username=f"DN-{i+1:04d}", password_hash=hashed, role=UserRole.donor, status=UserStatus.active, created_at=NOW, updated_at=NOW)
            db.add(u); await db.flush()
            d = Donor(id=uid(f"donor-{i}"), madrasa_id=MID, user_id=u.id, name=dn, contact=dc, created_at=NOW, updated_at=NOW)
            d_profiles.append(d); db.add(d)
        await db.flush()

        # Categories & Donations
        cats = ["Monthly Fee","Admission Fee","Exam Fee","Library Fee","Donation General","Zakat","Sadqa"]
        cat_ids = {}
        for cn in cats:
            c = PaymentCategory(id=uid(f"cat-{cn}"), madrasa_id=MID, name=cn, created_at=NOW, updated_at=NOW)
            cat_ids[cn] = c
            db.add(c)
        await db.flush()

        for i,(dn,_) in enumerate(donors):
            for j in range(2):
                db.add(Donation(id=uid(f"don-{i}-{j}"), madrasa_id=MID, donor_id=d_profiles[i].id, category_id=cat_ids[cats[(i+j+4)%7]].id, amount=5000+i*3000+j*2000, currency="PKR", donation_date=date(2026,7,1+j*15), note="Monthly donation", recorded_by_id=admin_u.id, created_at=NOW, updated_at=NOW))
        await db.flush()

        # Roles
        role_defs = [("Attendance Manager",["attendance.take","students.attendance.manage","teachers.attendance.manage"]),("Finance Clerk",["finance.manage","finance.reports.view"]),("Exam Coordinator",["assessments.exam_types.manage","assessments.marks.enter","assessments.results.publish"])]
        rid_map = {}
        for rn, perms in role_defs:
            r = PermissionRole(id=uid(f"role-{rn}"), madrasa_id=MID, name=rn, created_at=NOW, updated_at=NOW)
            rid_map[rn] = r; db.add(r)
            await db.flush()
            for p in perms:
                db.add(PermissionRoleGrant(id=uid(f"rg-{rn}-{p}"), role_id=r.id, permission_code=p, created_at=NOW, updated_at=NOW))
        await db.flush()

        for i in range(3):
            db.add(UserRoleAssignment(id=uid(f"ura-t{i}"), user_id=t_users[i].id, role_id=rid_map[list(role_defs)[i][0]].id, created_at=NOW, updated_at=NOW))
        await db.flush()

        # Grading scheme
        gs = GradingScheme(id=uid("gs-default"), madrasa_id=MID, name="Default Scheme", bands=[{"label":"A+","min_score":90,"max_score":100},{"label":"A","min_score":80,"max_score":89},{"label":"B","min_score":70,"max_score":79},{"label":"C","min_score":60,"max_score":69},{"label":"D","min_score":50,"max_score":59},{"label":"F","min_score":0,"max_score":49}], created_at=NOW, updated_at=NOW)
        db.add(gs); await db.flush()
        teaching_profiles = [admin_tp, *t_profiles]
        session_months = []
        cursor = date(s2.gregorian_start.year, s2.gregorian_start.month, 1)
        while cursor <= s2.gregorian_end:
            session_months.append(cursor)
            cursor = date(cursor.year + (1 if cursor.month == 12 else 0), 1 if cursor.month == 12 else cursor.month + 1, 1)

        exams = [("Mid Term",30),("Final Term",50),("Assignments",20)]
        for en, ew in exams:
            e = ExamType(id=uid(f"exam-{en}"), madrasa_id=MID, name=en, weightage=ew, grading_scheme_id=gs.id, created_at=NOW, updated_at=NOW)
            db.add(e)
            if en == "Assignments":
                await db.flush()
                for u in range(1,5):
                    db.add(ExamType(id=uid(f"exam-{en}-{u}"), madrasa_id=MID, name=f"Assignment {u}", weightage=5.0, grading_scheme_id=gs.id, parent_exam_type_id=e.id, created_at=NOW, updated_at=NOW))

        # ---- Timetable Slots: full weekly grid for the active academic year ----
        random.seed(42)
        period_times = [("08:00","08:40"),("08:40","09:20"),("09:30","10:10"),("10:10","10:50"),("11:00","11:40"),("11:40","12:20")]
        tslot_i = 0
        teacher_by_class_section_course = {}
        for cn, cl in cl_ids.items():
            for l in ["A","B"]:
                sec = sec_ids[f"{cn}-{l}"]
                assigned_courses = pc_map[class_map[cn]]
                for day in sorted(DEFAULT_SCHOOL_DAY_INDEXES):
                    for period, (st, et) in enumerate(period_times, start=1):
                        co_name = assigned_courses[(day + period - 1) % len(assigned_courses)]
                        teacher_idx = (list(class_map.keys()).index(cn) + {"A":0,"B":1}[l] + day + period) % len(teaching_profiles)
                        teacher = teaching_profiles[teacher_idx]
                        # Keep the admin's self-service timetable obviously populated.
                        if cn == "Hifz A" and l == "A" and period in {1, 2}:
                            teacher = admin_tp
                        db.add(TimetableSlot(id=uid(f"tslot-{tslot_i}"), madrasa_id=MID, session_id=s2.id, class_id=cl.id, section_id=sec.id,
                            course_id=courses[co_name].id, teacher_id=teacher.id, day_of_week=day, period=period,
                            start_time=st, end_time=et, created_at=NOW, updated_at=NOW))
                        teacher_by_class_section_course.setdefault((cl.id, sec.id, courses[co_name].id), teacher.id)
                        tslot_i += 1

        await db.flush()

        # ---- Class/course assessment plans, exams, marks, assignments: full academic year ----
        exam_i = 0
        mark_i = 0
        assignment_i = 0
        submission_i = 0
        for class_name, academic_class in cl_ids.items():
            for course_name in pc_map[class_map[class_name]]:
                course = courses[course_name]
                plan = GradingScheme(
                    id=uid(f"plan-{class_name}-{course_name}"),
                    madrasa_id=MID,
                    name=f"{class_name} {course_name} Plan",
                    bands=gs.bands,
                    include_assignments=True,
                    course_id=course.id,
                    class_id=academic_class.id,
                    assignment_weightage=20,
                    created_at=NOW,
                    updated_at=NOW,
                )
                db.add(plan)
                await db.flush()
                exam_types = []
                for exam_name, weightage in [("Quarter 1", 20), ("Quarter 2", 20), ("Quarter 3", 20), ("Final Term", 20)]:
                    exam = ExamType(
                        id=uid(f"exam-{class_name}-{course_name}-{exam_name}"),
                        madrasa_id=MID,
                        course_id=course.id,
                        class_id=academic_class.id,
                        name=exam_name,
                        weightage=weightage,
                        grading_scheme_id=plan.id,
                        created_at=NOW,
                        updated_at=NOW,
                    )
                    db.add(exam)
                    exam_types.append(exam)
                    exam_i += 1
                section_keys = [key for key in sec_ids if key.startswith(f"{class_name}-")]
                for section_key in section_keys:
                    section = sec_ids[section_key]
                    teacher_id = teacher_by_class_section_course.get((academic_class.id, section.id, course.id), t_profiles[0].id)
                    section_students = students_by_section.get(section.id, [])
                    for student in section_students:
                        for exam in exam_types:
                            score = random.randint(58, 96)
                            db.add(Mark(
                                id=uid(f"mark-{mark_i}"),
                                exam_type_id=exam.id,
                                student_id=student.id,
                                score=score,
                                entered_by_id=teacher_id,
                                created_at=NOW,
                                updated_at=NOW,
                            ))
                            mark_i += 1
                    for month_index, month_start in enumerate(session_months):
                        due_day = min(25, 20 + (month_index % 6))
                        creator_id = admin_tp.id if month_index % 4 == 0 else teacher_id
                        assignment = Assignment(
                            id=uid(f"assignment-{assignment_i}"),
                            madrasa_id=MID,
                            class_id=academic_class.id,
                            section_id=section.id,
                            course_id=course.id,
                            title=f"{course_name} monthly task - {month_start.strftime('%b %Y')}",
                            category="homework" if month_index % 3 else "assessment",
                            instructions=f"Complete the {course_name} practice work for {month_start.strftime('%B %Y')} and submit before the due date.",
                            due_date=datetime(month_start.year, month_start.month, due_day, 12, 0),
                            max_marks=20,
                            weightage=5,
                            created_by_id=creator_id,
                            created_at=NOW,
                            updated_at=NOW,
                        )
                        db.add(assignment)
                        await db.flush()
                        for student in section_students:
                            sub_mark = random.randint(12, 20)
                            submitted_day = min(due_day, 18 + (submission_i % 5))
                            db.add(Submission(
                                id=uid(f"submission-{submission_i}"),
                                assignment_id=assignment.id,
                                student_id=student.id,
                                submitted_at=datetime(month_start.year, month_start.month, submitted_day, 10, 0),
                                file_key=f"madrasas/{MID}/submissions/{assignment.id}/{student.id}.pdf",
                                mark=sub_mark,
                                feedback="Good effort. Keep revising daily.",
                                created_at=NOW,
                                updated_at=NOW,
                            ))
                            submission_i += 1
                        assignment_i += 1

        for student in sp_ids:
            db.add(ResultPublication(
                id=uid(f"publication-{student.id}"),
                madrasa_id=MID,
                student_id=student.id,
                session_id=s2.id,
                published_by_id=admin_u.id,
                created_at=NOW,
                updated_at=NOW,
            ))

        # ---- Operations content ----
        db.add_all([
            Holiday(id=uid("holiday-ashura"), madrasa_id=MID, name="Ashura Break", category="religious", start_date=date(2026, 7, 25), end_date=date(2026, 7, 26), class_ids=None, created_at=NOW, updated_at=NOW),
            Holiday(id=uid("holiday-iqbal"), madrasa_id=MID, name="Iqbal Day", category="national", start_date=date(2026, 11, 9), end_date=date(2026, 11, 9), class_ids=None, created_at=NOW, updated_at=NOW),
            Leave(id=uid("leave-teacher-1"), madrasa_id=MID, user_id=t_users[1].id, start_date=date(2026, 8, 12), end_date=date(2026, 8, 13), reason="Family appointment", status="approved", created_at=NOW, updated_at=NOW),
            Leave(id=uid("leave-student-1"), madrasa_id=MID, user_id=sp_ids[3].user_id, start_date=date(2026, 8, 14), end_date=date(2026, 8, 14), reason="Medical checkup", status="pending", created_at=NOW, updated_at=NOW),
        ])
        resource_category = ResourceCategory(id=uid("resource-cat-quran"), madrasa_id=MID, name="Qur'an Practice", owner_id=None, created_at=NOW, updated_at=NOW)
        db.add(resource_category)
        await db.flush()
        db.add_all([
            Resource(id=uid("resource-tajweed"), madrasa_id=MID, category_id=resource_category.id, title="Tajweed Makharij Guide", description="Printable makharij reference for daily practice.", file_key=f"madrasas/{MID}/resources/tajweed-guide.pdf", video_url=None, visibility_scope={"all": True}, created_by_id=admin_u.id, created_at=NOW, updated_at=NOW),
            Announcement(id=uid("announce-fees"), madrasa_id=MID, title="Monthly fee reminder", body="Please clear August dues before the 10th.", category="finance", attachment_link=None, audience_scope={"roles": ["parent"]}, publish_at=NOW, expires_at=NOW + timedelta(days=15), created_by_id=admin_u.id, created_at=NOW, updated_at=NOW),
            BlogPost(id=uid("blog-hifz"), madrasa_id=MID, title="Daily Hifz Routine", body="A short note on consistency, revision, and adab for Qur'an memorisation.", published=True, publish_at=NOW, author_id=admin_u.id, created_at=NOW, updated_at=NOW),
            ContactEnquiry(id=uid("contact-1"), madrasa_id=MID, name="Muhammad Danish", contact="+923331234567", message="I want admission information for Nazra.", status="new", created_at=NOW, updated_at=NOW),
        ])
        form = Form(
            id=uid("form-parent-feedback"),
            madrasa_id=MID,
            title="Parent Feedback",
            description="Monthly parent feedback form",
            category="survey",
            fields_definition=[{"id": "satisfaction", "label": "Satisfaction", "type": "select", "options": ["Good", "Average", "Needs attention"]}],
            visibility_scope={"roles": ["parent"]},
            open_from=NOW - timedelta(days=7),
            open_until=NOW + timedelta(days=21),
            allow_multiple=False,
            created_by_id=admin_u.id,
            created_at=NOW,
            updated_at=NOW,
        )
        admission_form = AdmissionForm(
            id=uid("admission-form-2026"),
            madrasa_id=MID,
            program_id=progs["Nazra"].id,
            title="Nazra Admissions 2026",
            category="Admissions",
            description="Public admission form for new Nazra students.",
            fields_definition=[{"id": "previous_school", "label": "Previous school", "type": "text", "required": False}],
            public_token="nazra-2026",
            is_open=True,
            created_by_id=admin_u.id,
            created_at=NOW,
            updated_at=NOW,
        )
        db.add_all([form, admission_form])
        await db.flush()
        db.add_all([
            FormResponse(id=uid("form-response-1"), madrasa_id=MID, form_id=form.id, guardian_id=g_profiles[0].id, ward_id=sp_ids[0].id, submitted_by_id=g_profiles[0].user_id, response_data={"satisfaction": "Good"}, created_at=NOW, updated_at=NOW),
            AdmissionApplication(id=uid("admission-app-1"), madrasa_id=MID, applicant_name="Huzaifa Salman", guardian_contact="+923331112233", program_id=progs["Nazra"].id, date_of_birth=date(2016, 4, 12), notes="Interested in morning section.", status="pending", status_history=[{"status": "pending", "at": NOW.isoformat()}], form_id=admission_form.id, extra_data={"previous_school": "Home"}, form_title_snapshot=admission_form.title, fields_definition_snapshot=admission_form.fields_definition, created_at=NOW, updated_at=NOW),
        ])

        # ---- Messaging/settings fixtures ----
        db.add_all([
            MessageTemplate(id=uid("tmpl-credentials"), madrasa_id=MID, code="credentials", name="Credentials", content={"en": "Assalamu alaikum {name}, your Suffa MS login is {username}.", "ur": "{name}، آپ کا سفہ ایم ایس لاگ ان {username} ہے۔"}, created_at=NOW, updated_at=NOW),
            MessageTemplate(id=uid("tmpl-receipt"), madrasa_id=MID, code="receipt", name="Receipt", content={"en": "Receipt for {name}: {amount}", "ur": "{name} کی رسید: {amount}"}, created_at=NOW, updated_at=NOW),
            MessageLog(id=uid("msg-log-1"), madrasa_id=MID, template_code="credentials", recipient_number=g_profiles[0].phone_numbers, recipient_type="guardian", recipient_id=g_profiles[0].id, dispatched_at=NOW - timedelta(days=1), sent_by_id=admin_u.id, content_sent="Seed credential message", created_at=NOW, updated_at=NOW),
            MadrasaSetting(id=uid("setting-name-en"), madrasa_id=MID, key="madrasa.name_en", value="Suffa MS", created_at=NOW, updated_at=NOW),
            MadrasaSetting(id=uid("setting-name-ur"), madrasa_id=MID, key="madrasa.name_ur", value="جامعہ سفہ", created_at=NOW, updated_at=NOW),
            MadrasaSetting(id=uid("setting-phone"), madrasa_id=MID, key="madrasa.phone", value="+923001112233", created_at=NOW, updated_at=NOW),
            MadrasaSetting(id=uid("setting-address"), madrasa_id=MID, key="madrasa.address", value="Suffa Road, Lahore", created_at=NOW, updated_at=NOW),
            MadrasaSetting(id=uid("setting-school-days"), madrasa_id=MID, key="attendance.school_days", value="[0,1,2,3,4,5]", created_at=NOW, updated_at=NOW),
        ])

        # ---- Student/teacher Attendance: every school day for the full active session ----
        random.seed(99)
        school_days = []
        d = s2.gregorian_start
        while d <= s2.gregorian_end:
            if d.weekday() in DEFAULT_SCHOOL_DAY_INDEXES:
                school_days.append(d)
            d += timedelta(days=1)
        att_i = 0
        for sp in sp_ids:
            for ad in school_days:
                status = random.choices(["present","absent","leave"],weights=[85,10,5])[0]
                db.add(StudentAttendance(id=uid(f"satt-{att_i}"), madrasa_id=MID, student_id=sp.id, session_id=s2.id,
                    attendance_date=ad, status=status, marked_at=datetime(ad.year,ad.month,ad.day,8,30,0),
                    marked_by_id=admin_u.id, idempotency_key=f"satt-{att_i}", created_at=NOW, updated_at=NOW))
                att_i += 1

        for tp in teaching_profiles:
            for ad in school_days:
                status = random.choices(["present","absent"],weights=[90,10])[0]
                ta = TeacherAttendance(id=uid(f"tatt-{att_i}"), madrasa_id=MID, teacher_id=tp.id, session_id=s2.id,
                    attendance_date=ad, status=status, marked_at=datetime(ad.year,ad.month,ad.day,8,30,0),
                    marked_by_id=admin_u.id, idempotency_key=f"tatt-{att_i}", created_at=NOW, updated_at=NOW)
                if status == "present":
                    ta.check_in = random.choice([time(7,50),time(7,55),time(8,0),time(8,5),time(8,10)])
                    ta.check_out = random.choice([time(12,0),time(12,30),time(13,0),time(13,30),time(14,0)])
                db.add(ta)
                att_i += 1

        # ---- Payments: admission plus monthly dues for the full academic year ----
        pay_i = 0
        for sp in sp_ids:
            db.add(Payment(id=uid(f"pay-{pay_i}"), madrasa_id=MID, student_id=sp.id, category_id=cat_ids["Admission Fee"].id,
                amount=1500.0, currency="PKR", payment_date=s2.gregorian_start, note="Admission fee",
                recorded_by_id=admin_u.id, created_at=NOW, updated_at=NOW))
            pay_i += 1
            for month_index, month_start in enumerate(session_months):
                pay_day = min(10, 5 + (month_index % 5))
                db.add(Payment(id=uid(f"pay-{pay_i}"), madrasa_id=MID, student_id=sp.id, category_id=cat_ids["Monthly Fee"].id,
                    amount=750.0 + (month_index % 3) * 50, currency="PKR",
                    payment_date=date(month_start.year, month_start.month, pay_day), note=f"Monthly dues for {month_start.strftime('%B %Y')}",
                    recorded_by_id=admin_u.id, created_at=NOW, updated_at=NOW))
                pay_i += 1

        # ---- Donations: recurring support across the full academic year ----
        donation_i = 100
        for donor_i, donor in enumerate(d_profiles):
            for month_index, month_start in enumerate(session_months):
                db.add(Donation(
                    id=uid(f"don-monthly-{donation_i}"),
                    madrasa_id=MID,
                    donor_id=donor.id,
                    category_id=cat_ids[["Donation General", "Zakat", "Sadqa"][(donor_i + month_index) % 3]].id,
                    amount=5000 + donor_i * 2500 + (month_index % 4) * 1000,
                    currency="PKR",
                    donation_date=date(month_start.year, month_start.month, min(18, 12 + (month_index % 6))),
                    note=f"Recurring support for {month_start.strftime('%B %Y')}",
                    recorded_by_id=admin_u.id,
                    created_at=NOW,
                    updated_at=NOW,
                ))
                donation_i += 1

        # ---- Salary Records and payments for the full academic year ----
        for i, tp in enumerate(teaching_profiles):
            db.add(SalaryRecord(id=uid(f"sal-{i}"), madrasa_id=MID, teacher_id=tp.id, amount=15000.0+5000*i,
                currency="PKR", effective_from=s2.gregorian_start, created_at=NOW, updated_at=NOW))
            for month_index, month_start in enumerate(session_months):
                db.add(SalaryPayment(id=uid(f"salpay-{i}-{month_index}"), madrasa_id=MID, teacher_id=tp.id, amount=15000.0+5000*i,
                    currency="PKR", payment_date=date(month_start.year, month_start.month, 28), period_covered=month_start.strftime("%B %Y"), method="bank_transfer",
                    note="Monthly salary", recorded_by_id=admin_u.id, created_at=NOW, updated_at=NOW))

        await db.commit()
        print("Seed complete!")

        print("\n  Admin: admin / abcd1234")
        print("  Teachers: TCH-0001 … TCH-0005 / abcd1234")
        print("  Students: ADM-0001 … ADM-0020 / abcd1234")
        print("  Guardians: GR-0001 … GR-0003 / abcd1234")
        print("  Donors: DN-0001 … DN-0003 / abcd1234")

if __name__ == "__main__":
    asyncio.run(seed())

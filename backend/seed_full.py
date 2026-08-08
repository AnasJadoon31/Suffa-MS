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
from app.modules.people.models import TeacherProfile, StudentProfile, Guardian
from app.modules.finance.models import Donor, Donation, Payment, PaymentCategory, SalaryRecord, SalaryPayment
from app.modules.assessments.models import GradingScheme, ExamType
from app.modules.attendance.models import StudentAttendance, TeacherAttendance
from app.modules.operations.models import TimetableSlot
from app.modules.finance.models import Payment, SalaryRecord, SalaryPayment

PASSWORD = "abcd1234"
NOW = datetime.utcnow()
MID = UUID(hashlib.md5(b"madrasa").hexdigest())
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
        db.add(TeacherProfile(id=uid("tp-admin"), madrasa_id=MID, user_id=admin_u.id, employee_code="ADMIN", name="Admin Sahib", status="active", whatsapp_number="+923001111111", join_date=date(2020,1,1), is_principal_delegate=True, created_at=NOW, updated_at=NOW))
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
        for i, (sn, sc) in enumerate(zip(students, s_class)):
            adm = f"ADM-{i+1:04d}"
            u = User(id=uid(f"u-s{i}"), madrasa_id=MID, username=adm, password_hash=hashed, role=UserRole.student, status=UserStatus.active, created_at=NOW, updated_at=NOW)
            db.add(u); await db.flush()
            sp = StudentProfile(id=uid(f"sp-{i}"), madrasa_id=MID, user_id=u.id, name=sn, admission_number=adm, status="active", date_of_birth=date(2010+(i%8),(i%12)+1,(i%28)+1), phone=f"+92310{i+1000000:07d}", created_at=NOW, updated_at=NOW)
            sp_ids.append(sp); db.add(sp)
            await db.flush()
            sec = f"{sc}-{'A' if i%2==0 else 'B'}"
            db.add(Enrollment(id=uid(f"enr-{i}"), madrasa_id=MID, student_id=sp.id, class_id=cl_ids[sc].id, section_id=sec_ids[sec].id, program_id=progs[class_map[sc]].id, session_id=s2.id, created_at=NOW, updated_at=NOW))
        await db.flush()

        # Guardians
        guardians = [("Haji Muhammad Siddique","father","+923001111222"),("Bashir Ahmad","father","+923001111333"),("Naseem Akhtar","uncle","+923001111444")]
        g_profiles = []
        for i,(gn,gr,gp) in enumerate(guardians):
            u = User(id=uid(f"u-g{i}"), madrasa_id=MID, username=f"GR-{i+1:04d}", password_hash=hashed, role=UserRole.parent, status=UserStatus.active, created_at=NOW, updated_at=NOW)
            db.add(u); await db.flush()
            g = Guardian(id=uid(f"guard-{i}"), madrasa_id=MID, user_id=u.id, name=gn, relationship=gr, phone_numbers=gp, created_at=NOW, updated_at=NOW)
            g_profiles.append(g); db.add(g)
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

        exams = [("Mid Term",30),("Final Term",50),("Assignments",20)]
        for en, ew in exams:
            e = ExamType(id=uid(f"exam-{en}"), madrasa_id=MID, name=en, weightage=ew, grading_scheme_id=gs.id, created_at=NOW, updated_at=NOW)
            db.add(e)
            if en == "Assignments":
                await db.flush()
                for u in range(1,5):
                    db.add(ExamType(id=uid(f"exam-{en}-{u}"), madrasa_id=MID, name=f"Assignment {u}", weightage=5.0, grading_scheme_id=gs.id, parent_exam_type_id=e.id, created_at=NOW, updated_at=NOW))

        # ---- Timetable Slots ----
        random.seed(42)
        course_names = list(courses.keys())
        period_times = [("08:00","08:40"),("08:40","09:20"),("09:30","10:10"),("10:10","10:50"),("11:00","11:40"),("11:40","12:20")]
        tslot_i = 0
        for cn, cl in cl_ids.items():
            for l in ["A","B"]:
                sec = sec_ids[f"{cn}-{l}"]
                assigned_courses = pc_map[class_map[cn]]
                for ci, co_name in enumerate(assigned_courses):
                    teacher_idx = (list(class_map.keys()).index(cn) * 2 + {"A":0,"B":1}[l] + ci) % len(t_profiles)
                    day = (ci + {"A":0,"B":3}[l]) % 6
                    period = ci % len(period_times)
                    st, et = period_times[period]
                    db.add(TimetableSlot(id=uid(f"tslot-{tslot_i}"), madrasa_id=MID, session_id=s2.id, class_id=cl.id, section_id=sec.id,
                        course_id=courses[co_name].id, teacher_id=t_profiles[teacher_idx].id, day_of_week=day, period=period+1,
                        start_time=st, end_time=et, created_at=NOW, updated_at=NOW))
                    tslot_i += 1

        # ---- Student Attendance (all school days up to today) ----
        random.seed(99)
        today = date.today()
        school_days = []
        d = date(2026,7,20)
        while d <= today:
            if d.weekday() < 5:  # Mon-Fri
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

        # ---- Teacher Attendance (last 14 school days) ----
        for tp in t_profiles:
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

        # ---- Payments ----
        fee_cat_ids = [cat_ids[c].id for c in ["Monthly Fee","Admission Fee"]]
        pay_i = 0
        for sp in sp_ids[:10]:
            for fc in fee_cat_ids:
                db.add(Payment(id=uid(f"pay-{pay_i}"), madrasa_id=MID, student_id=sp.id, category_id=fc,
                    amount=500.0 if "Monthly" in cats[0] else 1000.0, currency="PKR",
                    payment_date=school_days[pay_i % len(school_days)], recorded_by_id=admin_u.id, created_at=NOW, updated_at=NOW))
                pay_i += 1

        # ---- Salary Records ----
        for i, tp in enumerate(t_profiles):
            db.add(SalaryRecord(id=uid(f"sal-{i}"), madrasa_id=MID, teacher_id=tp.id, amount=15000.0+5000*i,
                currency="PKR", effective_from=date(2026,7,1), created_at=NOW, updated_at=NOW))
            db.add(SalaryPayment(id=uid(f"salpay-{i}"), madrasa_id=MID, teacher_id=tp.id, amount=15000.0+5000*i,
                currency="PKR", payment_date=date(2026,8,1), period_covered="July 2026", method="bank_transfer",
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

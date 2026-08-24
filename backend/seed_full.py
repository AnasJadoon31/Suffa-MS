"""Complete production-like seed using ORM. All passwords = abcd1234.

Mimics a real madrasa with 4 programs, 3 academic sessions, student promotion,
full attendance/exam/assignment history, daily reports, finance, and operations.

Programs:
  Hifz-ul-Qur'an      : 1 class, 2 sections, 30 students/section
  Nazra               : 2 classes, 2 sections each, 30 students/section
  Dars e Nizami       : 8 classes, 1 section each, 30 students/section, 6 courses/class
  Night Alim Course   : 6 classes, 1 section each, 10 students/section, 4 courses/class

Sessions: 1446/2024-25 (inactive), 1447/2025-26 (inactive), 1448/2026-27 (active).
Students are promoted to the next class in each subsequent session.
"""
import asyncio, hashlib, random
from datetime import date, datetime, timedelta, time
from uuid import UUID

from sqlalchemy import text

from app.core.security import hash_password
from app.db import core_models  # noqa: F401  ensure FileObject loaded for FK resolution
from app.db.session import SessionLocal
from app.modules.academics.models import (
    AcademicSession, AcademicClass, Course, Enrollment, Madrasa, Program,
    ClassCourse, Section, DailyReportConfig, DailyReportEntry,
)
from app.modules.auth.models import (
    User, UserRole, UserStatus, PermissionRole, PermissionRoleGrant, UserRoleAssignment,
)
from app.modules.people.models import (
    TeacherProfile, StudentProfile, Guardian, StudentGuardian,
)
from app.modules.finance.models import (
    Donor, Donation, Payment, PaymentCategory, SalaryRecord, SalaryPayment,
)
from app.modules.assessments.models import (
    Assignment, GradingScheme, ExamType, Mark, ResultPublication, Submission,
)
from app.modules.attendance.models import StudentAttendance, TeacherAttendance
from app.modules.operations.models import (
    AdmissionApplication, AdmissionForm, Announcement, BlogPost, ContactEnquiry,
    Form, FormResponse, Holiday, Leave, MadrasaSetting, Resource, ResourceCategory,
    TimetableSlot,
)
from app.modules.messaging.models import MessageLog, MessageTemplate

# ---------------------------------------------------------------------------
# Constants & deterministic-ID helpers
# ---------------------------------------------------------------------------
PASSWORD = "abcd1234"
NOW = datetime.utcnow()
MID = UUID(hashlib.md5(b"madrasa").hexdigest())


def uid(s):
    """Deterministic UUID from a string key (stable across re-seeds)."""
    return UUID(hashlib.md5(s.encode()).hexdigest())


# ---------------------------------------------------------------------------
# Program / class / section structure
# ---------------------------------------------------------------------------
# Each entry: (program_name, class_name, section_name, student_count, [course_names])
PROGRAM_STRUCTURE = [
    # Hifz-ul-Qur'an: 1 class, 2 sections, 30/section
    ("Hifz-ul-Qur'an", "Hifz", "A", 30, ["Qur'an", "Tajweed", "Arabic Grammar"]),
    ("Hifz-ul-Qur'an", "Hifz", "B", 30, ["Qur'an", "Tajweed", "Arabic Grammar"]),
    # Nazra: 2 classes, 2 sections each, 30/section
    ("Nazra", "Nazra 1", "A", 30, ["Qur'an", "Tajweed", "Urdu"]),
    ("Nazra", "Nazra 1", "B", 30, ["Qur'an", "Tajweed", "Urdu"]),
    ("Nazra", "Nazra 2", "A", 30, ["Qur'an", "Tajweed", "Urdu"]),
    ("Nazra", "Nazra 2", "B", 30, ["Qur'an", "Tajweed", "Urdu"]),
    # Dars e Nizami: 8 classes, 1 section each, 30/section, 6 courses
    ("Dars e Nizami", "Alim 1", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    ("Dars e Nizami", "Alim 2", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    ("Dars e Nizami", "Alim 3", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    ("Dars e Nizami", "Alim 4", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    ("Dars e Nizami", "Alim 5", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    ("Dars e Nizami", "Alim 6", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    ("Dars e Nizami", "Alim 7", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    ("Dars e Nizami", "Alim 8", "A", 30, ["Qur'an", "Hadith", "Fiqh", "Arabic Grammar", "Nahw", "Sarf"]),
    # Night Alim Course: 6 classes, 1 section each, 10/section, 4 courses
    ("Night Alim Course", "Night Alim 1", "A", 10, ["Qur'an", "Hadith", "Fiqh", "Arabic"]),
    ("Night Alim Course", "Night Alim 2", "A", 10, ["Qur'an", "Hadith", "Fiqh", "Arabic"]),
    ("Night Alim Course", "Night Alim 3", "A", 10, ["Qur'an", "Hadith", "Fiqh", "Arabic"]),
    ("Night Alim Course", "Night Alim 4", "A", 10, ["Qur'an", "Hadith", "Fiqh", "Arabic"]),
    ("Night Alim Course", "Night Alim 5", "A", 10, ["Qur'an", "Hadith", "Fiqh", "Arabic"]),
    ("Night Alim Course", "Night Alim 6", "A", 10, ["Qur'an", "Hadith", "Fiqh", "Arabic"]),
]

# School days: 0=Mon .. 6=Sun.  Night Alim = Sat-Thu (5,6,0,1,2,3), Fri off.
# All others = Mon-Sat (0-5), Sun off.
NIGHT_ALIM_DAYS = {5, 6, 0, 1, 2, 3}  # Sat-Thu
REGULAR_DAYS = {0, 1, 2, 3, 4, 5}     # Mon-Sat

PERIOD_TIMES = [
    ("08:00", "08:40"), ("08:40", "09:20"), ("09:30", "10:10"),
    ("10:10", "10:50"), ("11:00", "11:40"), ("11:40", "12:20"),
]

# Daily report fields per class: (field_id, label, required)
DR_FIELDS = [
    ("attendance", "Attendance", True),
    ("hifz_revision", "Hifz / Revision", True),
    ("recitation", "Recitation Quality", False),
    ("manners", "Manners & Behaviour", True),
    ("homework", "Homework Completion", False),
    ("remarks", "Teacher Remarks", False),
]

# ---------------------------------------------------------------------------
# Name pools for realistic data generation
# ---------------------------------------------------------------------------
STUDENT_FIRST_NAMES = [
    "Muhammad Ali", "Ahmed Hassan", "Bilal Ahmed", "Usman Ghani", "Farooq Siddique",
    "Abdullah Khan", "Hamza Malik", "Saad Iqbal", "Yousuf Tariq", "Hassan Raza",
    "Imran Butt", "Khalid Mehmood", "Zain ul Abideen", "Zubair Khalid", "Ayesha Fatima",
    "Maryam Noor", "Fatima Zahra", "Rukhsana Bibi", "Saima Javed", "Nusrat Bibi",
    "Tariq Jameel", "Noman Ali", "Waqar Younis", "Shoaib Akhtar", "Shahid Afridi",
    "Mohsin Khan", "Fawad Alam", "Asad Shafiq", "Babar Azam", "Shaheen Shah",
    "Hasan Ali", "Haris Rauf", "Shaheen Afridi", "Mohammad Rizwan", "Fakhar Zaman",
    "Imam ul Haq", "Shadab Khan", "Faheem Ashraf", "Imad Wasim", "Sarfaraz Ahmed",
    "Rashid Latif", "Waqar Younis", "Saeed Anwar", "Inzamam ul Haq", "Misbah ul Haq",
    "Younis Khan", "Kamran Akmal", "Umar Akmal", "Shoaib Malik", "Azhar Ali",
]
STUDENT_LAST_NAMES = [
    "Khan", "Ahmed", "Malik", "Hussain", "Shah", "Qureshi", "Syed", "Raza",
    "Baig", "Chaudhry", "Sheikh", "Mirza", "Siddiqui", "Hashmi", "Gilani",
]
GUARDIAN_NAMES = [
    "Haji Muhammad Siddique", "Bashir Ahmad", "Naseem Akhtar", "Abdul Rasheed",
    "Khalil Ahmed", "Rashid Mahmood", "Zafar Iqbal", "Tariq Mahmood",
    "Muhammad Aslam", "Ghulam Nabi", "Noor Muhammad", "Fazal Karim",
    "Sardar Ali", "Mehmood Akhtar", "Jahangir Khan", "Akbar Ali",
    "Hafiz Muhammad Yunis", "Shafiq ur Rehman", "Naeem Ahmed", "Wali Muhammad",
    "Ismail Khan", "Yaqoob Ali", "Hanif Ahmed", "Sirajuddin", "Majid Khan",
    "Anwar Ali", "Sadiq Hussain", "Iftikhar Ahmed", "Zahoor Ahmed", "Muzammil Hussain",
    "Abdul Qadeer", "Habibullah", "Muhammad Nawaz", "Saeed Ahmed", "Riaz Ahmed",
    "Pervez Iqbal", "Ghulam Mustafa", "Abdul Haq", "Maula Bakhsh", "Khalid Pervaiz",
    "Shujaat Hussain", "Chaudhry Pervez", "Malik Riaz", "Haji Anwar", "Sheikh Rasheed",
    "Chaudhry Shujaat", "Mian Muhammad", "Sardar Farooq", "Haji Muhammad",
    "Muhammad Ismail",
]
DONOR_NAMES = [
    "Chaudhry Aslam", "Haji Anwar", "Sheikh Rasheed", "Malik Saeed",
    "Haji Muhammad Iqbal", "Sheikh Tariq", "Chaudhry Ahmed", "Haji Farooq",
    "Muhammad Rashid", "Haji Noor Khan", "Sheikh Jameel", "Chaudhry Yousaf",
    "Haji Mukhtar", "Muhammad Yameen", "Sheikh Nadeem", "Chaudhry Faisal",
    "Haji Zahid", "Muhammad Arif", "Sheikh Waseem", "Chaudhry Rashid",
    "Haji Shakeel", "Muhammad Naeem", "Sheikh Aamir", "Chaudhry Idrees",
    "Haji Rafi", "Muhammad Sabir", "Sheikh Khalid", "Chaudhry Mazhar",
    "Haji Aftab", "Muhammad Ilyas", "Sheikh Pervez", "Chaudhry Akram",
    "Haji Sajjad", "Muhammad Mushtaq", "Sheikh Ijaz", "Chaudhry Zafar",
    "Haji Mukhtar Ahmed", "Muhammad Saleem", "Sheikh Mukhtar", "Chaudhry Naeem",
    "Haji Abdul Sattar", "Muhammad Ramzan", "Sheikh Abdul Rehman", "Chaudhry Mukhtar",
    "Haji Muhammad Younas", "Muhammad Yousaf", "Sheikh Muhammad Ali", "Chaudhry Muhammad",
    "Haji Muhammad Aslam",
]
TEACHER_NAMES = [
    "Molvi Abdul Rahman", "Qari Hafiz Saeed", "Allama Irfan Shah",
    "Mufti Tariq Masood", "Maulana Zubair Ahmed", "Dr. Hamid Ali Shah",
    "Maulana Obaidullah", "Qari Muhammad Ismail", "Molvi Muhammad Sharif",
    "Allama Tariq Jamil", "Mufti Abu Lubaba", "Maulana Fazlur Rehman",
    "Dr. Muhammad Tahir", "Maulana Abdul Qadir", "Qari Muhammad Asim",
]
TEACHER_QUALIFICATIONS = [
    "MA Islamic Studies", "Hafiz-ul-Qur'an", "Mufti", "PhD Arabic",
    "MPhil Urdu", "MA Arabic", "Maulvi Fazil", "MA Hadith",
    "PhD Islamic Studies", "MA Fiqh", "MA Tafsir", "MA Education",
    "MA History", "MA Pakistan Studies", "MA Economics",
]

# ---------------------------------------------------------------------------
# Helper: generate a unique name with index
# ---------------------------------------------------------------------------
def student_name(i):
    first = STUDENT_FIRST_NAMES[i % len(STUDENT_FIRST_NAMES)]
    last = STUDENT_LAST_NAMES[(i // len(STUDENT_FIRST_NAMES)) % len(STUDENT_LAST_NAMES)]
    if i >= len(STUDENT_FIRST_NAMES):
        return f"{first} {last} {i}"
    return f"{first} {last}"


def phone_num(seed_val):
    return f"+92300{1000000 + seed_val:07d}"


def cnic_num(seed_val):
    return f"35202-{1000000 + seed_val:07d}-{(seed_val % 10)}"


# ===========================================================================
# MAIN SEED
# ===========================================================================
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
        random.seed(42)

        # ------------------------------------------------------------------
        # Madrasa
        # ------------------------------------------------------------------
        madrasa = Madrasa(
            id=MID, slug="suffa", name="Suffa MS", content_language="ur",
            public_key="seed-pk", created_at=NOW, updated_at=NOW,
        )
        db.add(madrasa)
        await db.flush()

        # ------------------------------------------------------------------
        # Academic Sessions (3)
        # ------------------------------------------------------------------
        sessions = []
        for idx, (hijri, gy_start, gy_end, active) in enumerate([
            ("1446", date(2024, 6, 1), date(2025, 5, 31), False),
            ("1447", date(2025, 6, 1), date(2026, 5, 31), False),
            ("1448", date(2026, 6, 1), date(2027, 5, 31), True),
        ]):
            s = AcademicSession(
                id=uid(f"s{idx + 1}"), madrasa_id=MID,
                name=f"{hijri} / {gy_start.year}-{gy_end.year}",
                gregorian_start=gy_start, gregorian_end=gy_end,
                hijri_span=hijri, is_active=active,
                created_at=NOW, updated_at=NOW,
            )
            sessions.append(s)
            db.add(s)
        await db.flush()
        ACTIVE_SESSION = sessions[-1]  # 1448 is the current active session

        # ------------------------------------------------------------------
        # Programs
        # ------------------------------------------------------------------
        program_names = ["Hifz-ul-Qur'an", "Nazra", "Dars e Nizami", "Night Alim Course"]
        programs = {}
        for pn in program_names:
            p = Program(
                id=uid(f"p-{pn}"), madrasa_id=MID, name=pn,
                created_at=NOW, updated_at=NOW,
            )
            programs[pn] = p
            db.add(p)
        await db.flush()

        # ------------------------------------------------------------------
        # Courses (union of all course names used across programs)
        # ------------------------------------------------------------------
        all_course_names = set()
        for _, _, _, _, cnames in PROGRAM_STRUCTURE:
            all_course_names.update(cnames)
        courses = {}
        for cn in sorted(all_course_names):
            c = Course(
                id=uid(f"c-{cn}"), madrasa_id=MID, name=cn,
                created_at=NOW, updated_at=NOW,
            )
            courses[cn] = c
            db.add(c)
        await db.flush()

        # ------------------------------------------------------------------
        # Classes, Sections, ClassCourses
        # ------------------------------------------------------------------
        classes = {}    # class_name -> AcademicClass
        sections = {}   # (class_name, section_name) -> Section
        class_courses = {}  # (class_name, course_name) -> ClassCourse

        for prog_name, class_name, sec_name, count, cnames in PROGRAM_STRUCTURE:
            if class_name not in classes:
                cl = AcademicClass(
                    id=uid(f"cl-{class_name}"), madrasa_id=MID,
                    program_id=programs[prog_name].id, name=class_name,
                    default_portal_enabled=True, created_at=NOW, updated_at=NOW,
                )
                classes[class_name] = cl
                db.add(cl)
        await db.flush()

        for prog_name, class_name, sec_name, count, cnames in PROGRAM_STRUCTURE:
            key = (class_name, sec_name)
            if key not in sections:
                sec = Section(
                    id=uid(f"sec-{class_name}-{sec_name}"), madrasa_id=MID,
                    class_id=classes[class_name].id, name=f"{class_name}-{sec_name}",
                    created_at=NOW, updated_at=NOW,
                )
                sections[key] = sec
                db.add(sec)
        await db.flush()

        for prog_name, class_name, sec_name, count, cnames in PROGRAM_STRUCTURE:
            for cn in cnames:
                cc_key = (class_name, cn)
                if cc_key not in class_courses:
                    cc = ClassCourse(
                        id=uid(f"cc-{class_name}-{cn}"), madrasa_id=MID,
                        class_id=classes[class_name].id, course_id=courses[cn].id,
                        created_at=NOW, updated_at=NOW,
                    )
                    class_courses[cc_key] = cc
                    db.add(cc)
        await db.flush()

        # ------------------------------------------------------------------
        # Daily Report Configs (one per class, enabled)
        # ------------------------------------------------------------------
        for class_name, cl in classes.items():
            drc = DailyReportConfig(
                id=uid(f"drc-{class_name}"), madrasa_id=MID,
                class_id=cl.id, enabled=True,
                fields_definition=[
                    {
                        "key": fid,
                        "label": label,
                        "type": "text",
                        "required": req,
                        "options": [],
                        "enabled": True,
                    }
                    for fid, label, req in DR_FIELDS
                ],
                created_at=NOW, updated_at=NOW,
            )
            db.add(drc)
        await db.flush()

        # ------------------------------------------------------------------
        # Teachers (15) — 3 principals, 5 with roles, 7 plain teachers
        # ------------------------------------------------------------------
        teacher_users = []
        teacher_profiles = []
        for i, tn in enumerate(TEACHER_NAMES):
            code = f"TCH-{i + 1:04d}"
            is_principal = i < 3
            u = User(
                id=uid(f"u-t{i}"), madrasa_id=MID, username=code, name=tn,
                password_hash=hashed,
                role=UserRole.principal if is_principal else UserRole.teacher,
                status=UserStatus.active, created_at=NOW, updated_at=NOW,
            )
            teacher_users.append(u)
            db.add(u)
            await db.flush()
            tp = TeacherProfile(
                id=uid(f"tp-{i}"), madrasa_id=MID, user_id=u.id,
                employee_code=code, name=tn, status="active",
                whatsapp_number=phone_num(2000 + i),
                join_date=date(2018 + (i % 6), 6, 1),
                cnic=cnic_num(3000 + i),
                qualifications=TEACHER_QUALIFICATIONS[i % len(TEACHER_QUALIFICATIONS)],
                is_principal_delegate=is_principal,
                created_at=NOW, updated_at=NOW,
            )
            teacher_profiles.append(tp)
            db.add(tp)
        await db.flush()

        # ------------------------------------------------------------------
        # Students — generate all unique students up front
        # ------------------------------------------------------------------
        total_students = sum(count for _, _, _, count, _ in PROGRAM_STRUCTURE)
        all_students = []  # list of (StudentProfile, user, program, class_name, section_key)
        student_idx = 0

        for prog_name, class_name, sec_name, count, cnames in PROGRAM_STRUCTURE:
            for j in range(count):
                sn = student_name(student_idx)
                adm = f"ADM-{student_idx + 1:05d}"
                is_independent = (student_idx % 15 == 0)  # ~7% independent
                is_incomplete = (student_idx % 12 == 0) and not is_independent  # some incomplete profiles
                u = User(
                    id=uid(f"u-s{student_idx}"), madrasa_id=MID, username=adm,
                    name=sn, password_hash=hashed, role=UserRole.student,
                    status=UserStatus.active, created_at=NOW, updated_at=NOW,
                )
                db.add(u)
                await db.flush()
                sp = StudentProfile(
                    id=uid(f"sp-{student_idx}"), madrasa_id=MID, user_id=u.id,
                    name=sn, admission_number=adm, status="active",
                    date_of_birth=date(2005 + (student_idx % 10), (student_idx % 12) + 1, (student_idx % 28) + 1),
                    phone=phone_num(4000 + student_idx) if is_independent else None,
                    is_independent=is_independent,
                    b_form_number=cnic_num(5000 + student_idx) if not is_incomplete else None,
                    address=f"House {student_idx + 1}, Suffa Town, Lahore" if not is_incomplete else None,
                    created_at=NOW, updated_at=NOW,
                )
                db.add(sp)
                await db.flush()
                all_students.append((sp, u, prog_name, class_name, (class_name, sec_name)))
                student_idx += 1

        print(f"  Created {len(all_students)} students")

        # ------------------------------------------------------------------
        # Enrollments — students enrolled in each of the 3 sessions with promotion
        # ------------------------------------------------------------------
        # For each program, determine the ordered list of classes.
        program_classes = {}
        for prog_name, class_name, sec_name, count, cnames in PROGRAM_STRUCTURE:
            if prog_name not in program_classes:
                program_classes[prog_name] = []
            if class_name not in program_classes[prog_name]:
                program_classes[prog_name].append(class_name)

        enrollment_i = 0
        for session in sessions:
            for sp, u, prog_name, orig_class_name, orig_section_key in all_students:
                # Determine which class this student is in for this session.
                # Session 0 -> original class, Session 1 -> +1 promotion, Session 2 -> +2 promotion
                session_idx = sessions.index(session)
                class_list = program_classes[prog_name]
                orig_idx = class_list.index(orig_class_name)
                promoted_idx = min(orig_idx + session_idx, len(class_list) - 1)
                current_class_name = class_list[promoted_idx]
                # Section stays the same letter
                sec_name = orig_section_key[1]
                current_section_key = (current_class_name, sec_name)

                # If the promoted class doesn't have this section, use the first available
                if current_section_key not in sections:
                    for key in sections:
                        if key[0] == current_class_name:
                            current_section_key = key
                            break

                sec = sections[current_section_key]
                cl = classes[current_class_name]

                db.add(Enrollment(
                    id=uid(f"enr-{enrollment_i}"), madrasa_id=MID,
                    student_id=sp.id, class_id=cl.id, section_id=sec.id,
                    program_id=programs[prog_name].id, session_id=session.id,
                    started_on=session.gregorian_start, created_at=NOW, updated_at=NOW,
                ))
                enrollment_i += 1
                if enrollment_i % 500 == 0:
                    await db.flush()
        await db.flush()
        print(f"  Created {enrollment_i} enrollments")

        # ------------------------------------------------------------------
        # Guardians (50)
        # ------------------------------------------------------------------
        guardian_users = []
        guardian_profiles = []
        for i in range(50):
            gn = GUARDIAN_NAMES[i % len(GUARDIAN_NAMES)]
            if i >= len(GUARDIAN_NAMES):
                gn = f"{gn} {i}"
            u = User(
                id=uid(f"u-g{i}"), madrasa_id=MID, username=f"GR-{i + 1:04d}",
                name=gn, password_hash=hashed, role=UserRole.parent,
                status=UserStatus.active, created_at=NOW, updated_at=NOW,
            )
            guardian_users.append(u)
            db.add(u)
            await db.flush()
            g = Guardian(
                id=uid(f"guard-{i}"), madrasa_id=MID, user_id=u.id,
                name=gn, relationship="father" if i % 3 != 2 else "uncle",
                phone_numbers=phone_num(6000 + i),
                cnic=cnic_num(7000 + i),
                address=f"Street {i + 1}, Suffa Town, Lahore",
                is_donor=(i < 20),  # first 20 guardians are also donors
                created_at=NOW, updated_at=NOW,
            )
            guardian_profiles.append(g)
            db.add(g)
        await db.flush()

        # ------------------------------------------------------------------
        # Donors (50) — 20 overlap with guardians, 30 independent
        # ------------------------------------------------------------------
        donor_users = []
        donor_profiles = []
        for i in range(50):
            dn = DONOR_NAMES[i % len(DONOR_NAMES)]
            if i >= len(DONOR_NAMES):
                dn = f"{dn} {i}"
            # First 20 donors are linked to guardians
            guardian_link = guardian_profiles[i] if i < 20 else None
            u = User(
                id=uid(f"u-d{i}"), madrasa_id=MID, username=f"DN-{i + 1:04d}",
                name=dn, password_hash=hashed, role=UserRole.donor,
                status=UserStatus.active, created_at=NOW, updated_at=NOW,
            )
            donor_users.append(u)
            db.add(u)
            await db.flush()
            d = Donor(
                id=uid(f"donor-{i}"), madrasa_id=MID, user_id=u.id,
                name=dn, contact=phone_num(8000 + i),
                guardian_id=guardian_link.id if guardian_link else None,
                created_at=NOW, updated_at=NOW,
            )
            donor_profiles.append(d)
            db.add(d)
        await db.flush()

        # ------------------------------------------------------------------
        # Student-Guardian links (non-independent students)
        # ------------------------------------------------------------------
        sg_i = 0
        for sp, u, prog_name, class_name, section_key in all_students:
            if sp.is_independent:
                continue
            guardian = guardian_profiles[sg_i % len(guardian_profiles)]
            db.add(StudentGuardian(
                id=uid(f"sg-{sg_i}"), madrasa_id=MID,
                student_id=sp.id, guardian_id=guardian.id,
                relationship=guardian.relationship, is_primary=True,
                portal_access=True, created_at=NOW, updated_at=NOW,
            ))
            sg_i += 1
            if sg_i % 500 == 0:
                await db.flush()
        await db.flush()
        print(f"  Created {sg_i} student-guardian links")

        # ------------------------------------------------------------------
        # Permission Roles (5) + grants + assignments
        # ------------------------------------------------------------------
        role_defs = [
            ("Attendance Manager", ["attendance.take", "students.attendance.manage", "teachers.attendance.manage"]),
            ("Finance Clerk", ["finance.manage", "finance.reports.view"]),
            ("Exam Coordinator", ["assessments.exam_types.manage", "assessments.marks.enter", "assessments.results.publish"]),
            ("Admission Officer", ["admissions.manage", "admissions.forms.manage"]),
            ("Librarian", ["resources.manage", "resources.manage_all"]),
        ]
        role_ids = {}
        for rn, perms in role_defs:
            r = PermissionRole(
                id=uid(f"role-{rn}"), madrasa_id=MID, name=rn,
                created_at=NOW, updated_at=NOW,
            )
            role_ids[rn] = r
            db.add(r)
            await db.flush()
            for p in perms:
                db.add(PermissionRoleGrant(
                    id=uid(f"rg-{rn}-{p}"), role_id=r.id,
                    permission_code=p, created_at=NOW, updated_at=NOW,
                ))
        await db.flush()

        # Assign roles to teachers 3-7 (indices 3-7), rest are plain teachers
        role_names = [rn for rn, _ in role_defs]
        for i in range(5):
            teacher_idx = i + 3  # teachers at index 3,4,5,6,7
            if teacher_idx < len(teacher_users):
                db.add(UserRoleAssignment(
                    id=uid(f"ura-t{teacher_idx}"),
                    user_id=teacher_users[teacher_idx].id,
                    role_id=role_ids[role_names[i]].id,
                    created_at=NOW, updated_at=NOW,
                ))
        await db.flush()

        # ------------------------------------------------------------------
        # Payment Categories
        # ------------------------------------------------------------------
        cat_names = ["Monthly Fee", "Admission Fee", "Exam Fee", "Library Fee",
                     "Donation General", "Zakat", "Sadqa"]
        cat_ids = {}
        for cn in cat_names:
            c = PaymentCategory(
                id=uid(f"cat-{cn}"), madrasa_id=MID, name=cn,
                created_at=NOW, updated_at=NOW,
            )
            cat_ids[cn] = c
            db.add(c)
        await db.flush()

        # ------------------------------------------------------------------
        # Grading Schemes (one per program)
        # ------------------------------------------------------------------
        grade_bands = [
            {"label": "A+", "min_score": 90, "max_score": 100},
            {"label": "A", "min_score": 80, "max_score": 89},
            {"label": "B", "min_score": 70, "max_score": 79},
            {"label": "C", "min_score": 60, "max_score": 69},
            {"label": "D", "min_score": 50, "max_score": 59},
            {"label": "F", "min_score": 0, "max_score": 49},
        ]
        grading_schemes = {}
        for pn in program_names:
            gs = GradingScheme(
                id=uid(f"gs-{pn}"), madrasa_id=MID, name=f"{pn} Scheme",
                bands=grade_bands, created_at=NOW, updated_at=NOW,
            )
            grading_schemes[pn] = gs
            db.add(gs)
        await db.flush()

        # ------------------------------------------------------------------
        # Timetable Slots
        # ------------------------------------------------------------------
        tslot_i = 0
        # teacher_by_class_section_course: (class_id, section_id, course_id) -> teacher_id
        tsc_map = {}

        for prog_name, class_name, sec_name, count, cnames in PROGRAM_STRUCTURE:
            cl = classes[class_name]
            sec = sections[(class_name, sec_name)]
            is_night = prog_name == "Night Alim Course"
            school_days = NIGHT_ALIM_DAYS if is_night else REGULAR_DAYS

            for day in sorted(school_days):
                for period, (st, et) in enumerate(PERIOD_TIMES, start=1):
                    co_name = cnames[(day + period - 1) % len(cnames)]
                    teacher_idx = (
                        list(classes.keys()).index(class_name) * 3
                        + (0 if sec_name == "A" else 1)
                        + day + period
                    ) % len(teacher_profiles)
                    teacher = teacher_profiles[teacher_idx]

                    db.add(TimetableSlot(
                        id=uid(f"tslot-{tslot_i}"), madrasa_id=MID,
                        session_id=ACTIVE_SESSION.id, class_id=cl.id,
                        section_id=sec.id, course_id=courses[co_name].id,
                        teacher_id=teacher.id, day_of_week=day, period=period,
                        start_time=st, end_time=et, created_at=NOW, updated_at=NOW,
                    ))
                    tsc_map[(cl.id, sec.id, courses[co_name].id)] = teacher.id
                    tslot_i += 1
                    if tslot_i % 1000 == 0:
                        await db.flush()
        await db.flush()
        print(f"  Created {tslot_i} timetable slots")

        # ------------------------------------------------------------------
        # Exam Types, Marks, Assignments, Submissions per class/course/session
        # ------------------------------------------------------------------
        exam_i = 0
        mark_i = 0
        assignment_i = 0
        submission_i = 0
        pub_i = 0

        for session in sessions:
            session_months = []
            cursor = date(session.gregorian_start.year, session.gregorian_start.month, 1)
            while cursor <= min(session.gregorian_end, date.today()):
                session_months.append(cursor)
                cursor = date(
                    cursor.year + (1 if cursor.month == 12 else 0),
                    1 if cursor.month == 12 else cursor.month + 1, 1,
                )

            for prog_name, class_name, sec_name, count, cnames in PROGRAM_STRUCTURE:
                cl = classes[class_name]
                sec = sections[(class_name, sec_name)]
                gs = grading_schemes[prog_name]

                for cn in cnames:
                    course = courses[cn]
                    teacher_id = tsc_map.get(
                        (cl.id, sec.id, course.id),
                        teacher_profiles[0].id,
                    )

                    # Exam types for this class/course
                    exam_types = []
                    for exam_name, weightage in [("Mid Term", 30), ("Final Term", 50), ("Assignments", 20)]:
                        exam = ExamType(
                            id=uid(f"exam-{exam_i}"), madrasa_id=MID,
                            course_id=course.id, class_id=cl.id,
                            name=exam_name, weightage=weightage,
                            grading_scheme_id=gs.id,
                            created_at=NOW, updated_at=NOW,
                        )
                        db.add(exam)
                        exam_types.append(exam)
                        exam_i += 1
                    await db.flush()

                    # Get students in this class/section for this session
                    students_in_section = [
                        sp for sp, u, pn, cn_val, sk in all_students
                        if sk[0] == class_name and sk[1] == sec_name
                    ]

                    # Marks for each student in each exam
                    for student in students_in_section:
                        for exam in exam_types:
                            score = random.randint(45, 98)
                            db.add(Mark(
                                id=uid(f"mark-{mark_i}"),
                                exam_type_id=exam.id,
                                student_id=student.id,
                                score=score,
                                entered_by_id=teacher_id,
                                created_at=NOW, updated_at=NOW,
                            ))
                            mark_i += 1
                    await db.flush()

                    # Assignments (one per month) with submissions
                    for month_idx, month_start in enumerate(session_months):
                        due_day = min(28, 20 + (month_idx % 6))
                        due_dt = datetime(month_start.year, month_start.month, due_day, 12, 0)
                        assignment = Assignment(
                            id=uid(f"assignment-{assignment_i}"),
                            madrasa_id=MID, class_id=cl.id,
                            section_id=sec.id, course_id=course.id,
                            title=f"{cn} task - {month_start.strftime('%b %Y')}",
                            category="homework" if month_idx % 3 else "assessment",
                            instructions=f"Complete the {cn} work for {month_start.strftime('%B %Y')}.",
                            due_date=due_dt, max_marks=20, weightage=5,
                            created_by_id=teacher_id,
                            created_at=NOW, updated_at=NOW,
                        )
                        db.add(assignment)
                        await db.flush()

                        for student in students_in_section:
                            sub_day = min(due_day, 18 + (submission_i % 5))
                            db.add(Submission(
                                id=uid(f"submission-{submission_i}"),
                                assignment_id=assignment.id,
                                student_id=student.id,
                                submitted_at=datetime(month_start.year, month_start.month, sub_day, 10, 0),
                                file_key=f"madrasas/{MID}/submissions/{assignment.id}/{student.id}.pdf",
                                mark=random.randint(10, 20),
                                feedback=random.choice([
                                    "Good effort.", "Needs improvement.", "Excellent work.",
                                    "Keep revising.", "Satisfactory.", "Well done.",
                                ]),
                                created_at=NOW, updated_at=NOW,
                            ))
                            submission_i += 1
                        assignment_i += 1
                        if assignment_i % 200 == 0:
                            await db.flush()

            # Result publications for this session
            for sp, u, prog_name, class_name, section_key in all_students:
                db.add(ResultPublication(
                    id=uid(f"pub-{pub_i}"), madrasa_id=MID,
                    student_id=sp.id, session_id=session.id,
                    published_by_id=teacher_users[0].id,
                    created_at=NOW, updated_at=NOW,
                ))
                pub_i += 1
                if pub_i % 500 == 0:
                    await db.flush()

        await db.flush()
        print(f"  Created {mark_i} marks, {assignment_i} assignments, {submission_i} submissions")

        # ------------------------------------------------------------------
        # Daily Report Entries — every student, every school day, every session
        # ------------------------------------------------------------------
        dr_i = 0
        for session in sessions:
            school_days = []
            d = session.gregorian_start
            while d <= min(session.gregorian_end, date.today()):
                # Determine if this day is a school day for any program
                if d.weekday() in REGULAR_DAYS or d.weekday() in NIGHT_ALIM_DAYS:
                    school_days.append(d)
                d += timedelta(days=1)

            for sp, u, prog_name, class_name, section_key in all_students:
                is_night = prog_name == "Night Alim Course"
                student_days = NIGHT_ALIM_DAYS if is_night else REGULAR_DAYS
                cl = classes[class_name]
                sec = sections[section_key]

                for ad in school_days:
                    if ad.weekday() not in student_days:
                        continue
                    values = {}
                    for fid, label, req in DR_FIELDS:
                        if fid == "attendance":
                            values[fid] = random.choice(["present", "present", "present", "absent"])
                        elif fid == "remarks":
                            if random.random() > 0.6:
                                values[fid] = random.choice([
                                    "Doing well.", "Needs attention.", "Improving.",
                                    "Good progress.", "Focus required.",
                                ])
                        elif not req and random.random() > 0.5:
                            continue  # skip optional fields sometimes
                        else:
                            values[fid] = random.choice(["Excellent", "Good", "Average", "Needs work"])
                    db.add(DailyReportEntry(
                        id=uid(f"dr-{dr_i}"), madrasa_id=MID,
                        class_id=cl.id, section_id=sec.id,
                        student_id=sp.id, date=ad, values=values,
                        created_by_id=teacher_users[0].id,
                        created_at=NOW, updated_at=NOW,
                    ))
                    dr_i += 1
                    if dr_i % 5000 == 0:
                        await db.flush()
                        print(f"    daily reports: {dr_i}...")

        await db.flush()
        print(f"  Created {dr_i} daily report entries")

        # ------------------------------------------------------------------
        # Attendance — every student & teacher, every school day, every session
        # ------------------------------------------------------------------
        att_i = 0
        for session in sessions:
            school_days = []
            d = session.gregorian_start
            while d <= min(session.gregorian_end, date.today()):
                if d.weekday() in REGULAR_DAYS or d.weekday() in NIGHT_ALIM_DAYS:
                    school_days.append(d)
                d += timedelta(days=1)

            for sp, u, prog_name, class_name, section_key in all_students:
                is_night = prog_name == "Night Alim Course"
                student_days = NIGHT_ALIM_DAYS if is_night else REGULAR_DAYS
                for ad in school_days:
                    if ad.weekday() not in student_days:
                        continue
                    status = random.choices(
                        ["present", "absent", "leave"], weights=[82, 10, 8],
                    )[0]
                    db.add(StudentAttendance(
                        id=uid(f"satt-{att_i}"), madrasa_id=MID,
                        student_id=sp.id, session_id=session.id,
                        attendance_date=ad, status=status,
                        marked_at=datetime(ad.year, ad.month, ad.day, 8, 30, 0),
                        marked_by_id=teacher_users[0].id,
                        idempotency_key=f"satt-{att_i}",
                        created_at=NOW, updated_at=NOW,
                    ))
                    att_i += 1
                    if att_i % 5000 == 0:
                        await db.flush()

            # Teacher attendance
            for tp in teacher_profiles:
                for ad in school_days:
                    status = random.choices(["present", "absent"], weights=[92, 8])[0]
                    ta = TeacherAttendance(
                        id=uid(f"tatt-{att_i}"), madrasa_id=MID,
                        teacher_id=tp.id, session_id=session.id,
                        attendance_date=ad, status=status,
                        marked_at=datetime(ad.year, ad.month, ad.day, 8, 30, 0),
                        marked_by_id=teacher_users[0].id,
                        idempotency_key=f"tatt-{att_i}",
                        created_at=NOW, updated_at=NOW,
                    )
                    if status == "present":
                        ta.check_in = random.choice([time(7, 50), time(7, 55), time(8, 0), time(8, 5)])
                        ta.check_out = random.choice([time(12, 0), time(12, 30), time(13, 0), time(14, 0)])
                    db.add(ta)
                    att_i += 1
                    if att_i % 5000 == 0:
                        await db.flush()

        await db.flush()
        print(f"  Created {att_i} attendance records")

        # ------------------------------------------------------------------
        # Holidays (random, various scopes)
        # ------------------------------------------------------------------
        holiday_data = [
            ("Ashura Break", "religious", date(2024, 7, 25), date(2024, 7, 26), None),
            ("Eid Milad un Nabi", "religious", date(2024, 9, 16), date(2024, 9, 16), None),
            ("Winter Break", "madrasa", date(2024, 12, 20), date(2025, 1, 2), None),
            ("Pakistan Day", "national", date(2025, 3, 23), date(2025, 3, 23), None),
            ("Eid ul Fitr", "religious", date(2025, 3, 31), date(2025, 4, 2), None),
            ("Labour Day", "national", date(2025, 5, 1), date(2025, 5, 1), None),
            ("Eid ul Adha", "religious", date(2025, 6, 7), date(2025, 6, 10), None),
            ("Ashura Break", "religious", date(2025, 7, 5), date(2025, 7, 6), None),
            ("Independence Day", "national", date(2025, 8, 14), date(2025, 8, 14), None),
            ("Eid Milad un Nabi", "religious", date(2025, 9, 5), date(2025, 9, 5), None),
            ("Iqbal Day", "national", date(2025, 11, 9), date(2025, 11, 9), None),
            ("Quaid Day", "national", date(2025, 12, 25), date(2025, 12, 25), None),
            ("Winter Break", "madrasa", date(2025, 12, 26), date(2026, 1, 5), None),
            ("Pakistan Day", "national", date(2026, 3, 23), date(2026, 3, 23), None),
            ("Eid ul Fitr", "religious", date(2026, 3, 20), date(2026, 3, 22), None),
            ("Labour Day", "national", date(2026, 5, 1), date(2026, 5, 1), None),
            ("Eid ul Adha", "religious", date(2026, 5, 27), date(2026, 5, 30), None),
            ("Ashura Break", "religious", date(2026, 6, 25), date(2026, 6, 26), None),
            ("Independence Day", "national", date(2026, 8, 14), date(2026, 8, 14), None),
            ("Exam Break", "exam-break", date(2026, 4, 1), date(2026, 4, 5),
             [classes["Alim 1"].id, classes["Alim 2"].id]),
        ]
        for i, (name, cat, sd, ed, cids) in enumerate(holiday_data):
            # Convert UUID class_ids to strings for JSONB serialization
            str_cids = [str(c) for c in cids] if cids else None
            db.add(Holiday(
                id=uid(f"holiday-{i}"), madrasa_id=MID, name=name,
                category=cat, start_date=sd, end_date=ed, class_ids=str_cids,
                created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Leaves (random teachers & students)
        # ------------------------------------------------------------------
        leave_i = 0
        for i in range(12):
            tu = teacher_profiles[i % len(teacher_profiles)]
            sd = date(2025, 1 + (i % 12), 1 + (i * 3) % 25)
            db.add(Leave(
                id=uid(f"leave-t{leave_i}"), madrasa_id=MID,
                user_id=tu.user_id, start_date=sd,
                end_date=sd + timedelta(days=random.randint(0, 2)),
                reason=random.choice([
                    "Family matter", "Medical appointment", "Personal work",
                    "Wedding ceremony", "Travel",
                ]),
                status=random.choice(["approved", "approved", "pending"]),
                created_at=NOW, updated_at=NOW,
            ))
            leave_i += 1

        for i in range(15):
            sp, u, _, _, _ = all_students[i * 10 % len(all_students)]
            sd = date(2025, 1 + (i % 12), 5 + (i * 2) % 20)
            db.add(Leave(
                id=uid(f"leave-s{leave_i}"), madrasa_id=MID,
                user_id=u.id, start_date=sd,
                end_date=sd + timedelta(days=random.randint(0, 3)),
                reason=random.choice([
                    "Sick", "Family event", "Medical", "Travel", "Personal",
                ]),
                status=random.choice(["approved", "pending", "approved"]),
                created_at=NOW, updated_at=NOW,
            ))
            leave_i += 1
        await db.flush()

        # ------------------------------------------------------------------
        # Announcements (random audiences)
        # ------------------------------------------------------------------
        announcement_data = [
            ("Monthly fee reminder", "Please clear dues before the 10th.", "finance", {"roles": ["parent"]}),
            ("Parent-Teacher Meeting", "PTM scheduled for next Saturday.", "general", {"roles": ["parent", "teacher"]}),
            ("Exam Schedule Published", "Mid-term exams begin next week.", "academics", {"roles": ["parent", "student", "teacher"]}),
            ("Holiday Notice", "Madrasa closed on account of Ashura.", "general", {"roles": ["parent", "student", "teacher"]}),
            ("Admission Open 2026", "Admissions open for Hifz and Nazra programs.", "admissions", {"roles": ["parent"]}),
            ("Sports Day", "Annual sports day next Friday.", "events", {"roles": ["student", "teacher"]}),
            ("Library Books Return", "Please return borrowed books by month-end.", "academics", {"roles": ["student"]}),
            ("Teacher Training", "Workshop on modern teaching methods.", "general", {"roles": ["teacher"]}),
            ("Result Declaration", "Session results have been published.", "academics", {"roles": ["parent", "student"]}),
            ("Ramadan Timings", "Revised schedule during Ramadan.", "general", {"roles": ["parent", "student", "teacher"]}),
        ]
        for i, (title, body, cat, scope) in enumerate(announcement_data):
            db.add(Announcement(
                id=uid(f"announce-{i}"), madrasa_id=MID,
                title=title, body=body, category=cat,
                attachment_link=None, audience_scope=scope,
                publish_at=NOW - timedelta(days=i * 3),
                expires_at=NOW + timedelta(days=30 - i * 2),
                created_by_id=teacher_users[0].id,
                created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Forms & Responses
        # ------------------------------------------------------------------
        form_defs = [
            ("Parent Feedback", "survey", {"roles": ["parent"]}, [
                {"id": "satisfaction", "label": "Satisfaction", "type": "select",
                 "options": ["Good", "Average", "Needs attention"]},
                {"id": "comments", "label": "Comments", "type": "text"},
            ]),
            ("Student Enrollment Form", "enrollment", {"roles": ["parent"]}, [
                {"id": "previous_school", "label": "Previous school", "type": "text"},
                {"id": "medical_conditions", "label": "Medical conditions", "type": "text"},
            ]),
            ("Teacher Evaluation", "survey", {"roles": ["teacher"]}, [
                {"id": "professionalism", "label": "Professionalism", "type": "select",
                 "options": ["Excellent", "Good", "Average", "Poor"]},
            ]),
        ]
        form_objs = []
        for i, (title, cat, scope, fields) in enumerate(form_defs):
            f = Form(
                id=uid(f"form-{i}"), madrasa_id=MID, title=title,
                description=f"{title} form", category=cat,
                fields_definition=fields, visibility_scope=scope,
                open_from=NOW - timedelta(days=30),
                open_until=NOW + timedelta(days=30),
                allow_multiple=False, created_by_id=teacher_users[0].id,
                created_at=NOW, updated_at=NOW,
            )
            form_objs.append(f)
            db.add(f)
        await db.flush()

        # Form responses
        for i in range(20):
            guardian = guardian_profiles[i % len(guardian_profiles)]
            db.add(FormResponse(
                id=uid(f"fr-{i}"), madrasa_id=MID,
                form_id=form_objs[i % len(form_objs)].id,
                guardian_id=guardian.id,
                ward_id=all_students[i % len(all_students)][0].id,
                submitted_by_id=guardian.user_id,
                response_data={"satisfaction": random.choice(["Good", "Average", "Excellent"])},
                created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Admission Forms & Applications
        # ------------------------------------------------------------------
        adm_form_data = [
            ("Hifz Admissions 2026", programs["Hifz-ul-Qur'an"].id, "hifz-2026"),
            ("Nazra Admissions 2026", programs["Nazra"].id, "nazra-2026"),
            ("Dars e Nizami Admissions 2026", programs["Dars e Nizami"].id, "dars-2026"),
        ]
        adm_forms = []
        for i, (title, prog_id, token) in enumerate(adm_form_data):
            af = AdmissionForm(
                id=uid(f"adm-form-{i}"), madrasa_id=MID, program_id=prog_id,
                title=title, category="Admissions",
                description=f"Public admission form for {title}.",
                fields_definition=[
                    {"id": "previous_school", "label": "Previous school", "type": "text", "required": False},
                    {"id": "hifz_status", "label": "Hifz status", "type": "select",
                     "options": ["Complete", "Partial", "None"]},
                ],
                public_token=token, is_open=True,
                created_by_id=teacher_users[0].id,
                created_at=NOW, updated_at=NOW,
            )
            adm_forms.append(af)
            db.add(af)
        await db.flush()

        # Admission applications
        applicant_names = [
            "Huzaifa Salman", "Muhammad Danish", "Ali Raza", "Hassan Ali",
            "Usman Tariq", "Bilal Ahmed", "Hamza Shahid", "Zain Abdullah",
            "Saad Hussain", "Faisal Ahmed", "Kamran Yousuf", "Tariq Nadeem",
        ]
        for i, an in enumerate(applicant_names):
            db.add(AdmissionApplication(
                id=uid(f"adm-app-{i}"), madrasa_id=MID,
                applicant_name=an, guardian_contact=phone_num(9000 + i),
                program_id=adm_forms[i % len(adm_forms)].program_id,
                date_of_birth=date(2012 + (i % 6), (i % 12) + 1, (i % 28) + 1),
                notes=random.choice([
                    "Interested in morning section.", "Transfer from another madrasa.",
                    "Hafiz applying for Alim course.", "Sibling already enrolled.",
                ]),
                status=random.choice(["pending", "pending", "accepted", "rejected"]),
                status_history=[{"status": "pending", "at": NOW.isoformat()}],
                form_id=adm_forms[i % len(adm_forms)].id,
                extra_data={"previous_school": random.choice(["Home", "Local Masjid", "Madrasa XYZ"])},
                form_title_snapshot=adm_forms[i % len(adm_forms)].title,
                fields_definition_snapshot=adm_forms[i % len(adm_forms)].fields_definition,
                created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Blog Posts
        # ------------------------------------------------------------------
        for i in range(3):
            db.add(BlogPost(
                id=uid(f"blog-{i}"), madrasa_id=MID,
                title=random.choice([
                    "Daily Hifz Routine", "Importance of Tajweed", "Student Achievements",
                ]),
                body="A short note on consistency, revision, and adab.",
                published=True, publish_at=NOW - timedelta(days=i * 7),
                author_id=teacher_users[0].id, created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Contact Enquiries
        # ------------------------------------------------------------------
        for i in range(5):
            db.add(ContactEnquiry(
                id=uid(f"contact-{i}"), madrasa_id=MID,
                name=GUARDIAN_NAMES[i + 30],
                contact=phone_num(9500 + i),
                message=random.choice([
                    "I want admission information for Nazra.",
                    "What are the fee details?",
                    "Timings for Night Alim course?",
                    "Is transport available?",
                    "How to apply for Hifz program?",
                ]),
                status=random.choice(["new", "reviewed"]),
                created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Resources
        # ------------------------------------------------------------------
        rc = ResourceCategory(
            id=uid("rc-quran"), madrasa_id=MID, name="Qur'an Practice",
            owner_id=None, created_at=NOW, updated_at=NOW,
        )
        db.add(rc)
        await db.flush()
        for i in range(4):
            db.add(Resource(
                id=uid(f"resource-{i}"), madrasa_id=MID, category_id=rc.id,
                title=random.choice(["Tajweed Guide", "Hifz Schedule", "Arabic Notes", "Fiqh Summary"]),
                description="Printable reference material.",
                file_key=f"madrasas/{MID}/resources/doc-{i}.pdf",
                video_url=None, visibility_scope={"all": True},
                created_by_id=teacher_users[0].id,
                created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Payments (admission + monthly fees per student per session)
        # ------------------------------------------------------------------
        pay_i = 0
        for session in sessions:
            session_months = []
            cursor = date(session.gregorian_start.year, session.gregorian_start.month, 1)
            while cursor <= min(session.gregorian_end, date.today()):
                session_months.append(cursor)
                cursor = date(
                    cursor.year + (1 if cursor.month == 12 else 0),
                    1 if cursor.month == 12 else cursor.month + 1, 1,
                )

            for sp, u, prog_name, class_name, section_key in all_students:
                db.add(Payment(
                    id=uid(f"pay-{pay_i}"), madrasa_id=MID,
                    student_id=sp.id, category_id=cat_ids["Admission Fee"].id,
                    amount=1500.0, currency="PKR",
                    payment_date=session.gregorian_start,
                    note="Admission fee", recorded_by_id=teacher_users[0].id,
                    created_at=NOW, updated_at=NOW,
                ))
                pay_i += 1

                for month_idx, month_start in enumerate(session_months):
                    pay_day = min(10, 5 + (month_idx % 5))
                    db.add(Payment(
                        id=uid(f"pay-{pay_i}"), madrasa_id=MID,
                        student_id=sp.id, category_id=cat_ids["Monthly Fee"].id,
                        amount=750.0 + (month_idx % 3) * 50,
                        currency="PKR",
                        payment_date=date(month_start.year, month_start.month, pay_day),
                        note=f"Monthly dues for {month_start.strftime('%B %Y')}",
                        recorded_by_id=teacher_users[0].id,
                        created_at=NOW, updated_at=NOW,
                    ))
                    pay_i += 1
                    if pay_i % 2000 == 0:
                        await db.flush()
        await db.flush()
        print(f"  Created {pay_i} payments")

        # ------------------------------------------------------------------
        # Donations (recurring per donor per session)
        # ------------------------------------------------------------------
        don_i = 0
        for session in sessions:
            session_months = []
            cursor = date(session.gregorian_start.year, session.gregorian_start.month, 1)
            while cursor <= min(session.gregorian_end, date.today()):
                session_months.append(cursor)
                cursor = date(
                    cursor.year + (1 if cursor.month == 12 else 0),
                    1 if cursor.month == 12 else cursor.month + 1, 1,
                )

            for di, donor in enumerate(donor_profiles):
                for month_idx, month_start in enumerate(session_months):
                    db.add(Donation(
                        id=uid(f"don-{don_i}"), madrasa_id=MID,
                        donor_id=donor.id,
                        category_id=cat_ids[["Donation General", "Zakat", "Sadqa"][(di + month_idx) % 3]].id,
                        amount=3000 + di * 500 + (month_idx % 4) * 1000,
                        currency="PKR",
                        donation_date=date(month_start.year, month_start.month, min(18, 12 + (month_idx % 6))),
                        note=f"Support for {month_start.strftime('%B %Y')}",
                        recorded_by_id=teacher_users[0].id,
                        created_at=NOW, updated_at=NOW,
                    ))
                    don_i += 1
                    if don_i % 1000 == 0:
                        await db.flush()
        await db.flush()
        print(f"  Created {don_i} donations")

        # ------------------------------------------------------------------
        # Salary Records & Payments
        # SalaryRecord has unique teacher_id, so one per teacher (active session).
        # SalaryPayment is per teacher per month per session.
        # ------------------------------------------------------------------
        for i, tp in enumerate(teacher_profiles):
            base_salary = 20000.0 + i * 3000
            db.add(SalaryRecord(
                id=uid(f"sal-{i}"), madrasa_id=MID,
                teacher_id=tp.id, amount=base_salary,
                currency="PKR", effective_from=ACTIVE_SESSION.gregorian_start,
                created_at=NOW, updated_at=NOW,
            ))
            for session in sessions:
                session_months = []
                cursor = date(session.gregorian_start.year, session.gregorian_start.month, 1)
                while cursor <= min(session.gregorian_end, date.today()):
                    session_months.append(cursor)
                    cursor = date(
                        cursor.year + (1 if cursor.month == 12 else 0),
                        1 if cursor.month == 12 else cursor.month + 1, 1,
                    )
                for month_idx, month_start in enumerate(session_months):
                    db.add(SalaryPayment(
                        id=uid(f"salpay-{i}-{month_idx}-{session.id}"),
                        madrasa_id=MID, teacher_id=tp.id,
                        amount=base_salary, currency="PKR",
                        payment_date=date(month_start.year, month_start.month, 28),
                        period_covered=month_start.strftime("%B %Y"),
                        method="bank_transfer", note="Monthly salary",
                        recorded_by_id=teacher_users[0].id,
                        created_at=NOW, updated_at=NOW,
                    ))
        await db.flush()

        # ------------------------------------------------------------------
        # Messaging / Settings
        # ------------------------------------------------------------------
        db.add_all([
            MessageTemplate(
                id=uid("tmpl-credentials"), madrasa_id=MID, code="credentials",
                name="Login credentials",
                content={
                    "en": "Assalamu Alaikum,\nPortal access for {student_name}.\nUsername: {username}\nSet your password (valid 24h): {setup_link}\n— {madrasa_name}",
                    "ur": "السلام علیکم،\n{student_name} کے پورٹل تک رسائی۔\nصارف نام: {username}\nاپنا پاس ورڈ مقرر کریں (24 گھنٹے کارآمد): {setup_link}\n— {madrasa_name}",
                },
                created_at=NOW, updated_at=NOW,
            ),
            MessageTemplate(
                id=uid("tmpl-receipt"), madrasa_id=MID, code="receipt",
                name="Receipt",
                content={"en": "Receipt for {name}: {amount}", "ur": "{name} کی رسید: {amount}"},
                created_at=NOW, updated_at=NOW,
            ),
            MessageLog(
                id=uid("msg-log-1"), madrasa_id=MID, template_code="credentials",
                recipient_number=guardian_profiles[0].phone_numbers,
                recipient_type="guardian", recipient_id=guardian_profiles[0].id,
                dispatched_at=NOW - timedelta(days=1), sent_by_id=teacher_users[0].id,
                content_sent="Seed credential message",
                created_at=NOW, updated_at=NOW,
            ),
        ])
        settings_data = [
            ("madrasa.name_en", "Suffa MS"),
            ("madrasa.name_ur", "جامعہ سفہ"),
            ("madrasa.phone", "+923001112233"),
            ("madrasa.address", "Suffa Road, Lahore"),
            ("attendance.school_days", "[0,1,2,3,4,5]"),
            ("madrasa.currency", "PKR"),
            ("madrasa.session_start", "2026-06-01"),
            ("portal.students_can_login", "true"),
            ("portal.guardians_can_login", "true"),
            ("portal.donors_can_login", "false"),
        ]
        for i, (key, val) in enumerate(settings_data):
            db.add(MadrasaSetting(
                id=uid(f"setting-{i}"), madrasa_id=MID,
                key=key, value=val, created_at=NOW, updated_at=NOW,
            ))
        await db.flush()

        # ------------------------------------------------------------------
        # Commit & report
        # ------------------------------------------------------------------
        await db.commit()
        print("\nSeed complete!")
        print(f"\n  Programs: {len(programs)}")
        print(f"  Classes: {len(classes)}")
        print(f"  Sections: {len(sections)}")
        print(f"  Students: {len(all_students)}")
        print(f"  Teachers: {len(teacher_profiles)} (3 principals)")
        print(f"  Guardians: {len(guardian_profiles)}")
        print(f"  Donors: {len(donor_profiles)} (20 overlap with guardians)")
        print(f"  Sessions: {len(sessions)}")
        print(f"\n  Admin/Principal: {teacher_users[0].username} / {PASSWORD}")
        print(f"  Teachers: TCH-0001 … TCH-{len(teacher_profiles):04d} / {PASSWORD}")
        print(f"  Students: ADM-00001 … ADM-{len(all_students):05d} / {PASSWORD}")
        print(f"  Guardians: GR-0001 … GR-{len(guardian_profiles):04d} / {PASSWORD}")
        print(f"  Donors: DN-0001 … DN-{len(donor_profiles):04d} / {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())

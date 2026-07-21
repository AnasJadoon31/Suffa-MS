from app.db.base import Base

# Import all models here for Alembic to discover them
from app.db.core_models import FileObject, AuditLog
from app.modules.academics.models import Madrasa, Program, AcademicClass, Section, Course, AcademicSession, Enrollment, TeacherAssignment
from app.modules.assessments.models import Assignment, Submission, GradingScheme, ExamType, Mark, ResultPublication
from app.modules.attendance.models import StudentAttendance, TeacherAttendance, AttendanceCorrection
from app.modules.auth.models import User, UserPermission
from app.modules.finance.models import PaymentCategory, Payment, Donor, Donation, SalaryRecord, SalaryPayment
from app.modules.messaging.models import MessageTemplate, MessageLog
from app.modules.operations.models import TimetableSlot, Holiday, Leave, ResourceCategory, Resource, Form, FormResponse, Announcement, AdmissionForm, AdmissionApplication, AdminNotification, BlogPost, ContactEnquiry, MadrasaSetting
from app.modules.people.models import TeacherProfile, StudentProfile, Guardian, StudentGuardian, StudentAdmissionRecord
from app.modules.platform.models import MadrasaFeature

# Ensure all models are loaded
__all__ = [
    "Base",
    "FileObject", "AuditLog",
    "Madrasa", "Program", "AcademicClass", "Section", "Course", "AcademicSession", "Enrollment", "TeacherAssignment",
    "Assignment", "Submission", "GradingScheme", "ExamType", "Mark", "ResultPublication",
    "StudentAttendance", "TeacherAttendance", "AttendanceCorrection",
    "User", "UserPermission",
    "PaymentCategory", "Payment", "Donor", "Donation", "SalaryRecord", "SalaryPayment",
    "MessageTemplate", "MessageLog",
    "TimetableSlot", "Holiday", "Leave", "ResourceCategory", "Resource", "Form", "FormResponse", "Announcement",
    "AdmissionForm", "AdmissionApplication", "AdminNotification", "BlogPost", "ContactEnquiry", "MadrasaSetting",
    "TeacherProfile", "StudentProfile", "Guardian", "StudentGuardian", "StudentAdmissionRecord",
    "MadrasaFeature"
]

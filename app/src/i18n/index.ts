import i18next from "i18next";
import { initReactI18next } from "react-i18next";

void i18next.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        appName: "Madrasa Management",
        dashboard: "Dashboard",
        attendance: "Attendance",
        auth: "Auth",
        academics: "Academics",
        students: "Students",
        guardians: "Guardians",
        teachers: "Teachers",
        salary: "Salary",
        assignments: "Assignments",
        results: "Results",
        timetable: "Timetable",
        resources: "Resources",
        forms: "Forms",
        announcements: "Announcements",
        finance: "Finance",
        messaging: "Messaging",
        reports: "Reports",
        "blog.manage": "Blog",
        admissions: "Admissions",
        settings: "Settings",
        todayAttendance: "Today's attendance",
        missingSync: "Missing sync",
        monthlyIncome: "Monthly income",
        markAttendance: "Mark attendance",
        syncNow: "Sync now",
        outbox: "Outbox",
        present: "Present",
        absent: "Absent",
        leave: "Leave"
      }
    },
    ur: {
      translation: {
        appName: "مدرسہ مینجمنٹ",
        dashboard: "ڈیش بورڈ",
        attendance: "حاضری",
        auth: "لاگ اِن",
        academics: "تعلیمی ڈھانچہ",
        students: "طلبہ",
        guardians: "سرپرست",
        teachers: "اساتذہ",
        salary: "تنخواہ",
        assignments: "اسباق",
        results: "نتائج",
        timetable: "نظام الاوقات",
        resources: "وسائل",
        forms: "فارمز",
        announcements: "اعلانات",
        finance: "مالیات",
        messaging: "پیغامات",
        reports: "رپورٹس",
        "blog.manage": "بلاگ",
        admissions: "داخلے",
        settings: "ترتیبات",
        todayAttendance: "آج کی حاضری",
        missingSync: "غائب سنک",
        monthlyIncome: "ماہانہ آمدن",
        markAttendance: "حاضری لگائیں",
        syncNow: "ابھی سنک کریں",
        outbox: "آؤٹ باکس",
        present: "حاضر",
        absent: "غائب",
        leave: "رخصت"
      }
    }
  }
});

export default i18next;

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
        academics: "Academics",
        people: "People",
        assessments: "Assessments",
        students: "Students",
        guardians: "Guardians",
        teachers: "Teachers",
        assignments: "Assignments",
        results: "Results",
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
        academics: "تعلیمی ڈھانچہ",
        people: "افراد",
        assessments: "تشخیص",
        students: "طلبہ",
        guardians: "سرپرست",
        teachers: "اساتذہ",
        assignments: "اسباق",
        results: "نتائج",
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

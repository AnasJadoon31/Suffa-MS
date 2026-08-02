const fs = require('fs');
const en = require('./src/i18n/locales/en.json');
const ur = require('./src/i18n/locales/ur.json');

const dictionary = {
  "Academics": "تعلیمی",
  "Admissions": "داخلے",
  "Announcements": "اعلانات",
  "Assignments": "اسائنمنٹس",
  "Attendance": "حاضری",
  "Dashboard": "ڈیش بورڈ",
  "Finance": "مالیات",
  "Forms": "فارم",
  "Holidays": "تعطیلات",
  "Logout": "لاگ آؤٹ",
  "My Profile": "میری پروفائل",
  "People": "لوگ",
  "Resources": "وسائل",
  "Results": "نتائج",
  "Settings": "ترتیبات",
  "Timetable": "ٹائم ٹیبل",
  "Students": "طلباء",
  "Teachers": "اساتذہ",
  "Classes": "کلاسز",
  "Home": "ہوم",
  "More": "مزید",
  "Admin": "ایڈمن",
  "Operations": "آپریشنز",
  "Daily": "روزانہ",
  "Reports": "رپورٹس",
  "Leave": "چھٹی",
  "Blog": "بلاگ"
};

for (const [key, val] of Object.entries(dictionary)) {
  en[key] = key;
  ur[key] = val;
}

fs.writeFileSync('./src/i18n/locales/en.json', JSON.stringify(en, null, 2));
fs.writeFileSync('./src/i18n/locales/ur.json', JSON.stringify(ur, null, 2));

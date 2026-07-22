import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.env.LIVE_VERIFICATION_CONFIRM !== "isolated-disposable-environment") {
  throw new Error("Set LIVE_VERIFICATION_CONFIRM=isolated-disposable-environment only for an isolated verification stack");
}
const apiBase = requiredEnvironment("LIVE_API_BASE");
const tenant = requiredEnvironment("LIVE_TENANT");
const principalPassword = requiredEnvironment("LIVE_PRINCIPAL_PASSWORD");
const sharedPassword = process.env.LIVE_ROLE_PASSWORD ?? `Verify-${randomBytes(18).toString("base64url")}!`;

async function request(path, { token, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "X-Madrasa": tenant,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? response.json() : response.arrayBuffer();
}

async function login(username, password) {
  return (await request("/auth/token", { method: "POST", body: { username, password } })).access_token;
}

async function setProvisionedPassword(setPasswordUrl) {
  const token = new URL(setPasswordUrl, "http://verification.local").searchParams.get("token");
  if (!token) throw new Error(`Missing setup token in ${setPasswordUrl}`);
  await request("/auth/set-password", { method: "POST", body: { token, password: sharedPassword } });
}

const principal = await login("principal.verify", principalPassword);
for (const [key, value] of [
  ["madrasa.name_en", "Suffa Verification Madrasa"],
  ["madrasa.name_ur", "مدرسہ صفہ تصدیق"],
  ["madrasa.address", "Lahore, Pakistan"],
]) {
  await request("/operations/settings", { token: principal, method: "PUT", body: { key, value } });
}

const program = await request("/academics/programs", { token: principal, method: "POST", body: { name: "Hifz Programme" } });
const academicClass = await request("/academics/classes", { token: principal, method: "POST", body: { program_id: program.id, name: "Hifz Level 1", assignment_limit: 8 } });
const section = await request(`/academics/classes/${academicClass.id}/sections`, { token: principal, method: "POST", body: { name: "A" } });
const course = await request("/academics/courses", { token: principal, method: "POST", body: { name: "Quran Memorization" } });
await request(`/academics/classes/${academicClass.id}/courses/assign`, { token: principal, method: "POST", body: { course_id: course.id } });
const session = await request("/academics/sessions", {
  token: principal,
  method: "POST",
  body: { name: "2026–27", gregorian_start: "2026-07-01", gregorian_end: "2027-06-30", hijri_span: "1448–1449 AH", is_active: true },
});

const guardian = await request("/people/guardians", {
  token: principal,
  method: "POST",
  body: { name: "Shaikh Noor", relationship: "Father", phone_numbers: "0321 1234505", cnic: "35202-1234567-1", address: "Model Town, Lahore", preferred_language: "en" },
});
const guardianCredentials = await request(`/people/guardians/${guardian.id}/credentials-link`, {
  token: principal,
  method: "POST",
  body: { username: "guardian.verify" },
});
await setProvisionedPassword(guardianCredentials.set_password_url);

const teacher = await request("/people/teachers", {
  token: principal,
  method: "POST",
  body: { username: "teacher.verify", name: "Ustad Ahmad", whatsapp_number: "0300 1112233", employee_code: "TCH-V01", preferred_language: "en" },
});
await setProvisionedPassword(teacher.set_password_url);

const delegatedTeacher = await request("/people/teachers", {
  token: principal,
  method: "POST",
  body: { username: "delegate.verify", name: "Ustad Delegate", whatsapp_number: "0300 1112244", employee_code: "TCH-V02", preferred_language: "en", is_principal_delegate: true },
});
await setProvisionedPassword(delegatedTeacher.set_password_url);

const student = await request("/people/students", {
  token: principal,
  method: "POST",
  body: { username: "student.verify", name: "Ali Noor", date_of_birth: "2017-01-12", admission_number: "ADM-V001", guardian_ids: [guardian.id], preferred_language: "en", b_form_number: "61101-1234567-3", address: "Model Town, Lahore" },
});
await setProvisionedPassword(student.set_password_url);
await request("/academics/students/enroll", {
  token: principal,
  method: "POST",
  body: { student_id: student.id, session_id: session.id, program_id: program.id, class_id: academicClass.id, section_id: section.id, effective_date: "2026-07-01" },
});
await request("/operations/timetable", {
  token: principal,
  method: "POST",
  body: { class_id: academicClass.id, section_id: section.id, course_id: course.id, teacher_id: teacher.id, day_of_week: 2, period: 1, start_time: "08:00", end_time: "09:00" },
});

const consentForm = await request("/operations/forms", {
  token: principal,
  method: "POST",
  body: { title: "Whole-school acknowledgement", description: "Visible to every portal role", category: "General", fields: [{ label: "Acknowledged", type: "radio", required: true, options: ["Yes", "No"] }], visibility_scope: { all: true }, allow_multiple: true },
});

const admissionForm = await request("/operations/admission-forms", {
  token: principal,
  method: "POST",
  body: { program_id: program.id, title: "Verified student intake", description: "Disposable browser-verification template", fields: [] },
});

const teacherToken = await login("teacher.verify", sharedPassword);
const category = await request("/operations/resource-categories", { token: teacherToken, method: "POST", body: { name: "Teacher handouts", is_global: false } });
const fileBody = new TextEncoder().encode("Suffa live verification PDF");
const upload = await request("/files/presign-upload", { token: teacherToken, method: "POST", body: { category: "resources", filename: "teacher-handout.pdf", content_type: "application/pdf", size_bytes: fileBody.byteLength } });
const uploadResponse = await fetch(upload.upload_url, { method: "PUT", headers: { "Content-Type": "application/pdf", "Content-Length": String(fileBody.byteLength) }, body: fileBody });
if (!uploadResponse.ok) throw new Error(`resource upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
const resource = await request("/operations/resources", {
  token: teacherToken,
  method: "POST",
  body: { category_id: category.id, title: "Teacher timetable handout", description: "Uploaded by the assigned teacher", file_key: upload.object_key, visibility_scope: { sections: [section.id] } },
});

const scheme = await request("/assessments/grading-schemes", {
  token: principal,
  method: "POST",
  body: { name: "Verification grading", include_assignments: true, bands: [{ label: "A", min_score: 80, max_score: 100 }, { label: "B", min_score: 60, max_score: 79.99 }, { label: "C", min_score: 0, max_score: 59.99 }] },
});
const examType = await request("/assessments/exam-types", { token: principal, method: "POST", body: { course_id: course.id, class_id: academicClass.id, name: "Term assessment", weightage: 100, grading_scheme_id: scheme.id } });
await request("/assessments/marks", { token: teacherToken, method: "PUT", body: { exam_type_id: examType.id, student_id: student.id, score: 88 } });
const [assignment] = await request("/assessments/assignments", {
  token: teacherToken,
  method: "POST",
  body: { class_id: academicClass.id, course_id: course.id, section_ids: [section.id], title: "Memorisation recording", category: "Homework", instructions: "Upload the completed recitation.", due_date: "2027-01-15T12:00:00Z", max_marks: 20, weightage: 20 },
});

const studentToken = await login("student.verify", sharedPassword);
const submissionBody = new TextEncoder().encode("Ali Noor verified submission");
const submissionUpload = await request("/files/presign-upload", { token: studentToken, method: "POST", body: { category: "submissions", filename: "ali-recitation.pdf", content_type: "application/pdf", size_bytes: submissionBody.byteLength } });
const submissionPut = await fetch(submissionUpload.upload_url, { method: "PUT", headers: { "Content-Type": "application/pdf", "Content-Length": String(submissionBody.byteLength) }, body: submissionBody });
if (!submissionPut.ok) throw new Error(`submission upload failed: ${submissionPut.status} ${await submissionPut.text()}`);
const submission = await request(`/assessments/assignments/${assignment.id}/submissions`, { token: studentToken, method: "POST", body: { file_key: submissionUpload.object_key } });
await request(`/assessments/submissions/${submission.id}/grade`, { token: teacherToken, method: "PUT", body: { mark: 18, feedback: "Accurate recitation; keep practising the final ayah." } });
await request("/assessments/results/publish", { token: principal, method: "POST", body: { session_id: session.id, student_ids: [student.id] } });

for (const [username, password, ownPath] of [
  ["principal.verify", principalPassword, `/assessments/results/card?student_id=${student.id}&session_id=${session.id}`],
  ["teacher.verify", sharedPassword, `/assessments/results/card?student_id=${student.id}&session_id=${session.id}`],
  ["student.verify", sharedPassword, `/assessments/results/card/me?session_id=${session.id}`],
]) {
  const token = await login(username, password);
  const pdf = await request(ownPath, { token });
  if (pdf.byteLength < 1000) throw new Error(`${username} result PDF was unexpectedly small (${pdf.byteLength})`);
}

const state = {
  apiBase,
  tenant,
  credentials: {
    principal: { username: "principal.verify", password: principalPassword },
    teacher: { username: "teacher.verify", password: sharedPassword },
    delegatedTeacher: { username: "delegate.verify", password: sharedPassword },
    student: { username: "student.verify", password: sharedPassword },
    guardian: { username: "guardian.verify", password: sharedPassword },
  },
  ids: { program: program.id, class: academicClass.id, section: section.id, course: course.id, session: session.id, guardian: guardian.id, teacher: teacher.id, delegatedTeacher: delegatedTeacher.id, student: student.id, admissionForm: admissionForm.id, form: consentForm.id, resource: resource.id, assignment: assignment.id, submission: submission.id },
};
await writeFile("artifacts/live-verification-state.json", `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log("live verification seed and three-role PDF checks passed");

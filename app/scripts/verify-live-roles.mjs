import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const state = JSON.parse(await readFile("artifacts/live-verification-state.json", "utf8"));
const appBase = process.env.LIVE_APP_BASE ?? "http://127.0.0.1:4175";
const outputDir = path.resolve("artifacts/issue-verification");
let server;
const browserTeacherRemark = "Browser-saved teacher remark for Ali Noor.";

if (process.env.LIVE_VERIFICATION_CONFIRM !== "isolated-disposable-environment") {
  throw new Error("Set LIVE_VERIFICATION_CONFIRM=isolated-disposable-environment only for an isolated verification stack");
}

async function login(credentials) {
  const response = await fetch(`${state.apiBase}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Madrasa": state.tenant },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function ensureServer() {
  if (process.env.LIVE_APP_BASE) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4175"], {
    env: { ...process.env, VITE_API_BASE: state.apiBase.replace(/\/api\/v1$/, "") },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(appBase)).ok) return; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting live-role Vite server");
}

async function rolePage(browser, role, { language = "en", viewport = { width: 1440, height: 1000 } } = {}) {
  const token = await login(state.credentials[role]);
  const languageResponse = await fetch(`${state.apiBase}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Madrasa": state.tenant, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ preferred_language: language }),
  });
  if (!languageResponse.ok) throw new Error(`language update failed: ${languageResponse.status} ${await languageResponse.text()}`);
  const context = await browser.newContext({ viewport, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
  await context.addInitScript(({ token: authToken, tenant, language: locale }) => {
    localStorage.setItem("mms_token", authToken);
    localStorage.setItem("mms_tenant", tenant);
    localStorage.setItem("i18nextLng", locale);
  }, { token, tenant: state.tenant, language });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`${role} page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${role} HTTP ${response.status()}: ${response.url()}`);
  });
  return { context, page, errors, token };
}

async function open(page, route) {
  await page.goto(`${appBase}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace").waitFor();
  await page.locator(".loading-screen").waitFor({ state: "hidden" }).catch(() => {});
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}

async function shot(page, name, locator = null) {
  await (locator ?? page).screenshot({ path: path.join(outputDir, name), animations: "disabled", ...(locator ? {} : { fullPage: false }) });
  console.log(`captured ${name}`);
}

async function principalJourney(browser) {
  const { context, page, errors, token } = await rolePage(browser, "principal");
  await open(page, "/people/students");
  await page.getByRole("button", { name: "Add student" }).click();
  const addStudent = page.getByRole("dialog", { name: "Add student" });
  await addStudent.getByText("Shaikh Noor").waitFor();
  await addStudent.getByLabel("Admission form").selectOption(state.ids.admissionForm);
  const uniqueSuffix = Date.now();
  await addStudent.getByLabel("Username").fill(`browser.student.${uniqueSuffix}`);
  await addStudent.getByLabel("Student name").fill("Browser Linked Student");
  await addStudent.getByLabel("Date of birth").fill("2018-02-03");
  await addStudent.getByRole("checkbox", { name: /Shaikh Noor/ }).check();
  await shot(page, "PDF-05_guardian-link-during-student-creation_live.png", addStudent);
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/people/students") && response.request().method() === "POST");
  await addStudent.getByRole("button", { name: "Add student" }).click();
  const createdResponse = await createResponse;
  if (!createdResponse.ok()) throw new Error(`Browser student creation failed: ${createdResponse.status()}`);
  const createdStudent = await createdResponse.json();
  await addStudent.waitFor({ state: "hidden" });
  const detailResponse = await fetch(`${state.apiBase}/people/students/${createdStudent.id}/guardians`, {
    headers: { "X-Madrasa": state.tenant, Authorization: `Bearer ${token}` },
  });
  if (!detailResponse.ok || !(await detailResponse.text()).includes("Shaikh Noor")) {
    throw new Error("Browser-created student did not persist the selected guardian link");
  }

  await open(page, "/forms");
  await page.getByText("Whole-school acknowledgement").waitFor();
  await open(page, "/settings");
  const nameSetting = page.locator(".settingsRow", { hasText: "Name (English)" });
  await nameSetting.getByRole("button", { name: "Edit" }).click();
  const nameDialog = page.getByRole("dialog", { name: "Edit Name (English)" });
  const nameInput = nameDialog.getByRole("textbox");
  const baseBrandName = "Suffa Verification Madrasa";
  const browserBrandName = (await nameInput.inputValue()) === baseBrandName ? `${baseBrandName} Campus` : baseBrandName;
  await nameInput.fill(browserBrandName);
  const settingResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/operations/settings") && response.request().method() === "PUT");
  await nameDialog.getByRole("button", { name: "Save" }).click();
  if (!(await settingResponse).ok()) throw new Error("Principal browser branding edit failed");
  await page.getByText(browserBrandName, { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(browserBrandName, { exact: true }).waitFor();
  await page.locator(".settingsRow", { hasText: browserBrandName }).waitFor();
  await shot(page, "PDF-11_principal-branding-live.png");
  await context.close();
  return errors;
}

async function teacherJourney(browser) {
  const { context, page, errors } = await rolePage(browser, "teacher");
  await open(page, "/forms");
  await page.getByText("Whole-school acknowledgement").waitFor();
  await page.getByRole("button", { name: "Open" }).click();
  const form = page.getByRole("dialog", { name: "Whole-school acknowledgement" });
  await form.getByLabel("Acknowledged").waitFor();
  await form.getByLabel("Acknowledged").fill("Yes");
  await shot(page, "PDF-02_teacher-everyone-form-live.png", form);
  const submissionResponse = page.waitForResponse((response) => response.url().includes(`/operations/forms/${state.ids.form}/responses`) && response.request().method() === "POST");
  await form.getByRole("button", { name: "Submit response" }).click();
  if (!(await submissionResponse).ok()) throw new Error("Teacher browser form submission failed");
  await form.getByText("Response submitted").waitFor();
  await form.getByRole("button", { name: "Close" }).click();

  await open(page, "/resources");
  await page.locator(".dataRow", { hasText: "Teacher timetable handout" }).waitFor();
  await page.getByRole("button", { name: "Download", exact: true }).first().waitFor();
  await shot(page, "PDF-16_teacher-resource-upload-live.png", page.locator(".modulePanel").first());

  await page.getByRole("button", { name: "Add resource" }).click();
  const resourceDialog = page.getByRole("dialog", { name: "Add resource" });
  const browserResourceTitle = `Browser teacher upload ${Date.now()}`;
  await resourceDialog.getByLabel("Category").selectOption({ label: "Teacher handouts" });
  await resourceDialog.getByLabel("Title").fill(browserResourceTitle);
  await resourceDialog.getByLabel("File").setInputFiles({ name: "browser-teacher-handout.pdf", mimeType: "application/pdf", buffer: Buffer.from("Browser teacher verification upload") });
  await resourceDialog.getByLabel("Audience").selectOption("sections");
  await resourceDialog.getByRole("checkbox", { name: /Hifz Level 1 \/ A/ }).check();
  const resourceResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/operations/resources") && response.request().method() === "POST");
  await resourceDialog.getByRole("button", { name: "Add resource" }).click();
  if (!(await resourceResponse).ok()) throw new Error("Teacher browser resource upload failed");
  await resourceDialog.waitFor({ state: "hidden" });
  await page.getByText(browserResourceTitle, { exact: true }).waitFor();

  await page.getByTitle("Delete").first().click();
  const confirmation = page.getByRole("dialog", { name: "Confirm" });
  await confirmation.getByText("Delete this resource?").waitFor();
  await shot(page, "PDF-08_application-destructive-dialog-live.png", confirmation);
  await confirmation.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add category" }).click();
  const categoryDialog = page.getByRole("dialog", { name: "Add category" });
  await categoryDialog.getByLabel("Category name").fill("Loading-state proof");
  await page.route("**/api/v1/operations/resource-categories", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  const submit = categoryDialog.getByRole("button", { name: "Add category" });
  await submit.click();
  await submit.waitFor({ state: "visible" });
  if (!(await submit.isDisabled())) throw new Error("Mutation button did not enter a disabled loading state");
  await shot(page, "PDF-23_mutation-loading-state-live.png", categoryDialog);
  await categoryDialog.waitFor({ state: "hidden" });

  await open(page, "/assessments/assignments");
  await page.getByText("Memorisation recording").waitFor();
  await page.getByRole("button", { name: "Submissions" }).click();
  const feedback = page.getByPlaceholder("Feedback/Remarks");
  await feedback.waitFor();
  await feedback.fill(browserTeacherRemark);
  const gradeResponse = page.waitForResponse((response) => response.url().includes(`/assessments/submissions/${state.ids.submission}/grade`) && response.request().method() === "PUT");
  await page.locator(".dataRow", { has: feedback }).getByRole("button", { name: "Save" }).click();
  if (!(await gradeResponse).ok()) throw new Error("Teacher browser remark save failed");
  await page.getByPlaceholder("Feedback/Remarks").waitFor();
  if ((await page.getByPlaceholder("Feedback/Remarks").inputValue()) !== browserTeacherRemark) throw new Error("Teacher browser remark did not persist after reload");
  await shot(page, "PDF-29_teacher-assignment-remarks-live.png", page.locator(".modulePanel").last());
  await shot(page, "PDF-11_teacher-branding-live.png");
  await context.close();
  return errors;
}

async function delegatedTeacherJourney(browser) {
  const { context, page, errors } = await rolePage(browser, "delegatedTeacher");
  await open(page, "/academics/courses");
  await page.getByText("Quran Memorization").waitFor();
  await page.getByText("Suffa Verification Madrasa").waitFor();
  await shot(page, "PDF-11_delegated-teacher-academics-live.png");
  await context.close();
  return errors;
}

async function studentJourney(browser) {
  const { context, page, errors } = await rolePage(browser, "student");
  await open(page, "/my-assessments");
  await page.getByText("Memorisation recording").waitFor();
  await page.getByText(browserTeacherRemark).waitFor();
  await page.getByText("88").first().waitFor();
  if (await page.locator('input[type="file"]').count()) throw new Error("Submitted assignment still exposes a file chooser");
  await page.getByRole("button", { name: "Download", exact: true }).waitFor();
  await page.getByRole("button", { name: "Download result card" }).waitFor();
  const resultDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download result card" }).click();
  const downloadedResult = await resultDownload;
  if (!(await downloadedResult.createReadStream())) throw new Error("Student result-card browser download produced no file");
  const submissionPresign = page.waitForResponse((response) => response.url().includes("/files/presign-download") && response.request().method() === "GET");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  if (!(await submissionPresign).ok()) throw new Error("Submitted assignment browser download failed");
  await shot(page, "PDF-14_PDF-28_PDF-30_student-results-submission-live.png");

  await open(page, "/dashboard");
  await page.getByText("Suffa Verification Madrasa").waitFor();
  await shot(page, "PDF-31_student-dashboard-live-en.png");
  await context.close();
  return errors;
}

async function guardianJourney(browser) {
  const { context, page, errors } = await rolePage(browser, "guardian");
  await open(page, "/forms");
  await page.getByText("Whole-school acknowledgement").waitFor();
  await page.getByText("Suffa Verification Madrasa").waitFor();
  await shot(page, "PDF-11_guardian-branding-live.png");
  await context.close();
  return errors;
}

async function urduStudentJourney(browser) {
  const { context, page, errors } = await rolePage(browser, "student", { language: "ur", viewport: { width: 390, height: 844 } });
  await open(page, "/dashboard");
  await page.locator(".navToggle").click();
  await page.getByText("مدرسہ صفہ تصدیق").waitFor();
  await shot(page, "PDF-11_PDF-31_student-dashboard-live-mobile-urdu.png");
  await context.close();
  return errors;
}

async function roleLanguageViewportMatrix(browser) {
  const routes = {
    principal: "/forms",
    delegatedTeacher: "/academics/courses",
    teacher: "/forms",
    student: "/dashboard",
    guardian: "/forms",
  };
  const allErrors = [];
  for (const role of Object.keys(routes)) {
    for (const language of ["en", "ur"]) {
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        const { context, page, errors } = await rolePage(browser, role, { language, viewport });
        await open(page, routes[role]);
        if (viewport.width < 600) await page.locator(".navToggle").click();
        await page.getByText(language === "ur" ? "مدرسہ صفہ تصدیق" : "Suffa Verification Madrasa").waitFor();
        allErrors.push(...errors);
        await context.close();
      }
    }
  }
  return allErrors;
}

await mkdir(outputDir, { recursive: true });
await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  const errors = [
    ...await roleLanguageViewportMatrix(browser),
    ...await principalJourney(browser),
    ...await teacherJourney(browser),
    ...await delegatedTeacherJourney(browser),
    ...await studentJourney(browser),
    ...await guardianJourney(browser),
    ...await urduStudentJourney(browser),
  ];
  if (errors.length) throw new Error(`browser errors:\n${errors.join("\n")}`);
  console.log("live role verification: all remaining role journeys passed");
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}

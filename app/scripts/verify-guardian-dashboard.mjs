import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4176";
const outputDir = path.resolve("artifacts/issue-verification");
let server;

const child = (id, name, score, status, totalPaid) => ({
  id,
  name,
  admission_number: `ADM-${id.slice(-1)}`,
  current_class: "Hifz Level 1",
  my_attendance: { "2026-07-22": status },
  my_attendance_periods: [{
    date: "2026-07-22", status, course_id: "course-1", course_name: "Quran Memorization",
    timetable_slot_id: `slot-${id}`, period: 1, legacy_general: false,
  }],
  today_timetable: [{ course_id: "course-1", period: 1, start_time: "08:00", end_time: "09:00" }],
  latest_result: {
    session_id: "session-1", student_id: id, overall_score: score, published: true,
    course_results: [{ course_id: "course-1", course_name: "Quran Memorization", raw_score: score, band: score >= 80 ? "A" : "F", exam_count: 1 }],
  },
  due_assignments: [{ id: `assignment-${id}`, title: "Memorisation revision", due_date: "2026-07-30T12:00:00Z", course_id: "course-1" }],
  resources: [{ id: `resource-${id}`, title: `${name} study guide` }],
  announcements: [{ id: `announcement-${id}`, title: `${name} parent meeting`, body: "After Asr prayer" }],
  fee_summary: { totals: [{ amount: totalPaid, currency: "PKR" }] },
  payments: [{ id: `payment-${id}`, category: "Monthly fee", amount: totalPaid, currency: "PKR", payment_date: "2026-07-01", note: "July" }],
});

const dashboard = {
  role: "parent",
  children: [
    child("student-1", "Ali Noor", 85, "present", 1500),
    child("student-2", "Fatima Noor", 40, "absent", 2000),
  ],
};

async function ensureServer() {
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4176"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting guardian dashboard verification server");
}

await mkdir(outputDir, { recursive: true });
await ensureServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await context.addInitScript(() => {
  localStorage.setItem("mms_token", "guardian-verification-token");
  localStorage.setItem("mms_tenant", "suffa");
  localStorage.setItem("i18nextLng", "en");
});
await context.route("**/api/v1/**", async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  const body = pathname === "/api/v1/auth/me"
    ? {
        user: { id: "parent-1", username: "a.sattar", role: "parent", status: "active", preferred_language: "en", selected_session_id: null },
        madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
        permissions: [], features: {}, has_teaching_assignment: false,
      }
    : pathname === "/api/v1/reporting/dashboard"
      ? dashboard
      : pathname === "/api/v1/academics/today"
        ? { gregorian: "2026-07-22", hijri: "8 Safar 1448 AH" }
        : pathname === "/api/v1/academics/sessions"
          ? [{ id: "session-1", name: "Test", gregorian_start: "2026-07-01", gregorian_end: "2027-06-30", hijri_span: "1448 AH", is_active: true }]
          : [];
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "My children" }).waitFor();
  await page.getByRole("tab", { name: /Ali Noor/ }).waitFor();
  await page.getByLabel("Dashboard summary").getByText("1,500 PKR", { exact: true }).waitFor();
  if (await page.getByText("Monthly income", { exact: true }).count()) throw new Error("Guardian still sees the principal finance card");
  if (await page.getByText("Recent activity", { exact: true }).count()) throw new Error("Guardian still sees principal audit activity");

  await page.getByRole("tab", { name: /Fatima Noor/ }).click();
  await page.getByLabel("Dashboard summary").getByText("2,000 PKR", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Attendance for Fatima Noor" }).waitFor();
  await page.getByText("Fatima Noor parent meeting", { exact: true }).waitFor();
  await page.getByText("Fatima Noor study guide", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(outputDir, "guardian-multi-child-dashboard.png"),
    fullPage: true,
    animations: "disabled",
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("guardian dashboard verification passed");
} finally {
  await context.close();
  await browser.close();
  server.kill("SIGTERM");
}

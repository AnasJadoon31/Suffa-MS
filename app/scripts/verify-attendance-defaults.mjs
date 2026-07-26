import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";

const today = "2026-07-26";
const courses = [{ id: "course-1", name: "Quran Memorization" }];
const classes = [{
  id: "class-1",
  name: "Hifz Level 1",
  course_names: courses.map((course) => course.name),
  courses,
  student_count: 2,
  sections: [{ id: "section-1", name: "A", student_count: 2 }],
}];
const timetableSlots = [{
  id: "slot-1",
  session_id: "session-1",
  class_id: "class-1",
  section_id: "section-1",
  course_id: "course-1",
  teacher_id: "teacher-1",
  day_of_week: 6,
  period: 1,
  start_time: "08:00:00",
  end_time: "09:00:00",
  class_name: "Hifz Level 1",
  section_name: "A",
  course_name: "Quran Memorization",
  teacher_name: "Ustad Ahmad",
}];
const students = [
  { id: "student-1", admission_number: "ADM-0001", name: "Ali Noor", section_id: "section-1", section_name: "A" },
  { id: "student-2", admission_number: "ADM-0002", name: "Demo Student", section_id: "section-1", section_name: "A" },
];

function historyEntry(student, status) {
  return {
    id: `attendance-${student.id}`,
    attendance_date: today,
    student_id: student.id,
    student_name: student.name,
    admission_number: student.admission_number,
    status,
    marked_at: `${today}T09:00:00Z`,
    synced_at: `${today}T09:00:00Z`,
    marked_by: { id: "principal-1", username: "admin", display_name: "admin", role: "principal" },
    overridden: false,
    source: "manual",
    locked_reason: null,
    leave_id: null,
    course: courses[0],
    timetable_slot: { id: "slot-1", period: 1, day_of_week: 6, start_time: "08:00:00", end_time: "09:00:00" },
    legacy_general: false,
  };
}

async function runScenario({ name, historyEntries, expectDefaultForm, screenshot }) {
  let syncPosts = 0;
  let lastSyncPayload = null;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "attendance-defaults-test-token");
    localStorage.setItem("mms_tenant", "suffa");
  });

  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body = [];
    if (pathname === "/api/v1/auth/me") {
      body = {
        user: {
          id: "principal-1",
          username: "admin",
          role: "principal",
          status: "active",
          preferred_language: "en",
          is_principal_delegate: false,
          selected_session_id: null,
        },
        madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
        permissions: ["attendance.take"],
        features: {},
      };
    } else if (pathname === "/api/v1/academics/today") {
      body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
    } else if (pathname === "/api/v1/attendance/classes") {
      body = classes;
    } else if (pathname === "/api/v1/operations/timetable") {
      body = timetableSlots;
    } else if (pathname === "/api/v1/operations/holidays") {
      body = [];
    } else if (pathname === "/api/v1/attendance/classes/class-1/roster") {
      body = {
        session_id: "session-1",
        session_name: "2026–27",
        class_id: "class-1",
        class_name: "Hifz Level 1",
        section_id: "section-1",
        section_name: "A",
        course: courses[0],
        timetable_slot: { id: "slot-1", period: 1, day_of_week: 6, start_time: "08:00:00", end_time: "09:00:00" },
        students,
      };
    } else if (pathname === "/api/v1/attendance/classes/class-1/history") {
      body = { session_id: "session-1", session_name: "2026–27", class_id: "class-1", class_name: "Hifz Level 1", entries: historyEntries };
    } else if (pathname === "/api/v1/attendance/sync" && request.method() === "POST") {
      syncPosts += 1;
      lastSyncPayload = request.postDataJSON();
      body = {
        idempotency_keys: lastSyncPayload.entries.map((entry) => entry.idempotency_key),
        locked: [],
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Expose-Headers": "X-Total-Count",
        "X-Total-Count": Array.isArray(body) ? String(body.length) : "0",
      },
      body: JSON.stringify(body),
    });
  });

  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/attendance`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Hifz Level 1/ }).click();
    await page.getByLabel("Course").selectOption("course-1");
    await page.getByLabel("Period").selectOption("slot-1");
    await page.getByText("Ali Noor").waitFor();

    if (expectDefaultForm) {
      const activePresent = await page.locator(".statusButton.active.present").count();
      if (activePresent !== students.length) {
        throw new Error(`${name}: expected all students to default Present, got ${activePresent}`);
      }
      if (syncPosts !== 0) {
        throw new Error(`${name}: attendance synced before Save`);
      }
      if (screenshot) {
        await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
      }
      await page.getByRole("button", { name: "Save attendance" }).click();
      await page.waitForFunction(() => window.__attendanceSyncDone === true, null, { timeout: 50 }).catch(() => {});
      await page.waitForTimeout(500);
      if (syncPosts !== 1 || lastSyncPayload?.entries?.length !== students.length) {
        throw new Error(`${name}: save did not sync the default-present batch: ${JSON.stringify({ syncPosts, lastSyncPayload })}`);
      }
      if (!lastSyncPayload.entries.every((entry) => entry.status === "present")) {
        throw new Error(`${name}: default batch was not all Present: ${JSON.stringify(lastSyncPayload)}`);
      }
    } else {
      const rosterRows = await page.locator(".rosterRow").count();
      if (rosterRows !== 0) {
        throw new Error(`${name}: historical marks reopened the mark form`);
      }
      await page.getByText("Absent").waitFor();
      if (syncPosts !== 0) {
        throw new Error(`${name}: historical marks synced without Save`);
      }
      if (screenshot) {
        await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

await runScenario({
  name: "unmarked roster",
  historyEntries: [],
  expectDefaultForm: true,
  screenshot: process.env.TEST_SCREENSHOT_UNMARKED,
});
await runScenario({
  name: "historical marks",
  historyEntries: [historyEntry(students[0], "absent"), historyEntry(students[1], "present")],
  expectDefaultForm: false,
  screenshot: process.env.TEST_SCREENSHOT_HISTORY,
});

console.log("attendance defaults: present initialization, explicit save, and historical marks passed");

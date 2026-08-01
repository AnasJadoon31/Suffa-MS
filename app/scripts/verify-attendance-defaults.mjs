import { chromium } from "@playwright/test";
import { ensureViteServer } from "./lib/vite-server.mjs";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4196";

const todayDate = new Date();
const today = [
  todayDate.getFullYear(),
  String(todayDate.getMonth() + 1).padStart(2, "0"),
  String(todayDate.getDate()).padStart(2, "0"),
].join("-");
const todayDayOfWeek = (todayDate.getDay() + 6) % 7;

await ensureViteServer({ baseUrl, port: 4196 });
const courses = [{ id: "course-1", name: "Quran Memorization" }];
const secondCourse = { id: "course-2", name: "Hadith" };
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
  day_of_week: todayDayOfWeek,
  period: 1,
  start_time: "08:00:00",
  end_time: "09:00:00",
  class_name: "Hifz Level 1",
  section_name: "A",
  course_name: "Quran Memorization",
  teacher_name: "Ustad Ahmad",
}];
const secondTimetableSlot = {
  ...timetableSlots[0],
  id: "slot-2",
  period: 2,
  start_time: "09:05:00",
  end_time: "09:45:00",
};
const secondCourseSlot = {
  ...timetableSlots[0],
  id: "slot-course-2",
  course_id: "course-2",
  course_name: "Hadith",
};
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
    timetable_slot: { id: "slot-1", period: 1, day_of_week: todayDayOfWeek, start_time: "08:00:00", end_time: "09:00:00" },
    legacy_general: false,
  };
}

async function runScenario({ name, historyEntries, expectDefaultForm, expectCourseChoice = false, expectPeriodChoice = false, slots = timetableSlots, courseOptions = courses, screenshot }) {
  let syncPosts = 0;
  let lastSyncPayload = null;
  const rosterRequestParams = [];

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
      body = { gregorian: today, hijri: "11 Safar 1448 AH" };
    } else if (pathname === "/api/v1/attendance/classes") {
      body = classes.map((item) => ({
        ...item,
        course_names: courseOptions.map((course) => course.name),
        courses: courseOptions,
      }));
    } else if (pathname === "/api/v1/operations/timetable") {
      body = slots;
    } else if (pathname === "/api/v1/operations/holidays") {
      body = [];
    } else if (pathname === "/api/v1/attendance/classes/class-1/roster") {
      const params = new URL(request.url()).searchParams;
      rosterRequestParams.push(Object.fromEntries(params.entries()));
      const requestedSlot = slots.find((slot) => slot.id === params.get("timetable_slot_id")) ?? slots[0];
      body = {
        session_id: "session-1",
        session_name: "2026–27",
        class_id: "class-1",
        class_name: "Hifz Level 1",
        section_id: "section-1",
        section_name: "A",
        course: courses[0],
        timetable_slot: {
          id: requestedSlot.id,
          period: requestedSlot.period,
          day_of_week: requestedSlot.day_of_week,
          start_time: requestedSlot.start_time,
          end_time: requestedSlot.end_time,
        },
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
    const consoleFailures = [];
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      const text = message.text();
      if (/showLabel|InputProps|Maximum update depth exceeded|invalid hook call|dispatcher is null/i.test(text)) {
        consoleFailures.push(text);
      }
    });
    page.on("pageerror", (error) => {
      const text = error.stack || error.message;
      if (/showLabel|InputProps|Maximum update depth exceeded|invalid hook call|dispatcher is null/i.test(text)) {
        consoleFailures.push(text);
      }
    });
    await page.goto(`${baseUrl}/attendance`, { waitUntil: "domcontentloaded" });
    await page.getByText("Hifz Level 1 / A").click();
    if (expectCourseChoice) {
      await page.getByLabel("Course").selectOption("course-1");
    } else {
      await page.waitForFunction(() => new URL(window.location.href).searchParams.get("course") === "course-1");
      const courseFields = await page.getByLabel("Course").count();
      if (courseFields !== 0) {
        throw new Error(`${name}: course selector appeared when the section has one course`);
      }
    }
    await page.waitForFunction(() => {
      const params = new URL(window.location.href).searchParams;
      return params.get("class") === "class-1" && params.get("section") === "section-1" && params.get("course") === "course-1";
    });
    if (expectPeriodChoice) {
      await page.getByLabel("Period").selectOption("slot-1");
    } else {
      const periodFields = await page.getByLabel("Period").count();
      if (periodFields !== 0) {
        throw new Error(`${name}: period selector appeared for a single period`);
      }
    }
    await page.getByText("Ali Noor").waitFor();

    if (expectDefaultForm) {
      await page.waitForFunction((expected) => {
        return Array.from(document.querySelectorAll("button[aria-pressed='true']")).filter((button) =>
          button.textContent?.includes("Present")
        ).length === expected;
      }, students.length).catch(async () => {
        const buttons = await page.locator("button").evaluateAll((nodes) =>
          nodes.map((node) => ({
            text: node.textContent,
            ariaPressed: node.getAttribute("aria-pressed"),
            className: node.className,
          })),
        );
        throw new Error(`${name}: Present defaults did not settle. Buttons: ${JSON.stringify(buttons)}`);
      });
      const activePresent = await page.locator("button[aria-pressed='true']", { hasText: "Present" }).count();
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
      if (!lastSyncPayload.entries.every((entry) => entry.course_id === "course-1" && entry.timetable_slot_id === "slot-1")) {
        throw new Error(`${name}: save did not use the inferred/selected period: ${JSON.stringify(lastSyncPayload)}`);
      }
      if (!lastSyncPayload.entries.every((entry) => entry.status === "present")) {
        throw new Error(`${name}: default batch was not all Present: ${JSON.stringify(lastSyncPayload)}`);
      }
      if (!expectPeriodChoice && rosterRequestParams.some((params) => params.timetable_slot_id)) {
        throw new Error(`${name}: single-period roster request should let the backend infer the slot: ${JSON.stringify(rosterRequestParams)}`);
      }
    } else {
      const presentButtons = await page.getByRole("button", { name: "Present" }).count();
      if (presentButtons !== 0) {
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
    if (consoleFailures.length > 0) {
      throw new Error(`${name}: attendance console regressions: ${consoleFailures.join("\n")}`);
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
  name: "multiple periods",
  historyEntries: [],
  expectDefaultForm: true,
  expectPeriodChoice: true,
  slots: [timetableSlots[0], secondTimetableSlot],
});
await runScenario({
  name: "multiple courses",
  historyEntries: [],
  expectDefaultForm: true,
  expectCourseChoice: true,
  slots: [timetableSlots[0], secondCourseSlot],
  courseOptions: [courses[0], secondCourse],
});
await runScenario({
  name: "historical marks",
  historyEntries: [historyEntry(students[0], "absent"), historyEntry(students[1], "present")],
  expectDefaultForm: false,
  screenshot: process.env.TEST_SCREENSHOT_HISTORY,
});

console.log("attendance defaults: present initialization, explicit save, and historical marks passed");

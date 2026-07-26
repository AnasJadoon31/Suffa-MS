import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const viewport = process.env.TEST_VIEWPORT === "mobile"
  ? { width: 390, height: 844 }
  : process.env.TEST_VIEWPORT === "tablet"
    ? { width: 768, height: 1024 }
    : { width: 1280, height: 900 };

const slots = [
  {
    id: "slot-1",
    session_id: "session-1",
    class_id: "class-1",
    section_id: "section-1",
    course_id: "course-1",
    teacher_id: "teacher-1",
    day_of_week: 0,
    period: 1,
    start_time: "08:00",
    end_time: "08:40",
    class_name: "Class 1",
    section_name: "Alif",
    course_name: "Nazra",
    teacher_name: "Amina Khan",
  },
  {
    id: "slot-2",
    session_id: "session-1",
    class_id: "class-2",
    section_id: "section-2",
    course_id: "course-2",
    teacher_id: "teacher-1",
    day_of_week: 0,
    period: 2,
    start_time: "09:00",
    end_time: "09:40",
    class_name: "Class 2",
    section_name: "Baa",
    course_name: "Hifz",
    teacher_name: "Amina Khan",
  },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "my-timetable-test-token");
  localStorage.setItem("mms_tenant", "suffa");
});

await context.route("**/api/v1/**", async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  let body = [];
  let status = 200;
  if (pathname === "/api/v1/auth/me") {
    body = {
      user: {
        id: "teacher-user-1",
        username: "teacher",
        role: "teacher",
        status: "active",
        preferred_language: "en",
        is_principal_delegate: false,
        selected_session_id: null,
      },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: [],
      features: {},
      has_teaching_assignment: true,
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/operations/timetable/me") {
    body = slots;
  } else if (pathname === "/api/v1/files/presign-download") {
    status = 404;
    body = { detail: "No logo" };
  }
  await route.fulfill({
    status,
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
  await page.goto(`${baseUrl}/my-timetable`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "My timetable" }).waitFor();
  await page.getByRole("heading", { name: "Class 1" }).waitFor();
  await page.getByText("Nazra").waitFor();

  const headers = await page.locator(".dataRow.header").first().innerText();
  const normalizedHeaders = headers.toLowerCase();
  if (!normalizedHeaders.includes("time") || !normalizedHeaders.includes("course") || !normalizedHeaders.includes("section / period") || !normalizedHeaders.includes("teacher / location")) {
    throw new Error(`my timetable headers missing: ${headers}`);
  }
  if (normalizedHeaders.includes("class")) {
    throw new Error(`my timetable still renders a redundant Class column: ${headers}`);
  }

  await page.getByLabel("Class").selectOption("class-2");
  await page.getByRole("heading", { name: "Class 2" }).waitFor();
  await page.getByText("Hifz").waitFor();
  if (await page.getByText("Nazra").isVisible().catch(() => false)) {
    throw new Error("class switcher did not filter out the first class slots");
  }

  const geometry = await page.evaluate(() => {
    const visibleLabels = [...document.querySelectorAll(".dataRow:not(.header) > span")]
      .map((span) => ({ label: span.getAttribute("data-label"), text: span.textContent?.trim() }))
      .filter((row) => row.text);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      visibleLabels,
    };
  });
  if (geometry.scrollWidth > geometry.clientWidth) {
    throw new Error(`my timetable overflowed: ${JSON.stringify(geometry)}`);
  }
  for (const requiredLabel of ["Time", "Course", "Section / period", "Teacher / location"]) {
    if (!geometry.visibleLabels.some((row) => row.label === requiredLabel)) {
      throw new Error(`missing mobile/card label ${requiredLabel}: ${JSON.stringify(geometry)}`);
    }
  }

  if (process.env.TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true, animations: "disabled" });
  }

  console.log("my timetable: headers, class switcher, scoped heading, and card labels passed");
} finally {
  await context.close();
  await browser.close();
}

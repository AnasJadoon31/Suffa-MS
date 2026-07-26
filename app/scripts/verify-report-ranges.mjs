import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const viewport = process.env.TEST_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 };
const fixedNow = "2026-07-26T08:00:00Z";
const expectedRanges = {
  "1 week": { from: "2026-07-20", to: "2026-07-26" },
  "1 month": { from: "2026-06-26", to: "2026-07-26" },
  "3 months": { from: "2026-04-26", to: "2026-07-26" },
  "6 months": { from: "2026-01-26", to: "2026-07-26" },
  "1 year": { from: "2025-07-26", to: "2026-07-26" },
};

const reportRequests = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(({ fixedNow }) => {
  localStorage.setItem("mms_token", "report-ranges-test-token");
  localStorage.setItem("mms_tenant", "suffa");
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixedNow);
      else super(...args);
    }
    static now() {
      return new RealDate(fixedNow).getTime();
    }
  }
  MockDate.UTC = RealDate.UTC;
  MockDate.parse = RealDate.parse;
  globalThis.Date = MockDate;
}, { fixedNow });

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  let body = [];
  let contentType = "application/json";

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["reports.view", "assessments.marks.enter", "finance.reports.view", "teachers.salary.manage"],
      features: {},
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/academics/classes") {
    body = [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true }];
  } else if (pathname === "/api/v1/academics/classes/class-1/sections") {
    body = [{ id: "section-1", class_id: "class-1", name: "Alif" }];
  } else if (pathname === "/api/v1/academics/sessions") {
    body = [{ id: "session-1", name: "2026-27", gregorian_start: "2026-04-01", gregorian_end: "2027-03-31", hijri_span: "1447-48", is_active: true }];
  } else if (pathname === "/api/v1/operations/settings") {
    body = [{ key: "regional.timezone", category: "regional", type: "string", label: "Timezone", value: "Asia/Karachi" }];
  } else if (pathname.startsWith("/api/v1/reporting/reports/")) {
    reportRequests.push({ pathname, params: Object.fromEntries(url.searchParams.entries()) });
    contentType = url.searchParams.get("format") === "pdf" ? "application/pdf" : "text/csv";
    body = contentType === "application/pdf" ? "%PDF-1.4\n" : "ok\n";
  }

  await route.fulfill({
    status: 200,
    contentType,
    headers: {
      "Access-Control-Expose-Headers": "X-Total-Count, Content-Disposition",
      "X-Total-Count": Array.isArray(body) ? String(body.length) : "0",
      "Content-Disposition": "attachment; filename=report.csv",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
});

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, saw ${actual}`);
  }
}

try {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/reports`, { waitUntil: "domcontentloaded" });
  await page.getByText("Attendance summary").waitFor();

  for (const [label, expected] of Object.entries(expectedRanges)) {
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: label }).evaluate((button) => {
      if (button.getAttribute("aria-pressed") !== "true") {
        throw new Error(`${button.textContent} did not indicate active preset`);
      }
    });
    assertEqual(await page.getByLabel("From").inputValue(), expected.from, `${label} from`);
    assertEqual(await page.getByLabel("To").inputValue(), expected.to, `${label} to`);
  }

  await page.getByLabel("From").fill("2026-07-01");
  await page.getByLabel("To").fill("2026-07-15");
  for (const label of Object.keys(expectedRanges)) {
    const pressed = await page.getByRole("button", { name: label }).getAttribute("aria-pressed");
    if (pressed === "true") {
      throw new Error(`${label} stayed active after manual date edit`);
    }
  }

  await page.getByLabel("Class").first().selectOption("class-1");
  await page.getByLabel("Section").first().selectOption("section-1");
  await page.getByRole("button", { name: "CSV" }).first().click();
  await page.waitForFunction(() => window.__reportsReady === true).catch(() => undefined);
  const attendanceRequest = reportRequests.find((request) => request.pathname.endsWith("/attendance"));
  if (!attendanceRequest) {
    throw new Error("attendance report download request was not made");
  }
  for (const [key, value] of Object.entries({
    class_id: "class-1",
    section_id: "section-1",
    start_date: "2026-07-01",
    end_date: "2026-07-15",
    format: "csv",
  })) {
    assertEqual(attendanceRequest.params[key], value, `attendance report param ${key}`);
  }

  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (geometry.scrollWidth > geometry.width) {
    throw new Error(`reports page overflowed: ${JSON.stringify(geometry)}`);
  }

  if (process.env.TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true, animations: "disabled" });
  }

  console.log("report ranges: presets, manual edits, and attendance query wiring passed");
} finally {
  await context.close();
  await browser.close();
}

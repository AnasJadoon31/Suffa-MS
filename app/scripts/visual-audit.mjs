import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5173";
const label = process.argv[2] ?? "current";
const outputDir = path.resolve("artifacts/ui-audit", label);

const principalDashboard = {
  role: "principal",
  counts: { students: 184, teachers: 16, classes: 9 },
  attendance: {
    present: 151,
    absent: 11,
    leave: 4,
    total_students: 184,
    missing_sync_teachers: 2,
    missing_sync_teacher_list: [
      { id: "teacher-1", name: "Ustad Ahmad" },
      { id: "teacher-2", name: "Ustad Bilal" },
    ],
  },
  finance: { month_total: 428500, currency: "PKR" },
  activity: [
    "Attendance completed for Hifz A",
    "New admission received for Nazra",
    "Monthly fee receipt recorded",
  ],
};

const routes = [
  "/dashboard",
  "/attendance",
  "/timetable/grid",
  "/academics/classes",
  "/assessments/assignments",
  "/people/students",
  "/announcements",
  "/resources",
  "/forms",
  "/finance/summary",
  "/reports",
  "/settings",
];

async function mockApi(context, preferredLanguage = "en") {
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
          preferred_language: preferredLanguage,
          selected_session_id: null,
        },
        madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
        permissions: [],
        features: {},
      };
    } else if (pathname === "/api/v1/academics/today") {
      body = { gregorian: "17 Jul 2026", hijri: "2 Safar 1448 AH" };
    } else if (pathname === "/api/v1/reporting/dashboard") {
      body = principalDashboard;
    } else if (pathname === "/api/v1/finance/summary") {
      body = { total_contributions: 342000, total_donations: 86500, total: 428500, by_category: { Fees: 342000, Donations: 86500 } };
    } else if (pathname.endsWith("/summary") || pathname.endsWith("/matrix")) {
      body = {};
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "X-Total-Count", "X-Total-Count": Array.isArray(body) ? String(body.length) : "0" },
      body: JSON.stringify(body),
    });
  });
}

async function capture(browser, viewport, name, preferredLanguage = "en") {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  let page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".login-container").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(outputDir, `login-${name}.png`), fullPage: true, animations: "disabled" });

  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "visual-audit-token");
    localStorage.setItem("mms_tenant", "suffa");
  });
  await mockApi(context, preferredLanguage);
  await page.close();
  page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.locator(".workspace").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(".emptyState", { hasText: "Loading" }).waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    await page.locator(".emptyState", { hasText: "لوڈ ہو رہا ہے" }).waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForTimeout(150);
    const slug = route.replace(/^\//, "").replaceAll("/", "-");
    await page.screenshot({ path: path.join(outputDir, `${slug}-${name}.png`), fullPage: false, animations: "disabled" });
    console.log(`captured ${name} ${route}`);
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    if (overflow.content > overflow.viewport + 1) {
      errors.push(`${route}: horizontal overflow ${overflow.content - overflow.viewport}px`);
    }
  }

  await context.close();
  return errors;
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const desktopErrors = await capture(browser, { width: 1440, height: 1000 }, "desktop");
  const mobileErrors = await capture(browser, { width: 390, height: 844 }, "mobile");
  const mobileUrduErrors = await capture(browser, { width: 390, height: 844 }, "mobile-urdu", "ur");
  const errors = [...desktopErrors, ...mobileErrors, ...mobileUrduErrors];
  if (errors.length) {
    console.log(JSON.stringify({ label, errors }, null, 2));
  } else {
    console.log(JSON.stringify({ label, errors: [] }));
  }
} finally {
  await browser.close();
}

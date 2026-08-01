import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const apiBase = process.env.TEST_API_BASE ?? "http://localhost:8001";
const tenant = process.env.TEST_TENANT ?? "suffa";
const username = process.env.TEST_USERNAME ?? "admin";
const password = process.env.TEST_PASSWORD ?? "password";

const routes = [
  "/dashboard",
  "/attendance",
  "/timetable/grid",
  "/timetable/list",
  "/timetable/teachers",
  "/holidays",
  "/leave",
  "/announcements",
  "/academics/programs",
  "/academics/classes",
  "/academics/courses",
  "/academics/sessions",
  "/assessments/assignments",
  "/assessments/grading",
  "/assessments/setup",
  "/assessments/results",
  "/resources",
  "/forms",
  "/people/teachers",
  "/people/students",
  "/people/guardians",
  "/people/donators",
  "/admissions",
  "/admission-forms",
  "/enquiries",
  "/finance/contributions",
  "/finance/donations",
  "/finance/summary",
  "/salary",
  "/reports",
  "/blog",
  "/settings",
  "/my-profile",
];

const failurePattern = /invalid hook call|dispatcher is null|resolveDispatcher\(\) is null|can't access property "use(Context|Ref)"|Maximum update depth exceeded|React does not recognize the `(?:showLabel|InputProps)` prop/i;

const loginResponse = await fetch(`${apiBase}/api/v1/auth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Madrasa": tenant },
  body: JSON.stringify({ username, password }),
});
if (!loginResponse.ok) {
  throw new Error(`route runtime login failed ${loginResponse.status}: ${await loginResponse.text()}`);
}
const { access_token: token } = await loginResponse.json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: "allow",
});
await context.addInitScript((auth) => {
  localStorage.setItem("mms_token", auth.token);
  localStorage.setItem("mms_tenant", auth.tenant);
}, { token, tenant });

const failures = [];
try {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (failurePattern.test(text)) failures.push(`${page.url()} :: console ${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => {
    const text = error.stack || error.message;
    if (failurePattern.test(text)) failures.push(`${page.url()} :: pageerror: ${text}`);
  });

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
  }
} finally {
  await context.close();
  await browser.close();
}

if (failures.length > 0) {
  throw new Error(`route runtime hook regressions:\n${failures.join("\n")}`);
}

console.log(`route runtime: scanned ${routes.length} portal routes without hook/runtime regressions`);

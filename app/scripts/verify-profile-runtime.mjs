import { chromium } from "@playwright/test";
import { ensureViteServer } from "./lib/vite-server.mjs";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4197";

await ensureViteServer({ baseUrl, port: 4197 });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem("mms_token", "profile-runtime-test-token");
  localStorage.setItem("mms_tenant", "suffa");
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  let body = {};
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
    body = { gregorian: "2026-08-01", hijri: "16 Safar 1448 AH" };
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
});

try {
  const page = await context.newPage();
  const failures = [];
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (/invalid hook call|dispatcher|RadioGroup|useRef|Maximum update depth|showLabel|InputProps/i.test(text)) {
      failures.push(text);
    }
  });
  page.on("pageerror", (error) => {
    failures.push(error.stack || error.message);
  });

  await page.goto(`${baseUrl}/my-profile`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "My profile" }).waitFor();
  for (const theme of ["Dark", "System", "Light"]) {
    await page.getByRole("radio", { name: theme }).click();
    await page.getByRole("radio", { name: theme }).waitFor({ state: "visible" });
  }
  if (failures.length > 0) {
    throw new Error(`profile runtime console regressions: ${failures.join("\n")}`);
  }
} finally {
  await context.close();
  await browser.close();
}

console.log("profile runtime: theme selector rendered and switched without hook errors");

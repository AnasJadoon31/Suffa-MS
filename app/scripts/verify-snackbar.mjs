import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4185";
let server;
let credentialAttempts = 0;

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4185"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting Vite for snackbar verification");
}

function studentRows() {
  return [{
    id: "student-1",
    user_id: "student-user-1",
    username: "ali.noor",
    admission_number: "ADM-0008",
    name: "Ali Noor",
    date_of_birth: "2017-12-01",
    status: "active",
    portal_enabled: true,
    notes: "",
    created_at: "2026-07-01T00:00:00Z",
    b_form_number: "",
    address: "",
    current_class: null,
    active_enrollment: null,
    admission_record: null,
  }];
}

async function routeApi(context) {
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    let status = 200;
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
        permissions: ["students.view", "students.add", "students.edit", "students.send_credentials"],
        features: {},
        branding: {},
        has_teaching_assignment: false,
      };
    } else if (pathname === "/api/v1/academics/today") {
      body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
    } else if (pathname === "/api/v1/people/students" && request.method() === "GET") {
      body = studentRows();
    } else if (pathname === "/api/v1/people/students/student-1/credentials-link") {
      credentialAttempts += 1;
      if (credentialAttempts === 1) {
        body = { username: "ali.noor", set_password_url: "/set-password?token=SECRET-SNACKBAR-TOKEN" };
      } else {
        status = 422;
        body = { detail: "Demo failure from API" };
      }
    } else if (pathname === "/api/v1/messaging/send-credentials") {
      body = { normalised_number: "+923001234567", direct_sent: true };
    } else if (pathname === "/api/v1/people/guardians") {
      body = [];
    } else if (pathname === "/api/v1/academics/programs") {
      body = [];
    } else if (pathname === "/api/v1/academics/classes") {
      body = [];
    } else if (pathname === "/api/v1/academics/sessions") {
      body = [];
    } else if (pathname === "/api/v1/operations/admission-forms") {
      body = [];
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
}

async function clickLoginLink(page) {
  await page.getByRole("button", { name: "Actions: Ali Noor" }).click();
  await page.getByRole("menuitem", { name: "Login link" }).click();
}

await ensureServer();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "en-US",
  serviceWorkers: "block",
  reducedMotion: "reduce",
});
await context.addInitScript(() => {
  localStorage.setItem("mms_token", "snackbar-test-token");
  localStorage.setItem("mms_tenant", "suffa");
  localStorage.setItem("i18nextLng", "en");
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => undefined },
    configurable: true,
  });
});
await routeApi(context);

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/people/students`, { waitUntil: "domcontentloaded" });
  await page.getByText("ADM-0008").waitFor();

  await clickLoginLink(page);
  const successToast = page.locator(".snackbarToast.success", { hasText: "Changes saved." }).first();
  await successToast.waitFor();
  await page.locator(".snackbarToast.success").nth(1).waitFor();
  if ((await page.locator(".snackbarContainer").getAttribute("aria-live")) !== "polite") {
    throw new Error("snackbar container is missing aria-live='polite'");
  }
  await page.locator(".snackbarDismiss").first().click();

  await clickLoginLink(page);
  await page.locator(".snackbarToast.error", { hasText: "Demo failure from API" }).waitFor();

  const visibleText = await page.locator("body").innerText();
  if (visibleText.includes("SECRET-SNACKBAR-TOKEN")) {
    throw new Error("snackbar flow leaked a raw credential token into visible text");
  }

  await page.screenshot({ path: "/tmp/suffa-snackbar-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/suffa-snackbar-mobile.png", fullPage: true, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error("snackbar page overflowed on mobile");
  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  console.log("snackbar: mutation success/error queue, ARIA, dismiss, token redaction, and mobile layout passed");
} finally {
  await browser.close();
  if (server) server.kill();
}

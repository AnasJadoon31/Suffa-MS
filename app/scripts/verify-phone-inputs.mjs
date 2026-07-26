import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4189";
let server;
const pairingPayloads = [];
const admissionUpdatePayloads = [];

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4189"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting Vite for phone input verification");
}

function apiBody(pathname, request) {
  if (pathname === "/api/v1/auth/me") {
    return {
      user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["settings.manage", "admissions.manage"],
      features: {},
      branding: {},
      has_teaching_assignment: false,
    };
  }
  if (pathname === "/api/v1/academics/today") return { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  if (pathname === "/api/v1/operations/settings/catalog") return [];
  if (pathname === "/api/v1/messaging/whatsapp/connection") return { instance_name: "suffa", state: "close", connected: false };
  if (pathname === "/api/v1/messaging/whatsapp/connection/pairing-code") {
    pairingPayloads.push(request.postDataJSON());
    return { instance_name: "suffa", state: "connecting", pairing_code: "123-456" };
  }
  if (pathname === "/api/v1/academics/programs") return [{ id: "program-1", name: "Hifz" }];
  if (pathname === "/api/v1/operations/admin-notifications") return [];
  if (pathname === "/api/v1/operations/admission-forms") return [];
  if (pathname === "/api/v1/operations/admissions" && request.method() === "GET") {
    return [{
      id: "application-1",
      applicant_name: "Ali Applicant",
      guardian_contact: "+923001111111",
      program_id: "program-1",
      form_id: null,
      date_of_birth: "2017-12-01",
      notes: "Original",
      status: "pending",
      extra_data: {},
      status_history: [],
      converted_student_id: null,
      converted_guardian_id: null,
      created_at: "2026-07-26T00:00:00Z",
    }];
  }
  if (pathname === "/api/v1/operations/admissions/application-1" && request.method() === "PUT") {
    const payload = request.postDataJSON();
    admissionUpdatePayloads.push(payload);
    return {
      id: "application-1",
      status: "pending",
      form_id: null,
      converted_student_id: null,
      converted_guardian_id: null,
      created_at: "2026-07-26T00:00:00Z",
      status_history: [],
      ...payload,
    };
  }
  return [];
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
  localStorage.setItem("mms_token", "phone-input-test-token");
  localStorage.setItem("mms_tenant", "suffa");
  localStorage.setItem("i18nextLng", "en");
});
await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const body = apiBody(new URL(request.url()).pathname, request);
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

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Connect WhatsApp/ }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Connect WhatsApp" });
  await settingsDialog.getByLabel("WhatsApp phone number").fill("123");
  await settingsDialog.getByRole("button", { name: "Generate code" }).waitFor({ state: "visible" });
  if (!(await settingsDialog.getByRole("button", { name: "Generate code" }).isDisabled())) {
    throw new Error("Invalid WhatsApp phone did not disable pairing submission");
  }
  await settingsDialog.getByLabel("WhatsApp phone number").fill("03001234567");
  await settingsDialog.getByRole("button", { name: "Generate code" }).click();
  await settingsDialog.getByText("123-456").waitFor();
  if (pairingPayloads[0]?.phone_number !== "+923001234567") {
    throw new Error(`WhatsApp pairing phone was not normalized: ${JSON.stringify(pairingPayloads)}`);
  }
  await settingsDialog.screenshot({ path: "/tmp/suffa-phone-settings-pairing.png", animations: "disabled" });

  await page.goto(`${baseUrl}/admissions`, { waitUntil: "domcontentloaded" });
  await page.getByText("Ali Applicant").waitFor();
  await page.getByRole("button", { name: "Actions: Ali Applicant" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit application" });
  await editDialog.getByLabel("Guardian contact").fill("03111222333");
  await editDialog.getByRole("button", { name: "Save" }).click();
  await editDialog.waitFor({ state: "hidden" });
  if (admissionUpdatePayloads[0]?.guardian_contact !== "+923111222333") {
    throw new Error(`Admission guardian contact was not normalized: ${JSON.stringify(admissionUpdatePayloads)}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Connect WhatsApp/ }).click();
  await page.screenshot({ path: "/tmp/suffa-phone-settings-mobile.png", fullPage: true, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error("phone input settings page overflowed on mobile");
  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  console.log("phone inputs: shared +92 UI, invalid blocking, E.164 payloads, admission edit, and mobile layout passed");
} finally {
  await browser.close();
  if (server) server.kill();
}

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4190";
let server;
const qrRequests = [];
let connectionState = "close";

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("./node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4190", "--strictPort"], { stdio: "ignore" });
  let startupError = null;
  let exitCode = null;
  server.on("error", (error) => {
    startupError = error;
  });
  server.on("exit", (code) => {
    exitCode = code;
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (startupError) throw startupError;
    if (exitCode !== null) throw new Error(`Vite exited before startup with code ${exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (startupError) throw startupError;
  if (exitCode !== null) throw new Error(`Vite exited before startup with code ${exitCode}`);
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
  localStorage.setItem("mms_token", "whatsapp-connection-test-token");
  localStorage.setItem("mms_tenant", "suffa");
  localStorage.setItem("i18nextLng", "en");
});
await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  let status = 200;
  let body = [];

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["settings.manage"],
      features: {},
      branding: {},
      has_teaching_assignment: false,
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/operations/settings/catalog") {
    body = [];
  } else if (pathname === "/api/v1/messaging/whatsapp/connection") {
    body = { instance_name: "suffa", state: connectionState, connected: connectionState === "open" };
  } else if (pathname === "/api/v1/messaging/whatsapp/connection/qr-code") {
    const replaceExisting = url.searchParams.get("replace_existing") === "true";
    qrRequests.push({ replaceExisting });
    if (!replaceExisting) {
      status = 428;
      body = { detail: "whatsapp_pairing_replace_required" };
    } else {
      body = {
        instance_name: "suffa",
        state: "connecting",
        qr_code_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      };
    }
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

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Connect WhatsApp/ }).click();
  const dialog = page.getByRole("dialog", { name: "Connect WhatsApp" });
  await dialog.getByRole("tab", { name: "Phone number" }).waitFor();
  await dialog.getByRole("tab", { name: "QR code" }).click();
  await dialog.getByText("Use QR code pairing").waitFor();
  await dialog.getByRole("button", { name: "Generate QR code" }).click();
  await dialog.getByText("An incomplete QR pairing is active.").waitFor();
  await dialog.getByRole("button", { name: "Replace and continue" }).click();
  await dialog.getByAltText("WhatsApp QR code").waitFor();
  if (JSON.stringify(qrRequests) !== JSON.stringify([{ replaceExisting: false }, { replaceExisting: true }])) {
    throw new Error(`QR replacement sequence was wrong: ${JSON.stringify(qrRequests)}`);
  }
  await dialog.screenshot({ path: "/tmp/suffa-whatsapp-qr-desktop.png", animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/suffa-whatsapp-qr-mobile.png", fullPage: true, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error("WhatsApp QR modal overflowed on mobile");

  connectionState = "open";
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  const connectButton = page.getByRole("button", { name: /Connect WhatsApp/ });
  await connectButton.waitFor();
  if (!(await connectButton.isDisabled())) throw new Error("Connected WhatsApp session can still be replaced from the UI");

  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  console.log("whatsapp connection: QR/phone method switch, replacement confirmation, connected guard, and mobile layout passed");
} finally {
  await browser.close();
  if (server) server.kill();
}

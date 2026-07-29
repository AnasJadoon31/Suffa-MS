import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4173";
const artifactDir = path.join("artifacts", "issue-verification");
let previewServer;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function ensureServer() {
  if (process.env.APP_URL) return;
  previewServer = spawn("node_modules/.bin/vite", ["preview", "--host", "127.0.0.1", "--port", "4173"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting PWA offline preview server");
}

const profilePayload = {
  user: {
    id: "principal-1",
    username: "admin",
    role: "principal",
    status: "active",
    preferred_language: "en",
    is_principal_delegate: false,
    selected_session_id: null,
    has_teaching_assignment: true,
  },
  madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
  permissions: [],
  features: {},
  has_teaching_assignment: true,
};

async function mockOnlineApi(context) {
  await context.route("**/api/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    let body = [];
    if (pathname === "/api/v1/auth/me") {
      body = profilePayload;
    } else if (pathname === "/api/v1/academics/today") {
      body = { gregorian: "17 Jul 2026", hijri: "2 Safar 1448 AH" };
    } else if (pathname === "/api/v1/academics/sessions") {
      body = [{ id: "session-1", name: "2026-27", is_active: true }];
    } else if (pathname === "/api/v1/reporting/dashboard") {
      body = {
        role: "principal",
        counts: { students: 1, teachers: 1, classes: 1 },
        attendance: {
          present: 1,
          absent: 0,
          leave: 0,
          total_students: 1,
          missing_sync_teachers: 0,
          missing_sync_teacher_list: [],
        },
        finance: { month_total: 0, currency: "PKR" },
        activity: [],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function assertMobileShell(page, label, options = {}) {
  await page.locator(".workspace").waitFor({ state: "visible", timeout: 12_000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await page.locator(".topbar").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".pwaStatusProbe, .pwaStatusChip").first().waitFor({ state: "attached", timeout: 10_000 });
  if (options.expectOffline) {
    await page.locator(".pwaStatusChip-offline").waitFor({ state: "visible", timeout: 10_000 });
  }

  const state = await page.evaluate(() => {
    const doc = document.documentElement;
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const workspace = document.querySelector(".workspace")?.getBoundingClientRect();
    const login = document.querySelector(".login-container");
    const bodyText = document.body.innerText;
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      topbarHeight: topbar?.height ?? 0,
      workspaceHeight: workspace?.height ?? 0,
      token: localStorage.getItem("mms_token"),
      loginVisible: Boolean(login),
      hasBrowserError: bodyText.includes("ERR_INTERNET_DISCONNECTED") || bodyText.includes("This site can't be reached"),
      hasOfflineChip: bodyText.includes("Offline"),
    };
  });

  requireValue(state.token === "offline-shell-token", `${label}: token was removed during offline reload`);
  requireValue(!state.loginVisible, `${label}: offline auth cache fell back to login`);
  requireValue(!state.hasBrowserError, `${label}: browser network error rendered`);
  if (options.expectOffline) {
    requireValue(state.hasOfflineChip, `${label}: offline status chip missing`);
  }
  requireValue(state.scrollWidth <= state.clientWidth + 1, `${label}: horizontal overflow ${JSON.stringify(state)}`);
  requireValue(state.topbarHeight > 0 && state.workspaceHeight > 0, `${label}: app shell dimensions invalid ${JSON.stringify(state)}`);
}

async function waitForServiceWorker(page) {
  const registration = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return null;
    const ready = await navigator.serviceWorker.ready;
    await ready.update().catch(() => {});
    return { scope: ready.scope, active: Boolean(ready.active) };
  });
  requireValue(registration?.active, `service worker did not activate: ${JSON.stringify(registration)}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 12_000 });
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  await fs.mkdir(artifactDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "allow",
  });
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "offline-shell-token");
    localStorage.setItem("mms_tenant", "suffa");
  });
  await mockOnlineApi(context);

  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
  await assertMobileShell(page, "online warmup");
  await waitForServiceWorker(page);
  await assertMobileShell(page, "controlled warmup");

  await context.unroute("**/api/v1/**");
  await context.setOffline(true);
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
  });
  await page.goto(`${baseUrl}/dashboard?offline-reload=1`, { waitUntil: "domcontentloaded" });
  await assertMobileShell(page, "offline reload", { expectOffline: true });
  await page.screenshot({
    path: path.join(artifactDir, "CURRENT-PWA_offline-reload-shell_mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  await context.close();
} finally {
  await browser.close();
  previewServer?.kill("SIGTERM");
}

console.log("pwa offline shell: built app shell reloads offline without logout, browser error, or mobile overflow");

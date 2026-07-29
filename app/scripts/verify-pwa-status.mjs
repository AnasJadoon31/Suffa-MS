import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const artifactDir = path.join("artifacts", "issue-verification");
let server;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function ensureServer() {
  if (process.env.APP_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "5173"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting PWA status verification server");
}

async function mockApi(context, preferredLanguage = "en") {
  await context.route("**/api/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    let body = [];
    if (pathname === "/api/v1/auth/me") {
      body = {
        user: {
          id: "principal-1",
          username: "admin",
          role: "principal",
          status: "active",
          preferred_language: preferredLanguage,
          is_principal_delegate: false,
          selected_session_id: null,
          has_teaching_assignment: true,
        },
        madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
        permissions: [],
        features: {},
        has_teaching_assignment: true,
      };
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

async function preparePage(browser, preferredLanguage = "en") {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "token");
    localStorage.setItem("mms_tenant", "suffa");
  });
  await mockApi(context, preferredLanguage);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator(".topbar").waitFor({ state: "visible" });
  await page.locator(".pwaStatusProbe").waitFor({ state: "attached", timeout: 10_000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  return { context, page };
}

async function assertChipGeometry(page, expectedText, label) {
  const chip = page.locator(".pwaStatusChip", { hasText: expectedText });
  await chip.waitFor({ state: "visible", timeout: 5_000 });
  const geometry = await chip.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      viewport: document.documentElement.clientWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
    };
  });
  requireValue(geometry.height >= 44 && geometry.width >= 44, `${label}: touch target too small ${JSON.stringify(geometry)}`);
  requireValue(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, `${label}: leaves viewport ${JSON.stringify(geometry)}`);
  requireValue(geometry.scrollWidth <= geometry.clientWidth + 1, `${label}: clipped text ${JSON.stringify(geometry)}`);
  requireValue(geometry.pageScrollWidth <= geometry.viewport + 1, `${label}: page overflow ${JSON.stringify(geometry)}`);
}

async function triggerInstallPrompt(page) {
  await page.evaluate(() => {
    window.__pwaInstallPrompted = false;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", {
      value: () => {
        window.__pwaInstallPrompted = true;
        return Promise.resolve();
      },
    });
    Object.defineProperty(event, "userChoice", {
      value: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);
  });
}

async function triggerOffline(context, page) {
  await context.setOffline(true);
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
  });
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  await fs.mkdir(artifactDir, { recursive: true });
  const en = await preparePage(browser, "en");
  await triggerInstallPrompt(en.page);
  await assertChipGeometry(en.page, "Install", "install chip");
  await en.page.screenshot({ path: path.join(artifactDir, "CURRENT-PWA_install-chip_mobile.png"), fullPage: false, animations: "disabled" });
  const clickedInstall = await en.page.evaluate(() => {
    const button = document.querySelector(".pwaStatusChip-install");
    if (!button) return false;
    (button instanceof HTMLElement ? button : null)?.click();
    return true;
  });
  const currentChipText = await en.page.locator(".pwaStatusChip").first().textContent().catch(() => "");
  requireValue(clickedInstall, `install chip disappeared before click; current chip: ${currentChipText}`);
  const prompted = await en.page.evaluate(() => window.__pwaInstallPrompted);
  requireValue(prompted === true, "install chip did not call prompt()");
  await triggerOffline(en.context, en.page);
  await assertChipGeometry(en.page, "Offline", "offline chip");
  await en.page.screenshot({ path: path.join(artifactDir, "CURRENT-PWA_offline-chip_mobile.png"), fullPage: false, animations: "disabled" });
  await en.context.close();

  const ur = await preparePage(browser, "ur");
  await triggerOffline(ur.context, ur.page);
  await assertChipGeometry(ur.page, "آف لائن", "urdu offline chip");
  await ur.page.screenshot({ path: path.join(artifactDir, "CURRENT-PWA_offline-chip_mobile-urdu.png"), fullPage: false, animations: "disabled" });
  await ur.context.close();
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}

console.log("pwa status: install prompt, offline state, mobile geometry, and Urdu label passed");

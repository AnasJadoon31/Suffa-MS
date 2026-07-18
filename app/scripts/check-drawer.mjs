import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.DRAWER_BASE_URL ?? "http://127.0.0.1:4173";
let previewServer;

async function ensureServer() {
  if (process.env.DRAWER_BASE_URL) return;
  previewServer = spawn(
    "node_modules/.bin/vite",
    ["preview", "--host", "127.0.0.1", "--port", "4173"],
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting the PWA preview server");
}

async function mockApi(context) {
  await context.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/v1/auth/me"
      ? {
          user: {
            id: "teacher-1",
            username: "teacher",
            role: "teacher",
            status: "active",
            preferred_language: "en",
            selected_session_id: null,
          },
          madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
          permissions: [],
          features: {},
        }
      : pathname === "/api/v1/academics/today"
        ? { gregorian: "19 Jul 2026", hijri: "4 Safar 1448 AH" }
        : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Total-Count": Array.isArray(body) ? String(body.length) : "0" },
      body: JSON.stringify(body),
    });
  });
}

async function checkViewport(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "drawer-test-token");
    localStorage.setItem("mms_tenant", "suffa");
  });
  await mockApi(context);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("requestfailed", (request) => browserErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(`${baseUrl}/my-timetable`, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");

  const toggle = page.locator(".navToggle");
  if (!(await toggle.isVisible())) {
    const state = await page.evaluate(() => {
      const element = document.querySelector(".navToggle");
      return {
        viewport: innerWidth,
        path: location.pathname,
        exists: Boolean(element),
        display: element ? getComputedStyle(element).display : null,
        appShell: Boolean(document.querySelector(".appShell")),
        body: document.body.innerText.slice(0, 200),
      };
    });
    throw new Error(`${width}px: drawer toggle is not visible: ${JSON.stringify({ state, browserErrors })}`);
  }
  await toggle.click();
  const drawer = page.locator(".sidebar.sidebarOpen");
  await drawer.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const element = document.querySelector(".sidebar.sidebarOpen");
    if (!element) return false;
    const transform = getComputedStyle(element).transform;
    if (transform === "none") return true;
    const values = transform.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number);
    return Boolean(values && Math.abs(values[4]) < 0.5);
  });

  const labelState = await page.evaluate(() => {
    const element = document.querySelector(".sidebar.sidebarOpen .navItem span");
    if (!element) throw new Error("Drawer has no navigation label element");
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const sidebar = element.closest(".sidebar");
    const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
    return {
      connected: element.isConnected,
      display: style.getPropertyValue("display"),
      visibility: style.getPropertyValue("visibility"),
      width: rect.width,
      text: element.textContent,
      html: element.outerHTML,
      sidebarClass: sidebar?.className,
      sidebarVisibility: sidebarStyle?.visibility,
      sidebarTransform: sidebarStyle?.transform,
    };
  });
  if (labelState.display === "none" || labelState.visibility === "hidden" || labelState.width < 1) {
    throw new Error(`${width}px: drawer label is icons-only: ${JSON.stringify(labelState)}`);
  }

  await context.close();
  return labelState;
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  const phone = await checkViewport(browser, 390, 844);
  const compactTablet = await checkViewport(browser, 920, 900);
  console.log(JSON.stringify({ phone, compactTablet }));
} finally {
  await browser.close();
  previewServer?.kill("SIGTERM");
}

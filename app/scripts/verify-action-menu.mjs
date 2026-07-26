import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4175";
let server;

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4175"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting Vite for action-menu verification");
}

function apiResponse(pathname) {
  if (pathname === "/api/v1/auth/me") {
    return {
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
      permissions: [],
      features: {},
      branding: {},
      has_teaching_assignment: false,
    };
  }
  if (pathname === "/api/v1/academics/today") {
    return { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  }
  if (pathname === "/api/v1/people/students") {
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
      set_password_url: "/set-password/student-token",
      admission_record: null,
    }];
  }
  if (pathname === "/api/v1/people/guardians") return [];
  if (pathname === "/api/v1/academics/programs") return [];
  if (pathname === "/api/v1/academics/classes") return [];
  if (pathname === "/api/v1/academics/sessions") return [];
  if (pathname === "/api/v1/operations/admission-forms") return [];
  return [];
}

async function verifyActionMenuAtViewport(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    locale: "en-US",
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "action-menu-token");
    localStorage.setItem("mms_tenant", "suffa");
    localStorage.setItem("i18nextLng", "en");
  });
  await context.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = apiResponse(pathname);
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
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(`${baseUrl}/people/students`, { waitUntil: "domcontentloaded" });
    await page.locator(".workspace").waitFor();
    await page.getByText("ADM-0008").waitFor();

    const row = page.locator(".dataRow", { hasText: "Ali Noor" }).last();
    const beforeHeight = (await row.boundingBox())?.height ?? 0;
    await page.getByRole("button", { name: "Actions: Ali Noor" }).click();

    const menu = page.getByRole("menu");
    await menu.waitFor();
    await page.getByRole("menuitem", { name: "Edit" }).waitFor();
    await page.getByRole("menuitem", { name: "View" }).waitFor();
    await page.getByRole("menuitem", { name: "Login link" }).waitFor();

    const afterHeight = (await row.boundingBox())?.height ?? 0;
    const styles = await menu.evaluate((element) => {
      const menuStyle = getComputedStyle(element);
      const firstItem = element.querySelector(".actionMenuItem");
      const firstLi = element.querySelector("li");
      return {
        menuPosition: menuStyle.position,
        listStyle: menuStyle.listStyleType,
        marginTop: menuStyle.marginTop,
        paddingTop: menuStyle.paddingTop,
        itemDisplay: firstItem ? getComputedStyle(firstItem).display : "",
        itemBackground: firstItem ? getComputedStyle(firstItem).backgroundColor : "",
        liListStyle: firstLi ? getComputedStyle(firstLi).listStyleType : "",
      };
    });
    const menuBox = await menu.boundingBox();

    if (!["absolute", "fixed"].includes(styles.menuPosition)) {
      throw new Error(`Action menu is not anchored; position=${styles.menuPosition}`);
    }
    if (styles.listStyle !== "none" || styles.liListStyle !== "none") {
      throw new Error(`Action menu is showing list bullets; menu=${styles.listStyle}, li=${styles.liListStyle}`);
    }
    if (styles.itemDisplay !== "flex") {
      throw new Error(`Action menu items are falling back to native buttons; display=${styles.itemDisplay}`);
    }
    if (!menuBox || menuBox.height < 110 || menuBox.height > 190 || menuBox.width < 140) {
      throw new Error(`Action menu dimensions look broken: ${JSON.stringify(menuBox)}`);
    }
    if (afterHeight > Math.max(120, beforeHeight + 24)) {
      throw new Error(`Opening action menu inflated table row height from ${beforeHeight} to ${afterHeight}`);
    }
    if (errors.length) {
      throw new Error(`Browser errors while verifying ${label}: ${errors.join(" | ")}`);
    }
    console.log(`action menu ${label}: positioned dropdown passed (${Math.round(menuBox.width)}x${Math.round(menuBox.height)}, row ${Math.round(afterHeight)}px)`);
  } finally {
    await context.close();
  }
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  await verifyActionMenuAtViewport(browser, { width: 1440, height: 900 }, "desktop");
  await verifyActionMenuAtViewport(browser, { width: 390, height: 844 }, "mobile");
} finally {
  await browser.close();
  if (server) server.kill("SIGTERM");
}

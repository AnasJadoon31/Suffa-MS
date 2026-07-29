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
      permissions: ["students.view", "students.send_credentials", "resources.manage", "holidays.manage"],
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
  if (pathname === "/api/v1/academics/programs") return [{ id: "program-1", name: "Hifz Program", created_at: "2026-07-26T00:00:00Z" }];
  if (pathname === "/api/v1/academics/classes") return [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true }];
  if (pathname === "/api/v1/academics/classes/class-1/sections") return [{ id: "section-1", class_id: "class-1", name: "A" }];
  if (pathname === "/api/v1/academics/classes/class-1/courses") return [];
  if (pathname === "/api/v1/academics/courses") return [{ id: "course-1", name: "Quran" }];
  if (pathname === "/api/v1/academics/sessions") return [{
    id: "session-1",
    name: "2026-27",
    gregorian_start: "2026-04-01",
    gregorian_end: "2027-03-31",
    hijri_span: "1447-1448 AH",
    is_active: false,
  }];
  if (pathname === "/api/v1/operations/admission-forms") return [];
  if (pathname === "/api/v1/operations/resource-categories") return [{ id: "category-1", name: "Handouts", description: "" }];
  if (pathname === "/api/v1/operations/resources") {
    return [{
      id: "resource-1",
      category_id: "category-1",
      title: "Week 1 packet",
      description: "Read before class",
      file_key: "resources/week-1.pdf",
      video_url: "https://example.test/lesson",
      visibility_scope: { all: true },
      owner_id: "teacher-1",
      owner_name: "Ustad Ahmad",
      created_at: "2026-07-26T00:00:00Z",
    }];
  }
  if (pathname === "/api/v1/operations/holidays") {
    return [{
      id: "holiday-1",
      name: "Eid break",
      category: "holiday",
      start_date: "2026-07-01",
      end_date: "2026-07-03",
      class_ids: [],
      created_at: "2026-07-26T00:00:00Z",
    }];
  }
  return [];
}

async function verifyMenuItems(page, triggerName, itemNames, label) {
  await page.getByRole("button", { name: triggerName }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  for (const itemName of itemNames) {
    await page.getByRole("menuitem", { name: itemName }).waitFor();
  }
  const styles = await menu.evaluate((element) => ({
    position: getComputedStyle(element).position,
    listStyle: getComputedStyle(element).listStyleType,
    firstItemDisplay: getComputedStyle(element.querySelector(".actionMenuItem")).display,
  }));
  if (styles.position !== "fixed" || styles.listStyle !== "none" || styles.firstItemDisplay !== "flex") {
    throw new Error(`Action menu styling regressed on ${label}: ${JSON.stringify(styles)}`);
  }
  await page.keyboard.press("Escape");
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
    await page.getByText("ADM-0008").first().waitFor();

    const row = page.locator(".dataRow, .mobileDataCard", { hasText: "Ali Noor" }).last();
    const beforeHeight = (await row.boundingBox())?.height ?? 0;
    await row.getByRole("button", { name: "Actions: Ali Noor" }).click();

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

    await page.goto(`${baseUrl}/resources`, { waitUntil: "domcontentloaded" });
    await page.getByText("Week 1 packet").waitFor();
    await verifyMenuItems(page, "Actions: Week 1 packet", ["Watch", "Download", "Edit", "Delete"], `${label} resources`);

    await page.goto(`${baseUrl}/holidays`, { waitUntil: "domcontentloaded" });
    await page.getByText("Eid break").waitFor();
    await verifyMenuItems(page, "Actions: Eid break", ["Edit", "Delete"], `${label} holidays`);

    await page.goto(`${baseUrl}/academics/programs`, { waitUntil: "domcontentloaded" });
    await page.getByText("Hifz Program").waitFor();
    await verifyMenuItems(page, "Actions: Hifz Program", ["Edit", "Delete"], `${label} academic programs`);

    await page.goto(`${baseUrl}/academics/classes`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Actions: Hifz Level 1" }).waitFor();
    await verifyMenuItems(page, "Actions: Hifz Level 1", ["Edit", "Delete"], `${label} academic classes`);

    await page.goto(`${baseUrl}/academics/courses`, { waitUntil: "domcontentloaded" });
    await page.getByText("Quran").waitFor();
    await verifyMenuItems(page, "Actions: Quran", ["Edit", "Delete"], `${label} academic courses`);

    await page.goto(`${baseUrl}/academics/sessions`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Actions: 2026-27" }).waitFor();
    await verifyMenuItems(page, "Actions: 2026-27", ["Activate", "Edit", "Delete"], `${label} academic sessions`);

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

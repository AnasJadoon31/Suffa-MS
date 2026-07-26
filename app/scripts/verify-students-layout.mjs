import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4188";
let server;

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4188"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting Vite for students layout verification");
}

const students = Array.from({ length: 12 }, (_, index) => ({
  id: `student-${index + 1}`,
  user_id: `student-user-${index + 1}`,
  username: `student.${index + 1}`,
  admission_number: `ADM-${String(index + 8).padStart(4, "0")}`,
  name: index === 0 ? "Ali Noor" : `Student ${index + 1}`,
  date_of_birth: "2017-12-01",
  status: index % 3 === 0 ? "inactive" : "active",
  portal_enabled: index % 2 === 0,
  notes: "",
  created_at: "2026-07-01T00:00:00Z",
  b_form_number: "",
  address: "",
  current_class: null,
  active_enrollment: null,
  admission_record: null,
}));

function apiResponse(pathname) {
  if (pathname === "/api/v1/auth/me") {
    return {
      user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["students.view", "students.add", "students.edit", "students.send_credentials"],
      features: {},
      branding: {},
      has_teaching_assignment: false,
    };
  }
  if (pathname === "/api/v1/academics/today") return { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  if (pathname === "/api/v1/people/students") return students;
  if (pathname === "/api/v1/people/guardians") return [];
  if (pathname === "/api/v1/academics/programs") return [];
  if (pathname === "/api/v1/academics/classes") return [];
  if (pathname === "/api/v1/academics/sessions") return [];
  if (pathname === "/api/v1/operations/admission-forms") return [];
  return [];
}

async function verifyViewport(browser, viewport, label, language = "en") {
  const context = await browser.newContext({
    viewport,
    locale: language === "ur" ? "ur-PK" : "en-US",
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.addInitScript((lng) => {
    localStorage.setItem("mms_token", "students-layout-token");
    localStorage.setItem("mms_tenant", "suffa");
    localStorage.setItem("i18nextLng", lng);
  }, language);
  await context.route("**/api/v1/**", async (route) => {
    const body = apiResponse(new URL(route.request().url()).pathname);
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
    await page.goto(`${baseUrl}/people/students`, { waitUntil: "domcontentloaded" });
    await page.getByText("ADM-0008").waitFor();
    const geometry = await page.evaluate(() => {
      const doc = document.documentElement;
      const toolbar = document.querySelector(".studentsToolbar")?.getBoundingClientRect();
      const addButton = document.querySelector(".studentsToolbar button.primaryAction")?.getBoundingClientRect();
      const portal = document.querySelector(".studentsTable .colPortal")?.getBoundingClientRect();
      const status = document.querySelector(".studentsTable .colStatus")?.getBoundingClientRect();
      const actions = document.querySelector(".studentsTable .colActions")?.getBoundingClientRect();
      return {
        overflow: doc.scrollWidth > window.innerWidth + 1,
        toolbar,
        addButton,
        portal,
        status,
        actions,
      };
    });
    if (geometry.overflow) throw new Error(`${label}: page has horizontal overflow`);
    if (!geometry.toolbar || !geometry.addButton) throw new Error(`${label}: missing toolbar or Add student button`);
    if (geometry.addButton.right > viewport.width + 1) throw new Error(`${label}: Add student button overflowed toolbar`);
    if (viewport.width >= 768) {
      for (const [name, box] of Object.entries({ portal: geometry.portal, status: geometry.status, actions: geometry.actions })) {
        if (!box || box.width > 180) throw new Error(`${label}: ${name} column is not content-sized: ${JSON.stringify(box)}`);
      }
    }

    await page.locator(".studentsTable .actionMenuTrigger").first().click();
    await page.getByRole("menuitem").first().waitFor();
    await page.screenshot({ path: `/tmp/suffa-students-layout-${label}.png`, fullPage: true, animations: "disabled" });
    if (errors.length) throw new Error(`${label}: browser errors: ${errors.join(" | ")}`);
    console.log(`students layout ${label}: toolbar, table sizing, actions, and overflow checks passed`);
  } finally {
    await context.close();
  }
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1440, height: 900 }, "desktop");
  await verifyViewport(browser, { width: 768, height: 1024 }, "tablet");
  await verifyViewport(browser, { width: 390, height: 844 }, "mobile");
  await verifyViewport(browser, { width: 390, height: 844 }, "mobile-urdu", "ur");
} finally {
  await browser.close();
  if (server) server.kill();
}

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4181";
const outputDir = path.resolve("artifacts/audience-picker");
let server;

const students = [
  {
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
    current_class: "Hifz Level 1 / A",
    active_enrollment: { class_id: "class-1", section_id: "section-1" },
    set_password_url: "/set-password/student-token",
    admission_record: null,
  },
  {
    id: "student-2",
    user_id: "student-user-2",
    username: "demo.student",
    admission_number: "ADM-0009",
    name: "Demo Student",
    date_of_birth: "2016-02-01",
    status: "active",
    portal_enabled: true,
    notes: "",
    created_at: "2026-07-01T00:00:00Z",
    b_form_number: "",
    address: "",
    current_class: "Hifz Level 1 / A",
    active_enrollment: { class_id: "class-1", section_id: "section-1" },
    set_password_url: "/set-password/student-token-2",
    admission_record: null,
  },
  ...Array.from({ length: 130 }, (_, index) => ({
    id: `bulk-student-${index + 1}`,
    user_id: `bulk-student-user-${index + 1}`,
    username: `bulk.student.${index + 1}`,
    admission_number: `ADM-B${String(index + 1).padStart(4, "0")}`,
    name: `Bulk Student ${String(index + 1).padStart(3, "0")}`,
    date_of_birth: "2016-02-01",
    status: "active",
    portal_enabled: true,
    notes: "",
    created_at: "2026-07-01T00:00:00Z",
    b_form_number: "",
    address: "",
    current_class: "Hifz Level 1 / A",
    active_enrollment: { class_id: "class-1", section_id: "section-1" },
    set_password_url: `/set-password/bulk-student-${index + 1}`,
    admission_record: null,
  })),
];
const guardians = [
  {
    id: "guardian-1",
    user_id: "guardian-user-1",
    name: "Shaikh Noor",
    relationship: "father",
    phone_numbers: "+923001234567",
    ward_count: 2,
  },
  {
    id: "guardian-unlinked",
    user_id: null,
    name: "Unlinked Guardian",
    relationship: "uncle",
    phone_numbers: "+923009999999",
    ward_count: 1,
  },
];

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4181"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting Vite for audience picker verification");
}

function responseFor(pathname, request) {
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
  if (pathname === "/api/v1/academics/today") return { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  if (pathname === "/api/v1/academics/classes") return [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true, assignment_limit: 8 }];
  if (pathname === "/api/v1/academics/classes/class-1/sections") return [{ id: "section-1", class_id: "class-1", name: "A" }];
  if (pathname === "/api/v1/operations/forms") return [];
  if (pathname === "/api/v1/operations/form-responses") return [];
  if (pathname === "/api/v1/people/students") {
    const query = new URL(request.url()).searchParams.get("search")?.toLowerCase() ?? "";
    return query ? students.filter((student) => student.name.toLowerCase().includes(query)) : students;
  }
  if (pathname === "/api/v1/people/teachers") return [];
  if (pathname === "/api/v1/people/guardians") {
    const query = new URL(request.url()).searchParams.get("search")?.toLowerCase() ?? "";
    return query ? guardians.filter((guardian) => guardian.name.toLowerCase().includes(query)) : guardians;
  }
  return [];
}

async function verifyAtViewport(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    locale: "en-US",
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "audience-picker-token");
    localStorage.setItem("mms_tenant", "suffa");
    localStorage.setItem("i18nextLng", "en");
  });
  const formCreatePayloads = [];
  await context.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && pathname === "/api/v1/operations/forms") {
      const payload = route.request().postDataJSON();
      formCreatePayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `form-${formCreatePayloads.length}`,
          title: payload.title,
          description: payload.description ?? "",
          category: payload.category ?? null,
          fields_definition: payload.fields,
          allow_multiple: payload.allow_multiple,
          visibility_scope: payload.visibility_scope,
          created_at: "2026-07-26T00:00:00Z",
        }),
      });
      return;
    }
    const body = responseFor(pathname, route.request());
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
    await page.goto(`${baseUrl}/forms`, { waitUntil: "domcontentloaded" });
    await page.locator(".workspace").waitFor();
    await page.getByRole("button", { name: "Create form" }).click();
    const dialog = page.getByRole("dialog", { name: "Create form" });
    await dialog.waitFor();

    await dialog.getByRole("button", { name: /All students/i }).click();
    const menu = dialog.locator(".peopleMultiSelectMenu");
    await menu.waitFor();
    await dialog.getByRole("searchbox", { name: "Search..." }).fill("Ali");
    await dialog.getByRole("option", { name: /Ali Noor/ }).waitFor();
    await dialog.getByRole("searchbox", { name: "Search..." }).press("Enter");

    await dialog.getByText("Ali Noor").first().waitFor();
    await dialog.getByRole("button", { name: "Ali Noor", exact: true }).waitFor();
    await dialog.getByRole("searchbox", { name: "Search..." }).fill("Demo");
    await dialog.getByRole("option", { name: /Demo Student/ }).waitFor();
    await dialog.getByRole("searchbox", { name: "Search..." }).press("Enter");
    await dialog.getByText("Demo Student").first().waitFor();
    await dialog.getByRole("searchbox", { name: "Search..." }).fill("");
    await dialog.getByRole("option", { name: /Bulk Student 100/ }).waitFor();
    const loadedStudentOptions = await dialog.getByRole("option").count();
    if (loadedStudentOptions < 100) {
      throw new Error(`Audience picker did not handle the large student fixture; options=${loadedStudentOptions}`);
    }
    await dialog.getByRole("searchbox", { name: "Search..." }).press("Escape");
    await dialog.getByLabel("Target Audience").selectOption("guardians");
    await dialog.getByRole("button", { name: /2 selected/i }).click();
    await dialog.getByRole("searchbox", { name: "Search..." }).fill("Unlinked");
    await page.waitForTimeout(350);
    if (await dialog.getByRole("option", { name: /Unlinked Guardian/ }).count()) {
      throw new Error("Guardian without a portal user was offered as a specific person target");
    }
    await dialog.getByRole("searchbox", { name: "Search..." }).fill("Shaikh");
    await dialog.getByRole("option", { name: /Shaikh Noor/ }).waitFor();
    await dialog.getByRole("searchbox", { name: "Search..." }).press("Enter");
    await dialog.getByRole("button", { name: /3 selected/i }).waitFor();
    const visibleRawCheckboxes = await dialog.locator(".personList, .searchBox").count();
    if (visibleRawCheckboxes > 0) {
      throw new Error("Legacy raw person list/search box is still rendered");
    }

    const menuBox = await menu.boundingBox();
    const triggerBox = await dialog.locator(".peopleMultiSelectTrigger").boundingBox();
    const optionDisplay = await dialog.locator(".peopleMultiSelectOption").first().evaluate((element) => getComputedStyle(element).display);
    if (!menuBox || !triggerBox || menuBox.height < 90 || menuBox.width < triggerBox.width - 4) {
      throw new Error(`Audience picker dropdown dimensions look broken: menu=${JSON.stringify(menuBox)} trigger=${JSON.stringify(triggerBox)}`);
    }
    if (optionDisplay !== "grid") {
      throw new Error(`Audience picker options are not styled rows; display=${optionDisplay}`);
    }
    const selectedChips = await dialog.locator(".selectedChips .chip").count();
    if (selectedChips !== 3) {
      throw new Error(`Keyboard mixed-role multi-select should have 3 chips, selected=${selectedChips}`);
    }

    await mkdir(outputDir, { recursive: true });
    await dialog.screenshot({ path: path.join(outputDir, `audience-picker-${label}.png`), animations: "disabled" });
    await dialog.getByLabel("Title").fill(`Mixed audience ${label}`);
    await dialog.getByLabel("Label").first().fill("Consent");
    await dialog.getByRole("button", { name: "Create form" }).click();
    await dialog.waitFor({ state: "hidden" });
    const scope = formCreatePayloads.at(-1)?.visibility_scope;
    const users = new Set(scope?.users ?? []);
    const roles = new Set(scope?.roles ?? []);
    for (const userId of ["student-user-1", "student-user-2", "guardian-user-1"]) {
      if (!users.has(userId)) throw new Error(`Mixed audience payload missed ${userId}: ${JSON.stringify(scope)}`);
    }
    for (const role of ["student", "parent"]) {
      if (!roles.has(role)) throw new Error(`Mixed audience payload missed role ${role}: ${JSON.stringify(scope)}`);
    }
    if (errors.length) {
      throw new Error(`Browser errors while verifying ${label}: ${errors.join(" | ")}`);
    }

    console.log(`audience picker ${label}: searchable dropdown and mixed-role payload passed`);
  } finally {
    await context.close();
  }
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  await verifyAtViewport(browser, { width: 1280, height: 900 }, "desktop");
  await verifyAtViewport(browser, { width: 390, height: 844 }, "mobile");
} finally {
  await browser.close();
  if (server) server.kill("SIGTERM");
}

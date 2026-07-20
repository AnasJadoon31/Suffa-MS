import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const viewport = process.env.TEST_VIEWPORT === "mobile"
  ? { width: 390, height: 844 }
  : { width: 1280, height: 900 };
let createdPayload;
let createdForm;
let updatedPayload;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "builder-test-token");
  localStorage.setItem("mms_tenant", "suffa");
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  let body = [];

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: {
        id: "principal-1",
        username: "admin",
        role: "principal",
        status: "active",
        preferred_language: "en",
        selected_session_id: null,
      },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: [],
      features: {},
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "20 Jul 2026", hijri: "6 Safar 1448 AH" };
  } else if (pathname === "/api/v1/academics/programs") {
    body = [{ id: "program-1", name: "Hifz Program" }];
  } else if (pathname === "/api/v1/operations/admission-forms" && request.method() === "POST") {
    createdPayload = request.postDataJSON();
    createdForm = {
      id: "form-1",
      ...createdPayload,
      description: createdPayload.description ?? "",
      fields_definition: createdPayload.fields,
      public_token: "public-token",
      is_open: true,
      created_at: "2026-07-20T00:00:00Z",
      program_name: "Hifz Program",
    };
    body = createdForm;
  } else if (pathname === "/api/v1/operations/admission-forms/form-1" && request.method() === "PUT") {
    updatedPayload = request.postDataJSON();
    createdForm = {
      ...createdForm,
      ...updatedPayload,
      fields_definition: updatedPayload.fields,
    };
    body = createdForm;
  } else if (pathname === "/api/v1/operations/admission-forms") {
    body = createdForm ? [createdForm] : [];
  }

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

try {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/admission-forms`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create form" }).click();

  const dialog = page.getByRole("dialog", { name: "Create form" });
  await dialog.getByRole("button", { name: "Add field" }).waitFor();
  await dialog.getByLabel(/^Program/).selectOption("program-1");
  await dialog.getByLabel("Title", { exact: true }).fill("2027 admissions");
  await dialog.getByLabel("Key", { exact: true }).fill("previous_school");
  await dialog.getByLabel("Label", { exact: true }).fill("Previous school");
  await dialog.getByLabel(/^Type/).selectOption("textarea");
  if (process.env.TEST_SCREENSHOT) {
    await dialog.screenshot({ path: process.env.TEST_SCREENSHOT, animations: "disabled" });
  }
  await dialog.getByRole("button", { name: "Create form" }).click();
  await page.getByText("2027 admissions").waitFor();

  if (JSON.stringify(createdPayload?.fields) !== JSON.stringify([
    { key: "previous_school", label: "Previous school", type: "textarea", required: true, options: [] },
  ])) {
    throw new Error(`Admission form fields were not submitted: ${JSON.stringify(createdPayload)}`);
  }

  await page.getByRole("button", { name: "Edit 2027 admissions" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit public form" });
  await editDialog.getByLabel("Label", { exact: true }).fill("Previous madrasa");
  await editDialog.getByRole("button", { name: "Save" }).click();
  await editDialog.waitFor({ state: "hidden" });

  if (updatedPayload?.fields?.[0]?.label !== "Previous madrasa") {
    throw new Error(`Admission form fields were not updated: ${JSON.stringify(updatedPayload)}`);
  }

  console.log("admission form builder: create and edit payloads include configured fields");
} finally {
  await context.close();
  await browser.close();
}

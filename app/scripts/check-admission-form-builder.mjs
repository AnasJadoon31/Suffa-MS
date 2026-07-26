import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const viewport = process.env.TEST_VIEWPORT === "mobile"
  ? { width: 390, height: 844 }
  : { width: 1280, height: 900 };
let createdPayload;
let createdForm;
let updatedPayload;
let publicSubmission;

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
  } else if (pathname === "/api/v1/public/admission-forms/public-token" && request.method() === "POST") {
    publicSubmission = request.postDataJSON();
    body = { id: "application-1", form_id: "form-1", ...publicSubmission };
  } else if (pathname === "/api/v1/public/admission-forms/public-token") {
    body = {
      title: createdForm.title,
      description: createdForm.description,
      program_name: createdForm.program_name,
      fields_definition: createdForm.fields_definition,
      is_open: true,
    };
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
  await page.getByRole("dialog", { name: "Choose admission form type" }).getByRole("button", { name: "General form" }).click();

  const dialog = page.getByRole("dialog", { name: "Create form" });
  await dialog.getByRole("button", { name: "Add field" }).waitFor();
  await dialog.getByLabel(/^Program/).selectOption("program-1");
  await dialog.getByLabel("Title", { exact: true }).fill("2027 admissions");
  await dialog.getByText("Built-in").first().waitFor();
  await dialog.getByRole("button", { name: "Add field" }).click();
  await dialog.getByLabel("Label", { exact: true }).nth(11).fill("Previous school");
  await dialog.getByLabel(/^Type/).nth(11).selectOption("textarea");
  await dialog.getByRole("button", { name: "Add field" }).click();
  await dialog.getByLabel("Label", { exact: true }).nth(12).fill("Preferred campus");
  await dialog.getByLabel(/^Type/).nth(12).selectOption("radio");
  await dialog.getByRole("button", { name: "Create form" }).click();
  if (createdPayload) throw new Error("Option-based field was submitted without options");
  await dialog.getByLabel("Option 1").last().fill("North");
  await dialog.getByLabel("Option 2").last().fill("South");
  if (process.env.TEST_SCREENSHOT) {
    await dialog.screenshot({ path: process.env.TEST_SCREENSHOT, animations: "disabled" });
  }
  await dialog.getByRole("button", { name: "Create form" }).click();
  await page.getByText("2027 admissions").waitFor();

  const builtIns = createdPayload?.fields?.filter((field) => field.built_in);
  const previousSchool = createdPayload?.fields?.find((field) => field.key === "Previous school");
  const preferredCampus = createdPayload?.fields?.find((field) => field.key === "Preferred campus");
  if (
    builtIns?.length !== 11 ||
    !builtIns.some((field) => field.key === "guardian_phone_numbers" && field.enabled === true) ||
    JSON.stringify(previousSchool) !== JSON.stringify({ key: "Previous school", label: "Previous school", type: "textarea", required: true, options: [], enabled: true }) ||
    JSON.stringify(preferredCampus) !== JSON.stringify({ key: "Preferred campus", label: "Preferred campus", type: "radio", required: true, options: ["North", "South"], enabled: true })
  ) {
    throw new Error(`Admission form fields were not submitted: ${JSON.stringify(createdPayload)}`);
  }

  await page.getByRole("button", { name: "Actions: 2027 admissions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit admission form" });
  await editDialog.getByLabel("Label", { exact: true }).nth(11).fill("Previous madrasa");
  await editDialog.getByRole("button", { name: "Save" }).click();
  await editDialog.waitFor({ state: "hidden" });

  if (!updatedPayload?.fields?.some((field) => field.key === "Previous madrasa" && field.label === "Previous madrasa")) {
    throw new Error(`Admission form fields were not updated: ${JSON.stringify(updatedPayload)}`);
  }

  await page.goto(`${baseUrl}/public/admission/public-token`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Student name").fill("New Applicant");
  await page.getByLabel("Date of birth").fill("2017-02-03");
  await page.getByLabel("Guardian name").fill("New Guardian");
  await page.getByLabel("Guardian relationship").fill("father");
  await page.getByLabel("Guardian phone number").fill("3001234567");
  await page.getByLabel("Guardian preferred language").selectOption("ur");
  await page.getByLabel("Previous madrasa").fill("Suffa School");
  await page.getByRole("radio", { name: "North" }).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await page.waitForTimeout(500);
  if (!publicSubmission) {
    const invalidControls = await page.locator("input:invalid, select:invalid, textarea:invalid").evaluateAll((nodes) => nodes.map((node) => ({
      label: node.closest("label")?.innerText ?? node.getAttribute("aria-label") ?? node.getAttribute("name") ?? node.id,
      value: node.value,
    })));
    const pageText = await page.locator("body").innerText();
    throw new Error(`Public form did not submit; invalid controls: ${JSON.stringify(invalidControls)}; page text: ${pageText}`);
  }
  await page.getByText("Application submitted.").waitFor();

  if (
    publicSubmission?.applicant_name !== "New Applicant" ||
    publicSubmission?.guardian_contact !== "+923001234567" ||
    publicSubmission?.date_of_birth !== "2017-02-03" ||
    publicSubmission?.extra_data?.["Preferred campus"] !== "North"
  ) {
    throw new Error(`Public form did not submit configured answers: ${JSON.stringify(publicSubmission)}`);
  }

  console.log("admission form builder: create, edit, render, and submit flow passed");
} finally {
  await context.close();
  await browser.close();
}

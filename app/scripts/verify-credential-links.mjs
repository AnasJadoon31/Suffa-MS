import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4188";
const viewport = process.env.TEST_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 };
const forbiddenFragments = ["SECRET-CREATE-TOKEN", "SECRET-REISSUE-TOKEN", "/set-password?token="];
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
  throw new Error("Timed out starting Vite for credential-link verification");
}

let teachers = [];
const guardians = [{
  id: "guardian-1",
  user_id: null,
  name: "Shaikh Noor",
  relationship: "Father",
  phone_numbers: "+923009999999",
  cnic: null,
  address: null,
  preferred_language: "en",
  created_at: "2026-07-26T00:00:00Z",
}];
const credentialSendPayloads = [];
const clipboardWrites = [];

await ensureServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "credential-link-test-token");
  localStorage.setItem("mms_tenant", "suffa");
  const writes = [];
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async (value) => { writes.push(value); window.__clipboardWrites = writes; } },
    configurable: true,
  });
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  let body = [];

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["teachers.view", "teachers.add", "teachers.edit", "students.view", "students.send_credentials"],
      features: {},
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/people/teachers" && request.method() === "GET") {
    const search = url.searchParams.get("search")?.toLowerCase() ?? "";
    body = search ? teachers.filter((teacher) => teacher.name.toLowerCase().includes(search)) : teachers;
  } else if (pathname === "/api/v1/people/teachers" && request.method() === "POST") {
    const payload = request.postDataJSON();
    const created = {
      id: "teacher-1",
      user_id: "user-teacher-1",
      employee_code: "TCH-0001",
      name: payload.name,
      whatsapp_number: payload.whatsapp_number,
      qualifications: payload.qualifications ?? null,
      join_date: payload.join_date ?? null,
      status: "active",
      notes: null,
      cnic: payload.cnic ?? null,
      address: payload.address ?? null,
      emergency_contact: payload.emergency_contact ?? null,
      is_principal_delegate: false,
      created_at: "2026-07-26T00:00:00Z",
      set_password_url: "/set-password?token=SECRET-CREATE-TOKEN",
    };
    teachers = [created];
    body = created;
  } else if (pathname === "/api/v1/people/teachers/teacher-1/credentials-link") {
    body = { username: "amina.teacher", set_password_url: "/set-password?token=SECRET-REISSUE-TOKEN" };
  } else if (pathname === "/api/v1/people/guardians" && request.method() === "GET") {
    body = guardians;
  } else if (pathname === "/api/v1/people/guardians/guardian-1/credentials-link") {
    body = { username: "shaikh.noor", set_password_url: "/set-password?token=SECRET-GUARDIAN-TOKEN" };
  } else if (pathname === "/api/v1/messaging/send-credentials") {
    credentialSendPayloads.push(request.postDataJSON());
    body = { normalised_number: "+923001111111", url: "", direct_sent: true };
  } else if (pathname === "/api/v1/people/username-proposal") {
    body = { username: "amina.teacher" };
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

function assertNoCredentialText(text, label) {
  for (const fragment of forbiddenFragments) {
    if (text.includes(fragment)) {
      throw new Error(`${label} leaked credential fragment ${fragment} into visible page text`);
    }
  }
}

try {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/people/teachers`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add teacher" }).click();
  const dialog = page.getByRole("dialog", { name: "Add teacher" });
  await dialog.getByLabel("Username").fill("amina.teacher");
  await dialog.getByLabel("Full name").fill("Amina Teacher");
  await dialog.getByLabel("WhatsApp number").fill("3001111111");
  await dialog.getByRole("button", { name: "Add teacher" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Login setup ready").waitFor();

  assertNoCredentialText(await page.locator("body").innerText(), "create teacher");
  await page.getByRole("button", { name: "Copy link" }).click();
  const afterCreateClipboard = await page.evaluate(() => window.__clipboardWrites ?? []);
  clipboardWrites.push(...afterCreateClipboard);
  if (!afterCreateClipboard.at(-1)?.includes("SECRET-CREATE-TOKEN")) {
    throw new Error("credential copy did not place the create link on the clipboard");
  }

  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Login link" }).click();
  await page.getByText("Link copied!").waitFor();
  assertNoCredentialText(await page.locator("body").innerText(), "reissue teacher");

  const allClipboardWrites = await page.evaluate(() => window.__clipboardWrites ?? []);
  if (!allClipboardWrites.some((value) => value.includes("SECRET-REISSUE-TOKEN"))) {
    throw new Error("reissued credential link was not copied");
  }
  if (!credentialSendPayloads.some((payload) => payload.set_password_url.includes("SECRET-REISSUE-TOKEN"))) {
    throw new Error("reissued credential link was not sent through the messaging API");
  }

  await page.goto(`${baseUrl}/people/guardians`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Actions: Shaikh Noor" }).click();
  await page.getByRole("menuitem", { name: "Login link" }).click();
  const guardianDialog = page.getByRole("dialog", { name: "Create guardian login" });
  await guardianDialog.locator("input").fill("shaikh.noor");
  await guardianDialog.getByRole("button", { name: "Create login" }).click();
  await page.getByText("Login link sent successfully").waitFor();
  assertNoCredentialText(await page.locator("body").innerText(), "guardian credential send");
  if (!credentialSendPayloads.some((payload) => payload.subject_type === "guardian" && payload.subject_id === "guardian-1" && payload.set_password_url.includes("SECRET-GUARDIAN-TOKEN"))) {
    throw new Error("guardian credential link was not sent through the messaging API");
  }
  const guardianClipboard = await page.evaluate(() => window.__clipboardWrites ?? []);
  if (!guardianClipboard.some((value) => value.includes("SECRET-GUARDIAN-TOKEN"))) {
    throw new Error("guardian credential recovery link was not copied");
  }

  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (geometry.scrollWidth > geometry.width) {
    throw new Error(`credential-link page overflowed: ${JSON.stringify(geometry)}`);
  }

  if (process.env.TEST_SCREENSHOT) {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true, animations: "disabled" });
  }

  console.log("credential links: teacher and guardian copy-send flows hide raw set-password URLs");
} finally {
  await context.close();
  await browser.close();
  if (server) server.kill();
}

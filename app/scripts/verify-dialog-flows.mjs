import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4187";
let server;

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4187"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting Vite for dialog flow verification");
}

let resourceDeleted = false;
let deleteAttempts = 0;
let guardianCredentialPayload;

function jsonFor(pathname) {
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
      permissions: ["students.view", "students.send_credentials", "resources.manage"],
      features: {},
      branding: {},
      has_teaching_assignment: false,
    };
  }
  if (pathname === "/api/v1/academics/today") return { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  if (pathname === "/api/v1/operations/resource-categories") return [{ id: "category-1", name: "Handouts", description: "" }];
  if (pathname === "/api/v1/operations/resources") {
    return resourceDeleted ? [] : [{
      id: "resource-1",
      category_id: "category-1",
      title: "Week 1 packet",
      description: "Read before class",
      file_key: "resources/week-1.pdf",
      video_url: "",
      visibility_scope: { all: true },
      owner_id: "teacher-1",
      owner_name: "Ustad Ahmad",
      created_at: "2026-07-26T00:00:00Z",
    }];
  }
  if (pathname === "/api/v1/people/guardians") {
    return [{
      id: "guardian-1",
      user_id: null,
      name: "Shaikh Noor",
      relationship: "father",
      phone_numbers: "+923001234567",
      preferred_language: "ur",
      ward_count: 1,
    }];
  }
  if (pathname === "/api/v1/people/students") return [];
  if (pathname === "/api/v1/academics/programs") return [];
  if (pathname === "/api/v1/academics/classes") return [];
  if (pathname === "/api/v1/academics/sessions") return [];
  if (pathname === "/api/v1/operations/admission-forms") return [];
  return [];
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "en-US",
  serviceWorkers: "block",
  reducedMotion: "reduce",
});
await context.addInitScript(() => {
  localStorage.setItem("mms_token", "dialog-flow-token");
  localStorage.setItem("mms_tenant", "suffa");
  localStorage.setItem("i18nextLng", "en");
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => undefined },
    configurable: true,
  });
});
await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (request.method() === "DELETE" && pathname === "/api/v1/operations/resources/resource-1") {
    deleteAttempts += 1;
    resourceDeleted = true;
    await route.fulfill({ status: 204, body: "" });
    return;
  }
  if (request.method() === "POST" && pathname === "/api/v1/people/guardians/guardian-1/credentials-link") {
    guardianCredentialPayload = request.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ username: guardianCredentialPayload.username, set_password_url: "/set-password?token=SECRET-DIALOG-FLOW" }),
    });
    return;
  }
  if (request.method() === "POST" && pathname === "/api/v1/messaging/send-credentials") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ normalised_number: "+923001234567", direct_sent: true }) });
    return;
  }
  const body = jsonFor(pathname);
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
const nativeDialogs = [];
const errors = [];
page.on("dialog", (dialog) => {
  nativeDialogs.push(dialog.type());
  void dialog.dismiss();
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/resources`, { waitUntil: "domcontentloaded" });
  await page.getByText("Week 1 packet").waitFor();
  await page.getByRole("button", { name: "Actions: Week 1 packet" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Confirm" });
  await confirmDialog.waitFor();
  await page.screenshot({ path: "/tmp/suffa-dialog-confirm-resource.png", fullPage: true, animations: "disabled" });
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  if (deleteAttempts !== 0) throw new Error("Canceling the destructive dialog still deleted the resource");

  await page.getByRole("button", { name: "Actions: Week 1 packet" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Confirm" }).getByRole("button", { name: "OK" }).click();
  if (deleteAttempts !== 1) throw new Error(`Confirming destructive dialog should delete once, got ${deleteAttempts}`);

  await page.goto(`${baseUrl}/people/guardians`, { waitUntil: "domcontentloaded" });
  await page.getByText("Shaikh Noor").waitFor();
  await page.getByRole("button", { name: "Actions: Shaikh Noor" }).click();
  await page.getByRole("menuitem", { name: "Login link" }).click();
  const promptDialog = page.getByRole("dialog", { name: "Create guardian login" });
  await promptDialog.waitFor();
  await promptDialog.locator("input").fill("shaikh.noor");
  await page.screenshot({ path: "/tmp/suffa-dialog-prompt-guardian.png", fullPage: true, animations: "disabled" });
  await promptDialog.getByRole("button", { name: "Create login" }).click();
  if (guardianCredentialPayload?.username !== "shaikh.noor") {
    throw new Error(`Prompt value did not reach credentials API: ${JSON.stringify(guardianCredentialPayload)}`);
  }

  const visibleText = await page.locator("body").innerText();
  if (visibleText.includes("SECRET-DIALOG-FLOW")) throw new Error("Dialog credential prompt leaked raw setup token");
  if (nativeDialogs.length > 0) throw new Error(`Native browser dialogs were opened: ${nativeDialogs.join(", ")}`);
  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log("dialog flows: destructive confirm, cancel, prompt, no native dialogs, and token redaction passed");
} finally {
  await browser.close();
  if (server) server.kill("SIGTERM");
}

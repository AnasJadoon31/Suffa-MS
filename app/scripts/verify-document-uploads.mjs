import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4186";
let server;
let presignUploads = 0;
let storagePuts = 0;
let createdResource = null;

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4186"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting Vite for document-upload verification");
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
  localStorage.setItem("mms_token", "document-upload-test-token");
  localStorage.setItem("mms_tenant", "suffa");
  localStorage.setItem("i18nextLng", "en");
});

await context.route("**/mock-upload/**", async (route) => {
  if (route.request().method() === "PUT") storagePuts += 1;
  await route.fulfill({ status: 200, body: "ok" });
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  let body = [];

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: { id: "teacher-1", username: "teacher", role: "teacher", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["resources.manage"],
      features: {},
      branding: {},
      has_teaching_assignment: true,
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/operations/resource-categories") {
    body = [{ id: "category-1", name: "Handouts", is_global: false, is_mine: true, owner_id: "teacher-1" }];
  } else if (pathname === "/api/v1/operations/resources" && request.method() === "GET") {
    body = createdResource ? [createdResource] : [];
  } else if (pathname === "/api/v1/files/presign-upload") {
    presignUploads += 1;
    const payload = request.postDataJSON();
    if (payload.filename !== "safe-notes.md" || payload.content_type !== "text/markdown") {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: `unexpected upload payload ${JSON.stringify(payload)}` }) });
      return;
    }
    body = { object_key: "madrasas/madrasa-1/resources/safe-notes.md", upload_url: `${baseUrl}/mock-upload/safe-notes.md` };
  } else if (pathname === "/api/v1/operations/resources" && request.method() === "POST") {
    const payload = request.postDataJSON();
    createdResource = {
      id: "resource-1",
      category_id: payload.category_id,
      category_name: "Handouts",
      title: payload.title,
      description: payload.description ?? null,
      file_key: payload.file_key,
      video_url: null,
      visibility_scope: payload.visibility_scope,
      created_at: "2026-07-26T00:00:00Z",
      created_by_name: "Teacher",
      can_manage: true,
    };
    body = createdResource;
  } else if (pathname === "/api/v1/files/presign-download") {
    body = { url: "https://storage.example/download/safe-notes.md" };
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

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/resources`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add resource" }).click();
  const dialog = page.getByRole("dialog", { name: "Add resource" });
  await dialog.getByLabel("Category").selectOption("category-1");
  await dialog.getByLabel("Title").fill("Unsafe upload");
  const fileInput = dialog.getByLabel("File");
  const accept = await fileInput.getAttribute("accept");
  for (const expected of [".pdf", ".docx", ".xlsx", ".pptx", ".odt", ".md", "text/markdown"]) {
    if (!accept?.includes(expected)) throw new Error(`file input accept is missing ${expected}: ${accept}`);
  }

  await fileInput.setInputFiles({ name: "unsafe.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") });
  await dialog.getByRole("button", { name: "Add resource" }).click();
  await dialog.getByText("Upload a supported document file").waitFor();
  if (presignUploads !== 0) throw new Error("unsafe HTML upload reached presign endpoint");

  await dialog.getByLabel("Title").fill("Markdown Tajweed Notes");
  await fileInput.setInputFiles({ name: "safe-notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Tajweed") });
  await dialog.getByRole("button", { name: "Add resource" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Markdown Tajweed Notes").waitFor();
  if (presignUploads !== 1 || storagePuts !== 1 || createdResource?.file_key !== "madrasas/madrasa-1/resources/safe-notes.md") {
    throw new Error(`markdown upload was not persisted correctly: ${JSON.stringify({ presignUploads, storagePuts, createdResource })}`);
  }

  const downloadPromise = page.waitForRequest((request) => request.url().includes("/api/v1/files/presign-download"));
  await page.getByRole("button", { name: "Actions: Markdown Tajweed Notes" }).click();
  await page.getByRole("menuitem", { name: "Download" }).click();
  await downloadPromise;

  await page.screenshot({ path: "/tmp/suffa-document-upload-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/suffa-document-upload-mobile.png", fullPage: true, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error("document upload resources page overflowed on mobile");
  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  console.log("document uploads: accept list, unsafe rejection, markdown upload, download, and mobile layout passed");
} finally {
  await browser.close();
  if (server) server.kill();
}

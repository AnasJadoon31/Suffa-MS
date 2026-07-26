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
  throw new Error("Timed out starting Vite for finance profile verification");
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
  localStorage.setItem("mms_token", "finance-profile-test-token");
  localStorage.setItem("mms_tenant", "suffa");
  localStorage.setItem("i18nextLng", "en");
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  let body = [];

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["finance.reports.view", "finance.manage"],
      features: { finance: true },
      branding: {},
      has_teaching_assignment: false,
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/finance/categories") {
    body = [{ id: "category-1", name: "Tuition" }];
  } else if (pathname === "/api/v1/academics/classes") {
    body = [{ id: "class-1", name: "Hifz Level 1", program_id: "program-1", assignment_limit: 5, default_portal_enabled: true }];
  } else if (pathname === "/api/v1/people/students") {
    body = [];
  } else if (pathname === "/api/v1/finance/payments") {
    body = [{
      id: "payment-1",
      student_id: "student-1",
      student_name: "Ali Noor",
      category_id: "category-1",
      category_name: "Tuition",
      amount: 1500,
      currency: "PKR",
      payment_date: "2026-07-10",
      note: "July fee",
    }];
  } else if (pathname === "/api/v1/finance/profiles/students/student-1") {
    body = {
      id: "student-1",
      name: "Ali Noor",
      admission_number: "ADM-0008",
      phone: "+923001234567",
      address: "Street 1",
      payments: [
        { id: "payment-1", category_name: "Tuition", amount: 1500, currency: "PKR", payment_date: "2026-07-10", note: "July fee" },
        { id: "payment-2", category_name: "Books", amount: 400, currency: "PKR", payment_date: "2026-06-10", note: "Workbook" },
      ],
    };
  } else if (pathname === "/api/v1/finance/donors") {
    body = [{ id: "donor-1", name: "Ayesha Donor", contact: "+923009999999" }];
  } else if (pathname === "/api/v1/finance/donations") {
    body = [{
      id: "donation-1",
      donor_id: "donor-1",
      donor_name: "Ayesha Donor",
      category_id: "category-1",
      category_name: "Tuition",
      amount: 5000,
      currency: "PKR",
      donation_date: "2026-07-11",
      note: "Sponsor",
    }];
  } else if (pathname === "/api/v1/finance/profiles/donors/donor-1") {
    body = {
      id: "donor-1",
      name: "Ayesha Donor",
      contact: "+923009999999",
      donations: [
        { id: "donation-1", category_name: "Tuition", amount: 5000, currency: "PKR", donation_date: "2026-07-11", note: "Sponsor" },
        { id: "donation-2", category_name: "Food", amount: 2500, currency: "PKR", donation_date: "2026-06-15", note: "Lunch" },
      ],
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

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/finance/contributions`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ali Noor", exact: true }).click();
  const studentDialog = page.getByRole("dialog", { name: "Ali Noor" });
  await studentDialog.getByText("ADM-0008").waitFor();
  await studentDialog.locator(".financeHistoryTable .dataRow.header").getByText("Amount").waitFor();
  await studentDialog.getByText("Books").waitFor();
  await studentDialog.getByText("PKR 400").waitFor();
  await studentDialog.screenshot({ path: "/tmp/suffa-finance-student-profile.png", animations: "disabled" });
  await studentDialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Actions: Ali Noor/ }).click();
  await page.getByRole("menuitem", { name: "Download receipt" }).waitFor();

  await page.goto(`${baseUrl}/finance/donations`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ayesha Donor", exact: true }).click();
  const donorDialog = page.getByRole("dialog", { name: "Ayesha Donor" });
  await donorDialog.getByText("+923009999999").waitFor();
  await donorDialog.locator(".financeHistoryTable .dataRow.header").getByText("Amount").waitFor();
  await donorDialog.getByText("Food").waitFor();
  await donorDialog.getByText("PKR 2500").waitFor();
  await donorDialog.screenshot({ path: "/tmp/suffa-finance-donor-profile.png", animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await donorDialog.screenshot({ path: "/tmp/suffa-finance-donor-profile-mobile.png", animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error("finance profile modal overflowed on mobile");
  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  console.log("finance profiles: student/donor identity modals, structured histories, action menu, and mobile layout passed");
} finally {
  await browser.close();
  if (server) server.kill();
}

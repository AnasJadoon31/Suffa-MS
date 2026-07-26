import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const viewport = process.env.TEST_VIEWPORT === "mobile"
  ? { width: 390, height: 844 }
  : process.env.TEST_VIEWPORT === "tablet"
    ? { width: 768, height: 1024 }
    : { width: 1280, height: 900 };

const teachers = [
  {
    id: "teacher-1",
    user_id: "user-teacher-1",
    employee_code: "TCH-0001",
    name: "Amina Khan",
    whatsapp_number: "+923001111111",
    qualifications: null,
    join_date: "2026-01-01",
    status: "active",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "teacher-2",
    user_id: "user-teacher-2",
    employee_code: "TCH-0002",
    name: "Bilal Ahmed",
    whatsapp_number: "+923002222222",
    qualifications: null,
    join_date: "2026-01-02",
    status: "active",
    notes: null,
    created_at: "2026-01-02T00:00:00Z",
  },
];

const salaryRecords = {
  "teacher-1": {
    id: "salary-record-1",
    teacher_id: "teacher-1",
    amount: 50000,
    currency: "PKR",
    effective_from: "2026-07-01",
  },
};

let salaryPayments = [
  {
    id: "salary-payment-1",
    teacher_id: "teacher-1",
    teacher_name: "Amina Khan",
    employee_code: "TCH-0001",
    amount: 50000,
    currency: "PKR",
    payment_date: "2026-07-26",
    period_covered: "July 2026",
    method: "cash",
    note: "Initial salary",
    status: "paid",
    recorded_by_id: "principal-1",
    created_at: "2026-07-26T00:00:00Z",
  },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "salary-test-token");
  localStorage.setItem("mms_tenant", "suffa");
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  let body = [];
  let status = 200;

  if (pathname === "/api/v1/auth/me") {
    body = {
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
      permissions: ["teachers.salary.manage", "teachers.view"],
      features: {},
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/people/teachers") {
    body = teachers;
  } else if (pathname === "/api/v1/finance/salary-history") {
    body = salaryPayments;
  } else if (pathname === "/api/v1/finance/salary/teacher-1") {
    body = salaryRecords["teacher-1"];
  } else if (pathname === "/api/v1/finance/salary/teacher-2") {
    status = 404;
    body = { detail: "No salary record set for this teacher" };
  } else if (pathname === "/api/v1/finance/salary/teacher-1/payments") {
    body = salaryPayments.filter((payment) => payment.teacher_id === "teacher-1" && !payment.deleted);
  } else if (pathname === "/api/v1/finance/salary/teacher-2/payments" && request.method() === "GET") {
    body = salaryPayments.filter((payment) => payment.teacher_id === "teacher-2" && !payment.deleted);
  } else if (pathname === "/api/v1/finance/salary/teacher-2/payments" && request.method() === "POST") {
    const payload = request.postDataJSON();
    const created = {
      id: "salary-payment-2",
      teacher_id: "teacher-2",
      teacher_name: "Bilal Ahmed",
      employee_code: "TCH-0002",
      amount: payload.amount,
      currency: payload.currency ?? "PKR",
      payment_date: payload.payment_date,
      period_covered: payload.period_covered,
      method: payload.method,
      note: payload.note ?? "",
      status: "paid",
      recorded_by_id: "principal-1",
      created_at: "2026-07-26T00:00:00Z",
    };
    salaryPayments = [created, ...salaryPayments];
    body = created;
  }

  await route.fulfill({
    status,
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
  await page.goto(`${baseUrl}/salary`, { waitUntil: "domcontentloaded" });
  await page.getByText("Amina Khan").waitFor();

  const firstRowActions = page.getByRole("button", { name: "Actions" }).first();
  await firstRowActions.click();
  await page.getByRole("menuitem", { name: "View" }).waitFor();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Record salary payment" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Record salary payment" });
  await dialog.getByLabel("Teacher").fill("Bilal");
  await dialog.getByRole("button", { name: /Bilal Ahmed/ }).click();
  await dialog.getByLabel("Amount").fill("60000");
  await dialog.getByLabel("Date").fill("2026-07-26");
  await dialog.getByLabel("Period").fill("July 2026");
  await dialog.getByLabel("Method").selectOption("bank_transfer");
  await dialog.getByRole("button", { name: "Record salary payment" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Bilal Ahmed").waitFor();

  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    actionButtons: [...document.querySelectorAll(".salaryHistoryTable button[aria-haspopup='menu']")].length,
    primaryButtonText: [...document.querySelectorAll("button")].map((button) => button.textContent?.trim()).filter(Boolean),
  }));

  if (geometry.scrollWidth > geometry.width) {
    throw new Error(`salary page overflowed: ${JSON.stringify(geometry)}`);
  }
  if (geometry.actionButtons < 2) {
    throw new Error(`salary rows did not render action menus: ${JSON.stringify(geometry)}`);
  }

  if (process.env.TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true, animations: "disabled" });
  }

  console.log("salary history: table-first record/search/action-menu journey passed");
} finally {
  await context.close();
  await browser.close();
}

const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:8085/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // wait for hydration
    const content = await page.content();
    if (content.includes("This page didn't load")) {
      console.log("CRASHED ON CLIENT!");
    } else {
      console.log("CLIENT SUCCESS!");
    }
  } catch(e) {
    console.log("Nav error", e.message);
  }

  await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', async msg => {
    const args = await Promise.all(msg.args().map(a => a.jsonValue().catch(e => a.toString())));
    console.log('BROWSER CONSOLE:', msg.text(), args);
  });
  page.on('pageerror', error => {
    console.log('BROWSER PAGEERROR:', error.message);
  });

  try {
    await page.goto('http://localhost:5174/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
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

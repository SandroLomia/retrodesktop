const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${process.cwd()}/index.html`);

  await page.waitForTimeout(3500); // Wait for boot screen
  await page.click('#login-user-btn'); // Login
  await page.waitForSelector('#desktop', { state: 'visible' });

  // Open an app
  await page.click('#icon-terminal', { clickCount: 2 });
  // Overcome double click timeout by using evaluate
  await page.evaluate(() => {
    const el = document.getElementById('icon-terminal');
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  await page.waitForSelector('.window', { state: 'visible' });
  const windowCount = await page.locator('.window:not(.minimized)').count();
  console.log('Window count before minimize:', windowCount);

  // Click Show Desktop
  await page.click('#show-desktop-btn');
  await page.waitForTimeout(500);

  const windowCountAfter = await page.locator('.window:not(.minimized)').count();
  console.log('Window count after minimize:', windowCountAfter);

  // Click Show Desktop again
  await page.click('#show-desktop-btn');
  await page.waitForTimeout(500);

  const windowCountAfterRestore = await page.locator('.window:not(.minimized)').count();
  console.log('Window count after restore:', windowCountAfterRestore);


  await browser.close();
})();

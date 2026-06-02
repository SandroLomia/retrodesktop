const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${process.cwd()}/index.html`);

  await page.waitForTimeout(3500); // Wait for boot screen
  await page.click('#login-user-btn'); // Login
  await page.waitForSelector('#desktop', { state: 'visible' });

  // Open notepad
  await page.click('#icon-notepad', { clickCount: 2 });
  await page.evaluate(() => {
    const el = document.getElementById('icon-notepad');
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  await page.waitForSelector('.window.active .status-section', { state: 'visible' });

  // Get status text
  const statusEl = page.locator('.window.active .status-section');
  console.log('Initial Status:', await statusEl.textContent());

  // Type in textarea
  const textarea = page.locator('.window.active .notepad-textarea');
  await textarea.fill('Hello\nWorld');

  await textarea.press('Enter');
  await textarea.type('A');

  console.log('Status after typing:', await statusEl.textContent());

  await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${process.cwd()}/index.html`);

  await page.waitForTimeout(3500); // Wait for boot screen
  await page.click('#login-user-btn'); // Login
  await page.waitForSelector('#desktop', { state: 'visible' });

  // Open calculator
  await page.click('#icon-calculator', { clickCount: 2 });
  await page.evaluate(() => {
    const el = document.getElementById('icon-calculator');
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  await page.waitForSelector('.window.active .calc-display', { state: 'visible' });

  const display = page.locator('.window.active .calc-display');
  console.log('Initial Display:', await display.inputValue());

  // Click buttons: 0 . 1 + 0 . 2 =
  await page.click('.window.active .calc-btn[data-val="0"]');
  await page.click('.window.active .calc-btn[data-val="."]');
  await page.click('.window.active .calc-btn[data-val="1"]');
  await page.click('.window.active .calc-btn[data-val="+"]');
  await page.click('.window.active .calc-btn[data-val="0"]');
  await page.click('.window.active .calc-btn[data-val="."]');
  await page.click('.window.active .calc-btn[data-val="2"]');
  await page.click('.window.active .calc-btn[data-val="="]');

  console.log('Display after 0.1 + 0.2 =', await display.inputValue());

  await browser.close();
})();

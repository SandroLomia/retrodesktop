const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set console listener to catch errors
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  await page.goto('file://' + process.cwd() + '/index.html');
  await page.waitForTimeout(4000);
  await page.click('#login-user-btn');
  await page.waitForSelector('#desktop', { state: 'visible' });

  // Right click on desktop then open terminal
  await page.evaluate(() => {
    const ev = new MouseEvent('contextmenu', { clientX: 100, clientY: 100, bubbles: true });
    document.getElementById('desktop').dispatchEvent(ev);
  });

  await page.waitForSelector('#context-menu', { state: 'visible' });
  await page.click('#ctx-open-terminal');

  await page.waitForTimeout(2000);

  const hasTerminal = await page.evaluate(() => document.querySelector('.terminal-input') !== null);
  console.log("Terminal input exists via context menu:", hasTerminal);

  await browser.close();
})();

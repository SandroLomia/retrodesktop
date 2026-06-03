const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log("Navigating to index.html...");
  await page.goto('file://' + process.cwd() + '/index.html');

  console.log("Waiting for boot screen...");
  await page.waitForTimeout(4000);

  console.log("Clicking user to login...");
  await page.click('#login-user-btn');

  console.log("Waiting for desktop...");
  await page.waitForSelector('#desktop', { state: 'visible' });

  console.log("Opening System Settings...");
  await page.evaluate(() => document.getElementById('icon-settings').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));

  console.log("Waiting for System Settings window...");
  await page.waitForSelector('.window-title-text:has-text("System Settings")');

  console.log("Changing theme to Olive...");
  await page.selectOption('#theme-selector', 'olive');

  console.log("Checking if theme changed...");
  const isOlive = await page.evaluate(() => document.documentElement.classList.contains('theme-olive'));
  if (!isOlive) throw new Error("Theme did not change to Olive!");

  console.log("Opening context menu on desktop...");
  await page.evaluate(() => {
    const ev = new MouseEvent('contextmenu', { clientX: 100, clientY: 100, bubbles: true });
    document.getElementById('desktop').dispatchEvent(ev);
  });

  console.log("Waiting for context menu...");
  await page.waitForSelector('#context-menu', { state: 'visible' });

  console.log("Clicking Sort by Name...");
  await page.click('#ctx-sort-name');

  console.log("Opening terminal...");
  // Simulate double-click properly through playwright evaluate using id
  await page.evaluate(() => {
    const icon = document.getElementById('icon-terminal');
    const evt = new MouseEvent('dblclick', { bubbles: true });
    icon.dispatchEvent(evt);
  });

  console.log("Waiting for Terminal window...");
  await page.waitForSelector('.window-title-text:has-text("Command Prompt")');

  console.log("Typing which ls command...");
  await page.waitForTimeout(500); // give terminal time to init
  const terminalInputSelector = '.terminal-input';
  await page.waitForSelector(terminalInputSelector);

  // Terminal input might be the last one, get the last one
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('.terminal-input');
    const last = inputs[inputs.length - 1];
    last.value = 'which ls';
    last.dispatchEvent(new Event('input', { bubbles: true }));
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  await page.waitForTimeout(500);

  const text = await page.evaluate(() => document.querySelector('.terminal-body').textContent);
  if (!text.includes('/usr/bin/ls')) throw new Error("Bug which ls not fixed!");

  console.log("Testing history redundancy fix...");
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('.terminal-input');
    const last = inputs[inputs.length - 1];
    last.value = 'which cat';
    last.dispatchEvent(new Event('input', { bubbles: true }));
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const inputs = document.querySelectorAll('.terminal-input');
    const last = inputs[inputs.length - 1];
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  });
  await page.waitForTimeout(100);

  const historyText = await page.evaluate(() => {
    const inputs = document.querySelectorAll('.terminal-input');
    return inputs[inputs.length - 1].value;
  });

  if (historyText !== 'which cat') throw new Error("Terminal history not working properly: expected 'which cat', got '" + historyText + "'");

  console.log("All tests passed!");
  await browser.close();
})();

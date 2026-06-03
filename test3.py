from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    # Navigate to local file
    file_url = f"file://{os.getcwd()}/index.html"
    page.goto(file_url)
    page.wait_for_timeout(4000) # wait for boot screen

    # Click user to login
    page.locator('#login-user-btn').click()
    page.wait_for_selector('#desktop', state='visible')
    page.wait_for_timeout(1000)

    # Open Settings
    page.evaluate("() => document.getElementById('icon-settings').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))")
    page.wait_for_selector('.window-title-text:has-text("System Settings")')
    page.wait_for_timeout(1000)

    # Change theme to Olive
    page.locator('#theme-selector').select_option('olive')
    page.wait_for_timeout(1000)

    # Context menu sort
    page.evaluate("""() => {
        const ev = new MouseEvent('contextmenu', { clientX: 100, clientY: 100, bubbles: true });
        document.getElementById('desktop').dispatchEvent(ev);
    }""")
    page.wait_for_selector('#context-menu', state='visible')
    page.wait_for_timeout(1000)

    page.locator('#ctx-sort-name').click()
    page.wait_for_timeout(1000)

    # Open terminal
    page.evaluate("() => document.getElementById('icon-terminal').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))")
    page.wait_for_selector('.window-title-text:has-text("Command Prompt")')
    page.wait_for_timeout(1000)

    # Test typing history up
    page.evaluate("""() => {
        const inputs = document.querySelectorAll('.terminal-input');
        const last = inputs[inputs.length - 1];
        last.value = 'ls';
        last.dispatchEvent(new Event('input', { bubbles: true }));
        last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }""")
    page.wait_for_timeout(1000)

    page.evaluate("""() => {
        const inputs = document.querySelectorAll('.terminal-input');
        const last = inputs[inputs.length - 1];
        last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    }""")
    page.wait_for_timeout(1000)

    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()

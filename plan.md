1. **Refactor `styles.css` to use CSS Variables for Theming:**
   - Define a `:root` block at the top of `styles.css` for the default "Luna" (Blue) theme.
   - Define variables for:
     - `--taskbar-bg`
     - `--start-btn-bg`
     - `--window-titlebar-active`
     - `--window-titlebar-inactive`
     - `--window-border`
     - `--start-menu-header`
     - `--start-menu-right`
     - `--selection-bg`
   - Create additional data attribute blocks like `[data-theme="olive"]`, `[data-theme="silver"]`, and `[data-theme="dark"]` to redefine these variables.
   - Update the existing CSS rules (taskbar, start button, window titlebar, start menu, selected items, etc.) to use these variables instead of hardcoded colors.

2. **Update `app.js` to Support Theme Selection:**
   - Add a function `applyTheme(themeName)` that sets `document.body.setAttribute('data-theme', themeName)`.
   - Update `openSettings()` to include a dropdown for "System Theme" (Blue, Olive Green, Silver, Dark).
   - Persist the chosen theme in `localStorage` as `retro_theme`.
   - Call `applyTheme()` during initialization (where background is applied).

3. **Enhance Design Details:**
   - Increase padding on start menu items to make them feel slightly more spacious and better matched to classic styling.
   - Apply minor visual fixes, such as making sure borders and box-shadows dynamically update with themes.

4. **Pre-commit Checks:**
   - Ensure to verify frontend styling manually or by taking a screenshot via playwright.
   - Run the Prettier code formatting on the modified files to keep codebase standard.
   - Verify all tests/checks pass.

5. **Commit and Submit:**
   - Make a final commit of changes and request submit approval.

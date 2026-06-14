1.  **Code Review & Improvements:**
    *   **Settings Dialog (Theme):** The codebase already has themes (Windows Bliss, Teal, Classic). I'll add more theme options (e.g., "Matrix" (black/green), "Synthwave" (purple/pink grid) or similar) to `openSettings` and `applyDesktopBackground` in `app.js` to make it better.
    *   **Double-Click Timeout fix for tests:** We need to keep in mind the double-click issue for tests (from memory), although I won't rewrite tests if none exist, I should ensure manual dblclick works cleanly.
    *   **Start Menu UX:** Review if the start menu behaves correctly when clicking outside (it should close). `app.js` has document click handlers, but I'll ensure they properly dismiss the start menu.
    *   **Terminal & System robustness:** Clean up some error handling in the terminal app if possible.

2.  **Add Feature (Theme support):**
    *   Modify `applyDesktopBackground` in `app.js` to handle new backgrounds (like Matrix or Hacker theme, maybe a simple CSS pattern).
    *   Update `openSettings` to include the new background options in the dropdown.

3.  **Code Style / Fixes:**
    *   Format `app.js` properly (already formatted with prettier, but will run it again after changes).

4.  **Pre-commit steps:**
    *   Ensure proper testing, verification, review, and reflection are done (by calling `pre_commit_instructions`).

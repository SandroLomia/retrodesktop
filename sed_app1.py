import re

with open('app.js', 'r') as f:
    content = f.read()

theme_apply_func = """
  // ======= SYSTEM THEME =======
  function applyTheme(themeType) {
    document.body.setAttribute('data-theme', themeType);
  }

  // ======= Desktop Background =======
"""

content = content.replace('  // ======= Desktop Background =======\n', theme_apply_func)

settings_search = """        <h3 style="margin-top:20px; font-size: 16px;">Desktop Background</h3>
        <select id="bg-selector" style="margin-top: 10px; padding: 4px; width: 100%; font-family: 'Tahoma';">
          <option value="classic" ${currentBg === 'classic' ? 'selected' : ''}>Classic Retro</option>
          <option value="bliss" ${currentBg === 'bliss' ? 'selected' : ''}>Windows Bliss</option>
          <option value="teal" ${currentBg === 'teal' ? 'selected' : ''}>Solid Teal</option>
        </select>
        <p style="color:#666; margin-top:20px; font-size: 12px; line-height: 1.4;">Changes are saved automatically.</p>
      </div>`,"""

settings_replace = """        <h3 style="margin-top:20px; font-size: 16px;">System Theme</h3>
        <select id="theme-selector" style="margin-top: 10px; padding: 4px; width: 100%; font-family: 'Tahoma';">
          <option value="luna" ${currentTheme === 'luna' ? 'selected' : ''}>Luna (Blue)</option>
          <option value="olive" ${currentTheme === 'olive' ? 'selected' : ''}>Olive Green</option>
          <option value="silver" ${currentTheme === 'silver' ? 'selected' : ''}>Silver</option>
          <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Modern Dark</option>
        </select>

        <h3 style="margin-top:20px; font-size: 16px;">Desktop Background</h3>
        <select id="bg-selector" style="margin-top: 10px; padding: 4px; width: 100%; font-family: 'Tahoma';">
          <option value="classic" ${currentBg === 'classic' ? 'selected' : ''}>Classic Retro</option>
          <option value="bliss" ${currentBg === 'bliss' ? 'selected' : ''}>Windows Bliss</option>
          <option value="teal" ${currentBg === 'teal' ? 'selected' : ''}>Solid Teal</option>
        </select>
        <p style="color:#666; margin-top:20px; font-size: 12px; line-height: 1.4;">Changes are saved automatically.</p>
      </div>`,"""

content = content.replace(settings_search, settings_replace)

open_settings_search = """  function openSettings() {
    const currentBg = localStorage.getItem('retro_bg') || 'classic';
    createWindow({"""

open_settings_replace = """  function openSettings() {
    const currentBg = localStorage.getItem('retro_bg') || 'classic';
    const currentTheme = localStorage.getItem('retro_theme') || 'luna';
    createWindow({"""

content = content.replace(open_settings_search, open_settings_replace)

settings_logic_search = """        const bgSel = body.querySelector('#bg-selector');
        bgSel.addEventListener('change', (e) => {
          const bg = e.target.value;
          localStorage.setItem('retro_bg', bg);
          applyDesktopBackground(bg);
        });
      }"""

settings_logic_replace = """        const themeSel = body.querySelector('#theme-selector');
        themeSel.addEventListener('change', (e) => {
          const theme = e.target.value;
          localStorage.setItem('retro_theme', theme);
          applyTheme(theme);
        });

        const bgSel = body.querySelector('#bg-selector');
        bgSel.addEventListener('change', (e) => {
          const bg = e.target.value;
          localStorage.setItem('retro_bg', bg);
          applyDesktopBackground(bg);
        });
      }"""

content = content.replace(settings_logic_search, settings_logic_replace)

init_search = """  // Init Background
  applyDesktopBackground(localStorage.getItem('retro_bg') || 'classic');"""

init_replace = """  // Init Background and Theme
  applyDesktopBackground(localStorage.getItem('retro_bg') || 'classic');
  applyTheme(localStorage.getItem('retro_theme') || 'luna');"""

content = content.replace(init_search, init_replace)

with open('app.js', 'w') as f:
    f.write(content)

import re

with open('styles.css', 'r') as f:
    content = f.read()

# Append theme vars after /* ======= RESET & BASE ======= */
theme_vars = """
:root {
  --taskbar-bg: linear-gradient(180deg, #245edb 0%, #3b7cf5 4%, #245edb 6%, #1c52c0 50%, #1848a8 90%, #1848a8 100%);
  --start-btn-bg: linear-gradient(180deg, #3d9c39 0%, #39872e 40%, #35872e 60%, #2e7d32 100%);
  --window-header-bg: linear-gradient(180deg, #0050a0 0%, #003380 30%, #002060 100%);
  --window-header-bg-active: linear-gradient(180deg, #2d8cff, #0f5ed6);
  --window-border: #0831d9;
  --sm-header-bg: linear-gradient(180deg, #1e6bd6, #0b56b0);
  --sm-right-bg: #d3e5fa;
  --selection-bg: #316ac5;
}

[data-theme="olive"] {
  --taskbar-bg: linear-gradient(180deg, #9cb76f 0%, #a6c075 4%, #9cb76f 6%, #829a4e 50%, #687e35 90%, #687e35 100%);
  --window-header-bg: linear-gradient(180deg, #879b63 0%, #6e804f 30%, #55643a 100%);
  --window-header-bg-active: linear-gradient(180deg, #bcd689, #9eb673);
  --window-border: #758b54;
  --sm-header-bg: linear-gradient(180deg, #8ba168, #697a4e);
  --sm-right-bg: #e3eed6;
}

[data-theme="silver"] {
  --taskbar-bg: linear-gradient(180deg, #b0b4ba 0%, #b8bcc2 4%, #b0b4ba 6%, #94969c 50%, #7b7e84 90%, #7b7e84 100%);
  --window-header-bg: linear-gradient(180deg, #a1a4a8 0%, #86888c 30%, #6b6d70 100%);
  --window-header-bg-active: linear-gradient(180deg, #c3c7cb, #a3a6aa);
  --window-border: #8b8d91;
  --sm-header-bg: linear-gradient(180deg, #a5a8ac, #828488);
  --sm-right-bg: #e5e6e8;
}

[data-theme="dark"] {
  --taskbar-bg: linear-gradient(180deg, #2a2a2a 0%, #333 4%, #2a2a2a 6%, #1a1a1a 50%, #111 90%, #111 100%);
  --start-btn-bg: linear-gradient(180deg, #444 0%, #3a3a3a 40%, #333 60%, #222 100%);
  --window-header-bg: linear-gradient(180deg, #222 0%, #1a1a1a 30%, #111 100%);
  --window-header-bg-active: linear-gradient(180deg, #444, #222);
  --window-border: #333;
  --sm-header-bg: linear-gradient(180deg, #333, #1a1a1a);
  --sm-right-bg: #222;
  --selection-bg: #555;
}
"""

content = content.replace('/* ======= RESET & BASE ======= */\n', '/* ======= RESET & BASE ======= */\n' + theme_vars)

content = content.replace('background: linear-gradient(180deg, #245edb 0%, #3b7cf5 4%, #245edb 6%, #1c52c0 50%, #1848a8 90%, #1848a8 100%);', 'background: var(--taskbar-bg);')
content = content.replace('background: linear-gradient(180deg, #3d9c39 0%, #39872e 40%, #35872e 60%, #2e7d32 100%);', 'background: var(--start-btn-bg);')
content = content.replace('background: linear-gradient(180deg, #0050a0 0%, #003380 30%, #002060 100%);', 'background: var(--window-header-bg);')
content = content.replace('background: linear-gradient(180deg, #2d8cff, #0f5ed6);', 'background: var(--window-header-bg-active);')
content = content.replace('background: linear-gradient(180deg, #1e6bd6, #0b56b0);', 'background: var(--sm-header-bg);')
content = content.replace('background: #d3e5fa;', 'background: var(--sm-right-bg);')
content = content.replace('background: #316ac5;', 'background: var(--selection-bg);')

with open('styles.css', 'w') as f:
    f.write(content)

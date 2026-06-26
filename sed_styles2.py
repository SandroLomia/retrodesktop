with open('styles.css', 'r') as f:
    content = f.read()
content = content.replace('border: 3px solid #0831d9;', 'border: 3px solid var(--window-border);')
content = content.replace('border: 1px solid #0831d9;', 'border: 1px solid var(--window-border);')
content = content.replace('background: linear-gradient(180deg, #1e6bd6, #0b56b0);', 'background: var(--sm-header-bg);')
content = content.replace('background: #d3e5fa;', 'background: var(--sm-right-bg);')
with open('styles.css', 'w') as f:
    f.write(content)

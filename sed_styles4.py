with open('styles.css', 'r') as f:
    content = f.read()

content = content.replace('padding: 5px 12px;', 'padding: 8px 10px;')
content = content.replace('padding: 6px 12px;', 'padding: 8px 10px;')
content = content.replace('background: #316ac5;', 'background: var(--selection-bg);')
content = content.replace('color: #000;', 'color: var(--sm-right-text, #000);')
content = content.replace('color: #333;', 'color: var(--sm-right-text, #333);')

with open('styles.css', 'w') as f:
    f.write(content)

with open('styles.css', 'r') as f:
    content = f.read()

content = content.replace('border: 2px solid #0055e5;', 'border: 2px solid var(--window-border);')
content = content.replace('border-radius: 8px 8px 0 0;', 'border-radius: 8px 8px 4px 4px;')

with open('styles.css', 'w') as f:
    f.write(content)

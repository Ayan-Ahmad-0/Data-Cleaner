path = 'frontend/src/pages/QueryPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '<p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">'
replacement = '<p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">'

assert target in content, "Target not found in QueryPage.tsx"
content = content.replace(target, replacement, 1)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print("Updated QueryPage.tsx successfully")

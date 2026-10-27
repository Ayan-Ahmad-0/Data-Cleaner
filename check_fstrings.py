import glob
import re

found = []
for file in glob.glob("**/*.py", recursive=True):
    if ".venv" in file:
        continue
    with open(file, "r", encoding="utf-8", errors="ignore") as f:
        for idx, line in enumerate(f, 1):
            # Check for f-string with a backslash inside {...}
            # Simple regex: f followed by quote, then any characters, then { followed by non-} with \ then }
            if re.search(r'f["\'].*\{[^}]*\\[^}]*\}', line):
                found.append((file, idx, line.strip()))

for f, i, l in found:
    print(f"{f}:{i}: {l}")

print(f"Total found: {len(found)}")

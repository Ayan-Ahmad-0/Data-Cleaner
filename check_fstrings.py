import glob
import re

for file in glob.glob("**/*.py", recursive=True):
    if ".venv" in file or file == "check_fstrings.py":
        continue
    with open(file, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    # Find any replace('\\' or replace("\\" in the file
    matches = re.findall(r".{0,50}\.replace\(['\"].*?\\.*?['\"].{0,50}", content)
    if matches:
        print(f"File: {file}")
        for m in matches:
            print(f"  {m.strip()}")

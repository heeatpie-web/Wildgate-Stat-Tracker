from pathlib import Path
lines = Path('tailwind.config.js').read_text().splitlines()
for i, line in enumerate(lines, 1):
    if 'playerhub-lg' in line or 'playerhub-xl' in line:
        print(i, line)

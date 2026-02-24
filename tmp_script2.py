from pathlib import Path
lines = Path('src/components/PlayerHub.tsx').read_text().splitlines()
for i, line in enumerate(lines, 1):
    if 'lg:grid' in line or 'grid-cols-playerhub' in line:
        print(i, line)

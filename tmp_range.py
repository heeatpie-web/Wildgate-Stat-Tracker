from pathlib import Path
lines = Path('src/components/PlayerHub.tsx').read_text().splitlines()
for i in range(330, 370):
    print(i+1, lines[i])

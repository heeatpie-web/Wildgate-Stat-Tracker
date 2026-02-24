from pathlib import Path
path = Path('src/components/PlayerHub.tsx')
data = path.read_text()
col2_start = data.index('            {/* Column 2: Player Detail */}')
col3_start = data.index('            {/* Column 3: Selected player summary */}')
col2_block = data[col2_start:col3_start]
marker = '                ) : (\n                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">'
if marker not in col2_block:
    raise SystemExit('marker not found')
detail_start = col2_block.index(marker) + len('                ) : (\n                    ')
detail_end = col2_block.rindex('                )}')
detail_block = col2_block[detail_start:detail_end]
print('detail block starts with repr:', repr(detail_block[:60]))

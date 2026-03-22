/**
 * Extract hex codes from the allwildgatecolors.png swatch grid.
 * Image: 1557 x 618 px, 7 cols x 5 rows (last row has 4 items centered)
 */
const sharp = require('sharp');
const path = require('path');

const IMG = 'C:/Users/Alec Gougebas/Downloads/allwildgatecolors.png';
const W = 1557, H = 618;
const COLS = 7, ROWS = 5;
const cellW = W / COLS;  // 222.43
const cellH = H / ROWS;  // 123.6

// Color names in grid order (row-major)
const NAMES = [
  // Row 0
  'White', 'Cloud', 'Hot Pink', 'Dusty Rose', 'Red', 'Salmon', 'Tangerine',
  // Row 1
  'Orange', 'Goldenrod', 'Marigold', 'Light Yellow', 'Mustard', 'Yellow Green', 'Lime Green',
  // Row 2
  'Green', 'Blue Green', 'Sea Green', 'Pale Blue', 'Cyan', 'Sky Blue', 'Blue',
  // Row 3
  'Periwinkle', 'Plum', 'Orchid', 'Purple', 'Grape', 'Magenta Red', 'Cognac',
  // Row 4 (4 items — visually spaced across the row, sampling at col positions 0,1,2,3)
  'Black', 'Blueberry', 'Green Pea', 'Light Navy Blue',
];

// Build sample points: center of swatch area (upper 75% of cell to avoid label)
const swatchCenterOffsetY = cellH * 0.38; // roughly center of colored rectangle

const points = [];
for (let row = 0; row < ROWS; row++) {
  const count = row === 4 ? 4 : COLS;
  for (let col = 0; col < count; col++) {
    const x = Math.round(col * cellW + cellW / 2);
    const y = Math.round(row * cellH + swatchCenterOffsetY);
    points.push({ x, y, row, col });
  }
}

async function samplePixel(img, x, y) {
  const region = await img
    .clone()
    .extract({ left: Math.max(0, x - 5), top: Math.max(0, y - 5), width: 11, height: 11 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = region;
  const ch = info.channels;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < data.length; i += ch) {
    rSum += data[i]; gSum += data[i+1]; bSum += data[i+2];
    count++;
  }
  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function main() {
  const img = sharp(IMG);
  const results = [];

  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    const { r, g, b } = await samplePixel(img, x, y);
    results.push({ name: NAMES[i], hex: toHex(r, g, b), r, g, b, x, y });
  }

  console.log('\n=== Extracted Colors ===\n');
  console.log('const WILDGATE_COLORS = [');
  for (const c of results) {
    console.log(`  { name: '${c.name.padEnd(16)}', hex: '${c.hex}' }, // sampled at (${c.x}, ${c.y})`);
  }
  console.log('];\n');

  // Also print a visual check table
  console.log('\n=== Verification Table ===\n');
  console.log('Name             | Hex     | R   G   B');
  console.log('-----------------|---------|------------------');
  for (const c of results) {
    console.log(`${c.name.padEnd(16)} | ${c.hex} | ${String(c.r).padStart(3)} ${String(c.g).padStart(3)} ${String(c.b).padStart(3)}`);
  }
}

main().catch(console.error);

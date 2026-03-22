/**
 * Debug the last row + scan for brightest pixel per swatch to self-correct.
 */
const sharp = require('sharp');
const IMG = 'C:/Users/Alec Gougebas/Downloads/allwildgatecolors.png';
const W = 1557, H = 618;
const COLS = 7, ROWS = 5;
const cellW = W / COLS;
const cellH = H / ROWS;

async function findSwatchColor(img, col, row, numCols) {
  // Use the cell width relative to how many columns this row has
  const actualCellW = W / numCols;
  const left = Math.round(col * actualCellW + actualCellW * 0.1);
  const top = Math.round(row * cellH + cellH * 0.05);
  const width = Math.round(actualCellW * 0.8);
  // Only top 75% of cell height = swatch (bottom 25% is label)
  const height = Math.round(cellH * 0.70);

  const { data, info } = await img.clone()
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  // Find the pixel with the highest saturation * lightness product (most vivid, non-black)
  let bestScore = -1, bestR = 0, bestG = 0, bestB = 0;
  // Also accumulate a mean across all pixels
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i+1], b = data[i+2];
    rSum += r; gSum += g; bSum += b; count++;

    // HSL saturation
    const max = Math.max(r,g,b)/255, min = Math.min(r,g,b)/255;
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2*l - 1));
    const score = s * l;
    if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
  }

  const meanR = Math.round(rSum/count), meanG = Math.round(gSum/count), meanB = Math.round(bSum/count);
  return { bestR, bestG, bestB, meanR, meanG, meanB, bestScore };
}

function toHex(r,g,b) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0').toUpperCase()).join('');
}

async function main() {
  const img = sharp(IMG);

  // Verify top rows look correct
  console.log('=== Row 4 Debug (scanning with 7-col and 4-col layouts) ===\n');
  const NAMES_ROW4 = ['Black', 'Blueberry', 'Green Pea', 'Light Navy Blue'];

  for (let numCols of [4, 7]) {
    console.log(`\n--- Last row sampled as ${numCols} cols ---`);
    for (let col = 0; col < NAMES_ROW4.length; col++) {
      const r = await findSwatchColor(img, col, 4, numCols);
      console.log(`${NAMES_ROW4[col].padEnd(16)} | best: ${toHex(r.bestR,r.bestG,r.bestB)} (${r.bestR},${r.bestG},${r.bestB}) score=${r.bestScore.toFixed(3)} | mean: ${toHex(r.meanR,r.meanG,r.meanB)}`);
    }
  }

  // Now do a full extraction with the best-pixel method
  const allNames = [
    'White','Cloud','Hot Pink','Dusty Rose','Red','Salmon','Tangerine',
    'Orange','Goldenrod','Marigold','Light Yellow','Mustard','Yellow Green','Lime Green',
    'Green','Blue Green','Sea Green','Pale Blue','Cyan','Sky Blue','Blue',
    'Periwinkle','Plum','Orchid','Purple','Grape','Magenta Red','Cognac',
    'Black','Blueberry','Green Pea','Light Navy Blue',
  ];

  console.log('\n\n=== Full Extraction (best-vivid-pixel method) ===\n');
  console.log('const WILDGATE_COLORS = [');

  let idx = 0;
  for (let row = 0; row < ROWS; row++) {
    const count = row === 4 ? 4 : COLS;
    for (let col = 0; col < count; col++) {
      const r = await findSwatchColor(img, col, row, count === 4 ? 4 : COLS);
      // For very dark swatches (black/blueberry etc), fall back to mean
      const useR = r.bestScore < 0.02 ? r.meanR : r.bestR;
      const useG = r.bestScore < 0.02 ? r.meanG : r.bestG;
      const useB = r.bestScore < 0.02 ? r.meanB : r.bestB;
      console.log(`  { name: '${allNames[idx].padEnd(16)}', hex: '${toHex(useR,useG,useB)}' }, // vivid-score=${r.bestScore.toFixed(3)}`);
      idx++;
    }
  }
  console.log('];\n');
}

main().catch(console.error);

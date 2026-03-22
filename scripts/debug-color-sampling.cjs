'use strict';

/**
 * Debug script: for each player in the enemy panel, extract the exact pixel
 * region that detectTeamColorBarBelow would sample and save it as a PNG so
 * we can see what sharp is actually looking at.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES = [
  { file: 'C:\\Users\\Alec Gougebas\\Downloads\\hub1.png', label: 'hub1' },
  { file: 'C:\\Users\\Alec Gougebas\\Downloads\\hub2.png', label: 'hub2' },
];

// Bounding boxes from the raw OCR JSON output (original image coordinates).
// These are the enemy-panel player and bar lines from our test run.
const HUB1_ENTRIES = [
  // [label, x0, y0, x1, y1]
  ['SoulOkk',           1311.5, 255.5, 1421.5, 281.5],
  ['CAREFREE-1',        1323.5, 282.5, 1391.5, 308.5],
  ['GoblinaTT',         1309.5, 330.5, 1445,   356.5],
  ['CAREFREE-2',        1323.5, 359.5, 1391.5, 382.5],
  ['[6*]Tiblolan',      1309.5, 405.5, 1447,   435  ],
  ['VANGUARD-1',        1321.5, 434,   1401.5, 460  ],
  ['IrksomeGames',      1307.5, 485,   1475,   508  ],
  ['VANGUARD-2',        1321.5, 510,   1401.5, 536  ],
  ['Demo49',            1309.5, 559,   1417.5, 585  ],
  ['VANGUARD-3',        1321.5, 586,   1403.5, 612  ],
  ['Jack',              1313.5, 635,   1387.5, 661  ],
  ['VANGUARD-4',        1321.5, 662,   1403.5, 688  ],
  ['IcannotseeImlega',  1305.5, 713,   1523,   736  ],
  ['LOWSTANDARDS-1',    1317.5, 740.5, 1439.5, 763  ],
  ['AlexRogansBeta',    1307.5, 787,   1483,   813.5],
  ['LOWSTANDARDS-2',    1317.5, 816.5, 1441,   839.5],
  ['CanIPetThatDog',    1305.5, 863.5, 1507,   889.5],
  ['LOWSTANDARDS-3',    1317.5, 890.5, 1441,   916.5],
];

const HUB2_ENTRIES = [
  ['StopsignWhatstop',      1307.5, 248.5, 1489,   271.5],
  ['LOWSTANDARDS-1',        1317.5, 274.5, 1439.5, 297.5],
  ['ONKI',                  1315.5, 321.5, 1381.5, 347.5],
  ['LIZARDLIZARDLIZARD-1',  1311.5, 350.5, 1477,   373.5],
  ['Zombie',                1309.5, 400,   1411.5, 422.5],
  ['LIZARDLIZARDLIZARD-2',  1311.5, 425,   1479,   451  ],
  ['NemoSophus',            1309.5, 476,   1463,   499  ],
  ['LIZARDLIZARDLIZARD-3',  1311.5, 504,   1479,   524  ],
  ['Biscuit_Champ',         1305.5, 553,   1475,   573  ],
  ['LIZARDLIZARDLIZARD-4',  1311.5, 580.5, 1479,   600  ],
  ['Whols_Knight',          1311.5, 627.5, 1461,   650  ],
  ['BANANACASTLE-1',        1315.5, 655.5, 1439.5, 678.5],
  ['Stoat',                 1311.5, 703.5, 1391.5, 726.5],
  ['BANANACASTLE-2',        1315.5, 732.5, 1439.5, 752.5],
  ['ZicZacCadillac',        1307.5, 779.5, 1473,   802.5],
  ['BANANACASTLE-3',        1315.5, 807,   1439.5, 829.5],
  ['MiShRa',                1313.5, 854,   1409.5, 880  ],
  ['BANANACASTLE-4',        1315.5, 883,   1439.5, 906  ],
];

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    switch (max) {
      case r: h = ((g - b) / diff + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / diff + 2) / 6; break;
      case b: h = ((r - g) / diff + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function majorityDark(data, channels, thresh = 25, fraction = 0.70) {
  const ch = Math.max(1, channels);
  const total = data.length / ch;
  let dark = 0;
  for (let i = 0; i < data.length; i += ch) {
    const { l } = rgbToHsl(data[i], data[i+1], data[i+2]);
    if (l < thresh) dark++;
  }
  return { isDark: dark / total >= fraction, darkPct: Math.round(dark / total * 100) };
}

// Replicate detectTeamColorBarBelow coordinate math (current code in colorUtils.cjs)
function getBarSampleRegion(bbox) {
  // bbox is in original image coords (as stored in raw JSON output)
  // scale=2 was used for OCR, so internally the extractor passes 2x bboxes.
  // detectTeamColorBarBelow divides by scale=2. So the ORIGINAL coords == what we have here.
  const x0 = bbox[0], y0 = bbox[1], x1 = bbox[2], y1 = bbox[3];
  const textHeight = y1 - y0;
  const textWidth  = x1 - x0;

  // Current formula (gapBelow = max(2, textHeight*0.15) — close to badge)
  const gapBelow   = Math.max(2,  textHeight * 0.15);
  const barHeight  = Math.max(12, textHeight * 1.1);
  const sampleY    = y1 + gapBelow + (barHeight * 0.3);
  const sampleH    = Math.max(8,  barHeight * 0.5);
  const sampleW    = Math.max(40, textWidth  * 0.5);

  const rightStep  = Math.max(sampleW * 0.65, textHeight * 2.5);
  const vertStep   = Math.max(2, sampleH * 0.4);

  return {
    sampleY, sampleH, sampleW,
    x0, y0, x1, y1, textHeight,
    gapBelow, barHeight,
    rightStep, vertStep,
    xPositions: [
      Math.max(0, Math.floor(x0)),
      Math.max(0, Math.floor(x0 + rightStep)),
      Math.max(0, Math.floor(x0 + rightStep * 2)),
    ],
  };
}

async function analyzeEntry(imageBuffer, imgMeta, label, bbox) {
  const r = getBarSampleRegion(bbox);
  console.log(`\n--- ${label} ---`);
  console.log(`  name bbox:    x=[${bbox[0].toFixed(1)}, ${bbox[2].toFixed(1)}]  y=[${bbox[1].toFixed(1)}, ${bbox[3].toFixed(1)}]  textH=${r.textHeight.toFixed(1)}`);
  console.log(`  gapBelow:     ${r.gapBelow.toFixed(1)}px  barHeight:${r.barHeight.toFixed(1)}px  rightStep:${r.rightStep.toFixed(1)}`);
  console.log(`  sampleY:      ${r.sampleY.toFixed(1)}  sampleH:${r.sampleH.toFixed(1)}`);
  console.log(`  xPositions:   ${r.xPositions.join(', ')}`);

  // Also sample the entire bar row at this y to see what the actual colors are
  // (wide strip across the right panel at sampleY)
  const stripY = Math.max(0, Math.floor(r.sampleY));
  const stripH = Math.max(1, Math.floor(r.sampleH));
  const panelX = 1060;
  const panelW = imgMeta.width - panelX;

  // Save strip crop
  const outDir = 'C:\\Users\\Alec Gougebas\\Downloads\\ocr-debug-crops';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    // Full strip across right panel
    const strip = await sharp(imageBuffer)
      .extract({ left: panelX, top: stripY, width: panelW, height: Math.max(1, stripH * 4) })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(outDir, `${safeName}_strip.png`), strip);

    // Each sample region
    for (let xi = 0; xi < r.xPositions.length; xi++) {
      const xBase = Math.max(0, r.xPositions[xi]);
      const sW = Math.min(Math.floor(r.sampleW), imgMeta.width - xBase);
      const sH = Math.min(stripH, imgMeta.height - stripY);
      if (sW <= 0 || sH <= 0) continue;

      for (let yi = 0; yi < 3; yi++) {
        const yOff = [0, Math.round(r.vertStep), -Math.round(r.vertStep)][yi];
        const sy = Math.max(0, Math.floor(r.sampleY + yOff));
        const sh = Math.min(sH, imgMeta.height - sy);
        if (sh <= 0) continue;

        try {
          const { data, info } = await sharp(imageBuffer)
            .extract({ left: xBase, top: sy, width: Math.max(1, sW), height: Math.max(1, sh) })
            .raw()
            .toBuffer({ resolveWithObject: true });

          const { isDark, darkPct } = majorityDark(data, info.channels);
          // Find most saturated pixel — bell-curve lightness score (matches colorUtils.cjs)
          const ch = info.channels;
          let bestScore = -1, bR = 0, bG = 0, bB = 0;
          for (let i = 0; i < data.length; i += ch) {
            const hsl = rgbToHsl(data[i], data[i+1], data[i+2]);
            const lScore = hsl.l <= 50 ? hsl.l / 50 : (100 - hsl.l) / 50;
            const score = (hsl.s / 100) * lScore;
            if (score > bestScore) { bestScore = score; bR = data[i]; bG = data[i+1]; bB = data[i+2]; }
          }
          const bestHsl = rgbToHsl(bR, bG, bB);
          const rawHue = (bestHsl.s > 5 && bestHsl.l <= 90) ? bestHsl.h : null;
          console.log(`  x[${xi}]=${xBase} yOff=${yOff}: darkPct=${darkPct}% majorityDark=${isDark} | bestPx=rgb(${bR},${bG},${bB}) hsl(${bestHsl.h}°,${bestHsl.s}%,${bestHsl.l}%) score=${bestScore.toFixed(3)} rawHue=${rawHue}`);
        } catch (e) {
          console.log(`  x[${xi}]=${xBase} yOff=${yOff}: ERROR ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.log(`  STRIP ERROR: ${e.message}`);
  }
}

async function main() {
  for (const { file, label } of IMAGES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`IMAGE: ${label} (${file})`);
    const buf = fs.readFileSync(file);
    const meta = await sharp(buf).metadata();
    console.log(`Size: ${meta.width}x${meta.height}`);

    const entries = label === 'hub1' ? HUB1_ENTRIES : HUB2_ENTRIES;
    for (const [name, ...bbox] of entries) {
      await analyzeEntry(buf, meta, `${label}_${name}`, bbox);
    }
  }
  console.log('\nDone. Strip crops saved to C:\\Users\\Alec Gougebas\\Downloads\\ocr-debug-crops\\');
}

main().catch(err => {
  console.error('Fatal:', err.message, err.stack);
  process.exit(1);
});

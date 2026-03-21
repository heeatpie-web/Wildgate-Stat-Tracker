'use strict';

const Module = require('module');
const os = require('os');
const _orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron') return {
    ipcMain: { handle: () => {}, on: () => {} },
    app: { getPath: () => os.tmpdir(), getVersion: () => '0.0.0' },
    BrowserWindow: class {}, dialog: {}, shell: {},
  };
  return _orig.apply(this, arguments);
};

const sharp = require('sharp');
const { rgbToHsl, classifyTeamColorHSL, __test__ } = require('../electron/colorUtils.cjs');
const { regionIsBlack } = __test__;

// ── Gap-based clustering (simulated new system) ─────────────────────────────
// Sort hues, find largest gaps, split there. Max 4 teams (3 splits).
function gapCluster(players, maxTeams = 4) {
  if (players.length === 0) return [];

  // Convert to circular hue — handle red wrapping around 0/360
  const withHue = players.map(p => ({ ...p, h: p.hsl.h }));

  // Sort by hue
  const sorted = [...withHue].sort((a, b) => a.h - b.h);

  if (sorted.length === 1) return [[sorted[0]]];

  // Compute all adjacent gaps (including wrap-around)
  const gaps = [];
  for (let i = 0; i < sorted.length; i++) {
    const next = (i + 1) % sorted.length;
    const gap = next === 0
      ? (360 - sorted[sorted.length - 1].h + sorted[0].h)
      : sorted[next].h - sorted[i].h;
    gaps.push({ afterIdx: i, gap });
  }

  // Pick the top (maxTeams-1) largest gaps as split points
  // Only split on gaps > MIN_GAP to avoid splitting within a team due to noise
  const MIN_GAP = 10;
  const splitCount = maxTeams - 1;
  const splitGaps = [...gaps]
    .filter(g => g.gap > MIN_GAP)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, splitCount);

  if (splitGaps.length === 0) return [sorted]; // all one team

  const splitIdxSet = new Set(splitGaps.map(g => g.afterIdx));

  // Build clusters by walking the sorted array and splitting at gap points
  const clusters = [];
  let current = [];
  for (let i = 0; i < sorted.length; i++) {
    current.push(sorted[i]);
    if (splitIdxSet.has(i)) {
      clusters.push(current);
      current = [];
    }
  }
  if (current.length > 0) clusters.push(current);

  return clusters;
}

// ── Sample bar color below a player name bbox ───────────────────────────────
async function sampleBarColor(imagePath, bbox) {
  const textHeight = bbox.y1 - bbox.y0;
  const textWidth = bbox.x1 - bbox.x0;
  const gapBelow = Math.max(6, textHeight * 0.6);
  const barHeight = Math.max(12, textHeight * 1.1);
  const sampleY = bbox.y1 + gapBelow + (barHeight * 0.3);
  const sampleH = Math.max(8, barHeight * 0.5);
  const sampleW = Math.max(40, textWidth * 0.5);
  const region = {
    left: Math.floor(bbox.x0),
    top: Math.max(0, Math.floor(sampleY)),
    width: Math.floor(sampleW),
    height: Math.floor(sampleH),
  };
  try {
    const { data, info } = await sharp(imagePath).extract(region).raw().toBuffer({ resolveWithObject: true });
    const isBlk = regionIsBlack(data, info.channels);
    let bestSat = -1, bestR = 0, bestG = 0, bestB = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (hsl.s > bestSat) { bestSat = hsl.s; bestR = data[i]; bestG = data[i + 1]; bestB = data[i + 2]; }
    }
    const hsl = rgbToHsl(bestR, bestG, bestB);
    const named = classifyTeamColorHSL(bestR, bestG, bestB);
    return { isBlack: isBlk, hsl, named, rgb: { r: bestR, g: bestG, b: bestB } };
  } catch (e) {
    return { isBlack: false, hsl: { h: 0, s: 0, l: 0 }, named: { color: 'unknown', confidence: 0 }, rgb: { r: 0, g: 0, b: 0 } };
  }
}

// ── Run simulation on a set of named player bboxes ──────────────────────────
async function simulate(label, imagePath, players) {
  console.log('\n' + '═'.repeat(60));
  console.log('  ' + label);
  console.log('═'.repeat(60));

  const results = [];
  for (const p of players) {
    const bar = await sampleBarColor(imagePath, p.bbox);
    results.push({ name: p.name, side: p.side, ...bar });
  }

  // Separate your team (left panel) from enemies (right panel)
  const enemies = results.filter(r => r.side === 'enemy');
  const teammates = results.filter(r => r.side === 'friendly');

  console.log('\nFRIENDLY (fast path, no clustering needed):');
  for (const p of teammates) {
    console.log(`  ${p.name.padEnd(22)} hue=${String(p.hsl.h).padStart(3)}°  named=${p.named.color}`);
  }

  // Separate known vs unknown enemies
  const knownEnemies = enemies.filter(r => !r.isBlack && r.named.color !== 'unknown');
  const blackEnemies = enemies.filter(r => r.isBlack);
  const unknownEnemies = enemies.filter(r => !r.isBlack && r.named.color === 'unknown');

  console.log('\nENEMY BAR SAMPLES:');
  for (const p of enemies) {
    const status = p.isBlack ? 'BLACK/skip' : p.named.color !== 'unknown' ? `FAST:${p.named.color}` : `UNKNOWN hue=${p.hsl.h}°`;
    console.log(`  ${p.name.padEnd(22)} hue=${String(p.hsl.h).padStart(3)}°  → ${status}`);
  }

  // Fast path groups
  const fastGroups = {};
  for (const p of knownEnemies) {
    if (!fastGroups[p.named.color]) fastGroups[p.named.color] = [];
    fastGroups[p.named.color].push(p.name);
  }

  // Gap-based clustering on unknowns
  const clusters = gapCluster(unknownEnemies.map(p => ({ name: p.name, hsl: p.hsl })));

  console.log('\nRESULT — SIMULATED NEW SYSTEM:');
  let teamIdx = 1;
  for (const [color, names] of Object.entries(fastGroups)) {
    console.log(`  Team ${teamIdx++} [${color.toUpperCase()} — fast path]: ${names.join(', ')}`);
  }
  for (const cluster of clusters) {
    const hues = cluster.map(p => p.h + '°').join(', ');
    console.log(`  Team ${teamIdx++} [custom color, hues: ${hues}]: ${cluster.map(p => p.name).join(', ')}`);
  }
  if (blackEnemies.length > 0) {
    console.log(`  Skipped (black/spectator): ${blackEnemies.map(p => p.name).join(', ')}`);
  }
}

// ── Screenshot data ──────────────────────────────────────────────────────────
async function main() {
  // Original screenshot
  await simulate('09A734EE — original', 'C:/Users/Alec Gougebas/Downloads/09A734EE-3EBC-46E2-BE91-747C0D7911F5.png', [
    { name: 'ArbiterofMercy',  side: 'friendly', bbox: { x0:355.5, y0:521,   x1:535.5, y1:549   } },
    { name: 'Talespinner',     side: 'friendly', bbox: { x0:357.5, y0:700,   x1:497.5, y1:724.5 } },
    { name: 'Dogepus',         side: 'friendly', bbox: { x0:381.5, y0:338.5, x1:535.5, y1:373.5 } },
    { name: 'Dezvul',          side: 'friendly', bbox: { x0:359.5, y0:611,   x1:449.5, y1:635.5 } },
    { name: 'MeMatiane22',     side: 'enemy',    bbox: { x0:1308.5,y0:332,   x1:1462.5,y1:356.5 } },
    { name: 'elleachimmi',     side: 'enemy',    bbox: { x0:1308.5,y0:409.5, x1:1450.5,y1:431   } },
    { name: 'Danielfnrk',      side: 'enemy',    bbox: { x0:1306.5,y0:484,   x1:1438.5,y1:508.5 } },
    { name: 'TerukiFice',      side: 'enemy',    bbox: { x0:1310.5,y0:635.5, x1:1432.5,y1:660.5 } },
    { name: 'Moomin',          side: 'enemy',    bbox: { x0:1310.5,y0:712,   x1:1414.5,y1:737   } },
    { name: 'Durge-Xtreme',    side: 'enemy',    bbox: { x0:1304.5,y0:268,   x1:1468.5,y1:296   } },
    { name: 'SirPrigman',      side: 'enemy',    bbox: { x0:1308.5,y0:558,   x1:1448.5,y1:586   } },
  ]);

  // Hub 1
  await simulate('hub1.png', 'C:/Users/Alec Gougebas/Downloads/hub1.png', [
    { name: 'Dogepus',          side: 'friendly', bbox: { x0:382,   y0:338,   x1:535.5, y1:373   } },
    { name: 'Subverts',         side: 'friendly', bbox: { x0:358,   y0:579.5, x1:468,   y1:602.5 } },
    { name: 'Jack',             side: 'friendly', bbox: { x0:362,   y0:667.5, x1:458,   y1:693.5 } },
    { name: 'Talespinner',      side: 'friendly', bbox: { x0:358,   y0:756,   x1:495.5, y1:782   } },
    { name: 'SoulOkk',          side: 'enemy',    bbox: { x0:1311.5,y0:255.5, x1:1421.5,y1:281.5 } },
    { name: 'GoblinaTT',        side: 'enemy',    bbox: { x0:1309.5,y0:330.5, x1:1445,  y1:356.5 } },
    { name: '[6*]Tiblolan',     side: 'enemy',    bbox: { x0:1309.5,y0:405.5, x1:1447,  y1:435   } },
    { name: 'IrksomeGames',     side: 'enemy',    bbox: { x0:1307.5,y0:485,   x1:1475,  y1:508   } },
    { name: 'Demo49',           side: 'enemy',    bbox: { x0:1309.5,y0:559,   x1:1417.5,y1:585   } },
    { name: 'Jack(enemy)',      side: 'enemy',    bbox: { x0:1313.5,y0:635,   x1:1387.5,y1:661   } },
    { name: 'IcannotseeImlega', side: 'enemy',    bbox: { x0:1305.5,y0:713,   x1:1523,  y1:736   } },
    { name: 'AlexRogansBeta',   side: 'enemy',    bbox: { x0:1307.5,y0:787,   x1:1483,  y1:813.5 } },
    { name: 'CanIPetThatDog',   side: 'enemy',    bbox: { x0:1305.5,y0:863.5, x1:1507,  y1:889.5 } },
  ]);

  // Hub 2
  await simulate('hub2.png', 'C:/Users/Alec Gougebas/Downloads/hub2.png', [
    { name: 'Dogepus',          side: 'friendly', bbox: { x0:382,   y0:338,   x1:535.5, y1:373.5 } },
    { name: 'Subverts',         side: 'friendly', bbox: { x0:358,   y0:579.5, x1:470,   y1:602   } },
    { name: 'Scipion',          side: 'friendly', bbox: { x0:362,   y0:667,   x1:458,   y1:693   } },
    { name: 'Talespinner',      side: 'friendly', bbox: { x0:358,   y0:758,   x1:495.5, y1:780.5 } },
    { name: 'StopsignWhatstop', side: 'enemy',    bbox: { x0:1307.5,y0:248.5, x1:1489,  y1:271.5 } },
    { name: 'ONKI',             side: 'enemy',    bbox: { x0:1315.5,y0:321.5, x1:1381.5,y1:347.5 } },
    { name: 'Zombie',           side: 'enemy',    bbox: { x0:1309.5,y0:400,   x1:1411.5,y1:422.5 } },
    { name: 'NemoSophus',       side: 'enemy',    bbox: { x0:1309.5,y0:476,   x1:1463,  y1:499   } },
    { name: 'Biscuit_Champ',    side: 'enemy',    bbox: { x0:1305.5,y0:553,   x1:1475,  y1:573   } },
    { name: 'Whols_Knight',     side: 'enemy',    bbox: { x0:1311.5,y0:627.5, x1:1461,  y1:650   } },
    { name: 'Stoat',            side: 'enemy',    bbox: { x0:1311.5,y0:703.5, x1:1391.5,y1:726.5 } },
    { name: 'ZicZacCadillac',   side: 'enemy',    bbox: { x0:1307.5,y0:779.5, x1:1473,  y1:802.5 } },
    { name: 'MiShRa',           side: 'enemy',    bbox: { x0:1313.5,y0:854,   x1:1409.5,y1:880   } },
  ]);
}

main().catch(e => { console.error(e.message); process.exit(1); });

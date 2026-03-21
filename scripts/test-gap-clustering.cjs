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

const fs = require('fs');
const sharp = require('sharp');
const { detectTeamColorBarBelow, detectColorInRegion, clusterByHue } = require('../electron/colorUtils.cjs');

// ── Sample bar color below a player name bbox ───────────────────────────────
// Uses detectTeamColorBarBelow for the named-color result and detectColorInRegion
// on the primary region to obtain rawHue for clustering.
async function sampleBarColor(imageBuffer, bbox) {
  // Get the named color result (high accuracy, multi-sample)
  const colorResult = await detectTeamColorBarBelow(imageBuffer, bbox, 1);

  // Compute the primary sample region (same geometry as detectTeamColorBarBelow internals)
  const textHeight = bbox.y1 - bbox.y0;
  const textWidth = bbox.x1 - bbox.x0;
  const gapBelow = Math.max(6, textHeight * 0.6);
  const barHeight = Math.max(12, textHeight * 1.1);
  const sampleY = bbox.y1 + gapBelow + (barHeight * 0.3);
  const sampleHeight = Math.max(8, barHeight * 0.5);
  const sampleWidth = Math.max(40, textWidth * 0.5);

  // Sample the primary region for rawHue
  const primaryRegion = {
    x: Math.max(0, Math.floor(bbox.x0)),
    y: Math.max(0, Math.floor(sampleY)),
    width: Math.floor(sampleWidth),
    height: Math.floor(sampleHeight),
  };
  const regionResult = await detectColorInRegion(imageBuffer, primaryRegion);

  return {
    color: colorResult.color,
    confidence: colorResult.confidence,
    rawHue: regionResult.rawHue,
    rgb: colorResult.rgb || regionResult.rgb,
  };
}

// ── Run simulation on a set of named player bboxes ──────────────────────────
async function simulate(label, imagePath, players) {
  console.log('\n' + '═'.repeat(60));
  console.log('  ' + label);
  console.log('═'.repeat(60));

  // Load image once as a Buffer
  const imageBuffer = fs.readFileSync(imagePath);

  const results = [];
  for (const p of players) {
    const bar = await sampleBarColor(imageBuffer, p.bbox);
    results.push({ name: p.name, side: p.side, ...bar });
  }

  // Separate your team (left panel) from enemies (right panel)
  const enemies = results.filter(r => r.side === 'enemy');
  const teammates = results.filter(r => r.side === 'friendly');

  console.log('\nFRIENDLY (fast path, no clustering needed):');
  for (const p of teammates) {
    const hueStr = typeof p.rawHue === 'number' ? String(p.rawHue).padStart(3) + '°' : '  —  ';
    console.log(`  ${p.name.padEnd(22)} hue=${hueStr}  named=${p.color}`);
  }

  // Separate known vs skipped vs unknown enemies
  const knownEnemies = enemies.filter(r => r.color !== 'unknown' && r.color !== 'spectator' && r.color !== 'black');
  const skippedEnemies = enemies.filter(r => r.color === 'black' || r.color === 'spectator');
  const unknownEnemies = enemies.filter(r => r.color === 'unknown');

  console.log('\nENEMY BAR SAMPLES:');
  for (const p of enemies) {
    const hueStr = typeof p.rawHue === 'number' ? String(p.rawHue).padStart(3) + '°' : '  —  ';
    let status;
    if (p.color === 'black' || p.color === 'spectator') {
      status = `${p.color.toUpperCase()}/skip`;
    } else if (p.color !== 'unknown') {
      status = `FAST:${p.color}`;
    } else {
      status = typeof p.rawHue === 'number' ? `UNKNOWN hue=${p.rawHue}°` : 'UNKNOWN (no hue)';
    }
    console.log(`  ${p.name.padEnd(22)} hue=${hueStr}  → ${status}`);
  }

  // Fast path groups (named colors)
  const fastGroups = {};
  for (const p of knownEnemies) {
    if (!fastGroups[p.color]) fastGroups[p.color] = [];
    fastGroups[p.color].push(p.name);
  }

  // Gap-based clustering on unknowns that have a hue
  const unknownsWithHue = unknownEnemies
    .filter(p => typeof p.rawHue === 'number')
    .map(p => ({ name: p.name, hue: p.rawHue }));
  const unknownsWithoutHue = unknownEnemies.filter(p => typeof p.rawHue !== 'number');

  const clusters = clusterByHue(unknownsWithHue);

  console.log('\nRESULT — SIMULATED NEW SYSTEM:');
  let teamIdx = 1;
  for (const [color, names] of Object.entries(fastGroups)) {
    console.log(`  Team ${teamIdx++} [${color.toUpperCase()} — fast path]: ${names.join(', ')}`);
  }
  for (const cluster of clusters) {
    const hues = cluster.map(p => p.hue + '°').join(', ');
    console.log(`  Team ${teamIdx++} [custom color, hues: ${hues}]: ${cluster.map(p => p.name).join(', ')}`);
  }
  if (skippedEnemies.length > 0) {
    console.log(`  Skipped (black/spectator): ${skippedEnemies.map(p => p.name).join(', ')}`);
  }
  if (unknownsWithoutHue.length > 0) {
    console.log(`  No hue detected: ${unknownsWithoutHue.map(p => p.name).join(', ')}`);
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

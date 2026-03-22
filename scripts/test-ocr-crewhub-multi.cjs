'use strict';

const fs = require('fs');
const os = require('os');

// Mock electron before requiring ocrHandler
const Module = require('module');
const _originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: { handle: () => {}, on: () => {} },
      app: {
        getPath: (name) => os.tmpdir(),
        getVersion: () => '0.0.0',
      },
      BrowserWindow: class {},
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      shell: { openPath: async () => '' },
    };
  }
  return _originalLoad.apply(this, arguments);
};

const { processCapture } = require('../electron/ocrHandler.cjs');

const IMAGES = [
  'C:\\Users\\Alec Gougebas\\Downloads\\hub1.png',
  'C:\\Users\\Alec Gougebas\\Downloads\\hub2.png',
];

async function runOCR(imagePath) {
  console.log(`\n>>> Processing: ${imagePath}`);
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  return processCapture(imageBase64, null, null, 'local', {
    screenTypeHint: 'crewhub',
    includeBboxes: true,
  });
}

function mergeCrewHubResults(results) {
  // Use first result as base for yourTeam/teamName
  const base = results.find(r => r) || {};
  const merged = {
    screenType: base.screenType,
    yourTeam: base.yourTeam,
    enemyPlayers: [],
    enemyTeams: [],
  };

  const seenNames = new Set();
  const seenTeams = new Map(); // teamName -> team object

  for (const result of results) {
    if (!result) continue;

    // Merge enemy players (deduplicate by name)
    const enemies = result.enemyPlayers || result.enemies || [];
    for (const p of enemies) {
      const key = (p.name || p.playerName || '').trim().toLowerCase();
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      merged.enemyPlayers.push(p);
    }

    // Merge enemy teams (deduplicate by teamName)
    const teams = result.enemyTeams || [];
    for (const t of teams) {
      const key = (t.teamName || '').trim().toLowerCase();
      if (!key) continue;
      if (!seenTeams.has(key)) {
        seenTeams.set(key, { ...t, players: [...(t.players || [])] });
      } else {
        // Merge players into existing team
        const existing = seenTeams.get(key);
        for (const p of (t.players || [])) {
          const pKey = (p.name || p.playerName || '').trim().toLowerCase();
          const alreadyIn = existing.players.some(ep =>
            (ep.name || ep.playerName || '').trim().toLowerCase() === pKey
          );
          if (!alreadyIn) existing.players.push(p);
        }
      }
    }
  }

  merged.enemyTeams = [...seenTeams.values()];
  return merged;
}

function printResult(label, result) {
  if (!result) { console.log(label + ': (null)'); return; }
  console.log(`\n=== ${label} ===`);
  console.log('Screen type:', result.screenType);

  const yourTeam = result.yourTeam || {};
  console.log('Your team name:', yourTeam.teamName || yourTeam.shipName || '(none)');
  const teammates = yourTeam.players || yourTeam.teammates || [];
  if (teammates.length) {
    console.log('Teammates:');
    for (const p of teammates) {
      const name = p.name || p.playerName || '?';
      const conf = p.confidence ?? p.nameConfidence ?? '?';
      console.log(`  - "${name}" conf=${conf}`);
    }
  }

  const enemies = result.enemyPlayers || result.enemies || [];
  console.log(`\nEnemy players (${enemies.length}):`);
  for (const p of enemies) {
    const name = p.name || p.playerName || '?';
    const team = p.teamName || p.teamColor || p.color || '?';
    const conf = p.confidence ?? p.nameConfidence ?? '?';
    console.log(`  - "${name}" | team="${team}" | conf=${conf}`);
  }

  const teams = result.enemyTeams || [];
  if (teams.length) {
    console.log(`\nEnemy teams (${teams.length}):`);
    for (const t of teams) {
      const players = (t.players || []).map(p => p.name || p.playerName || '?');
      console.log(`  [${t.teamName || t.color || '?'}] ${players.join(', ')}`);
    }
  }
}

async function main() {
  const results = [];
  for (const img of IMAGES) {
    try {
      const r = await runOCR(img);
      console.log('\n--- RAW JSON ---');
      console.log(JSON.stringify(r, null, 2));
      results.push(r);
      printResult(img.split('\\').pop(), r);
    } catch (err) {
      console.error('Error on', img, ':', err.message);
      results.push(null);
    }
  }

  const merged = mergeCrewHubResults(results);
  printResult('MERGED (both scrolls)', merged);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});

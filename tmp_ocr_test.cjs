/**
 * Universal OCR pipeline test harness.
 *
 * Runs exactly the same code path as the live app (processCapture → mergeCaptures).
 * No direct extractor calls — everything goes through ocrHandler.
 *
 * Usage:
 *   node tmp_ocr_test.cjs [matchId] [matchId2 ...]
 *   node tmp_ocr_test.cjs 132
 *   node tmp_ocr_test.cjs 119 132
 *   node tmp_ocr_test.cjs          # runs ALL available match IDs
 *
 * Suppress Tesseract chatter:
 *   node tmp_ocr_test.cjs 132 2>$null
 */
'use strict';

const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const Module  = require('module');

// ── Mock `electron` so ocrHandler can be required outside Electron ──────────
const FAKE_USERDATA = path.join(os.tmpdir(), 'wg-test-userdata');
fs.mkdirSync(FAKE_USERDATA, { recursive: true });

const MOCK_ID = '__wg_electron_mock__';
require.cache[MOCK_ID] = {
  id: MOCK_ID, filename: MOCK_ID, loaded: true, parent: null, children: [], paths: [],
  exports: {
    ipcMain: { handle: () => {}, on: () => {} },
    app: {
      getPath: (n) => (n === 'userData' || n === 'temp') ? FAKE_USERDATA : FAKE_USERDATA,
      on: () => {},
      isPackaged: false,
    },
  },
};
const _origResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, parent, isMain, opts) =>
  req === 'electron' ? MOCK_ID : _origResolve(req, parent, isMain, opts);

// ── Load pipeline (same modules the live app uses) ──────────────────────────
const { processCapture } = require('./electron/ocrHandler.cjs');
const { mergeCaptures }  = require('./electron/ocrMerger.cjs');

// ── Helpers ─────────────────────────────────────────────────────────────────
const ARTIFACTS_BASE = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'Wildgate Stat Tracker', 'match_artifacts'
);

function getMatchIds(args) {
  const ids = args.filter(a => /^\d+$/.test(a));
  if (ids.length) return ids;
  // no args → all available match IDs, sorted numerically
  return fs.readdirSync(ARTIFACTS_BASE)
    .filter(d => /^\d+$/.test(d))
    .sort((a, b) => parseInt(a) - parseInt(b));
}

function getScreenshots(matchId) {
  const dir = path.join(ARTIFACTS_BASE, String(matchId));
  return fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort()
    .map(f => path.join(dir, f));
}

function pname(p) { return typeof p === 'string' ? p : (p?.name || '?'); }

function printResult(matchId, data) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MATCH ${matchId}`);
  console.log('═'.repeat(60));

  // Your team
  const yourTeamName = data.playerTeamName || data.yourTeam?.name || '';
  const yourShip     = data.playerShip?.shipType || '?';
  const teammates    = (data.yourTeam?.players || data.teammates || []).map(pname);
  console.log(`YOUR TEAM: "${yourTeamName}"  ship=${yourShip}`);
  if (teammates.length)
    console.log(`  Players (${teammates.length}): ${teammates.join(', ')}`);

  // Opponent teams — ordered by number of players desc
  const teams = (data.opponentTeams || []).slice()
    .sort((a, b) => (b.players?.length || 0) - (a.players?.length || 0));

  if (teams.length === 0) {
    console.log('\n  (no opponent teams found)');
  } else {
    for (const t of teams) {
      const color   = t.color || '?';
      const name    = t.teamName || t.name || '?';
      const ship    = t.shipType || '?';
      const players = (t.players || []).map(pname);
      console.log(`\n[${color}] "${name}"  ship=${ship}`);
      if (players.length)
        console.log(`  Players (${players.length}): ${players.join(', ')}`);
      else
        console.log(`  Players: (none)`);
    }
  }

  // Hazards
  const mods = data.reachModifiers || data.modifiers || [];
  const hazardNames = [...new Set(mods.map(h => h?.name || h).filter(Boolean))];
  if (hazardNames.length)
    console.log(`\nHazards: ${hazardNames.join(', ')}`);
}

// ── Main ────────────────────────────────────────────────────────────────────
const ACTIVE_USER = 'AlixThus';

async function runMatch(matchId) {
  let screenshots;
  try {
    screenshots = getScreenshots(matchId);
  } catch (e) {
    console.error(`[Match ${matchId}] Cannot read dir:`, e.message);
    return;
  }
  if (!screenshots.length) {
    console.error(`[Match ${matchId}] No screenshots found`);
    return;
  }

  console.log(`\n[Match ${matchId}] ${screenshots.length} screenshot(s): ${screenshots.map(f => path.basename(f)).join(', ')}`);

  let accumulated = null;

  for (const imgPath of screenshots) {
    const base64 = fs.readFileSync(imgPath).toString('base64');
    let result;
    try {
      result = await processCapture(base64, ACTIVE_USER, accumulated, 'local', {
        skipDebugSave: true,
        forceUncached: true,
      });
    } catch (e) {
      console.error(`  [Match ${matchId}] processCapture failed on ${path.basename(imgPath)}:`, e.message);
      continue;
    }

    if (!result?.success) {
      console.error(`  [Match ${matchId}] OCR failure on ${path.basename(imgPath)}:`, result?.error);
      continue;
    }

    accumulated = accumulated ? mergeCaptures(accumulated, result.data) : result.data;
    console.log(`  [${path.basename(imgPath)}] type=${result.data.screenshotType} enemies=${result.data.opponentTeams?.length ?? 0}`);
  }

  if (accumulated) {
    printResult(matchId, accumulated);
  } else {
    console.log(`[Match ${matchId}] No data extracted.`);
  }
}

async function main() {
  const matchIds = getMatchIds(process.argv.slice(2));
  console.log(`Running OCR test for match ID(s): ${matchIds.join(', ')}`);
  console.log('Pipeline: processCapture (local-only) → mergeCaptures\n');

  for (const id of matchIds) {
    await runMatch(id);
  }

  // Force exit (Tesseract workers keep event loop alive)
  process.exit(0);
}

main().catch(e => { console.error('[Fatal]', e); process.exit(1); });

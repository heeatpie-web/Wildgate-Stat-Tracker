/**
 * Deterministic OCR regression for artifact 132.
 * Runs the same processCapture -> mergeCaptures pipeline as the app and checks
 * key expectations from the OCR hardening plan.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const FAKE_USERDATA = path.join(os.tmpdir(), 'wg-test-userdata');
fs.mkdirSync(FAKE_USERDATA, { recursive: true });

const MOCK_ID = '__wg_electron_mock_regression__';
require.cache[MOCK_ID] = {
  id: MOCK_ID, filename: MOCK_ID, loaded: true, parent: null, children: [], paths: [],
  exports: {
    ipcMain: { handle: () => {}, on: () => {} },
    app: {
      getPath: () => FAKE_USERDATA,
      on: () => {},
      isPackaged: false,
    },
  },
};
const originalResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, parent, isMain, opts) =>
  req === 'electron' ? MOCK_ID : originalResolve(req, parent, isMain, opts);

const { processCapture } = require('../electron/ocrHandler.cjs');
const { mergeCaptures } = require('../electron/ocrMerger.cjs');

const ACTIVE_USER = String(process.env.WG_OCR_ACTIVE_USER || process.env.ACTIVE_USER || '').trim();
const ARTIFACT_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'Wildgate Stat Tracker',
  'match_artifacts',
  '132'
);

const IMAGES = [
  'capture_2026-02-25T06-02-46-869Z.png',
  'capture_2026-02-25T06-02-56-295Z.png',
].map(name => path.join(ARTIFACT_DIR, name));

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function listTeamNames(opponentTeams = []) {
  return opponentTeams.map(t => t.teamName || t.name || '');
}

function listPlayers(team = {}) {
  return (team.players || []).map(p => (typeof p === 'string' ? p : p?.name || ''));
}

async function run() {
  if (!ACTIVE_USER) {
    throw new Error('Missing active user. Set WG_OCR_ACTIVE_USER=<your pilot name> before running this regression script.');
  }
  let merged = null;
  for (const imgPath of IMAGES) {
    const base64 = fs.readFileSync(imgPath).toString('base64');
    const res = await processCapture(base64, ACTIVE_USER, merged, 'local', {
      skipDebugSave: true,
      forceUncached: true,
    });
    if (!res?.success || !res?.data) {
      throw new Error(`OCR failed on ${path.basename(imgPath)}: ${res?.error || 'unknown error'}`);
    }
    merged = merged ? mergeCaptures(merged, res.data) : res.data;
  }

  const teamNames = listTeamNames(merged?.opponentTeams || []);
  const hazards = new Set((merged?.reachModifiers || []).map(h => String(h?.name || h || '').toLowerCase()));
  const teammateNames = new Set((merged?.teammates || []).map(t => normalize(typeof t === 'string' ? t : t?.name)));
  const enemyPlayersCount = (merged?.opponentTeams || []).reduce((sum, team) => sum + listPlayers(team).length, 0);
  const enemyShipTypes = (merged?.opponentTeams || []).map(t => String(t.shipType || '').toLowerCase());

  const checks = [
    {
      name: 'has_hazards_6',
      pass: ['artifact: healing', 'cryon rift', 'few ships', 'lava epics', 'legion patrols', 'low altitude fog']
        .every(h => hazards.has(h)),
      actual: Array.from(hazards),
    },
    {
      name: 'has_user_ship_hunter',
      pass: normalize(merged?.playerShip?.shipType) === 'hunter',
      actual: merged?.playerShip?.shipType || '',
    },
    {
      name: 'has_teammates_leet_and_h4vokxp_or_variant',
      pass: teammateNames.has(normalize('leet')) &&
        (teammateNames.has(normalize('h4vokxp')) || teammateNames.has(normalize('h4yokxp'))),
      actual: Array.from(teammateNames),
    },
    {
      name: 'enemy_players_at_least_5',
      pass: enemyPlayersCount >= 5,
      actual: enemyPlayersCount,
    },
    {
      name: 'enemy_has_bastion',
      pass: enemyShipTypes.some(t => t === 'bastion'),
      actual: enemyShipTypes,
    },
    {
      name: 'enemy_names_not_color_labels',
      pass: teamNames.every(n => !['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'unknown'].includes(String(n).toLowerCase().trim())),
      actual: teamNames,
    },
  ];

  const failed = checks.filter(c => !c.pass);
  console.log(JSON.stringify({
    matchId: 132,
    checks,
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length,
    },
  }, null, 2));

  if (failed.length > 0) process.exit(1);
}

run().catch((e) => {
  console.error('[ocr_regression_match132] fatal:', e?.message || e);
  process.exit(1);
});


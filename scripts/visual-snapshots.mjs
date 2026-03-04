import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import process from 'node:process';
import os from 'node:os';
import sharp from 'sharp';
import { chromium } from 'playwright';

const BASE_URL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173';
const ROOT = process.cwd();
const VISUAL_DIR = path.join(ROOT, '.visual');
const BASELINE_DIR = path.join(VISUAL_DIR, 'baseline');
const CURRENT_DIR = path.join(VISUAL_DIR, 'current');
const DIFF_DIR = path.join(VISUAL_DIR, 'diff');
const DIFF_COLOR_DIR = path.join(VISUAL_DIR, 'diff-color');
const SNAPSHOT_DATA_CACHE = path.join(VISUAL_DIR, 'snapshot-data.json');
const REPORT_JSON = path.join(VISUAL_DIR, 'report.json');
const REPORT_MD = path.join(VISUAL_DIR, 'report.md');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const APP_VERSION_FALLBACK = 'v2.12.1';
const SNAPSHOT_FIXED_NOW = Date.UTC(2026, 1, 13, 12, 0, 0);
const argDataFile = process.argv.find(a => a.startsWith('--data-file='));
const dataFileFromArg = argDataFile ? argDataFile.split('=')[1] : '';
const dataFileFromEnv = process.env.VISUAL_SNAPSHOT_DB_PATH || '';
const DATA_FILE_PATH = dataFileFromArg || dataFileFromEnv;
const DATA_SOURCE = DATA_FILE_PATH
  ? 'file'
  : (process.argv.includes('--real-data') ? 'real' : (process.env.VISUAL_SNAPSHOT_SEED === '0' ? 'none' : 'seed'));

const ALL_VIEWS = [
  { id: 'recording', nav: '[data-tour="nav-recording"]', ready: '[data-tour="view-recording"]' },
  { id: 'analytics', nav: '[data-tour="nav-analytics"]', ready: '[data-tour="view-analytics"]' },
  { id: 'smart-captures', nav: '[data-tour="nav-smart-captures"]', ready: '[data-tour="view-smart-captures"]' },
  { id: 'players', nav: '[data-tour="nav-players"]', ready: '[data-tour="view-players"]' },
  { id: 'history', nav: '[data-tour="nav-history"]', ready: '[data-tour="view-history"]' },
];

// Filter views via positional args: `npm run snap:views -- recording players`
const viewFilter = process.argv.slice(2).filter(a => !a.startsWith('--'));
const VIEWS = viewFilter.length > 0
  ? ALL_VIEWS.filter(v => viewFilter.some(f => v.id.startsWith(f)))
  : ALL_VIEWS;

if (viewFilter.length > 0) {
  const matched = VIEWS.map(v => v.id).join(', ');
  console.log(`Filtering views: ${matched || 'none matched'}`);
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const EMPTY_STATE_HINTS = {
  analytics: ['No match data yet'],
  'smart-captures': ['No matches found'],
  players: ['No players registered yet'],
  history: ['No matches yet'],
};

async function readAppVersion() {
  try {
    const constantsPath = path.join(ROOT, 'src', 'utils', 'constants.ts');
    const source = await fs.readFile(constantsPath, 'utf8');
    const match = source.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
    return match?.[1] || APP_VERSION_FALLBACK;
  } catch {
    return APP_VERSION_FALLBACK;
  }
}

function getAppDataRoot() {
  if (process.env.APPDATA) return process.env.APPDATA;
  if (process.platform === 'win32') return path.join(os.homedir(), 'AppData', 'Roaming');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  return path.join(os.homedir(), '.config');
}

async function findNewestBackupPath() {
  const backupDir = path.join(os.homedir(), 'Documents', 'Wildgate Stat Tracker', 'Backups');
  if (!existsSync(backupDir)) return '';

  const entries = await fs.readdir(backupDir);
  const candidates = entries
    .filter(name => name.toLowerCase().startsWith('backup_') && name.toLowerCase().endsWith('.json'))
    .map(name => path.join(backupDir, name));
  if (candidates.length === 0) return '';

  const stats = await Promise.all(candidates.map(async (fullPath) => {
    try {
      const st = await fs.stat(fullPath);
      return { fullPath, mtimeMs: st.mtimeMs || 0 };
    } catch {
      return null;
    }
  }));

  const newest = stats
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return newest?.fullPath || '';
}

async function resolveRealDbPath() {
  if (DATA_FILE_PATH) {
    const explicit = path.resolve(DATA_FILE_PATH);
    if (!existsSync(explicit)) {
      throw new Error(`Snapshot data file not found: ${explicit}`);
    }
    return explicit;
  }

  const appDataRoot = getAppDataRoot();
  const candidates = [
    path.join(appDataRoot, 'Wildgate Stat Tracker', 'wildgate_db.json'),
    path.join(appDataRoot, 'wildgate-stat-tracker', 'wildgate_db.json'),
    path.join(appDataRoot, 'wildgate-stat-tracker-dev', 'wildgate_db.json'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  const newestBackup = await findNewestBackupPath();
  if (newestBackup) return newestBackup;
  return '';
}

function normalizeSnapshotDbShape(raw, appVersion) {
  const dataRoot = raw && typeof raw === 'object' ? raw : {};
  const data = (dataRoot.state && typeof dataRoot.state === 'object') ? dataRoot.state : dataRoot;
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const players = Array.isArray(data.players) ? data.players : [];
  const pilotRegistry = Array.isArray(data.pilotRegistry) ? data.pilotRegistry : players;
  const activeUser = (data.settings && typeof data.settings.activeUser === 'string' && data.settings.activeUser.trim())
    ? data.settings.activeUser
    : (players[0] || pilotRegistry[0] || '');

  return {
    ...data,
    matches,
    players,
    pilotRegistry,
    settings: {
      ...(data.settings || {}),
      disableAnimations: true,
      tutorialCompleted: true,
      activeUser,
    },
    uidMappings: data.uidMappings || { players: {}, ships: {}, weapons: {}, equipment: {} },
    uidSeedState: data.uidSeedState || { seedVersionApplied: null },
    lastActivity: data.lastActivity || SNAPSHOT_FIXED_NOW,
    __snapshotMeta: {
      appVersion,
      loadedAt: new Date(SNAPSHOT_FIXED_NOW).toISOString(),
    },
  };
}

async function loadSnapshotData(appVersion) {
  if (DATA_SOURCE === 'none') {
    return { db: null, source: 'none', sourcePath: '', matchesCount: 0, cached: false };
  }

  if (DATA_SOURCE === 'seed') {
    const db = createSnapshotSeed();
    return { db, source: 'seed', sourcePath: '', matchesCount: db.matches.length, cached: false };
  }

  if (!UPDATE_BASELINE && existsSync(SNAPSHOT_DATA_CACHE)) {
    const cachedPayload = JSON.parse(await fs.readFile(SNAPSHOT_DATA_CACHE, 'utf8'));
    const db = normalizeSnapshotDbShape(cachedPayload?.db || cachedPayload, appVersion);
    return {
      db,
      source: `${DATA_SOURCE}-cached`,
      sourcePath: cachedPayload?.meta?.sourcePath || SNAPSHOT_DATA_CACHE,
      matchesCount: Array.isArray(db.matches) ? db.matches.length : 0,
      cached: true,
    };
  }

  const dbPath = await resolveRealDbPath();
  if (!dbPath) {
    throw new Error('Could not locate real snapshot database (wildgate_db.json or backup_*.json).');
  }

  const raw = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  const db = normalizeSnapshotDbShape(raw, appVersion);
  if (!Array.isArray(db.matches) || db.matches.length === 0) {
    throw new Error(`Snapshot real-data source has zero matches: ${dbPath}`);
  }
  if (UPDATE_BASELINE) {
    await fs.writeFile(
      SNAPSHOT_DATA_CACHE,
      `${JSON.stringify({
        meta: {
          generatedAt: new Date(SNAPSHOT_FIXED_NOW).toISOString(),
          source: DATA_SOURCE,
          sourcePath: dbPath,
          matchesCount: db.matches.length,
        },
        db,
      }, null, 2)}\n`,
      'utf8',
    );
  }
  return { db, source: DATA_SOURCE, sourcePath: dbPath, matchesCount: db.matches.length, cached: false };
}

function createSnapshotSeed() {
  const now = SNAPSHOT_FIXED_NOW;
  const day = 24 * 60 * 60 * 1000;
  const heroes = ['Adrian', 'Venture', 'Kae', 'Sammo', 'Ion', 'Mophs'];
  const ships = ['Hunter (4 Player)', 'Bastion (4 Player)', 'Privateer (4 Player)', 'Scout (3 Player)', 'Outlaw (2 Player)'];
  const teammatesPool = [['Jinx'], ['Rook', 'Nova'], ['Vega'], ['Rook'], ['Jinx', 'Vega']];
  const opponentsPool = [['Rival-1', 'Rival-2'], ['Bandit', 'Corsair'], ['Ghost', 'Warden'], ['Marauder'], ['Aegis', 'Fenrir']];
  const modifiers = ['Ancient Vault', 'Deadworlds', 'Fast Gate', 'Many asteroids', 'Haunted Storm', 'Artifact: Healing', 'Artifact: Ice'];
  const results = ['Win', 'Loss', 'Win', 'Draw', 'Win', 'Loss', 'Win', 'Win', 'Loss', 'Win', 'Draw', 'Win'];

  const matches = Array.from({ length: 18 }, (_, index) => {
    const timestamp = now - ((18 - index) * day) - (index * 37 * 60 * 1000);
    const result = results[index % results.length];
    const hero = heroes[index % heroes.length];
    const ship = ships[index % ships.length];
    const teammates = teammatesPool[index % teammatesPool.length];
    const opponents = opponentsPool[index % opponentsPool.length];
    const damageTaken = 280 + ((index * 137) % 2100);
    const minutes = 6 + (index % 12);
    const seconds = (index * 13) % 60;
    const totalKills = 1 + (index % 5);
    const hasArtifacts = index % 4 === 0;
    const hasOcr = index % 3 === 0;

    return {
      id: 5000 + index,
      timestamp,
      date: new Date(timestamp).toISOString().slice(0, 10),
      mode: index % 3 === 0 ? 'Fleet Battle' : 'Artifact Brawl',
      player: 'TestPilot',
      teammates,
      opponents,
      hero,
      ship,
      reachModifiers: [
        modifiers[index % modifiers.length],
        modifiers[(index + 2) % modifiers.length],
      ],
      kills: {
        'Hunter (4 Player)': totalKills % 3,
        'Bastion (4 Player)': (totalKills + 1) % 3,
        'Privateer (4 Player)': (totalKills + 2) % 3,
        'Scout (3 Player)': totalKills % 2,
        'Outlaw (2 Player)': (index + 1) % 2,
      },
      result,
      subType: result === 'Win' ? (index % 2 === 0 ? 'Combat' : 'Artifact') : (result === 'Loss' ? 'Eliminated' : 'Timeout'),
      placement: 1 + (index % 4),
      damageTaken,
      time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      poiEasy: index % 4,
      poiMedium: (index + 1) % 3,
      poiEpic: index % 2,
      artifactSource: index % 2 === 0 ? 'Vault' : 'Wreckage',
      killedBy: result === 'Loss' ? (index % 2 === 0 ? 'Enemy Player' : 'AI Legion') : '',
      notes: index % 5 === 0 ? 'Seeded snapshot fixture entry.' : '',
      opponentTeams: [
        {
          teamName: `Team ${index + 1}`,
          shipType: ships[(index + 1) % ships.length].split(' (')[0],
          color: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'][index % 6],
          players: opponents,
        },
      ],
      artifacts: hasArtifacts ? [`seed://capture-${index + 1}.png`] : [],
      ocrState: hasArtifacts ? (hasOcr ? 'reviewing' : 'ready') : undefined,
      ocrReviewedAt: hasArtifacts && !hasOcr ? timestamp + 5000 : undefined,
      ocrDebug: hasOcr
        ? {
            confidence: 72 + (index % 24),
            source: 'merged',
            timestamp,
          }
        : undefined,
    };
  });

  return {
    matches,
    players: ['TestPilot', 'Jinx', 'Rook', 'Nova', 'Vega', 'Kai', 'Marauder', 'Rival-1'],
    pilotRegistry: ['TestPilot', 'Jinx', 'Rook', 'Nova', 'Vega', 'Kai', 'Marauder', 'Rival-1', 'Rival-2', 'Corsair', 'Ghost', 'Warden'],
    favorites: ['TestPilot', 'Jinx', 'Rook'],
    pilotNotes: {
      Jinx: 'Primary wingman.',
      Rook: 'High-tempo fragger.',
      Marauder: 'Frequent late-match threat.',
    },
    playerIdMap: {},
    settings: {
      mode: 'twilight',
      theme: 'ocean',
      hue: '0',
      colorblind: 'none',
      disableAnimations: true,
      performanceMode: false,
      language: 'en',
      showTimer: true,
      bgUrl: '',
      autoLog: true,
      autoBackup: true,
      alwaysOnTop: false,
      overlayStyle: 'compact',
      visualMode: 'dense',
      ocrMode: 'both',
      captureMode: 'auto',
      lockOcrTeams: false,
      tutorialCompleted: true,
      activeUser: 'TestPilot',
    },
    layouts: {},
    lastActivity: now,
    mappings: {},
    playerProfiles: {},
    timelineEvents: [],
    ocrCorrections: {},
    uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {} },
    uidSeedState: { seedVersionApplied: null },
  };
}

async function seedBrowserStorage(page, appVersion, snapshotDb) {
  await page.addInitScript(
    ({ db, version, fixedNow }) => {
      try {
        const RealDate = Date;
        // Keep clock-driven UI deterministic during snapshot capture.
        class SnapshotDate extends RealDate {
          constructor(...args) {
            if (args.length === 0) {
              super(fixedNow);
            } else {
              super(...args);
            }
          }
          static now() {
            return fixedNow;
          }
        }
        SnapshotDate.parse = RealDate.parse;
        SnapshotDate.UTC = RealDate.UTC;
        window.Date = SnapshotDate;

        window.localStorage.clear();
        if (db) {
          window.localStorage.setItem('wg_db', JSON.stringify(db));
        }
        window.localStorage.setItem('wg_last_seen_version', version);
      } catch {
        // Ignore storage write failures in hardened browser contexts.
      }
    },
    { db: snapshotDb, version: appVersion, fixedNow: SNAPSHOT_FIXED_NOW },
  );
}

async function detectEmptyState(page, view) {
  const hints = EMPTY_STATE_HINTS[view.id] || [];
  if (hints.length === 0) return '';
  const root = page.locator(view.ready).first();
  for (const text of hints) {
    const match = root.getByText(text, { exact: false }).first();
    if (await match.count()) {
      return `empty-state detected (${text})`;
    }
  }
  return '';
}

async function waitForViewStable(page, view, timeoutMs = 12000) {
  await page.evaluate(async () => {
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    } catch {
      // ignore font readiness errors
    }
  });

  const hints = EMPTY_STATE_HINTS[view.id] || [];
  if (hints.length === 0) {
    await page.waitForTimeout(350);
    return;
  }

  const root = page.locator(view.ready).first();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let hasEmpty = false;
    for (const text of hints) {
      const match = root.getByText(text, { exact: false }).first();
      if (await match.count()) {
        hasEmpty = true;
        break;
      }
    }
    if (!hasEmpty) {
      await page.waitForTimeout(250);
      return;
    }
    await page.waitForTimeout(220);
  }
}

async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function isServerUp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(BASE_URL, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isServerUp()) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

function startDevServer() {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1 --port 5173'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, BROWSER: 'none' },
    });
  }

  return spawn(npmCmd, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, BROWSER: 'none' },
  });
}

async function copyFile(src, dest) {
  await mkdirp(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function compareImages(baselinePath, currentPath, diffPath, diffColorPath) {
  const base = await sharp(baselinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cur = await sharp(currentPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  if (
    base.info.width !== cur.info.width ||
    base.info.height !== cur.info.height
  ) {
    return {
      mismatchPct: 100,
      changedPixels: base.info.width * base.info.height,
      totalPixels: base.info.width * base.info.height,
      note: `dimension mismatch (${base.info.width}x${base.info.height} vs ${cur.info.width}x${cur.info.height})`,
    };
  }

  const width = base.info.width;
  const height = base.info.height;
  const channels = 4;
  const totalPixels = width * height;
  const diffBuf = Buffer.alloc(base.data.length);
  const diffColorBuf = Buffer.alloc(base.data.length);
  let changedPixels = 0;

  for (let i = 0; i < base.data.length; i += channels) {
    const dr = Math.abs(base.data[i] - cur.data[i]);
    const dg = Math.abs(base.data[i + 1] - cur.data[i + 1]);
    const db = Math.abs(base.data[i + 2] - cur.data[i + 2]);
    const da = Math.abs(base.data[i + 3] - cur.data[i + 3]);
    const changed = dr > 16 || dg > 16 || db > 16 || da > 16;

    if (changed) {
      changedPixels += 1;
      diffBuf[i] = 255;
      diffBuf[i + 1] = 32;
      diffBuf[i + 2] = 32;
      diffBuf[i + 3] = 255;

      diffColorBuf[i] = Math.min(255, Math.round(cur.data[i] * 0.35 + 230));
      diffColorBuf[i + 1] = Math.min(255, Math.round(cur.data[i + 1] * 0.18 + 32));
      diffColorBuf[i + 2] = Math.min(255, Math.round(cur.data[i + 2] * 0.35 + 230));
      diffColorBuf[i + 3] = 255;
    } else {
      const tone = Math.round(cur.data[i] * 0.18 + cur.data[i + 1] * 0.52 + cur.data[i + 2] * 0.3);
      diffBuf[i] = tone;
      diffBuf[i + 1] = tone;
      diffBuf[i + 2] = tone;
      diffBuf[i + 3] = 220;

      diffColorBuf[i] = Math.round(cur.data[i] * 0.82);
      diffColorBuf[i + 1] = Math.round(cur.data[i + 1] * 0.82);
      diffColorBuf[i + 2] = Math.round(cur.data[i + 2] * 0.82);
      diffColorBuf[i + 3] = 255;
    }
  }

  await sharp(diffBuf, { raw: { width, height, channels } }).png().toFile(diffPath);
  await sharp(diffColorBuf, { raw: { width, height, channels } }).png().toFile(diffColorPath);
  return {
    mismatchPct: Number(((changedPixels / totalPixels) * 100).toFixed(2)),
    changedPixels,
    totalPixels,
    note: '',
  };
}

async function writeReport(results, meta) {
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    updateBaseline: UPDATE_BASELINE,
    dataSource: meta.dataSource,
    dataSourcePath: meta.dataSourcePath || '',
    matchesCount: meta.matchesCount,
    dataCached: Boolean(meta.dataCached),
    artifacts: {
      baseline: path.relative(ROOT, BASELINE_DIR),
      current: path.relative(ROOT, CURRENT_DIR),
      diff: path.relative(ROOT, DIFF_DIR),
      diffColor: path.relative(ROOT, DIFF_COLOR_DIR),
    },
    views: results,
  };
  await fs.writeFile(REPORT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const lines = [
    '# Visual Snapshot Report',
    '',
    `- Generated: ${payload.generatedAt}`,
    `- URL: ${BASE_URL}`,
    `- Mode: ${UPDATE_BASELINE ? 'update-baseline' : 'compare'}`,
    `- Data Source: ${payload.dataSource}`,
    `- Match Count: ${payload.matchesCount}`,
    `- Dataset Lock: ${payload.dataCached ? `cached (${path.relative(ROOT, SNAPSHOT_DATA_CACHE)})` : 'live'}`,
    payload.dataSourcePath ? `- Data Path: ${payload.dataSourcePath}` : '',
    `- Color Artifacts: ${path.relative(ROOT, CURRENT_DIR)} (full-color views), ${path.relative(ROOT, DIFF_COLOR_DIR)} (color diff heatmaps)`,
    '',
    '| View | Status | Mismatch % | Notes |',
    '|---|---:|---:|---|',
  ].filter(Boolean);

  for (const r of results) {
    lines.push(`| ${r.view} | ${r.status} | ${r.mismatchPct ?? '-'} | ${r.note || ''} |`);
  }
  lines.push('');
  await fs.writeFile(REPORT_MD, lines.join('\n'), 'utf8');
}

async function dismissBlockingOverlays(page) {
  const overlay = page.locator('div.fixed.inset-0.z-\\[10000\\]');
  if (!(await overlay.count())) return;

  const preferred = [
    'Awesome!',
    'Close',
    'Skip',
    'Continue',
    'Done',
  ];

  for (const label of preferred) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count()) {
      try {
        await btn.first().click({ timeout: 1000 });
        await page.waitForTimeout(150);
        return;
      } catch {
        // Continue trying other labels.
      }
    }
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

async function clickNavWithRetry(page, selector, retries = 4) {
  const nav = page.locator(selector).first();
  await nav.waitFor({ state: 'visible', timeout: 10000 });
  await nav.scrollIntoViewIfNeeded();

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await nav.click({ timeout: 4000, force: true });
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      await dismissBlockingOverlays(page);
      await page.waitForTimeout(200);
    }
  }
}

async function activateView(page, view) {
  const nav = page.locator(view.nav).first();
  if (!(await nav.count())) return;

  await clickNavWithRetry(page, view.nav);
  try {
    await page.waitForSelector(view.ready, { state: 'visible', timeout: 9000 });
    return;
  } catch {
    // Fallback: dispatch a synthetic click from inside the page.
    await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (el) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
    }, view.nav);
    await page.waitForSelector(view.ready, { state: 'visible', timeout: 12000 });
  }
}

async function run() {
  await mkdirp(BASELINE_DIR);
  await mkdirp(CURRENT_DIR);
  await mkdirp(DIFF_DIR);
  await mkdirp(DIFF_COLOR_DIR);

  let devServer = null;
  if (!(await isServerUp())) {
    devServer = startDevServer();
    const ok = await waitForServer();
    if (!ok) {
      throw new Error(`Vite server did not come up at ${BASE_URL}`);
    }
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1720, height: 980 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const appVersion = await readAppVersion();
    const snapshotData = await loadSnapshotData(appVersion);

    await seedBrowserStorage(page, appVersion, snapshotData.db);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.app-container', { state: 'visible', timeout: 15000 });
    if (snapshotData.db) {
      await page.waitForFunction(() => {
        try {
          const raw = window.localStorage.getItem('wg_db');
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed.matches) && parsed.matches.length >= 10;
        } catch {
          return false;
        }
      }, { timeout: 10000 });
    }
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;scroll-behavior:auto!important;}' });
    await dismissBlockingOverlays(page);

    const results = [];
    let emptyStateDetected = false;
    for (const view of VIEWS) {
      await dismissBlockingOverlays(page);
      await activateView(page, view);
      await waitForViewStable(page, view);

      const target = page.locator('.app-container');
      const currentPath = path.join(CURRENT_DIR, `${view.id}.png`);
      await target.screenshot({ path: currentPath });

      const baselinePath = path.join(BASELINE_DIR, `${view.id}.png`);
      const diffPath = path.join(DIFF_DIR, `${view.id}.png`);
      const diffColorPath = path.join(DIFF_COLOR_DIR, `${view.id}.png`);
      const emptyNote = await detectEmptyState(page, view);
      if (emptyNote) {
        emptyStateDetected = true;
      }

      if (UPDATE_BASELINE || !existsSync(baselinePath)) {
        await copyFile(currentPath, baselinePath);
        results.push({
          view: view.id,
          status: UPDATE_BASELINE ? 'baseline-updated' : 'baseline-created',
          mismatchPct: 0,
          note: emptyNote,
        });
        continue;
      }

      const cmp = await compareImages(baselinePath, currentPath, diffPath, diffColorPath);
      results.push({
        view: view.id,
        status: cmp.mismatchPct > 0 ? 'changed' : 'unchanged',
        mismatchPct: cmp.mismatchPct,
        note: [cmp.note, emptyNote].filter(Boolean).join('; '),
      });
    }

    await writeReport(results, {
      dataSource: snapshotData.source,
      dataSourcePath: snapshotData.sourcePath,
      matchesCount: snapshotData.matchesCount,
      dataCached: snapshotData.cached,
    });
    if (emptyStateDetected && snapshotData.source !== 'none') {
      throw new Error('Snapshot run captured one or more views in empty-state. Seed or app state hydration is not producing representative data.');
    }
    console.log(`Visual report written to ${path.relative(ROOT, REPORT_MD)}`);
    console.log(`Snapshot data source: ${snapshotData.source} (${snapshotData.matchesCount} matches)${snapshotData.sourcePath ? ` @ ${snapshotData.sourcePath}` : ''}${snapshotData.cached ? ` [dataset locked from ${path.relative(ROOT, SNAPSHOT_DATA_CACHE)}]` : ''}`);
    console.log(`Color artifacts: ${path.relative(ROOT, CURRENT_DIR)} and ${path.relative(ROOT, DIFF_COLOR_DIR)}`);
    for (const r of results) {
      console.log(`${r.view.padEnd(14)} ${String(r.status).padEnd(16)} mismatch=${r.mismatchPct ?? '-'}% ${r.note || ''}`);
    }
  } finally {
    if (browser) await browser.close();
    if (devServer) {
      devServer.kill('SIGTERM');
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});


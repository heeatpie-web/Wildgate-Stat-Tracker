import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const BASE_URL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const argStage = process.argv.find(a => a.startsWith('--stage='))?.split('=')[1] || '';
const STAGE = argStage === 'after' ? 'after' : 'before';

const RESOLUTIONS = [
  { width: 1366, height: 768, id: '1366x768' },
  { width: 1920, height: 1080, id: '1920x1080' },
];

const STATES = [
  { id: 'idle', label: 'Idle' },
  { id: 'recording', label: 'Recording' },
  { id: 'smart-capture-processing', label: 'Smart Capture Processing' },
  { id: 'match-complete', label: 'Match Complete' },
];

const PANEL_TARGETS = [
  {
    id: 'ship-loadout',
    primary: '[data-recording-panel="ship-loadout"]',
    fallbackXPath: '//span[contains(normalize-space(.),"Ship & Loadout")]/ancestor::*[contains(@class,"md3-card")][1]',
  },
  {
    id: 'roster-manager',
    primary: '[data-recording-panel="roster-manager"]',
    fallbackXPath: '//h3[contains(normalize-space(.),"Roster Manager")]/ancestor::*[contains(@class,"md3-card")][1]',
  },
  {
    id: 'mission-intel',
    primary: '[data-recording-panel="mission-intel"]',
    fallbackXPath: '//h3[contains(normalize-space(.),"Mission Intel")]/ancestor::*[contains(@class,"md3-card")][1]',
  },
  {
    id: 'match-recording',
    primary: '[data-recording-panel="match-recording"]',
    fallbackXPath: '//h3[contains(normalize-space(.),"Match Recording")]/ancestor::*[contains(@class,"md3-card")][1]',
  },
  {
    id: 'topbar-smart-capture',
    primary: '[data-recording-panel="topbar-smart-capture"]',
    fallbackXPath: '//header//button[contains(@title,"Smart Capture")][1]',
  },
];

function createSnapshotSeed() {
  const now = Date.UTC(2026, 1, 13, 12, 0, 0);
  const matches = Array.from({ length: 14 }, (_, i) => ({
    id: 7000 + i,
    timestamp: now - (i * 5 * 60 * 1000),
    date: new Date(now - (i * 5 * 60 * 1000)).toISOString().slice(0, 10),
    mode: 'Artifact Brawl',
    player: 'TestPilot',
    teammates: i % 2 === 0 ? ['Jinx'] : ['Nova'],
    opponents: ['Rival-1', 'Rival-2'],
    hero: i % 2 === 0 ? 'Adrian' : 'Kae',
    ship: i % 2 === 0 ? 'Hunter (4 Player)' : 'Bastion (4 Player)',
    reachModifiers: ['Fast Gate'],
    kills: { 'AI Legion': 1 + (i % 3) },
    result: i % 3 === 0 ? 'Loss' : 'Win',
    subType: 'Combat',
    placement: 1 + (i % 3),
    damageTaken: 200 + (i * 15),
    time: `0${6 + (i % 4)}:${String((i * 7) % 60).padStart(2, '0')}`,
    poiEasy: i % 3,
    poiMedium: (i + 1) % 3,
    poiEpic: i % 2,
    notes: '',
  }));

  return {
    matches,
    players: ['TestPilot', 'Jinx', 'Nova', 'Rival-1', 'Rival-2'],
    pilotRegistry: ['TestPilot', 'Jinx', 'Nova', 'Rival-1', 'Rival-2', 'Rook'],
    favorites: ['Jinx'],
    pilotNotes: {},
    playerIdMap: {},
    settings: {
      mode: 'twilight',
      theme: 'ocean',
      hue: '0',
      colorblind: 'none',
      disableAnimations: false,
      performanceMode: false,
      language: 'en',
      showTimer: true,
      showSmartCaptureInHeader: true,
      tutorialCompleted: true,
      activeUser: 'TestPilot',
      overlayStyle: 'compact',
      visualMode: 'dense',
      ocrMode: 'both',
      captureMode: 'manual',
      lockOcrTeams: false,
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

async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function startDevServer() {
  return spawn(npmCmd, ['run', 'dev'], {
    cwd: ROOT,
    shell: false,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
}

async function isServerUp() {
  try {
    const res = await fetch(BASE_URL, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 50000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    if (await isServerUp()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function seedBrowserStorage(page) {
  const db = createSnapshotSeed();
  await page.addInitScript((payload) => {
    try {
      localStorage.clear();
      localStorage.setItem('wg_db', JSON.stringify(payload));
      localStorage.setItem('wg_last_seen_version', 'v2.12.4');
    } catch {
      // noop
    }
  }, db);
}

async function setState(page, stateId) {
  await page.evaluate((id) => {
    const store = (window).__WG_STORE__;
    if (!store || !store.getState) {
      throw new Error('WG store bridge missing');
    }
    const s = store.getState();
    s.setActiveView('recording');
    s.setShowWizard?.(null);
    s.setToast?.(null);
    s.setVisionStatus?.('idle');
    s.setIsMatchInProgress?.(false);
    s.setMatchStartTime?.(null);

    // Ensure telemetry badges are populated for validation captures.
    s.setActiveShip?.('Hunter (4 Player)', 'telemetry');
    s.setActiveHero?.('Adrian', 'telemetry');
    s.setSessionTeams?.({
      Cyan: ['TestPilot', 'Jinx'],
      Red: ['Rival-1', 'Rival-2'],
    });
    s.setSelectedTeammates?.(['Jinx']);
    s.setSelectedOpponents?.(['Rival-1', 'Rival-2']);

    if (id === 'recording') {
      s.setIsMatchInProgress?.(true);
      s.setMatchStartTime?.(Date.now() - 125000);
      return;
    }

    if (id === 'smart-capture-processing') {
      s.setVisionStatus?.('processing');
      s.setToast?.({ message: 'Processing OCR...', type: 'info' });
      s.setIsMatchInProgress?.(true);
      s.setMatchStartTime?.(Date.now() - 98000);
      return;
    }

    if (id === 'match-complete') {
      s.setToast?.({ message: 'Match recorded: WIN', type: 'success' });
      window.dispatchEvent(new CustomEvent('recording:match-complete', { detail: { result: 'Win' } }));
      return;
    }
  }, stateId);
}

async function ensureRecordingView(page) {
  await page.waitForSelector('.app-container', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(400);
  const recordingNav = page.locator('[data-tour="nav-recording"]');
  if (await recordingNav.count()) {
    await recordingNav.first().click({ force: true });
  }
  await page.waitForSelector('[data-tour="view-recording"]', { state: 'visible', timeout: 12000 });
}

async function selectCompactTab(page, tab) {
  const button = page.getByRole('button', { name: tab === 'loadout' ? /loadout/i : /actions/i }).first();
  if (await button.count()) {
    await button.click({ force: true });
    await page.waitForTimeout(120);
  }
}

async function panelLocator(page, target) {
  let loc = page.locator(target.primary);
  if (await loc.count()) return loc.first();
  loc = page.locator(`xpath=${target.fallbackXPath}`);
  return loc.first();
}

async function run() {
  const outRoot = path.join(ROOT, '.visual', 'phase2', STAGE);
  await mkdirp(outRoot);

  let devServer = null;
  if (!(await isServerUp())) {
    devServer = startDevServer();
    const ready = await waitForServer();
    if (!ready) throw new Error(`Vite dev server did not start at ${BASE_URL}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const resolution of RESOLUTIONS) {
      const context = await browser.newContext({
        viewport: { width: resolution.width, height: resolution.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await seedBrowserStorage(page);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await ensureRecordingView(page);

      for (const state of STATES) {
        const dir = path.join(outRoot, resolution.id, state.id);
        await mkdirp(dir);

        await setState(page, state.id);
        await ensureRecordingView(page);
        await page.waitForTimeout(state.id === 'match-complete' ? 180 : 220);

        const full = page.locator('.app-container').first();
        await full.screenshot({ path: path.join(dir, 'full.png') });

        for (const panel of PANEL_TARGETS) {
          if (panel.id === 'ship-loadout') await selectCompactTab(page, 'loadout');
          if (panel.id === 'match-recording') await selectCompactTab(page, 'actions');

          const loc = await panelLocator(page, panel);
          await loc.waitFor({ state: 'visible', timeout: 12000 });
          await loc.screenshot({ path: path.join(dir, `${panel.id}.png`) });
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
    if (devServer && !devServer.killed) {
      devServer.kill('SIGTERM');
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});


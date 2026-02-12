import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import process from 'node:process';
import sharp from 'sharp';
import { chromium } from 'playwright';

const BASE_URL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173';
const ROOT = process.cwd();
const VISUAL_DIR = path.join(ROOT, '.visual');
const BASELINE_DIR = path.join(VISUAL_DIR, 'baseline');
const CURRENT_DIR = path.join(VISUAL_DIR, 'current');
const DIFF_DIR = path.join(VISUAL_DIR, 'diff');
const REPORT_JSON = path.join(VISUAL_DIR, 'report.json');
const REPORT_MD = path.join(VISUAL_DIR, 'report.md');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

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

async function compareImages(baselinePath, currentPath, diffPath) {
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
    } else {
      const tone = Math.round(cur.data[i] * 0.18 + cur.data[i + 1] * 0.52 + cur.data[i + 2] * 0.3);
      diffBuf[i] = tone;
      diffBuf[i + 1] = tone;
      diffBuf[i + 2] = tone;
      diffBuf[i + 3] = 220;
    }
  }

  await sharp(diffBuf, { raw: { width, height, channels } }).png().toFile(diffPath);
  return {
    mismatchPct: Number(((changedPixels / totalPixels) * 100).toFixed(2)),
    changedPixels,
    totalPixels,
    note: '',
  };
}

async function writeReport(results) {
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    updateBaseline: UPDATE_BASELINE,
    views: results,
  };
  await fs.writeFile(REPORT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const lines = [
    '# Visual Snapshot Report',
    '',
    `- Generated: ${payload.generatedAt}`,
    `- URL: ${BASE_URL}`,
    `- Mode: ${UPDATE_BASELINE ? 'update-baseline' : 'compare'}`,
    '',
    '| View | Status | Mismatch % | Notes |',
    '|---|---:|---:|---|',
  ];

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

async function run() {
  await mkdirp(BASELINE_DIR);
  await mkdirp(CURRENT_DIR);
  await mkdirp(DIFF_DIR);

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

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;scroll-behavior:auto!important;}' });
    await dismissBlockingOverlays(page);

    const results = [];
    for (const view of VIEWS) {
      await dismissBlockingOverlays(page);
      const nav = page.locator(view.nav);
      if (await nav.count()) {
        await nav.first().click();
      }
      await page.waitForSelector(view.ready, { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(250);

      const target = page.locator('.app-container');
      const currentPath = path.join(CURRENT_DIR, `${view.id}.png`);
      await target.screenshot({ path: currentPath });

      const baselinePath = path.join(BASELINE_DIR, `${view.id}.png`);
      const diffPath = path.join(DIFF_DIR, `${view.id}.png`);

      if (UPDATE_BASELINE || !existsSync(baselinePath)) {
        await copyFile(currentPath, baselinePath);
        results.push({
          view: view.id,
          status: UPDATE_BASELINE ? 'baseline-updated' : 'baseline-created',
          mismatchPct: 0,
          note: '',
        });
        continue;
      }

      const cmp = await compareImages(baselinePath, currentPath, diffPath);
      results.push({
        view: view.id,
        status: cmp.mismatchPct > 0 ? 'changed' : 'unchanged',
        mismatchPct: cmp.mismatchPct,
        note: cmp.note,
      });
    }

    await writeReport(results);
    console.log(`Visual report written to ${path.relative(ROOT, REPORT_MD)}`);
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

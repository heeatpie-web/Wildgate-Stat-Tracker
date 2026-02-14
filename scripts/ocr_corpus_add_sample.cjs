#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv) {
  const args = {
    input: 'dataset/ocr-corpus/ground-truth.input.txt',
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (!next) break;
    if (token === '--input') args.input = next;
  }

  return args;
}

function ensureFile(filePath) {
  const abs = path.resolve(filePath);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(abs)) {
    fs.writeFileSync(abs, '# OCR ground truth input\n', 'utf8');
  }
}

function readExistingSampleIds(contents) {
  const ids = new Set();
  const lines = String(contents || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.toLowerCase().startsWith('sampleid:')) continue;
    const id = line.slice(line.indexOf(':') + 1).trim();
    if (id) ids.add(id);
  }
  return ids;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function ask(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, answer => resolve(String(answer || '').trim())));
}

async function collectOpponentTeams(rl) {
  const teams = [];
  while (true) {
    const teamName = await ask(rl, 'Opponent team name (leave blank to finish): ');
    if (!teamName) break;
    const teamColor = await ask(rl, `Team color for "${teamName}" (optional): `);
    const playersRaw = await ask(rl, `Players for "${teamName}" (comma-separated): `);
    const players = splitCsv(playersRaw);
    const team = { teamName, players };
    if (teamColor) team.teamColor = teamColor;
    teams.push(team);
  }
  return teams;
}

function formatOpponentTeams(teams) {
  if (!teams.length) return '';
  return teams
    .map(t => {
      const color = t.teamColor ? ` [${t.teamColor}]` : '';
      return `${t.teamName}${color}: ${t.players.join(', ')}`;
    })
    .join('; ');
}

function renderSampleBlock(sample) {
  const lines = [];
  lines.push(`sampleId: ${sample.sampleId}`);
  lines.push(`imagePath: ${sample.imagePath}`);
  lines.push(`teammates: ${sample.teammates.join(', ')}`);
  lines.push(`opponentTeams: ${formatOpponentTeams(sample.opponentTeams)}`);
  lines.push(`modifiers: ${sample.modifiers.join(', ')}`);
  return lines.join('\n');
}

function backupFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${abs}.bak.${stamp}`;
  fs.copyFileSync(abs, backupPath);
  return backupPath;
}

function appendSample(filePath, block) {
  const abs = path.resolve(filePath);
  const current = fs.readFileSync(abs, 'utf8');
  const trimmed = current.trimEnd();
  const prefix = trimmed ? `${trimmed}\n---\n` : '';
  fs.writeFileSync(abs, `${prefix}${block}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv);
  ensureFile(args.input);
  const inputAbs = path.resolve(args.input);
  const current = fs.readFileSync(inputAbs, 'utf8');
  const existingIds = readExistingSampleIds(current);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log('OCR Corpus Sample Wizard');
    console.log('------------------------');
    const sampleId = await ask(rl, 'Sample ID: ');
    if (!sampleId) throw new Error('Sample ID is required.');
    if (existingIds.has(sampleId)) throw new Error(`Sample ID already exists: ${sampleId}`);

    const imagePath = await ask(rl, 'Image path: ');
    if (!imagePath) throw new Error('Image path is required.');

    const teammates = splitCsv(await ask(rl, 'Teammates (comma-separated): '));
    const opponentTeams = await collectOpponentTeams(rl);
    const modifiers = splitCsv(await ask(rl, 'Modifiers (comma-separated): '));

    const sample = {
      sampleId,
      imagePath,
      teammates,
      opponentTeams,
      modifiers
    };
    const block = renderSampleBlock(sample);

    console.log('');
    console.log('Sample preview');
    console.log('--------------');
    console.log(block);
    console.log('');

    if (args.dryRun) {
      console.log('Dry run enabled, file was not modified.');
      return;
    }

    const confirm = (await ask(rl, 'Append this sample to input file? (y/n): ')).toLowerCase();
    if (confirm !== 'y' && confirm !== 'yes') {
      console.log('Cancelled, no changes written.');
      return;
    }

    const backupPath = backupFile(args.input);
    appendSample(args.input, block);
    console.log(`Appended sample to: ${args.input}`);
    if (backupPath) {
      console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`);
    }
    console.log('Next step: run "npm run ocr:truth:build"');
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error(`[ocr_corpus_add_sample] ${err.message}`);
  process.exitCode = 1;
});

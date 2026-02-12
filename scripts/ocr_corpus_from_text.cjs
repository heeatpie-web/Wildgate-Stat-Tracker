#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    in: 'dataset/ocr-corpus/ground-truth.input.txt',
    out: 'dataset/ocr-corpus/ground-truth.json',
    backup: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--no-backup') {
      args.backup = false;
      continue;
    }
    if (!next) break;
    if (token === '--in') args.in = next;
    if (token === '--out') args.out = next;
  }

  return args;
}

function ensureDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function parseTeamHeader(headerRaw) {
  const header = String(headerRaw || '').trim();
  if (header.includes('[') && !header.includes(']')) {
    throw new Error(`Invalid team color header "${header}". Missing closing "]".`);
  }
  const match = header.match(/^(.*?)(?:\s*\[([^\]]+)\])?$/);
  if (!match) return { teamName: header, teamColor: '' };
  const teamName = String(match[1] || '').trim();
  const teamColor = String(match[2] || '').trim();
  return { teamName, teamColor };
}

function parseOpponentTeams(value) {
  const teams = [];
  const chunks = String(value || '')
    .split(';')
    .map(v => v.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const colonIdx = chunk.indexOf(':');
    if (colonIdx <= 0) {
      throw new Error(
        `Invalid opponentTeams segment "${chunk}". Expected "Team Name: player1, player2".`
      );
    }
    const teamHeader = chunk.slice(0, colonIdx).trim();
    const playersRaw = chunk.slice(colonIdx + 1).trim();
    const players = splitCsv(playersRaw);
    const { teamName, teamColor } = parseTeamHeader(teamHeader);
    const team = { teamName, players };
    if (teamColor) team.teamColor = teamColor;
    teams.push(team);
  }

  return teams;
}

function parseFile(contents) {
  const lines = contents.split(/\r?\n/);
  const samples = [];
  let current = {};
  let currentStartLine = 1;

  function flushSample() {
    if (!Object.keys(current).length) return;
    const required = ['sampleId', 'imagePath'];
    for (const key of required) {
      if (!current[key]) {
        throw new Error(
          `Sample starting near line ${currentStartLine} is missing required field "${key}".`
        );
      }
    }
    current.teammates = Array.isArray(current.teammates) ? current.teammates : [];
    current.opponentTeams = Array.isArray(current.opponentTeams) ? current.opponentTeams : [];
    current.modifiers = Array.isArray(current.modifiers) ? current.modifiers : [];
    samples.push(current);
    current = {};
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNum = i + 1;
    const line = raw.trim();

    if (!line || line.startsWith('#')) continue;

    if (line === '---') {
      flushSample();
      currentStartLine = lineNum + 1;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx <= 0) {
      throw new Error(`Line ${lineNum}: expected "key: value".`);
    }

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) {
      throw new Error(`Line ${lineNum}: missing value for "${key}".`);
    }

    if (key === 'sampleId') current.sampleId = value;
    else if (key === 'imagePath') current.imagePath = value;
    else if (key === 'teammates') current.teammates = splitCsv(value);
    else if (key === 'modifiers') current.modifiers = splitCsv(value);
    else if (key === 'opponentTeams') current.opponentTeams = parseOpponentTeams(value);
    else throw new Error(`Line ${lineNum}: unknown key "${key}".`);
  }

  flushSample();

  const seen = new Set();
  for (const sample of samples) {
    if (seen.has(sample.sampleId)) {
      throw new Error(`Duplicate sampleId "${sample.sampleId}".`);
    }
    seen.add(sample.sampleId);
  }

  return {
    version: 1,
    samples
  };
}

function backupExistingOutput(outPath) {
  const outAbs = path.resolve(outPath);
  if (!fs.existsSync(outAbs)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${outAbs}.bak.${stamp}`;
  fs.copyFileSync(outAbs, backupPath);
  return backupPath;
}

function main() {
  const args = parseArgs(process.argv);
  const inAbs = path.resolve(args.in);
  if (!fs.existsSync(inAbs)) {
    throw new Error(`Missing input file: ${args.in}`);
  }

  const source = fs.readFileSync(inAbs, 'utf8');
  const truth = parseFile(source);

  ensureDir(args.out);
  const backupPath = args.backup ? backupExistingOutput(args.out) : null;
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(truth, null, 2), 'utf8');

  console.log('OCR Ground Truth Builder');
  console.log('------------------------');
  console.log(`Input: ${args.in}`);
  console.log(`Output: ${args.out}`);
  console.log(`Samples: ${truth.samples.length}`);
  if (backupPath) {
    console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`);
  }
}

main();

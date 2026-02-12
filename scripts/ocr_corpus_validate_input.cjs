#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    input: 'dataset/ocr-corpus/ground-truth.input.txt'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (!next) break;
    if (token === '--input') args.input = next;
  }

  return args;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function parseTeamHeader(headerRaw) {
  const header = String(headerRaw || '').trim();
  const match = header.match(/^(.*?)(?:\s*\[([^\]]+)\])?$/);
  if (!match) return { teamName: header, teamColor: '' };
  const teamName = String(match[1] || '').trim();
  const teamColor = String(match[2] || '').trim();
  return { teamName, teamColor };
}

function parseOpponentTeams(value, lineNum, errors) {
  const teams = [];
  const chunks = String(value || '')
    .split(';')
    .map(v => v.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const colonIdx = chunk.indexOf(':');
    if (colonIdx <= 0) {
      errors.push(`Line ${lineNum}: invalid opponentTeams segment "${chunk}" (expected "Team: p1, p2").`);
      continue;
    }
    const teamHeader = chunk.slice(0, colonIdx).trim();
    const playersRaw = chunk.slice(colonIdx + 1).trim();
    const players = splitCsv(playersRaw);
    const { teamName, teamColor } = parseTeamHeader(teamHeader);
    if (!teamName) {
      errors.push(`Line ${lineNum}: opponentTeams segment has empty team name.`);
      continue;
    }
    if (teamHeader.includes('[') && !teamHeader.includes(']')) {
      errors.push(`Line ${lineNum}: opponentTeams color bracket is not closed in "${teamHeader}".`);
      continue;
    }
    if (!players.length) {
      errors.push(`Line ${lineNum}: opponentTeams segment "${teamName}" has no players.`);
      continue;
    }
    const team = { teamName, players };
    if (teamColor) team.teamColor = teamColor;
    teams.push(team);
  }

  return teams;
}

function validate(contents) {
  const lines = contents.split(/\r?\n/);
  const errors = [];
  const warnings = [];
  const samples = [];
  let current = {};
  let startLine = 1;

  function flushSample() {
    if (!Object.keys(current).length) return;
    const sample = {
      sampleId: current.sampleId || '',
      imagePath: current.imagePath || '',
      teammates: Array.isArray(current.teammates) ? current.teammates : [],
      opponentTeams: Array.isArray(current.opponentTeams) ? current.opponentTeams : [],
      modifiers: Array.isArray(current.modifiers) ? current.modifiers : [],
      startLine
    };
    if (!sample.sampleId) errors.push(`Sample near line ${startLine}: missing sampleId.`);
    if (!sample.imagePath) errors.push(`Sample near line ${startLine}: missing imagePath.`);
    if (!sample.teammates.length) warnings.push(`Sample "${sample.sampleId || `line ${startLine}`}" has no teammates.`);
    if (!sample.opponentTeams.length) warnings.push(`Sample "${sample.sampleId || `line ${startLine}`}" has no opponent teams.`);
    samples.push(sample);
    current = {};
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNum = i + 1;
    const line = raw.trim();

    if (!line || line.startsWith('#')) continue;
    if (line === '---') {
      flushSample();
      startLine = lineNum + 1;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx <= 0) {
      errors.push(`Line ${lineNum}: expected "key: value".`);
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) {
      errors.push(`Line ${lineNum}: missing value for "${key}".`);
      continue;
    }

    if (key === 'sampleId') current.sampleId = value;
    else if (key === 'imagePath') current.imagePath = value;
    else if (key === 'teammates') current.teammates = splitCsv(value);
    else if (key === 'modifiers') current.modifiers = splitCsv(value);
    else if (key === 'opponentTeams') current.opponentTeams = parseOpponentTeams(value, lineNum, errors);
    else errors.push(`Line ${lineNum}: unknown key "${key}".`);
  }

  flushSample();

  const idCounts = new Map();
  for (const sample of samples) {
    if (!sample.sampleId) continue;
    idCounts.set(sample.sampleId, (idCounts.get(sample.sampleId) || 0) + 1);
  }
  for (const [sampleId, count] of idCounts) {
    if (count > 1) errors.push(`Duplicate sampleId "${sampleId}" appears ${count} times.`);
  }

  return { samples, errors, warnings };
}

function main() {
  const args = parseArgs(process.argv);
  const inputAbs = path.resolve(args.input);
  if (!fs.existsSync(inputAbs)) {
    throw new Error(`Missing input file: ${args.input}`);
  }

  const source = fs.readFileSync(inputAbs, 'utf8');
  const result = validate(source);

  console.log('OCR Corpus Input Validation');
  console.log('---------------------------');
  console.log(`Input: ${args.input}`);
  console.log(`Samples: ${result.samples.length}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log('');

  if (result.errors.length) {
    console.log('Errors');
    console.log('------');
    for (const e of result.errors) console.log(`- ${e}`);
    console.log('');
  }

  if (result.warnings.length) {
    console.log('Warnings');
    console.log('--------');
    for (const w of result.warnings) console.log(`- ${w}`);
    console.log('');
  }

  if (result.errors.length) {
    process.exitCode = 1;
  } else {
    console.log('Validation PASS');
  }
}

try {
  main();
} catch (err) {
  console.error(`[ocr_corpus_validate_input] ${err.message}`);
  process.exitCode = 1;
}

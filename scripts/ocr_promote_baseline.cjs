#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    report: 'dataset/ocr-corpus/reports/latest.json',
    baseline: 'dataset/ocr-corpus/baseline.json'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (!next) break;
    if (token === '--report') args.report = next;
    if (token === '--baseline') args.baseline = next;
  }

  return args;
}

function readJson(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function ensureDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv);
  const report = readJson(args.report);
  if (!report.summary) {
    throw new Error('Report does not contain summary');
  }

  const baseline = {
    generatedAt: new Date().toISOString(),
    sourceReport: args.report,
    summary: report.summary
  };

  ensureDir(args.baseline);
  fs.writeFileSync(path.resolve(args.baseline), JSON.stringify(baseline, null, 2), 'utf8');
  console.log(`Baseline promoted: ${args.baseline}`);
}

main();

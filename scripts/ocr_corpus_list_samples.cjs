#!/usr/bin/env node
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

function parseSamples(contents) {
  const lines = String(contents || '').split(/\r?\n/);
  const samples = [];
  let current = {};

  function flush() {
    if (!Object.keys(current).length) return;
    samples.push({
      sampleId: current.sampleId || '',
      imagePath: current.imagePath || '',
      line: current.line || 0
    });
    current = {};
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNum = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === '---') {
      flush();
      continue;
    }

    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (!current.line) current.line = lineNum;
    if (key === 'sampleId') current.sampleId = value;
    if (key === 'imagePath') current.imagePath = value;
  }

  flush();
  return samples;
}

function main() {
  const args = parseArgs(process.argv);
  const inputAbs = path.resolve(args.input);
  if (!fs.existsSync(inputAbs)) {
    throw new Error(`Missing input file: ${args.input}`);
  }

  const source = fs.readFileSync(inputAbs, 'utf8');
  const samples = parseSamples(source);

  console.log('OCR Corpus Samples');
  console.log('------------------');
  console.log(`Input: ${args.input}`);
  console.log(`Total samples: ${samples.length}`);
  console.log('');

  if (!samples.length) {
    console.log('No samples found.');
    return;
  }

  for (const sample of samples) {
    const id = sample.sampleId || '<missing-sampleId>';
    const image = sample.imagePath || '<missing-imagePath>';
    console.log(`- ${id}`);
    console.log(`  image: ${image}`);
    console.log(`  line: ${sample.line}`);
  }
}

main();

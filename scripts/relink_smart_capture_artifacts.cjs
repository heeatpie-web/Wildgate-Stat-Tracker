#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const relinker = require('../electron/helpers/artifactRelinker.cjs');

function parseArgs(argv) {
  const args = {
    mode: 'preview',
    userData: path.join(process.env.APPDATA || '', 'Wildgate Stat Tracker'),
    dbPath: null,
    json: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--apply') {
      args.mode = 'apply';
      continue;
    }
    if (token === '--dry-run') {
      args.mode = 'preview';
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--user-data' && next) {
      args.userData = path.resolve(next);
      i += 1;
      continue;
    }
    if (token === '--db' && next) {
      args.dbPath = path.resolve(next);
      i += 1;
      continue;
    }
  }

  args.dbPath = args.dbPath || path.join(args.userData, 'wildgate_db.json');
  return args;
}

function printSummary(result) {
  const summary = result && result.summary ? result.summary : {};
  console.log(`[ArtifactRelink] mode=${summary.mode || 'unknown'}`);
  console.log(`[ArtifactRelink] matches=${summary.matches || 0}`);
  console.log(`[ArtifactRelink] candidatesScanned=${summary.candidatesScanned || 0}`);
  console.log(`[ArtifactRelink] candidatesEligible=${summary.candidatesEligible || 0}`);
  console.log(`[ArtifactRelink] plannedLinks=${summary.plannedLinks || 0}`);
  if (typeof summary.appliedLinks === 'number') {
    console.log(`[ArtifactRelink] appliedLinks=${summary.appliedLinks}`);
  }
  if (typeof summary.updatedMatches === 'number') {
    console.log(`[ArtifactRelink] updatedMatches=${summary.updatedMatches}`);
  }
  if (summary.backupPath) {
    console.log(`[ArtifactRelink] backupPath=${summary.backupPath}`);
  }
}

function printCandidatePreview(result) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  if (candidates.length === 0) {
    console.log('[ArtifactRelink] no candidates');
    return;
  }
  console.log('[ArtifactRelink] top candidates:');
  candidates.slice(0, 20).forEach((item, idx) => {
    console.log(
      `  ${idx + 1}. match=${item.matchId} score=${item.score} file=${item.filename} source=${item.sourcePath}`
    );
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.dbPath)) {
    console.error(`[ArtifactRelink] DB file not found: ${args.dbPath}`);
    process.exit(1);
  }

  const payload = { dbPath: args.dbPath, userData: args.userData };
  const result = args.mode === 'apply'
    ? relinker.applyArtifactRepair(payload)
    : relinker.previewArtifactRepair(payload);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printSummary(result);
    printCandidatePreview(result);
    if (result?.error) {
      console.error(`[ArtifactRelink] error=${result.error}`);
    }
  }

  if (result && result.error) {
    process.exit(1);
  }
}

main();

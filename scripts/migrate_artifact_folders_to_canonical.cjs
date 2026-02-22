#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runArtifactCanonicalMigration } = require('../electron/helpers/artifactCanonicalMigration.cjs');

function parseArgs(argv) {
  const args = {
    userData: path.join(process.env.APPDATA || '', 'Wildgate Stat Tracker'),
    dbPath: null,
    force: false,
    json: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--force') {
      args.force = true;
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

function printSummary(summary) {
  console.log(`[ArtifactCanonicalMigration] changed=${summary.changed ? 'yes' : 'no'}`);
  console.log(`[ArtifactCanonicalMigration] skipped=${summary.skipped ? 'yes' : 'no'}`);
  if (summary.reason) console.log(`[ArtifactCanonicalMigration] reason=${summary.reason}`);
  console.log(`[ArtifactCanonicalMigration] assignedCanonicalNumbers=${summary.assignedCanonicalNumbers || 0}`);
  console.log(`[ArtifactCanonicalMigration] nextCanonicalMatchNumber=${summary.nextCanonicalMatchNumber || 0}`);
  console.log(`[ArtifactCanonicalMigration] renamedDirs=${summary.renamedDirs || 0}`);
  console.log(`[ArtifactCanonicalMigration] mergedDirs=${summary.mergedDirs || 0}`);
  console.log(`[ArtifactCanonicalMigration] filesMoved=${summary.filesMoved || 0}`);
  console.log(`[ArtifactCanonicalMigration] conflictRenames=${summary.conflictRenames || 0}`);
  console.log(`[ArtifactCanonicalMigration] duplicateFilesDeleted=${summary.duplicateFilesDeleted || 0}`);
  console.log(`[ArtifactCanonicalMigration] orphanDirsProcessed=${summary.orphanDirsProcessed || 0}`);
  console.log(`[ArtifactCanonicalMigration] orphanReattachedFiles=${summary.orphanReattachedFiles || 0}`);
  console.log(`[ArtifactCanonicalMigration] orphanQuarantinedFiles=${summary.orphanQuarantinedFiles || 0}`);
  console.log(`[ArtifactCanonicalMigration] artifactRowsRewritten=${summary.artifactRowsRewritten || 0}`);
  if (summary.backupPath) console.log(`[ArtifactCanonicalMigration] backupPath=${summary.backupPath}`);
  console.log(`[ArtifactCanonicalMigration] elapsedMs=${summary.elapsedMs || 0}`);
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.dbPath)) {
    console.error(`[ArtifactCanonicalMigration] DB file not found: ${args.dbPath}`);
    process.exit(1);
  }
  const summary = runArtifactCanonicalMigration({
    dbPath: args.dbPath,
    userData: args.userData,
    force: args.force,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printSummary(summary);
  }

  if (summary?.skipped && summary.reason && summary.reason !== 'already-migrated' && summary.reason !== 'db-missing') {
    process.exit(1);
  }
}

main();


#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-Time Legacy Screenshot Integration + GCloud Upload
 * 
 * Ingests screenshots from:
 * - Source A: dataset/images/ (workspace dataset images)
 * - Source B: userData/training_data/ (local app-generated training pairs)
 * 
 * Integrates into corpus ground truth and optionally uploads to GCloud.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse command-line arguments
function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    upload: false,
    strict: false,
    sources: ['dataset-images', 'training-data'], // default: both
    truthPath: 'dataset/ocr-corpus/ground-truth.json',
    reportDir: 'dataset/ocr-corpus/reports',
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--apply') {
      args.apply = true;
    } else if (token === '--upload') {
      args.upload = true;
    } else if (token === '--strict') {
      args.strict = true;
    } else if (token === '--sources' && i + 1 < argv.length) {
      args.sources = argv[i + 1].split(',').map(s => s.trim());
    } else if (token === '--truth' && i + 1 < argv.length) {
      args.truthPath = argv[i + 1];
    } else if (token === '--report-dir' && i + 1 < argv.length) {
      args.reportDir = argv[i + 1];
    }
  }

  return args;
}

// Compute SHA-256 hash of file
function computeFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Normalize filename for deduplication
function normalizeFilename(filePath) {
  return path.basename(filePath).toLowerCase().replace(/[_\-\s]+/g, '_');
}

// Generate sampleId from image path
function generateSampleId(imagePath) {
  const basename = path.basename(imagePath, path.extname(imagePath));
  // Try to extract timestamp if present (e.g., capture_2026-02-04T03-16-23-241Z)
  const timestampMatch = basename.match(/(\d{4}-\d{2}-\d{2}T[\d\-]+Z?)/);
  if (timestampMatch) {
    return basename.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
  // Fallback: use hash of filename
  return `legacy_${crypto.createHash('md5').update(basename).digest('hex').substring(0, 8)}`;
}

// Discover images from dataset/images/
function discoverDatasetImages(datasetRoot) {
  const images = [];
  const datasetPath = path.resolve(datasetRoot);
  
  if (!fs.existsSync(datasetPath)) {
    console.warn(`[Ingest] Dataset directory not found: ${datasetPath}`);
    return images;
  }

  const subdirs = ['train', 'val'];
  const imageExts = ['.png', '.jpg', '.jpeg'];

  for (const subdir of subdirs) {
    const subdirPath = path.join(datasetPath, subdir);
    if (!fs.existsSync(subdirPath)) continue;

    const files = fs.readdirSync(subdirPath);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!imageExts.includes(ext)) continue;

      const filePath = path.join(subdirPath, file);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      images.push({
        source: 'dataset-images',
        sourcePath: filePath,
        relativePath: path.relative(process.cwd(), filePath),
        filename: file,
        size: stat.size,
        mtime: stat.mtime,
      });
    }
  }

  return images;
}

// Discover images from userData/training_data/
function discoverTrainingDataImages(userDataRoot) {
  const images = [];
  const trainingPath = path.join(userDataRoot, 'training_data');

  if (!fs.existsSync(trainingPath)) {
    console.warn(`[Ingest] Training data directory not found: ${trainingPath}`);
    return images;
  }

  const files = fs.readdirSync(trainingPath);
  const imageExts = ['.png', '.jpg', '.jpeg'];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!imageExts.includes(ext)) continue;

    // Check for matching JSON label file
    const baseName = path.basename(file, ext);
    const jsonPath = path.join(trainingPath, `${baseName}.json`);
    const hasLabels = fs.existsSync(jsonPath);

    const filePath = path.join(trainingPath, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    images.push({
      source: 'training-data',
      sourcePath: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      filename: file,
      labelPath: hasLabels ? jsonPath : null,
      size: stat.size,
      mtime: stat.mtime,
    });
  }

  return images;
}

// Load existing ground truth
function loadGroundTruth(truthPath) {
  const absPath = path.resolve(truthPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`[Ingest] Ground truth not found, will create new: ${absPath}`);
    return { version: 1, samples: [] };
  }

  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const truth = JSON.parse(content);
    return {
      version: truth.version || 1,
      samples: Array.isArray(truth.samples) ? truth.samples : [],
    };
  } catch (error) {
    throw new Error(`Failed to parse ground truth: ${error.message}`);
  }
}

// Load labels from JSON file (training_data)
function loadLabels(labelPath, strict) {
  if (!labelPath || !fs.existsSync(labelPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(labelPath, 'utf8');
    const labels = JSON.parse(content);
    
    // Validate structure
    if (strict && (!labels.teammates && !labels.opponentTeams && !labels.modifiers)) {
      throw new Error('Label JSON missing required fields (teammates, opponentTeams, or modifiers)');
    }

    return {
      teammates: Array.isArray(labels.teammates) ? labels.teammates : [],
      opponentTeams: Array.isArray(labels.opponentTeams) ? labels.opponentTeams : [],
      modifiers: Array.isArray(labels.modifiers) ? labels.modifiers : [],
    };
  } catch (error) {
    if (strict) {
      throw new Error(`Invalid label JSON (strict mode): ${error.message}`);
    }
    console.warn(`[Ingest] Failed to load labels from ${labelPath}: ${error.message}`);
    return null;
  }
}

// Deduplicate candidates against existing truth
function deduplicateCandidates(candidates, existingTruth, strict = false) {
  // Build deduplication indexes
  const hashIndex = new Map(); // SHA-256 hash -> sampleId
  const filenameIndex = new Map(); // normalized filename -> sampleId
  const sampleIdIndex = new Set(); // existing sampleIds

  for (const sample of existingTruth.samples) {
    if (sample.sampleId) sampleIdIndex.add(sample.sampleId);
    if (sample.imageHash) hashIndex.set(sample.imageHash, sample.sampleId);
    if (sample.imagePath) {
      const norm = normalizeFilename(sample.imagePath);
      filenameIndex.set(norm, sample.sampleId);
    }
  }

  const newSamples = [];
  const skipped = {
    duplicateHash: 0,
    duplicateFilename: 0,
    duplicateSampleId: 0,
    error: 0,
  };

  for (const candidate of candidates) {
    try {
      // Compute hash
      const hash = computeFileHash(candidate.sourcePath);
      
      // Check hash deduplication (primary)
      if (hashIndex.has(hash)) {
        skipped.duplicateHash++;
        continue;
      }

      // Check filename deduplication (secondary)
      const normFilename = normalizeFilename(candidate.filename);
      if (filenameIndex.has(normFilename)) {
        skipped.duplicateFilename++;
        continue;
      }

      // Generate sampleId and check tertiary deduplication
      const sampleId = generateSampleId(candidate.sourcePath);
      if (sampleIdIndex.has(sampleId)) {
        skipped.duplicateSampleId++;
        continue;
      }

      // Load labels if available
      let labels = null;
      if (candidate.labelPath) {
        labels = loadLabels(candidate.labelPath, strict);
      }

      // Create new sample
      const sample = {
        sampleId,
        imagePath: candidate.relativePath,
        imageHash: hash,
        teammates: labels?.teammates || [],
        opponentTeams: labels?.opponentTeams || [],
        modifiers: labels?.modifiers || [],
      };

      newSamples.push({
        sample,
        candidate,
        hash,
      });

      // Update indexes for future deduplication within this batch
      hashIndex.set(hash, sampleId);
      filenameIndex.set(normFilename, sampleId);
      sampleIdIndex.add(sampleId);
    } catch (error) {
      console.error(`[Ingest] Error processing ${candidate.sourcePath}: ${error.message}`);
      skipped.error++;
    }
  }

  return { newSamples, skipped };
}

// Generate ingest report
function generateReport(report, reportDir) {
  const batchId = `ingest_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  report.batchId = batchId;
  report.timestamp = new Date().toISOString();

  // Ensure report directory exists
  fs.mkdirSync(reportDir, { recursive: true });

  // Write JSON report
  const jsonPath = path.join(reportDir, 'legacy-ingest-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`[Ingest] JSON report written: ${jsonPath}`);

  // Write Markdown report
  const mdPath = path.join(reportDir, 'legacy-ingest-report.md');
  const md = `# Legacy Screenshot Ingest Report

**Batch ID**: ${batchId}  
**Timestamp**: ${report.timestamp}  
**Mode**: ${report.dryRun ? 'DRY-RUN' : report.apply ? 'APPLY' : 'DISCOVERY'}

## Summary

| Metric | Value |
|--------|-------|
| Candidates discovered | ${report.candidates.total} |
| - From dataset-images | ${report.candidates.bySource['dataset-images'] || 0} |
| - From training-data | ${report.candidates.bySource['training-data'] || 0} |
| New samples to add | ${report.newSamples.length} |
| Skipped (duplicate hash) | ${report.skipped.duplicateHash} |
| Skipped (duplicate filename) | ${report.skipped.duplicateFilename} |
| Skipped (duplicate sampleId) | ${report.skipped.duplicateSampleId} |
| Errors | ${report.skipped.error} |

## New Samples

${report.newSamples.length === 0 ? '*None*' : report.newSamples.filter(s => s && s.sampleId).map(s => `- \`${s.sampleId}\`: ${s.imagePath} (${s.source})`).join('\n')}

## Upload Summary

${report.upload ? `| Status | Count |
|--------|-------|
| Uploaded | ${report.upload.uploaded || 0} |
| Skipped | ${report.upload.skipped || 0} |
| Failed | ${report.upload.failed || 0} |` : '*Upload not executed*'}

## Rollback

${report.backupPath ? `Backup created: \`${report.backupPath}\`` : '*No backup created*'}
`;

  fs.writeFileSync(mdPath, md);
  console.log(`[Ingest] Markdown report written: ${mdPath}`);

  return { batchId, jsonPath, mdPath };
}

// Main execution
async function main() {
  const args = parseArgs(process.argv);
  
  console.log('[Ingest] Starting legacy screenshot ingest');
  console.log(`[Ingest] Mode: ${args.dryRun ? 'DRY-RUN' : args.apply ? 'APPLY' : 'DISCOVERY'}`);
  console.log(`[Ingest] Sources: ${args.sources.join(', ')}`);
  console.log(`[Ingest] Strict mode: ${args.strict}`);

  // Load existing ground truth
  const existingTruth = loadGroundTruth(args.truthPath);
  console.log(`[Ingest] Existing ground truth: ${existingTruth.samples.length} samples`);

  // Discover candidates
  const candidates = [];
  
  if (args.sources.includes('dataset-images')) {
    const datasetImages = discoverDatasetImages('dataset/images');
    console.log(`[Ingest] Found ${datasetImages.length} images in dataset/images/`);
    candidates.push(...datasetImages);
  }

  if (args.sources.includes('training-data')) {
    // Get userData path (requires Electron app context)
    const electron = require('electron');
    const { app } = electron;
    await app.whenReady();
    const userDataRoot = app.getPath('userData');
    
    const trainingImages = discoverTrainingDataImages(userDataRoot);
    console.log(`[Ingest] Found ${trainingImages.length} images in ${userDataRoot}/training_data/`);
    candidates.push(...trainingImages);
  }

  console.log(`[Ingest] Total candidates: ${candidates.length}`);

  // Deduplicate
  const { newSamples, skipped } = deduplicateCandidates(candidates, existingTruth, args.strict);
  console.log(`[Ingest] New samples: ${newSamples.length}`);
  console.log(`[Ingest] Skipped: ${skipped.duplicateHash} hash, ${skipped.duplicateFilename} filename, ${skipped.duplicateSampleId} sampleId, ${skipped.error} errors`);

  // Build report
  const report = {
    dryRun: args.dryRun,
    apply: args.apply,
    upload: args.upload,
    candidates: {
      total: candidates.length,
      bySource: {
        'dataset-images': candidates.filter(c => c.source === 'dataset-images').length,
        'training-data': candidates.filter(c => c.source === 'training-data').length,
      },
    },
    newSamples: newSamples.map(ns => ({
      sampleId: ns.sample.sampleId,
      imagePath: ns.sample.imagePath,
      source: ns.candidate.source,
      hash: ns.hash,
    })),
    skipped,
    upload: null,
    backupPath: null,
  };

  // Apply changes (if not dry-run)
  if (!args.dryRun && args.apply) {
    // Create backup
    const backupPath = `${args.truthPath}.backup.${Date.now()}`;
    fs.copyFileSync(path.resolve(args.truthPath), backupPath);
    report.backupPath = backupPath;
    console.log(`[Ingest] Backup created: ${backupPath}`);

    // Merge new samples into truth
    const updatedTruth = {
      version: existingTruth.version,
      samples: [...existingTruth.samples, ...newSamples.map(ns => ns.sample)],
    };

    // Write updated truth
    fs.writeFileSync(path.resolve(args.truthPath), JSON.stringify(updatedTruth, null, 2));
    console.log(`[Ingest] Updated ground truth: ${updatedTruth.samples.length} samples (added ${newSamples.length})`);
  }

  // Upload to GCloud (if requested)
  if (!args.dryRun && args.upload && newSamples.length > 0) {
    console.log('[Ingest] Starting GCloud upload...');
    
    const gcloudSyncService = require(path.resolve('electron/gcloudSyncService.cjs'));
    
    // Initialize if needed (using same pattern as main.cjs)
    if (!gcloudSyncService.isInitialized) {
      console.log('[Ingest] Initializing GCloud Sync Service...');
      const electron = require('electron');
      const { app } = electron;
      await app.whenReady();
      
      const GCLOUD_KEY =
        process.env.WILDGATE_GCLOUD_KEY ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        path.join(app.getPath('documents'), 'GCloudInfo', 'service-account.json');
      const GCLOUD_BUCKET = process.env.WILDGATE_GCLOUD_BUCKET || 'wildgate-training-heeatpie';
      
      if (fs.existsSync(GCLOUD_KEY)) {
        await gcloudSyncService.initialize(GCLOUD_KEY, GCLOUD_BUCKET);
      } else {
        console.warn('[Ingest] GCloud key file not found, skipping upload');
        console.warn(`[Ingest] Expected key at: ${GCLOUD_KEY}`);
        report.upload = {
          uploaded: 0,
          skipped: newSamples.length,
          failed: 0,
          error: 'GCloud not initialized (key file not found)',
        };
        const reportPaths = generateReport(report, args.reportDir);
        console.log('[Ingest] Complete (upload skipped)');
        console.log(`[Ingest] Report: ${reportPaths.mdPath}`);
        process.exit(0);
      }
    }

    const uploadResults = {
      uploaded: 0,
      skipped: 0,
      failed: 0,
    };

    const batchId = `ingest_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    for (const ns of newSamples) {
      const remotePath = `_ingest/${batchId}/${path.basename(ns.candidate.sourcePath)}`;
      const result = await gcloudSyncService.uploadFile(ns.candidate.sourcePath, remotePath, 2);
      
      if (result.success) {
        uploadResults.uploaded++;
      } else {
        uploadResults.failed++;
        console.error(`[Ingest] Upload failed for ${ns.candidate.sourcePath}: ${result.error}`);
      }

      // Upload label file if present
      if (ns.candidate.labelPath) {
        const labelRemotePath = `_ingest/${batchId}/${path.basename(ns.candidate.labelPath)}`;
        const labelResult = await gcloudSyncService.uploadFile(ns.candidate.labelPath, labelRemotePath, 2);
        if (labelResult.success) {
          uploadResults.uploaded++;
        } else {
          uploadResults.failed++;
        }
      }
    }

    report.upload = uploadResults;
    console.log(`[Ingest] Upload complete: ${uploadResults.uploaded} uploaded, ${uploadResults.failed} failed`);
  }

  // Generate reports
  const reportPaths = generateReport(report, args.reportDir);
  
  console.log('[Ingest] Complete');
  console.log(`[Ingest] Report: ${reportPaths.mdPath}`);

  process.exit(0);
}

// Run
main().catch(error => {
  console.error('[Ingest] Fatal error:', error);
  process.exit(1);
});

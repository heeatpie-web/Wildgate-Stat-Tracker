/**
 * Test New OCR System - Verify the redesigned OCR extraction
 * Tests: colorUtils, screenDetector, crewHubExtractor, mapScreenExtractor, ocrMerger
 *
 * Usage: node test-new-ocr.cjs
 */

const fs = require('fs');
const path = require('path');

// Test images - CORRECTED based on visual inspection
const TEST_IMAGES = {
  crewHub: path.join(__dirname, '../dataset/images/train/capture_2026-02-04T08-21-06-645Z.png'),  // Actual Crew Hub
  mapScreen: path.join(__dirname, '../dataset/images/train/capture_2026-02-04T08-22-46-561Z.png'), // Map Screen with hazards visible
};

// Expected results for validation (names from actual screenshots)
const EXPECTED = {
  crewHub: {
    teammates: ['AlixThus', 'c0mbat_Barbi3', 'ScareQro', 'oSalad'], // Fixed: oSalad not oSa1ad
    enemyTeams: [
      { name: 'MURDER SPAGHURDER', color: 'red', players: ['NightmareGMC', 'SHTER', 'JACR1907', 'gaowang134'] },
      { name: 'MEANR THAN AVG', color: 'orange', players: ['littleleaves', '好果汁儿分你一半', 'PermanentWinner', 'MYNWINER'] },
    ],
  },
  mapScreen: {
    yourShip: { shipType: 'Hunter' },
    hazards: ['Healing Artifact', 'Ancient Vault', 'Lava Epics', 'Low Altitude Fog', 'Legion Patrols', 'Few Ships'],
  },
};

async function loadDependencies() {
  console.log('📦 Loading dependencies...');

  const Tesseract = require('tesseract.js');
  const sharp = require('sharp');

  // Load our modules
  const { detectScreenType, detectScreenTypeFromLines, SCREEN_TYPES } = require('./screenDetector.cjs');
  const { extractCrewHub } = require('./crewHubExtractor.cjs');
  const { extractMapScreen, KNOWN_HAZARDS } = require('./mapScreenExtractor.cjs');
  const { mergeCaptures, isSameMatch } = require('./ocrMerger.cjs');
  const colorUtils = require('./colorUtils.cjs');

  console.log('✅ All modules loaded successfully\n');

  return { Tesseract, sharp, detectScreenType, detectScreenTypeFromLines, SCREEN_TYPES,
           extractCrewHub, extractMapScreen, KNOWN_HAZARDS, mergeCaptures, isSameMatch, colorUtils };
}

async function runOCR(Tesseract, imageBuffer) {
  console.log('   Running Tesseract OCR (eng+chi_sim)...');
  const startTime = Date.now();

  const result = await Tesseract.recognize(imageBuffer, 'eng+chi_sim', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r   Progress: ${Math.round(m.progress * 100)}%   `);
      }
    }
  });

  const elapsed = Date.now() - startTime;
  console.log(`\n   ✅ OCR complete in ${elapsed}ms`);
  console.log(`   Words: ${result.data.words?.length || 0}, Lines: ${result.data.lines?.length || 0}`);

  // Convert to expected format
  return {
    text: result.data.text || '',
    confidence: result.data.confidence || 0,
    words: (result.data.words || []).map(w => ({
      text: w.text || '',
      confidence: w.confidence || 0,
      bbox: w.bbox ? {
        x0: w.bbox.x0 || 0,
        y0: w.bbox.y0 || 0,
        x1: w.bbox.x1 || 0,
        y1: w.bbox.y1 || 0,
      } : { x0: 0, y0: 0, x1: 0, y1: 0 },
    })),
    lines: (result.data.lines || []).map(l => ({
      text: l.text || '',
      confidence: l.confidence || 0,
      bbox: l.bbox ? {
        x0: l.bbox.x0 || 0,
        y0: l.bbox.y0 || 0,
        x1: l.bbox.x1 || 0,
        y1: l.bbox.y1 || 0,
      } : { x0: 0, y0: 0, x1: 0, y1: 0 },
    })),
  };
}

async function preprocessImage(sharp, imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  console.log(`   Original: ${metadata.width}x${metadata.height}`);

  // Scale up small images for better OCR (matches ocrHandler.cjs logic)
  const scale = metadata.width < 2000 ? 2 : 1;

  // Use SAME preprocessing as ocrHandler.cjs for consistent results
  const processed = await sharp(imageBuffer)
    .resize(metadata.width * scale, metadata.height * scale, {
      kernel: sharp.kernel.nearest,
    })
    .modulate({
      brightness: 1.1,
      saturation: 1.0, // Keep colors intact for team color detection
    })
    .linear(1.2, -(0.2 * 128)) // Contrast enhancement
    .sharpen({
      sigma: 1,
      m1: 1,
      m2: 0.5,
    })
    .png()
    .toBuffer();

  return {
    buffer: processed,
    width: metadata.width * scale,
    height: metadata.height * scale,
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    scale,
  };
}

function compareResults(actual, expected, label) {
  let matches = 0;
  let misses = 0;

  for (const exp of expected) {
    const expLower = exp.toLowerCase();
    const found = actual.some(a => {
      const aLower = (typeof a === 'string' ? a : a.name || '').toLowerCase();

      // Direct substring match (handles noise prefix/suffix like "fagrAlixThus")
      if (aLower.includes(expLower) || expLower.includes(aLower)) return true;

      // Fuzzy match with lenient threshold
      if (levenshteinDistance(aLower, expLower) <= 3) return true;

      // Check if core name is contained (strip digits and short prefixes)
      const aCore = aLower.replace(/^\w{0,4}/, '').replace(/\d+$/, '');
      const expCore = expLower.replace(/\d+$/, '');
      if (aCore.includes(expCore) || expCore.includes(aCore)) return true;
      if (aCore.length > 4 && expCore.length > 4 && levenshteinDistance(aCore, expCore) <= 2) return true;

      return false;
    });

    if (found) {
      matches++;
      console.log(`      ✅ Found: ${exp}`);
    } else {
      misses++;
      console.log(`      ❌ Missing: ${exp}`);
    }
  }

  return { matches, misses, total: expected.length };
}

function levenshteinDistance(s1, s2) {
  const m = s1.length, n = s2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i-1] === s2[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

async function testCrewHub(deps) {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 TEST 1: CREW HUB EXTRACTION');
  console.log('═'.repeat(70));

  const imagePath = TEST_IMAGES.crewHub;
  if (!fs.existsSync(imagePath)) {
    console.log('❌ Test image not found:', imagePath);
    return { passed: false, error: 'Image not found' };
  }

  console.log('📁 Image:', path.basename(imagePath));

  // Load and preprocess
  const imageBuffer = fs.readFileSync(imagePath);
  console.log('🔧 Preprocessing image...');
  const processed = await preprocessImage(deps.sharp, imageBuffer);
  console.log(`   Dimensions: ${processed.width}x${processed.height} (scale: ${processed.scale}x)`);

  // Run OCR
  const ocrResult = await runOCR(deps.Tesseract, processed.buffer);

  // Detect screen type
  console.log('\n📋 Screen Detection:');
  const screenType = deps.detectScreenTypeFromLines(ocrResult.lines, processed.width, processed.height);
  console.log(`   Type: ${screenType.type} (confidence: ${screenType.confidence}%)`);

  if (screenType.type !== deps.SCREEN_TYPES.CREW_HUB) {
    console.log('   ⚠️  Expected CREW_HUB, got', screenType.type);
  } else {
    console.log('   ✅ Correctly identified as Crew Hub');
  }

  // Extract data
  console.log('\n🎯 Extracting Crew Hub data...');
  const extracted = await deps.extractCrewHub(
    processed.buffer,
    'AlixThus', // activeUser
    ocrResult,
    processed.width,
    processed.height,
    processed.scale // Pass scale for accurate color detection
  );

  // Display results
  console.log('\n📊 EXTRACTION RESULTS:');
  console.log('─'.repeat(50));

  console.log(`\n   Your Team: "${extracted.yourTeam?.name || '(not found)'}"`);
  console.log(`   Teammates (${extracted.yourTeam?.players?.length || 0}):`);
  (extracted.yourTeam?.players || []).forEach((p, i) => {
    console.log(`      ${i+1}. ${p}`);
  });

  console.log(`\n   Enemy Teams (${extracted.enemyTeams?.length || 0}):`);
  (extracted.enemyTeams || []).forEach((team, i) => {
    console.log(`   ${i+1}. ${team.name} [${team.color}] - ${team.players?.length || 0} players`);
    (team.players || []).forEach((p, j) => {
      console.log(`      ${j+1}. ${p}`);
    });
  });

  // Validation
  console.log('\n✅ VALIDATION:');
  console.log('─'.repeat(50));

  console.log('\n   Teammates:');
  const teammateResult = compareResults(
    extracted.yourTeam?.players || [],
    EXPECTED.crewHub.teammates,
    'teammates'
  );

  console.log('\n   Enemy Players:');
  const allEnemyPlayers = (extracted.enemyTeams || []).flatMap(t => t.players || []);
  const expectedEnemyPlayers = EXPECTED.crewHub.enemyTeams.flatMap(t => t.players);
  const enemyResult = compareResults(allEnemyPlayers, expectedEnemyPlayers, 'enemies');

  const totalMatches = teammateResult.matches + enemyResult.matches;
  const totalExpected = teammateResult.total + enemyResult.total;
  const accuracy = Math.round((totalMatches / totalExpected) * 100);

  console.log(`\n   📈 Overall Accuracy: ${totalMatches}/${totalExpected} (${accuracy}%)`);

  return {
    passed: accuracy >= 50,
    accuracy,
    extracted,
    teammateResult,
    enemyResult,
  };
}

async function testMapScreen(deps) {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 TEST 2: MAP SCREEN EXTRACTION');
  console.log('═'.repeat(70));

  const imagePath = TEST_IMAGES.mapScreen;
  if (!fs.existsSync(imagePath)) {
    console.log('❌ Test image not found:', imagePath);
    return { passed: false, error: 'Image not found' };
  }

  console.log('📁 Image:', path.basename(imagePath));

  // Load and preprocess
  const imageBuffer = fs.readFileSync(imagePath);
  console.log('🔧 Preprocessing image...');
  const processed = await preprocessImage(deps.sharp, imageBuffer);
  console.log(`   Dimensions: ${processed.width}x${processed.height} (scale: ${processed.scale}x)`);

  // Run OCR
  const ocrResult = await runOCR(deps.Tesseract, processed.buffer);

  // Detect screen type
  console.log('\n📋 Screen Detection:');
  const screenType = deps.detectScreenTypeFromLines(ocrResult.lines, processed.width, processed.height);
  console.log(`   Type: ${screenType.type} (confidence: ${screenType.confidence}%)`);

  if (screenType.type !== deps.SCREEN_TYPES.MAP_SCREEN) {
    console.log('   ⚠️  Expected MAP_SCREEN, got', screenType.type);
  } else {
    console.log('   ✅ Correctly identified as Map Screen');
  }

  // Extract data
  console.log('\n🎯 Extracting Map Screen data...');
  const extracted = await deps.extractMapScreen(
    processed.buffer,
    ocrResult,
    processed.width,
    processed.height
  );

  // Display results
  console.log('\n📊 EXTRACTION RESULTS:');
  console.log('─'.repeat(50));

  console.log(`\n   Your Ship: ${extracted.yourShip?.shipType || '(not found)'}`);
  console.log(`   Team Name: ${extracted.yourShip?.teamName || '(not found)'}`);

  console.log(`\n   Enemy Ships (${extracted.enemyShips?.length || 0}):`);
  (extracted.enemyShips || []).forEach((ship, i) => {
    console.log(`   ${i+1}. ${ship.teamName} - ${ship.shipType} [${ship.color}]`);
  });

  console.log(`\n   Hazards (${extracted.hazards?.length || 0}):`);
  (extracted.hazards || []).forEach((h, i) => {
    console.log(`   ${i+1}. ${h}`);
  });

  console.log(`\n   Players (${extracted.players?.length || 0}):`);
  (extracted.players || []).forEach((p, i) => {
    console.log(`   ${i+1}. ${p}`);
  });

  // Validation
  console.log('\n✅ VALIDATION:');
  console.log('─'.repeat(50));

  console.log('\n   Ship Type:');
  const shipMatch = extracted.yourShip?.shipType?.toLowerCase() === EXPECTED.mapScreen.yourShip.shipType.toLowerCase();
  console.log(`      ${shipMatch ? '✅' : '❌'} Your Ship: ${extracted.yourShip?.shipType || '(none)'} (expected: ${EXPECTED.mapScreen.yourShip.shipType})`);

  console.log('\n   Hazards:');
  const hazardResult = compareResults(
    extracted.hazards || [],
    EXPECTED.mapScreen.hazards,
    'hazards'
  );

  const hazardAccuracy = Math.round((hazardResult.matches / hazardResult.total) * 100);
  console.log(`\n   📈 Hazard Accuracy: ${hazardResult.matches}/${hazardResult.total} (${hazardAccuracy}%)`);

  return {
    passed: shipMatch && hazardAccuracy >= 50,
    shipMatch,
    hazardAccuracy,
    extracted,
  };
}

async function testColorUtils(deps) {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 TEST 3: COLOR UTILITIES');
  console.log('═'.repeat(70));

  const testColors = [
    { rgb: [255, 0, 0], expected: 'red', name: 'Pure Red' },
    { rgb: [254, 99, 0], expected: 'orange', name: 'Orange' },
    { rgb: [255, 178, 0], expected: 'yellow', name: 'Yellow' },
    { rgb: [184, 184, 0], expected: 'yellowGreen', name: 'Yellow-Green' },
    { rgb: [0, 253, 205], expected: 'cyan', name: 'Cyan' },
    { rgb: [50, 50, 50], expected: 'unknown', name: 'Dark Gray (should be unknown)' },
  ];

  let passed = 0;

  for (const test of testColors) {
    const result = deps.colorUtils.classifyTeamColorHSL(...test.rgb);
    const match = result.color === test.expected;
    console.log(`   ${match ? '✅' : '❌'} ${test.name}: ${result.color} (expected: ${test.expected}, confidence: ${result.confidence}%)`);
    if (match) passed++;
  }

  console.log(`\n   📈 Color Detection: ${passed}/${testColors.length} correct`);

  return { passed: passed === testColors.length, score: passed, total: testColors.length };
}

async function main() {
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(20) + 'OCR SYSTEM VERIFICATION' + ' '.repeat(25) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('\nTesting the redesigned OCR system components...\n');

  try {
    const deps = await loadDependencies();

    const results = {
      colorUtils: await testColorUtils(deps),
      crewHub: await testCrewHub(deps),
      mapScreen: await testMapScreen(deps),
    };

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📋 TEST SUMMARY');
    console.log('═'.repeat(70));

    console.log(`\n   Color Utils:  ${results.colorUtils.passed ? '✅ PASSED' : '❌ FAILED'} (${results.colorUtils.score}/${results.colorUtils.total})`);
    console.log(`   Crew Hub:     ${results.crewHub.passed ? '✅ PASSED' : '❌ FAILED'} (${results.crewHub.accuracy || 0}% accuracy)`);
    console.log(`   Map Screen:   ${results.mapScreen.passed ? '✅ PASSED' : '❌ FAILED'} (ship: ${results.mapScreen.shipMatch ? 'yes' : 'no'}, hazards: ${results.mapScreen.hazardAccuracy || 0}%)`);

    const allPassed = results.colorUtils.passed && results.crewHub.passed && results.mapScreen.passed;
    console.log(`\n   Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);
    console.log('\n' + '═'.repeat(70) + '\n');

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

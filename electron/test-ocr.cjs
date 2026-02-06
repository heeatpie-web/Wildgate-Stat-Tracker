/**
 * Test OCR Extraction - Verify name extraction works correctly
 * Usage: node test-ocr.cjs <path-to-crew-hub-screenshot.png>
 */

const fs = require('fs');
const Tesseract = require('tesseract.js');
const { extractCrewHubAccurate } = require('./accurateOcrExtractor.cjs');

async function testOCR(imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.error('❌ File not found:', imagePath);
    process.exit(1);
  }

  console.log('🔍 Testing OCR extraction on:', imagePath);
  console.log('─'.repeat(60));

  // Read image
  const imageBuffer = fs.readFileSync(imagePath);

  // Get image dimensions (simple PNG parser)
  let width = 1920;
  let height = 1080;

  try {
    // PNG header check
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      width = imageBuffer.readUInt32BE(16);
      height = imageBuffer.readUInt32BE(20);
      console.log('📐 Image size:', width, 'x', height);
    }
  } catch (e) {
    console.log('⚠️  Using default dimensions:', width, 'x', height);
  }

  console.log('\n📸 Running OCR...');

  // Run OCR
  const result = await Tesseract.recognize(imageBuffer, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r   Progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  console.log('\n\n✅ OCR Complete');
  console.log('   Words detected:', result.data.words.length);
  console.log('─'.repeat(60));

  // Extract using accurate extractor
  console.log('\n🎯 Extracting players...\n');

  const extracted = await extractCrewHubAccurate(
    result,
    imageBuffer,
    width,
    height
  );

  // Display results
  console.log('\n📊 EXTRACTION RESULTS:');
  console.log('─'.repeat(60));

  console.log('\n👥 TEAMMATES:', extracted.teammates.length);
  if (extracted.teammates.length > 0) {
    extracted.teammates.forEach((player, i) => {
      console.log(`   ${i + 1}. ${player.name} (confidence: ${player.confidence}%)`);
    });
  } else {
    console.log('   (none found)');
  }

  console.log('\n⚔️  ENEMY TEAMS:', extracted.opponentTeams.length);
  if (extracted.opponentTeams.length > 0) {
    extracted.opponentTeams.forEach((team, i) => {
      console.log(`   ${i + 1}. ${team.teamName} (${team.color}) - ${team.players.length} players`);
      team.players.forEach((player, j) => {
        console.log(`      ${j + 1}. ${player.name} (confidence: ${player.confidence}%)`);
      });
    });
  } else {
    console.log('   (none found)');
  }

  console.log('\n' + '─'.repeat(60));

  // Show expected vs actual
  console.log('\n💡 EXPECTED TEAMMATES:');
  console.log('   1. AlixThus');
  console.log('   2. c0mbat_Barbi3');
  console.log('   3. ScareQro');
  console.log('   4. oSa1ad');

  console.log('\n💡 EXPECTED ENEMY TEAMS:');
  console.log('   1. MURDER SPAGHURDER (red) - 4 players');
  console.log('   2. MEANR THAN AVG (orange) - 4 players');

  console.log('\n' + '─'.repeat(60));
  console.log('\n✨ Test complete!\n');
}

// Run test
const imagePath = process.argv[2];
if (!imagePath) {
  console.log('Usage: node test-ocr.cjs <path-to-crew-hub-screenshot.png>');
  console.log('\nExample:');
  console.log('  node test-ocr.cjs "C:\\path\\to\\crew-hub-screenshot.png"');
  process.exit(1);
}

testOCR(imagePath).catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});

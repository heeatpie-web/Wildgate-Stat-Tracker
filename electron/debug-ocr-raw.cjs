/**
 * Debug OCR - Show raw OCR output to understand what's being detected
 */

const fs = require('fs');
const Tesseract = require('tesseract.js');

async function debugOCR(imagePath) {
  console.log('🔍 Reading:', imagePath);

  const imageBuffer = fs.readFileSync(imagePath);

  console.log('\n📸 Running OCR...\n');
  const result = await Tesseract.recognize(imageBuffer, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\rProgress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  console.log('\n\n✅ OCR Complete\n');
  console.log('═'.repeat(80));
  console.log('RAW TEXT OUTPUT:');
  console.log('═'.repeat(80));
  console.log(result.data.text);
  console.log('\n' + '═'.repeat(80));
  console.log('WORD-LEVEL OUTPUT (with positions):');
  console.log('═'.repeat(80));

  const words = result.data.words || [];
  const width = 3840; // Known from previous test
  const LEFT_MAX = width * 0.35;
  const RIGHT_MIN = width * 0.60;

  for (const word of words) {
    if (!word.bbox || !word.text) continue;

    const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;

    let zone = 'MIDDLE';
    if (centerX < LEFT_MAX) zone = 'LEFT';
    else if (centerX >= RIGHT_MIN) zone = 'RIGHT';

    const text = word.text.trim();
    if (text.length < 2) continue; // Skip very short

    console.log(`[${zone.padEnd(6)}] x:${Math.round(centerX).toString().padStart(4)} y:${Math.round(centerY).toString().padStart(4)} | "${text}"`);
  }

  console.log('\n' + '═'.repeat(80));
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.log('Usage: node debug-ocr-raw.cjs <image-path>');
  process.exit(1);
}

debugOCR(imagePath).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

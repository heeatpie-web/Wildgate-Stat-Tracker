const fs = require('fs');

const file = 'src/components/ocr/OCRReviewModal.tsx';
const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);
const needles = ['overflow', 'Ship', 'teammate', 'opponent', 'scroll', 'icon', 'name'];

for (let i = 0; i < lines.length; i++) {
  const lc = lines[i].toLowerCase();
  if (!needles.some((n) => lc.includes(n.toLowerCase()))) continue;
  if (
    !lc.includes('overflow')
    && !lc.includes('ship')
    && !lc.includes('teammate')
    && !lc.includes('opponent')
    && !lc.includes('scroll')
    && !lc.includes('icon')
  ) {
    continue;
  }
  const start = Math.max(0, i - 3);
  const end = Math.min(lines.length - 1, i + 3);
  console.log(`--- ${i + 1} ---`);
  for (let j = start; j <= end; j++) {
    const mark = j === i ? '>' : ' ';
    console.log(`${mark}${String(j + 1).padStart(4, ' ')}: ${lines[j]}`);
  }
}

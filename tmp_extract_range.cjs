const fs = require('fs');

const file = process.argv[2];
const start = Number(process.argv[3] || 1);
const count = Number(process.argv[4] || 200);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const from = Math.max(1, start);
const to = Math.min(lines.length, from + count - 1);
for (let i = from; i <= to; i++) {
  console.log(`${String(i).padStart(5, ' ')}: ${lines[i - 1]}`);
}

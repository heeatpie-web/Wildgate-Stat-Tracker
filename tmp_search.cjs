const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'src';
const needle = (process.argv[3] || '').toLowerCase();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', '.visual'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (exts.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

for (const file of walk(root)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(needle)) {
      console.log(`${file}:${i + 1}:${lines[i]}`);
    }
  }
}

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(process.cwd(), 'src');
const ALLOWLIST_PATH = path.join(__dirname, 'ui-hardcoded-allowlist.json');
const REPORT_DIR = path.join(process.cwd(), '.visual');
const JSON_REPORT = path.join(REPORT_DIR, 'ui-hardcoded-report.json');
const MD_REPORT = path.join(REPORT_DIR, 'ui-hardcoded-report.md');

function walkFiles(rootPath) {
  const out = [];
  if (!fs.existsSync(rootPath)) return out;
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && /\.(tsx?|jsx?)$/i.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isHumanText(value) {
  if (!value) return false;
  if (value.length < 3) return false;
  if (/^[\d\s.,:%/+-]+$/.test(value)) return false;
  if (/[{}$]/.test(value)) return false;
  return /[A-Za-z]/.test(value);
}

function loadAllowlist() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf-8'));
    if (!Array.isArray(parsed.allow)) return new Set();
    return new Set(parsed.allow.map(v => normalizeText(v)));
  } catch {
    return new Set();
  }
}

function auditFile(filePath, allowlist) {
  const findings = [];
  let text = '';
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return findings;
  }

  const regex = />\s*([^<>{}\n][^<>{}]*)\s*</g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const value = normalizeText(match[1]);
    if (!isHumanText(value)) continue;
    if (allowlist.has(value)) continue;
    findings.push({
      file: path.relative(process.cwd(), filePath),
      value,
      index: match.index,
    });
  }
  return findings;
}

function writeReports(findings, fileCount) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const grouped = {};
  for (const finding of findings) {
    if (!grouped[finding.file]) grouped[finding.file] = [];
    grouped[finding.file].push(finding.value);
  }

  const jsonPayload = {
    scannedFiles: fileCount,
    findingCount: findings.length,
    grouped,
  };
  fs.writeFileSync(JSON_REPORT, `${JSON.stringify(jsonPayload, null, 2)}\n`, 'utf-8');

  const lines = [
    '# UI Hardcoded Text Audit',
    '',
    `- Scanned files: ${fileCount}`,
    `- Findings: ${findings.length}`,
    '',
  ];
  for (const [file, values] of Object.entries(grouped)) {
    lines.push(`## ${file}`);
    for (const value of values.slice(0, 50)) {
      lines.push(`- ${value}`);
    }
    if (values.length > 50) lines.push(`- ... ${values.length - 50} more`);
    lines.push('');
  }
  fs.writeFileSync(MD_REPORT, `${lines.join('\n')}\n`, 'utf-8');
}

function main() {
  const strict = process.argv.includes('--strict');
  const allowlist = loadAllowlist();
  const files = walkFiles(SRC_ROOT);
  const findings = files.flatMap(file => auditFile(file, allowlist));
  writeReports(findings, files.length);

  console.log(`[ui-hardcoded-audit] scanned=${files.length} findings=${findings.length}`);
  console.log(`[ui-hardcoded-audit] report=${JSON_REPORT}`);
  if (strict && findings.length > 0) {
    process.exit(1);
  }
}

main();

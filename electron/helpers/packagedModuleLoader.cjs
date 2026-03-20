const fs = require('fs');
const path = require('path');

function normalizeModuleName(moduleName) {
  return String(moduleName || '')
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function buildCandidatePaths(moduleName) {
  const normalizedModuleName = normalizeModuleName(moduleName);
  if (!normalizedModuleName) return [];

  const seen = new Set();
  const candidates = [];
  const addCandidate = (candidatePath) => {
    const normalizedPath = String(candidatePath || '').trim();
    if (!normalizedPath) return;
    const key = normalizedPath.replace(/[\\/]+/g, '\\').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(normalizedPath);
  };

  if (process.resourcesPath) {
    addCandidate(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', normalizedModuleName));
    addCandidate(path.join(process.resourcesPath, 'node_modules', normalizedModuleName));
  }

  addCandidate(path.join(__dirname, '..', '..', 'node_modules', normalizedModuleName));
  addCandidate(path.join(process.cwd(), 'node_modules', normalizedModuleName));

  return candidates;
}

function canAttemptRequire(candidatePath) {
  try {
    if (!candidatePath || !fs.existsSync(candidatePath)) return false;
    const stat = fs.statSync(candidatePath);
    if (stat.isDirectory()) {
      return (
        fs.existsSync(path.join(candidatePath, 'package.json'))
        || fs.existsSync(path.join(candidatePath, 'index.js'))
        || fs.existsSync(path.join(candidatePath, 'index.cjs'))
      );
    }
    return stat.isFile();
  } catch {
    return false;
  }
}

function requirePackagedModule(moduleName) {
  try {
    return require(moduleName);
  } catch (directError) {
    const candidates = buildCandidatePaths(moduleName);
    const attemptedFallbacks = [];

    for (const candidate of candidates) {
      if (!canAttemptRequire(candidate)) continue;
      attemptedFallbacks.push(candidate);
      try {
        return require(candidate);
      } catch {
        // Try the next packaged candidate.
      }
    }

    const fallbackSummary = attemptedFallbacks.length > 0
      ? attemptedFallbacks.join(', ')
      : buildCandidatePaths(moduleName).join(', ');
    const detail = fallbackSummary
      ? ` Tried packaged fallbacks: ${fallbackSummary}`
      : '';
    if (directError && typeof directError === 'object') {
      directError.message = `${directError.message || `Cannot load ${moduleName}`}.${detail}`.trim();
    }
    throw directError;
  }
}

module.exports = {
  buildCandidatePaths,
  requirePackagedModule,
};

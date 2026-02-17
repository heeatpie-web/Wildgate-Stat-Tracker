const fsPromises = require('fs').promises;
const path = require('path');

const MAX_MATCH_HISTORY = 2000;
const MAX_NAME_LENGTH = 80;
const MAX_VARIATIONS_PER_NAME = 16;

const OCR_SUBSTITUTIONS = {
  '0': ['O', 'o'],
  O: ['0'],
  o: ['0'],
  '1': ['I', 'i', 'l', 'L'],
  I: ['1', 'l'],
  i: ['1', 'l'],
  l: ['1', 'I'],
  L: ['1', 'I'],
};

function normalizePilotName(value) {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact || compact.length > MAX_NAME_LENGTH) return null;
  return compact.replace(/[\r\n\t]/g, '').trim();
}

function uniquePilots(pilotRegistry) {
  if (!Array.isArray(pilotRegistry)) return [];
  const seen = new Set();
  const out = [];
  for (const rawName of pilotRegistry) {
    const name = normalizePilotName(rawName);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function frequencyIncrement(map, name, weight = 1) {
  const normalized = normalizePilotName(name);
  if (!normalized) return;
  const key = normalized.toLowerCase();
  map.set(key, (map.get(key) || 0) + Math.max(1, Number(weight) || 1));
}

function collectPilotFrequency(matchHistory) {
  const frequency = new Map();
  if (!Array.isArray(matchHistory)) return frequency;
  const safeMatches = matchHistory.slice(-MAX_MATCH_HISTORY);

  for (const match of safeMatches) {
    if (!match || typeof match !== 'object') continue;
    frequencyIncrement(frequency, match.player, 3);

    const teammates = Array.isArray(match.teammates) ? match.teammates : [];
    for (const teammate of teammates) frequencyIncrement(frequency, teammate, 2);

    const opponents = Array.isArray(match.opponents) ? match.opponents : [];
    for (const opponent of opponents) frequencyIncrement(frequency, opponent, 1);

    const opponentTeams = Array.isArray(match.opponentTeams) ? match.opponentTeams : [];
    for (const team of opponentTeams) {
      const players = Array.isArray(team?.players) ? team.players : [];
      for (const player of players) frequencyIncrement(frequency, player, 1);
    }
  }

  return frequency;
}

function sortPilotsByFrequency(pilots, frequencyMap) {
  return [...pilots].sort((a, b) => {
    const aWeight = frequencyMap.get(a.toLowerCase()) || 0;
    const bWeight = frequencyMap.get(b.toLowerCase()) || 0;
    if (aWeight !== bWeight) return bWeight - aWeight;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

function generateOcrVariations(name, maxVariants = MAX_VARIATIONS_PER_NAME) {
  const normalized = normalizePilotName(name);
  if (!normalized) return [];

  const chars = Array.from(normalized);
  const variants = new Set();
  const substitutions = [];

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    const replacements = OCR_SUBSTITUTIONS[char];
    if (!Array.isArray(replacements) || replacements.length === 0) continue;
    for (const replacement of replacements) {
      substitutions.push({ index: i, replacement });
    }
  }

  const pushVariant = (variant) => {
    const clean = normalizePilotName(variant);
    if (!clean) return;
    if (clean === normalized) return;
    if (variants.size >= maxVariants) return;
    variants.add(clean);
  };

  for (const op of substitutions) {
    if (variants.size >= maxVariants) break;
    const next = [...chars];
    next[op.index] = op.replacement;
    pushVariant(next.join(''));
  }

  for (let i = 0; i < substitutions.length; i += 1) {
    if (variants.size >= maxVariants) break;
    for (let j = i + 1; j < substitutions.length; j += 1) {
      if (variants.size >= maxVariants) break;
      if (substitutions[i].index === substitutions[j].index) continue;
      const next = [...chars];
      next[substitutions[i].index] = substitutions[i].replacement;
      next[substitutions[j].index] = substitutions[j].replacement;
      pushVariant(next.join(''));
    }
  }

  return Array.from(variants);
}

function buildDictionaryWords(sortedPilots) {
  const words = [];
  const seen = new Set();

  const addWord = (value) => {
    const normalized = normalizePilotName(value);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    words.push(normalized);
  };

  for (const pilot of sortedPilots) {
    addWord(pilot);
    addWord(pilot.toLowerCase());

    const pieces = pilot.split(/[\s_-]+/g).map(part => normalizePilotName(part)).filter(Boolean);
    for (const piece of pieces) {
      addWord(piece);
      addWord(piece.toLowerCase());
    }

    const variants = generateOcrVariations(pilot, MAX_VARIATIONS_PER_NAME);
    for (const variation of variants) {
      addWord(variation);
      addWord(variation.toLowerCase());
    }
  }

  return words;
}

async function generateUserWordsFile({ pilotRegistry = [], matchHistory = [], outputPath }) {
  const pilots = uniquePilots(pilotRegistry);
  if (pilots.length === 0) {
    throw new Error('No pilot names provided for OCR dictionary generation');
  }

  const frequencyMap = collectPilotFrequency(matchHistory);
  const sortedPilots = sortPilotsByFrequency(pilots, frequencyMap);
  const words = buildDictionaryWords(sortedPilots);

  if (words.length === 0) {
    throw new Error('Dictionary generation produced no usable words');
  }

  const content = `${words.join('\n')}\n`;
  const generatedAt = Date.now();
  let filePath = null;

  if (outputPath && typeof outputPath === 'string') {
    const resolved = path.resolve(outputPath);
    await fsPromises.mkdir(path.dirname(resolved), { recursive: true });
    await fsPromises.writeFile(resolved, content, 'utf8');
    filePath = resolved;
  }

  return {
    generatedAt,
    pilotCount: sortedPilots.length,
    totalWords: words.length,
    topPilots: sortedPilots.slice(0, 10),
    filePath,
    content,
  };
}

module.exports = {
  generateUserWordsFile,
  generateOcrVariations,
};

/**
 * @module electron/helpers/canonicalMatchNumbers
 * Shared helpers for assigning and resolving stable canonical match numbers.
 */

function toPositiveInt(value) {
  const parsed = Number(value || 0);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseMatchSortTimestamp(match) {
  if (!match || typeof match !== 'object') return 0;
  const ts = Number(match.timestamp || 0);
  if (Number.isFinite(ts) && ts > 0) return ts;
  const dateRaw = typeof match.date === 'string' ? match.date.trim() : '';
  if (!dateRaw) return 0;
  const parsed = Date.parse(dateRaw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCanonicalMatchNumberMaps(matches, options = {}) {
  const list = Array.isArray(matches) ? matches : [];
  const mutateMissing = options.mutateMissing === true;
  const nextHint = toPositiveInt(options.nextCanonicalHint) || 1;

  const idToCanonical = new Map();
  const canonicalToId = new Map();
  let maxCanonical = 0;

  const pending = [];

  for (const match of list) {
    if (!match || typeof match !== 'object') continue;
    const id = toPositiveInt(match.id);
    if (!id) continue;

    const canonical = toPositiveInt(match.canonicalMatchNumber);
    const canonicalTaken = canonical && canonicalToId.has(canonical) && canonicalToId.get(canonical) !== id;
    if (canonical && !canonicalTaken) {
      idToCanonical.set(id, canonical);
      canonicalToId.set(canonical, id);
      if (canonical > maxCanonical) maxCanonical = canonical;
      continue;
    }
    pending.push(match);
  }

  let nextCanonical = Math.max(nextHint, maxCanonical + 1);
  const sortedPending = pending.slice().sort((a, b) => {
    const ta = parseMatchSortTimestamp(a);
    const tb = parseMatchSortTimestamp(b);
    if (ta !== tb) return ta - tb;
    const ia = toPositiveInt(a?.id) || 0;
    const ib = toPositiveInt(b?.id) || 0;
    return ia - ib;
  });

  let assignedMissingCount = 0;
  for (const match of sortedPending) {
    const id = toPositiveInt(match.id);
    if (!id) continue;
    while (canonicalToId.has(nextCanonical)) {
      nextCanonical += 1;
    }
    const assigned = nextCanonical;
    nextCanonical += 1;
    assignedMissingCount += 1;
    idToCanonical.set(id, assigned);
    canonicalToId.set(assigned, id);
    if (assigned > maxCanonical) maxCanonical = assigned;
    if (mutateMissing) {
      match.canonicalMatchNumber = assigned;
    }
  }

  return {
    idToCanonical,
    canonicalToId,
    nextCanonicalMatchNumber: Math.max(nextCanonical, maxCanonical + 1, 1),
    assignedMissingCount,
    maxCanonicalMatchNumber: maxCanonical,
  };
}

module.exports = {
  toPositiveInt,
  parseMatchSortTimestamp,
  buildCanonicalMatchNumberMaps,
};


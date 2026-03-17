/**
 * @module electron/helpers/usableTelemetryHelpers
 * Shared normalization for compact telemetry events used by the main process.
 * Supports both raw nested telemetry payloads and already-normalized compact events.
 */

const PLAYER_ID_KEYS = new Set(['accountid', 'platformaccountid', 'userid', 'playerid', 'platform_account_id', 'puid']);
const HERO_ID_KEYS = new Set(['guidhero', 'heroguid', 'guid_hero', 'heroid', 'hero_id']);
const SHIP_ID_KEYS = new Set(['guidship', 'shipguid', 'guid_ship', 'shipid', 'ship_id']);
const WEAPON_ID_KEYS = new Set([
  'guidweaponprimary',
  'guidweaponsecondary',
  'guid_weapon_primary',
  'guid_weapon_secondary',
  'weaponid',
  'weapon_id',
  'primaryweaponid',
  'secondaryweaponid',
]);
const EQUIPMENT_ID_KEYS = new Set([
  'guidequipmentprimary',
  'guidequipmentsecondary',
  'guid_equipment_primary',
  'guid_equipment_secondary',
  'equipmentid',
  'equipment_id',
  'primaryequipmentid',
  'secondaryequipmentid',
]);
const PERK_ID_KEYS = new Set([
  'guidperkprimary',
  'guidperksecondary',
  'perkguidprimary',
  'perkguidsecondary',
  'guid_perk_primary',
  'guid_perk_secondary',
  'perkid',
  'perk_id',
  'primaryperkid',
  'secondaryperkid',
  'guidtraitprimary',
  'guidtraitsecondary',
  'traitguidprimary',
  'traitguidsecondary',
  'guid_trait_primary',
  'guid_trait_secondary',
  'traitid',
  'trait_id',
  'primarytraitid',
  'secondarytraitid',
]);
const MATCH_ID_KEYS = new Set(['matchid', 'match_id']);
const SESSION_ID_KEYS = new Set(['sessionid', 'session_id']);
const OUTCOME_KEYS = new Set(['result', 'matchresult', 'outcome']);

function extractTelemetryEvents(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.telemetry)) return data.telemetry;
  if (data.EventName || data.eventName) return [data];
  return [];
}

function parseTelemetryTimestampMs(evt) {
  if (!evt || typeof evt !== 'object') return null;
  const raw = evt.ClientTimestamp ?? evt.timestamp ?? evt.ts;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: telemetry timestamps are often seconds, convert to ms when needed.
  return n < 100000000000 ? n * 1000 : n;
}

function normalizeScalarId(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.includes(':') ? trimmed.split(':').pop() : trimmed;
  return withoutPrefix ? withoutPrefix.trim() : null;
}

function addNormalizedValuesToSet(set, values) {
  const source = Array.isArray(values) ? values : [values];
  for (const value of source) {
    const normalized = normalizeScalarId(value);
    if (normalized) set.add(normalized);
  }
}

function createCollectorFromEvent(evt) {
  const collector = {
    playerIds: new Set(),
    heroIds: new Set(),
    shipIds: new Set(),
    weaponIds: new Set(),
    equipmentIds: new Set(),
    perkIds: new Set(),
    matchIds: new Set(),
    sessionIds: new Set(),
    outcomes: new Set(),
  };

  if (!evt || typeof evt !== 'object') {
    return collector;
  }

  // Preserve already-normalized compact events so history compaction is lossless.
  addNormalizedValuesToSet(collector.playerIds, evt.playerIds);
  addNormalizedValuesToSet(collector.heroIds, evt.heroIds);
  addNormalizedValuesToSet(collector.shipIds, evt.shipIds);
  addNormalizedValuesToSet(collector.weaponIds, evt.weaponIds);
  addNormalizedValuesToSet(collector.equipmentIds, evt.equipmentIds);
  addNormalizedValuesToSet(collector.perkIds, evt.perkIds);
  addNormalizedValuesToSet(collector.matchIds, evt.matchIds);
  addNormalizedValuesToSet(collector.sessionIds, evt.sessionIds);
  addNormalizedValuesToSet(collector.outcomes, evt.outcomes);

  return collector;
}

function collectUsableTelemetryFields(node, collector, depth = 0) {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectUsableTelemetryFields(item, collector, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [rawKey, value] of Object.entries(node)) {
    const key = String(rawKey || '').toLowerCase();
    const normalized = normalizeScalarId(value);

    if (normalized) {
      if (PLAYER_ID_KEYS.has(key)) collector.playerIds.add(normalized);
      if (HERO_ID_KEYS.has(key)) collector.heroIds.add(normalized);
      if (SHIP_ID_KEYS.has(key)) collector.shipIds.add(normalized);
      if (WEAPON_ID_KEYS.has(key)) collector.weaponIds.add(normalized);
      if (EQUIPMENT_ID_KEYS.has(key)) collector.equipmentIds.add(normalized);
      if (PERK_ID_KEYS.has(key)) collector.perkIds.add(normalized);
      if (MATCH_ID_KEYS.has(key)) collector.matchIds.add(normalized);
      if (SESSION_ID_KEYS.has(key)) collector.sessionIds.add(normalized);
      if (OUTCOME_KEYS.has(key)) collector.outcomes.add(normalized);
    }

    if (typeof value === 'object' && value != null) {
      collectUsableTelemetryFields(value, collector, depth + 1);
    }
  }
}

function firstSetValue(set) {
  if (!(set instanceof Set) || set.size === 0) return null;
  for (const value of set.values()) return value;
  return null;
}

function buildUsableTelemetryEvent(evt) {
  if (!evt || typeof evt !== 'object') return null;
  const timestampMs = parseTelemetryTimestampMs(evt);
  const eventNameRaw = evt.EventName ?? evt.eventName ?? evt.type ?? evt.name;
  const eventName = typeof eventNameRaw === 'string' ? eventNameRaw.trim() : '';

  const collector = createCollectorFromEvent(evt);
  collectUsableTelemetryFields(evt, collector);

  const matchId = normalizeScalarId(evt.matchId ?? evt.MatchId ?? firstSetValue(collector.matchIds));
  const sessionId = normalizeScalarId(evt.sessionId ?? evt.SessionId ?? firstSetValue(collector.sessionIds));
  const outcome = normalizeScalarId(evt.result ?? evt.matchResult ?? evt.outcome ?? firstSetValue(collector.outcomes));

  const hasAnyUsefulContent = Boolean(
    eventName
    || timestampMs
    || matchId
    || sessionId
    || collector.playerIds.size
    || collector.heroIds.size
    || collector.shipIds.size
    || collector.weaponIds.size
    || collector.equipmentIds.size
    || collector.perkIds.size
    || outcome
  );
  if (!hasAnyUsefulContent) return null;

  return {
    timestamp: timestampMs ?? Date.now(),
    eventName: eventName || 'unknown',
    matchId: matchId || undefined,
    sessionId: sessionId || undefined,
    outcome: outcome || undefined,
    playerIds: Array.from(collector.playerIds),
    heroIds: Array.from(collector.heroIds),
    shipIds: Array.from(collector.shipIds),
    weaponIds: Array.from(collector.weaponIds),
    equipmentIds: Array.from(collector.equipmentIds),
    perkIds: Array.from(collector.perkIds),
  };
}

function extractUsableTelemetryEvents(data) {
  const events = extractTelemetryEvents(data);
  const usable = [];
  for (const evt of events) {
    const normalized = buildUsableTelemetryEvent(evt);
    if (normalized) usable.push(normalized);
  }
  return usable;
}

module.exports = {
  buildUsableTelemetryEvent,
  extractTelemetryEvents,
  extractUsableTelemetryEvents,
  normalizeScalarId,
  parseTelemetryTimestampMs,
};

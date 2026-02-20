import type {
  GameMode,
  TelemetryConsistency,
  TelemetryConsistencyChecks,
  TelemetryLoadoutSaveSnapshot,
} from '../types';
import {
  getTelemetryEventName,
  getTelemetryEventPayload,
  getTelemetryEventTimestamp,
  normalizeTelemetryArchiveCollection,
  type TelemetryArchiveEvent,
} from './telemetryArchive';

export const DEFAULT_DURATION_TOLERANCE_SECONDS = 45;

const MATCH_POOL_MODE_MAP: Record<string, GameMode> = {
  artifactbrawl: 'Artifact Brawl',
  artifact: 'Artifact Brawl',
  fleetbattle: 'Fleet Battle',
  fleet: 'Fleet Battle',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toEpochMs = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1_000_000_000_000 ? value * 1000 : value;
};

const normalizePoolKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const collectStrings = (value: unknown, out: string[], depth = 0) => {
  if (value == null || depth > 3) return;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text) out.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, out, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  Object.values(value).forEach((entry) => collectStrings(entry, out, depth + 1));
};

const toStringList = (value: unknown): string[] => {
  const out: string[] = [];
  collectStrings(value, out);
  return Array.from(new Set(out.map((entry) => entry.trim()).filter(Boolean)));
};

const toGameMode = (value: unknown): GameMode | undefined => {
  if (value === 'Artifact Brawl' || value === 'Fleet Battle') return value;
  return undefined;
};

const parseMatchmakerPlayerIds = (payload: Record<string, unknown>): string[] => {
  const candidates = [
    payload.playerIds,
    payload.player_ids,
    payload.players,
    payload.playerList,
    payload.ticketPlayerIds,
  ];
  const merged: string[] = [];
  candidates.forEach((candidate) => {
    merged.push(...toStringList(candidate));
  });
  return Array.from(new Set(merged));
};

const isFrontendMap = (value: unknown): boolean =>
  typeof value === 'string' && value.toLowerCase().includes('frontend');

const isLoadoutRecordKey = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return /(loadout|shipselection|gamemodeshipselection|characterloadout)/i.test(value);
};

const pushLoadoutSnapshot = (
  snapshots: TelemetryLoadoutSaveSnapshot[],
  timestamp: number,
  inGame: boolean,
  source: TelemetryLoadoutSaveSnapshot['source'],
) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return;
  const last = snapshots[snapshots.length - 1];
  if (last && last.timestamp === timestamp && last.source === source) return;
  snapshots.push({ timestamp, inGame, source });
};

export interface InferredModeResult {
  mode: GameMode;
  source: 'pool-map' | 'pool-heuristic';
}

export const inferModeFromMatchPool = (poolValue: unknown): InferredModeResult | null => {
  if (poolValue == null) return null;
  const raw = String(poolValue).trim();
  if (!raw) return null;

  const normalized = normalizePoolKey(raw);
  const mapped = MATCH_POOL_MODE_MAP[normalized];
  if (mapped) {
    return { mode: mapped, source: 'pool-map' };
  }

  const lowered = raw.toLowerCase();
  if (lowered.includes('artifact') || lowered.includes('brawl')) {
    return { mode: 'Artifact Brawl', source: 'pool-heuristic' };
  }
  if (lowered.includes('fleet')) {
    return { mode: 'Fleet Battle', source: 'pool-heuristic' };
  }

  return null;
};

export const getExpectedTeammateCountFromMode = (mode: GameMode | undefined): number | undefined => {
  if (mode === 'Artifact Brawl') return 3;
  return undefined;
};

export const parseClockDurationSeconds = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parts = String(value).split(':').map((part) => Number(part));
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return undefined;
  return Math.max(0, (parts[0] * 60) + parts[1]);
};

export const formatDurationOffset = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (minutes > 0) return `${minutes}m${remaining.toString().padStart(2, '0')}s`;
  return `${remaining}s`;
};

export const deriveTelemetryConsistency = (events: TelemetryArchiveEvent[]): TelemetryConsistency => {
  const orderedEvents = [...events]
    .map((event) => ({ event, ts: toEpochMs(getTelemetryEventTimestamp(event)) }))
    .sort((a, b) => a.ts - b.ts);

  let startTs = 0;
  let endTs = 0;
  const loadoutSaves: TelemetryLoadoutSaveSnapshot[] = [];

  const consistency: TelemetryConsistency = {
    durationToleranceSeconds: DEFAULT_DURATION_TOLERANCE_SECONDS,
  };

  orderedEvents.forEach(({ event, ts }) => {
    const eventName = getTelemetryEventName(event);
    const payload = getTelemetryEventPayload(event);

    if (eventName === 'NebClientMatchmakerStateChange') {
      const playerIds = parseMatchmakerPlayerIds(payload);
      const inferredMode = inferModeFromMatchPool(
        payload.ticketMatchPool ?? payload.ticket_match_pool ?? payload.matchPool ?? payload.match_pool,
      );

      if (playerIds.length > 0) {
        consistency.expectedTeammateCount = Math.max(0, playerIds.length - 1);
      } else if (inferredMode?.mode) {
        const fallbackExpected = getExpectedTeammateCountFromMode(inferredMode.mode);
        if (typeof fallbackExpected === 'number') {
          consistency.expectedTeammateCount = fallbackExpected;
        }
      }

      if (inferredMode) {
        consistency.expectedMode = inferredMode.mode;
        consistency.expectedModeSource = inferredMode.source;
      }
    }

    if (eventName === 'NebLoadingScreen' && ts > 0) {
      const mapName = payload.loadedMap ?? payload.loadingMap;
      if (!isFrontendMap(mapName) && startTs === 0) {
        startTs = ts;
      }
      if (isFrontendMap(mapName) && startTs > 0 && ts >= startTs && endTs === 0) {
        endTs = ts;
      }
    }

    if (eventName === 'NebLoadoutSaved' && ts > 0) {
      const inGame = Boolean(
        payload.bWasSavedInGame === true
        || payload.wasSavedInGame === true
        || payload.savedInGame === true
        || payload.inGame === true,
      );
      pushLoadoutSnapshot(loadoutSaves, ts, inGame, 'NebLoadoutSaved');
    }

    if (eventName === 'NebCloudSaveRecordSize' && ts > 0) {
      const recordKey = payload.recordKey ?? payload.record_key ?? payload.key;
      if (isLoadoutRecordKey(recordKey)) {
        pushLoadoutSnapshot(loadoutSaves, ts, false, 'NebCloudSaveRecordSize');
      }
    }
  });

  if (startTs > 0 && endTs > startTs) {
    consistency.telemetryDurationSeconds = Math.max(0, Math.floor((endTs - startTs) / 1000));
  }

  if (loadoutSaves.length > 0) {
    consistency.loadoutSaves = loadoutSaves;
    consistency.latestLoadoutSaveAt = loadoutSaves[loadoutSaves.length - 1].timestamp;
  }

  return consistency;
};

export const deriveTelemetryConsistencyFromCollections = (payload: unknown): TelemetryConsistency => {
  const collections = normalizeTelemetryArchiveCollection(payload);
  return deriveTelemetryConsistency(collections.flat());
};

export interface EvaluateTelemetryConsistencyInput {
  teammateCount?: number;
  mode?: string | GameMode;
  durationSeconds?: number;
  durationToleranceSeconds?: number;
}

export interface TelemetryConsistencyEvaluation {
  checks: TelemetryConsistencyChecks;
  durationDeltaSeconds?: number;
  durationToleranceSeconds: number;
}

export const evaluateTelemetryConsistencyChecks = (
  consistency: TelemetryConsistency | undefined,
  actual: EvaluateTelemetryConsistencyInput,
): TelemetryConsistencyEvaluation => {
  const checks: TelemetryConsistencyChecks = {
    teammateCount: 'unknown',
    mode: 'unknown',
    duration: 'unknown',
  };

  const durationToleranceSeconds = Math.max(
    0,
    Math.floor(
      actual.durationToleranceSeconds
      ?? consistency?.durationToleranceSeconds
      ?? DEFAULT_DURATION_TOLERANCE_SECONDS,
    ),
  );

  if (
    typeof consistency?.expectedTeammateCount === 'number'
    && typeof actual.teammateCount === 'number'
  ) {
    checks.teammateCount = actual.teammateCount === consistency.expectedTeammateCount ? 'pass' : 'warn';
  }

  const expectedMode = toGameMode(consistency?.expectedMode);
  const actualMode = toGameMode(actual.mode);
  if (expectedMode && actualMode) {
    checks.mode = expectedMode === actualMode ? 'pass' : 'warn';
  }

  let durationDeltaSeconds: number | undefined;
  if (
    typeof consistency?.telemetryDurationSeconds === 'number'
    && typeof actual.durationSeconds === 'number'
  ) {
    durationDeltaSeconds = Math.abs(actual.durationSeconds - consistency.telemetryDurationSeconds);
    checks.duration = durationDeltaSeconds <= durationToleranceSeconds ? 'pass' : 'warn';
  }

  return {
    checks,
    durationDeltaSeconds,
    durationToleranceSeconds,
  };
};

export const mergeTelemetryConsistency = (
  ...values: Array<TelemetryConsistency | undefined>
): TelemetryConsistency | undefined => {
  const merged: TelemetryConsistency = {};
  const loadoutByKey = new Map<string, TelemetryLoadoutSaveSnapshot>();

  values.forEach((value) => {
    if (!value) return;
    if (typeof value.expectedTeammateCount === 'number') merged.expectedTeammateCount = value.expectedTeammateCount;
    if (value.expectedMode) merged.expectedMode = value.expectedMode;
    if (value.expectedModeSource) merged.expectedModeSource = value.expectedModeSource;
    if (typeof value.telemetryDurationSeconds === 'number') merged.telemetryDurationSeconds = value.telemetryDurationSeconds;
    if (typeof value.durationToleranceSeconds === 'number') merged.durationToleranceSeconds = value.durationToleranceSeconds;
    if (typeof value.durationDeltaSeconds === 'number') merged.durationDeltaSeconds = value.durationDeltaSeconds;
    if (value.checks) merged.checks = value.checks;
    if (typeof value.latestLoadoutSaveAt === 'number') merged.latestLoadoutSaveAt = value.latestLoadoutSaveAt;
    (value.loadoutSaves || []).forEach((snapshot) => {
      loadoutByKey.set(`${snapshot.timestamp}_${snapshot.source}`, snapshot);
    });
  });

  const mergedLoadoutSaves = Array.from(loadoutByKey.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (mergedLoadoutSaves.length > 0) {
    merged.loadoutSaves = mergedLoadoutSaves;
    merged.latestLoadoutSaveAt = mergedLoadoutSaves[mergedLoadoutSaves.length - 1].timestamp;
  }

  if (typeof merged.durationToleranceSeconds !== 'number') {
    merged.durationToleranceSeconds = DEFAULT_DURATION_TOLERANCE_SECONDS;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
};

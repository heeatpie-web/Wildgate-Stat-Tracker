const SMART_CAPTURE_MATCH_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const SESSION_RECENCY_BUFFER_MS = 60_000;

function normalizePlayerKey(value) {
  return String(value || '').trim().toLowerCase();
}

function getRecentCutoff(sessionStartTime, now = Date.now()) {
  return typeof sessionStartTime === 'number' && sessionStartTime > 0
    ? (sessionStartTime - SESSION_RECENCY_BUFFER_MS)
    : (now - SMART_CAPTURE_MATCH_LOOKBACK_MS);
}

function findActiveTelemetryDraftMatch({
  activeUser,
  matches,
  sessionStartTime,
  now = Date.now(),
}) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const expectedPlayer = normalizePlayerKey(activeUser);
  const recentCutoff = getRecentCutoff(sessionStartTime, now);

  const telemetryDrafts = matches
    .filter(Boolean)
    .filter((match) => {
      if (match?.subType !== 'Telemetry Draft') return false;
      if (match?.telemetryDraftState !== 'active') return false;
      const timestamp = Number(match.timestamp || 0);
      if (!Number.isFinite(timestamp) || timestamp < recentCutoff) return false;
      const draftPlayer = normalizePlayerKey(match.player);
      if (expectedPlayer && draftPlayer && draftPlayer !== expectedPlayer) return false;
      return true;
    })
    .sort((left, right) => {
      const rightTimestamp = Number(right.timestamp || 0);
      const leftTimestamp = Number(left.timestamp || 0);
      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return Number(right.id || 0) - Number(left.id || 0);
    });

  return telemetryDrafts[0] || null;
}

function resolveSmartCaptureMatchId(options = {}) {
  const activeTelemetryDraft = findActiveTelemetryDraftMatch(options);
  if (activeTelemetryDraft?.id != null) {
    return activeTelemetryDraft.id;
  }

  const pendingMatchId = Number(options?.pendingMatchData?.id || 0);
  return Number.isInteger(pendingMatchId) && pendingMatchId > 0
    ? pendingMatchId
    : null;
}

function buildAutoCaptureRequestFromStateSnapshot(snapshot = {}, { now = Date.now() } = {}) {
  const activeUser = typeof snapshot.activeUser === 'string' && snapshot.activeUser.trim()
    ? snapshot.activeUser.trim()
    : null;
  const explicitMatchId = Number(snapshot.matchId || 0);
  const sessionStartTime = Number(snapshot.sessionStartTime || 0);
  const matches = Array.isArray(snapshot.matches) ? snapshot.matches : [];
  const pendingMatchData = snapshot.pendingMatchData && typeof snapshot.pendingMatchData === 'object'
    ? snapshot.pendingMatchData
    : null;
  const ocrEnhancedNameRecoveryEnabled = snapshot.ocrEnhancedNameRecoveryEnabled === true;
  const deviceDisplayInfo = snapshot.deviceDisplayInfo && typeof snapshot.deviceDisplayInfo === 'object'
    ? snapshot.deviceDisplayInfo
    : null;
  const derivedRuntimeOptions = {
    routingProfile: ocrEnhancedNameRecoveryEnabled ? 'names-only' : 'default',
    fontProfile: ocrEnhancedNameRecoveryEnabled ? 'ealing-black-italic' : 'default',
    nameRerouteThreshold: snapshot.ocrNameRerouteThreshold,
    maxReroutePasses: ocrEnhancedNameRecoveryEnabled ? 1 : 0,
    aspectProfile: typeof deviceDisplayInfo?.aspectProfile === 'string'
      ? deviceDisplayInfo.aspectProfile
      : null,
    gameResolution: snapshot.gameResolution || null,
    deviceDisplayInfo,
  };
  const runtimeOptions = snapshot.runtimeOptions && typeof snapshot.runtimeOptions === 'object'
    ? { ...derivedRuntimeOptions, ...snapshot.runtimeOptions }
    : derivedRuntimeOptions;
  const resolvedMatchId = Number.isInteger(explicitMatchId) && explicitMatchId > 0
    ? explicitMatchId
    : (
      resolveSmartCaptureMatchId({
        activeUser,
        matches,
        pendingMatchData,
        sessionStartTime,
        now,
      }) ?? resolveSmartCaptureMatchId({
        activeUser: null,
        matches,
        pendingMatchData,
        sessionStartTime,
        now,
      })
    );

  return {
    activeUser,
    matchId: Number.isInteger(resolvedMatchId) && resolvedMatchId > 0 ? resolvedMatchId : null,
    lifecycleActive: snapshot.lifecycleActive === true || snapshot.isMatchInProgress === true,
    autoCaptureSendKeypresses: snapshot.autoCaptureSendKeypresses !== false,
    autoCaptureWaitMultiplier: snapshot.autoCaptureWaitMultiplier,
    autoCaptureTacticalMapKey: typeof snapshot.autoCaptureTacticalMapKey === 'string'
      ? snapshot.autoCaptureTacticalMapKey
      : (typeof snapshot.tacticalMapKeybind === 'string' ? snapshot.tacticalMapKeybind : ''),
    holdTacticalMapKey: snapshot.holdTacticalMapKey === true,
    ocrMode: typeof snapshot.ocrMode === 'string' && snapshot.ocrMode.trim()
      ? snapshot.ocrMode.trim()
      : 'local',
    ocrRegions: snapshot.ocrRegions && typeof snapshot.ocrRegions === 'object'
      ? snapshot.ocrRegions
      : null,
    runtimeOptions,
  };
}

module.exports = {
  buildAutoCaptureRequestFromStateSnapshot,
  findActiveTelemetryDraftMatch,
  resolveSmartCaptureMatchId,
};

import type { Match } from '../types';

const SMART_CAPTURE_MATCH_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const SESSION_RECENCY_BUFFER_MS = 60_000;

export interface ResolveSmartCaptureMatchIdOptions {
    activeUser?: string | null;
    matches?: Match[] | null;
    pendingMatchData?: Partial<Match> | Match | null;
    sessionStartTime?: number | null;
    now?: number;
}

const normalizePlayerKey = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase();

const getRecentCutoff = (sessionStartTime?: number | null, now = Date.now()): number => (
    typeof sessionStartTime === 'number' && sessionStartTime > 0
        ? (sessionStartTime - SESSION_RECENCY_BUFFER_MS)
        : (now - SMART_CAPTURE_MATCH_LOOKBACK_MS)
);

export const findActiveTelemetryDraftMatch = ({
    activeUser,
    matches,
    sessionStartTime,
    now = Date.now(),
}: ResolveSmartCaptureMatchIdOptions): Match | null => {
    if (!Array.isArray(matches) || matches.length === 0) return null;

    const expectedPlayer = normalizePlayerKey(activeUser);
    const recentCutoff = getRecentCutoff(sessionStartTime, now);

    const telemetryDrafts = matches
        .filter((match): match is Match => Boolean(match))
        .filter((match) => {
            if (match.subType !== 'Telemetry Draft') return false;
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
};

export const resolveSmartCaptureMatchId = (
    options: ResolveSmartCaptureMatchIdOptions
): number | null => {
    // Prefer the active telemetry draft so new captures land in the live Smart Captures match
    // even if a stale pending submission draft is still hanging around in store state.
    const activeTelemetryDraft = findActiveTelemetryDraftMatch(options);
    if (activeTelemetryDraft?.id != null) {
        return activeTelemetryDraft.id;
    }

    const pendingMatchId = Number(options.pendingMatchData?.id || 0);
    return Number.isInteger(pendingMatchId) && pendingMatchId > 0
        ? pendingMatchId
        : null;
};

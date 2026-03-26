import type { Match } from '../../types';
import { normalizeOcrName } from '../../utils/stringUtils';
import type { PlayerDetail } from './playerHubTypes';

export const normalizeNameKey = (value: string | null | undefined): string => (
    normalizeOcrName(String(value || '')).toLowerCase()
);

export const normalizeEntityLabel = (value: string | null | undefined): string => (
    normalizeNameKey(value)
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b\d+\s*player\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

export const buildEntityNameSet = (values: string[]): Set<string> => new Set(
    values
        .map((value) => normalizeEntityLabel(value))
        .filter(Boolean)
);

export const normalizeGuidKey = (value: string | null | undefined): string => (
    String(value || '')
        .replace(/[{}-]/g, '')
        .trim()
        .toUpperCase()
);

export const lookupUidName = (lookup: Record<string, string> | undefined, value: string | null | undefined): string => {
    const guid = normalizeGuidKey(value);
    if (!guid || !lookup) return '';
    return String(
        lookup[guid]
        || lookup[guid.toLowerCase()]
        || lookup[guid.toUpperCase()]
        || ''
    ).trim();
};

export const getStatusChipClassName = (type: 'roster' | 'tracked' | 'detected'): string => {
    if (type === 'detected') return 'bg-info-soft text-info border border-info/20';
    if (type === 'tracked') return 'bg-warning-soft/40 text-warning border border-warning-soft';
    return 'bg-success/10 text-success border border-success/20';
};

export const getPlayerStatusChips = (pilot: Pick<PlayerDetail, 'isRoster' | 'isTrackedOnly' | 'isDetected'>) => {
    const chips: Array<{ key: 'roster' | 'tracked' | 'detected'; label: string }> = [];
    if (pilot.isRoster) chips.push({ key: 'roster', label: 'Roster' });
    if (pilot.isTrackedOnly) chips.push({ key: 'tracked', label: 'Tracked' });
    if (pilot.isDetected) chips.push({ key: 'detected', label: 'Detected' });
    return chips;
};

export const getMatchOpponentNames = (match: Match): string[] => {
    const opponentsFromTeams = Array.isArray(match.opponentTeams)
        ? match.opponentTeams.flatMap((team) => (Array.isArray(team.players) ? team.players : []))
        : [];
    return [
        ...(Array.isArray(match.opponents) ? match.opponents : []),
        ...opponentsFromTeams,
    ];
};

export const formatEncounterDisplayTimestamp = (match: Match): string => {
    const timestamp = Number(match.timestamp || 0);
    if (Number.isFinite(timestamp) && timestamp > 0) {
        return new Date(timestamp).toLocaleString();
    }
    return [String(match.date || '').trim(), String(match.time || '').trim()].filter(Boolean).join(' ') || `Match #${match.id}`;
};

export const formatRelativeEncounterTimestamp = (timestamp: number): string => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Never';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
};

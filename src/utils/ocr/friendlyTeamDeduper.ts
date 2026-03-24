import { UNKNOWN_PLAYER_LABELS } from '../constants';
import { combinedNameSimilarityScore, normalizeOcrName } from '../stringUtils';

export interface FriendlyRosterTeamLike {
    teamName?: string | null;
    shipType?: string | null;
    players?: string[] | null;
}

export interface SanitizeOpponentTeamsAgainstFriendlyRosterOptions<T extends FriendlyRosterTeamLike> {
    teams: T[];
    activeUser?: string | null;
    friendlyPlayers?: Array<string | null | undefined> | null;
    friendlyTeamLabels?: Array<string | null | undefined> | null;
}

export interface SanitizeOpponentTeamsAgainstFriendlyRosterResult<T extends FriendlyRosterTeamLike> {
    teams: T[];
    promotedFriendlyPlayers: string[];
}

const ACTIVE_USER_SIMILARITY_THRESHOLD = 90;
const FRIENDLY_LABEL_SIMILARITY_THRESHOLD = 90;

const normalizeNameKey = (value: string | null | undefined): string =>
    normalizeOcrName(String(value || '')).toLowerCase();

const isPlaceholderPlayerLabel = (value: string | null | undefined): boolean =>
    UNKNOWN_PLAYER_LABELS.has(normalizeNameKey(value));

const dedupeNames = (values: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>();
    const unique: string[] = [];
    values.forEach((value) => {
        const cleaned = normalizeOcrName(String(value || ''));
        const key = cleaned.toLowerCase();
        if (!cleaned || isPlaceholderPlayerLabel(cleaned) || seen.has(key)) return;
        seen.add(key);
        unique.push(cleaned);
    });
    return unique;
};

export const sanitizeOpponentTeamsAgainstFriendlyRoster = <T extends FriendlyRosterTeamLike>({
    teams,
    activeUser,
    friendlyPlayers,
    friendlyTeamLabels,
}: SanitizeOpponentTeamsAgainstFriendlyRosterOptions<T>): SanitizeOpponentTeamsAgainstFriendlyRosterResult<T> => {
    const activeUserDisplay = normalizeOcrName(String(activeUser || ''));
    const activeUserKey = activeUserDisplay.toLowerCase();
    const friendlyPlayerList = dedupeNames([
        activeUserDisplay,
        ...(friendlyPlayers || []),
    ]);
    const friendlyPlayerKeys = new Set(friendlyPlayerList.map((value) => value.toLowerCase()));
    const friendlyLabelList = dedupeNames(friendlyTeamLabels || []);
    const friendlyLabelKeys = new Set(friendlyLabelList.map((value) => value.toLowerCase()));

    const matchesActiveUser = (value: string): boolean => {
        const cleaned = normalizeOcrName(value);
        const key = cleaned.toLowerCase();
        if (!cleaned || !key || !activeUserDisplay) return false;
        if (key === activeUserKey) return true;
        return combinedNameSimilarityScore(cleaned, activeUserDisplay) >= ACTIVE_USER_SIMILARITY_THRESHOLD;
    };

    const matchesFriendlyPlayer = (value: string): boolean => {
        const key = normalizeNameKey(value);
        if (!key) return false;
        return friendlyPlayerKeys.has(key) || matchesActiveUser(value);
    };

    const matchesFriendlyLabel = (value: string | null | undefined): boolean => {
        const cleaned = normalizeOcrName(String(value || ''));
        const key = cleaned.toLowerCase();
        if (!cleaned || !key) return false;
        if (friendlyLabelKeys.has(key)) return true;
        return friendlyLabelList.some((label) => (
            combinedNameSimilarityScore(cleaned, label) >= FRIENDLY_LABEL_SIMILARITY_THRESHOLD
        ));
    };

    const promotedFriendlyPlayers: string[] = [];
    const sanitizedTeams: T[] = [];

    (teams || []).forEach((team) => {
        const uniquePlayers = dedupeNames(team.players || []);
        const friendlyHits = uniquePlayers.filter(matchesFriendlyPlayer);
        const containsActiveUser = uniquePlayers.some(matchesActiveUser);
        const looksLikeFriendlyTeam = matchesFriendlyLabel(team.teamName) || matchesFriendlyLabel(team.shipType);
        const isFriendlyDuplicateTeam = (uniquePlayers.length === 0 && looksLikeFriendlyTeam)
            || (
                friendlyHits.length > 0
                && (
                    containsActiveUser
                    || friendlyHits.length >= 2
                    || friendlyHits.length === uniquePlayers.length
                    || looksLikeFriendlyTeam
                )
            );

        if (isFriendlyDuplicateTeam) {
            promotedFriendlyPlayers.push(...uniquePlayers.filter((player) => !matchesActiveUser(player)));
            return;
        }

        const filteredPlayers = uniquePlayers.filter((player) => !matchesFriendlyPlayer(player));
        if (filteredPlayers.length === 0 && looksLikeFriendlyTeam) return;
        sanitizedTeams.push({
            ...team,
            players: filteredPlayers,
        });
    });

    return {
        teams: sanitizedTeams,
        promotedFriendlyPlayers: dedupeNames(promotedFriendlyPlayers),
    };
};

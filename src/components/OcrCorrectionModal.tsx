import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Search, Info, Users, Image as ImageIcon, Eye, Shield, Minus, Plus, ArrowLeft } from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useAriaLiveRegion } from '../hooks/useAriaLiveRegion';
import { getLearningMetadata } from '../utils/ocrAliasEngine';
import {
    getHighConfidenceEligible as getHighConfidenceBatchEligible,
    getLowConfidenceEligible as getLowConfidenceBatchEligible,
    OCR_BATCH_THRESHOLD_MAX,
    OCR_BATCH_THRESHOLD_MIN,
    OCR_BATCH_THRESHOLD_STEP,
} from '../utils/ocrBatchActions';
import { normalizeOcrCalibrationMode } from '../utils/ocrCalibration';
import { tryMoveOpponentPlayerBetweenTeams } from '../utils/opponentTeamTransfer';
import { ConfidenceMeter } from './ConfidenceMeter';
import { BatchActionConfirmDialog } from './BatchActionConfirmDialog';
import { LocalImage } from './LocalImage';
import { Match, SHIPS } from '../types';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';
import { findClosestMatch, similarityScore } from '../utils/stringUtils';
import { OcrTeamAssignmentBoard } from './ocr/OcrTeamAssignmentBoard';

interface OcrCorrectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAcceptAll: () => void;
    screenshots?: string[];
    embedded?: boolean;
}

interface DetectedPlayer {
    name: string;
    teamColor: string;
    teamName?: string;
    shipType?: string;
    confidence?: number;
}

type PendingBatchAction = 'accept' | 'ignore' | null;

interface TeamDraft {
    key: string;
    color: string;
    teamName: string;
    players: string[];
    shipType: string;
}

interface DropdownAnchor {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placeAbove: boolean;
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|bmp|gif)$/i;
const OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY = 'wg_ocr_review_help_dismissed_v1';

const getStoredHelpBannerDismissed = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

const normalizeNameKey = (name: string): string => String(name || '').trim().toLowerCase();
const normalizeSubmittedName = (name: string): string => String(name || '').trim();
const foldLikelyOcrDigits = (value: string): string => (
    String(value || '').replace(/[013456789]/g, (char) => (
        char === '0' ? 'o'
            : char === '1' ? 'i'
                : char === '3' ? 'e'
                    : char === '4' ? 'a'
                        : char === '5' ? 's'
                            : char === '6' ? 'g'
                                : char === '7' ? 't'
                                    : char === '8' ? 'b'
                                        : char === '9' ? 'g'
                                            : char
    ))
);

const dedupeNames = (names: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    names.forEach((name) => {
        const cleaned = String(name || '').trim();
        const key = normalizeNameKey(cleaned);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(cleaned);
    });
    return out;
};

const FRIENDLY_SHIP_SUFFIX_PATTERN = /\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i;
const normalizeShipTeamLabel = (value: string): string => (
    normalizeSubmittedName(String(value || '').replace(FRIENDLY_SHIP_SUFFIX_PATTERN, ''))
);

const parseTeamKey = (teamKey: string, index: number): { color: string; teamName: string } => {
    const normalizedKey = String(teamKey || '').trim();
    if (!normalizedKey) {
        return { color: 'unknown', teamName: `Team ${index + 1}` };
    }
    const separatorIndex = normalizedKey.indexOf(':');
    if (separatorIndex > -1) {
        const color = normalizedKey.slice(0, separatorIndex).trim() || 'unknown';
        const teamName = normalizedKey.slice(separatorIndex + 1).trim() || color;
        return { color, teamName };
    }
    return { color: normalizedKey, teamName: normalizedKey };
};

const resolveInitialTeamShip = (
    teamKey: string,
    color: string,
    players: string[],
    shipTypes: Record<string, string> | undefined
): string => {
    if (!shipTypes) return '';
    const candidates: string[] = [
        shipTypes[teamKey],
        shipTypes[color],
        shipTypes[color.toLowerCase()],
        ...players.map((name) => shipTypes[name]),
    ].filter((ship): ship is string => Boolean(ship && String(ship).trim()));
    return candidates[0] || '';
};

const buildTeamDraft = (
    sessionTeams: Record<string, string[]> | undefined,
    sessionShipTypes: Record<string, string> | undefined
): TeamDraft[] => {
    if (!sessionTeams) return [];
    return Object.entries(sessionTeams).map(([teamKey, teamPlayers], index) => {
        const { color, teamName } = parseTeamKey(teamKey, index);
        const players = dedupeNames((teamPlayers || []).map((name) => String(name || '').trim()).filter(Boolean));
        return {
            key: teamKey,
            color,
            teamName,
            players,
            shipType: resolveInitialTeamShip(teamKey, color, players, sessionShipTypes),
        };
    });
};

const buildTeamDraftFromPendingData = (
    pendingMatchData: Partial<Match> | null | undefined,
    activeUser: string | null | undefined,
    sessionTeams: Record<string, string[]> | undefined,
    sessionShipTypes: Record<string, string> | undefined
): TeamDraft[] => {
    const fromPendingOpponents = Array.isArray(pendingMatchData?.opponentTeams)
        ? pendingMatchData.opponentTeams
        : [];
    const hasPendingTeamData = fromPendingOpponents.length > 0
        || Array.isArray(pendingMatchData?.teammates);
    if (!hasPendingTeamData) {
        return buildTeamDraft(sessionTeams, sessionShipTypes);
    }

    const friendlyCaptain = normalizeSubmittedName(
        activeUser
        || String(pendingMatchData?.player || '').trim()
        || 'You'
    );
    const seededFriendlyLabel = Object.keys(sessionTeams || {}).find((teamKey) => (
        String(teamKey || '').toLowerCase().startsWith('friendly:')
    ));
    const parsedFriendlyLabel = seededFriendlyLabel
        ? parseTeamKey(seededFriendlyLabel, 0).teamName
        : '';
    const friendlyPlayers = dedupeNames([
        friendlyCaptain,
        ...((pendingMatchData?.teammates || []).map((name) => normalizeSubmittedName(String(name || '')))),
    ].filter(Boolean));
    const friendlyTeamName = normalizeShipTeamLabel(String(pendingMatchData?.ship || ''))
        || normalizeSubmittedName(String((pendingMatchData as { playerTeamName?: string } | null | undefined)?.playerTeamName || ''))
        || normalizeSubmittedName(parsedFriendlyLabel)
        || friendlyCaptain
        || 'Friendly Team';
    const friendlyShipType = normalizeSubmittedName(
        String(pendingMatchData?.ship || '')
    ) || resolveInitialTeamShip(`friendly:${friendlyTeamName}`, 'friendly', friendlyPlayers, sessionShipTypes);
    const teams: TeamDraft[] = [{
        key: `friendly:${friendlyTeamName}`,
        color: 'friendly',
        teamName: friendlyTeamName,
        players: friendlyPlayers,
        shipType: friendlyShipType,
    }];

    fromPendingOpponents.forEach((team, index) => {
        const teamColor = String(team?.color || '').trim() || 'unknown';
        const teamName = String(team?.teamName || '').trim() || `Enemy Team ${index + 1}`;
        const players = dedupeNames((team?.players || []).map((name) => normalizeSubmittedName(String(name || ''))));
        const shipType = normalizeSubmittedName(String(team?.shipType || ''))
            || resolveInitialTeamShip(`${teamColor}:${teamName}`, teamColor, players, sessionShipTypes);
        teams.push({
            key: `${teamColor}:${teamName}`,
            color: teamColor,
            teamName,
            players,
            shipType,
        });
    });

    return teams;
};

const serializeTeamDraftSnapshot = (
    teammates: string[],
    opponentTeams: Array<{ teamName: string; shipType: string; color: string; players: string[] }>,
    friendlyShip: string
): string => JSON.stringify({
    teammates: dedupeNames(teammates),
    friendlyShip: normalizeSubmittedName(friendlyShip),
    opponentTeams: opponentTeams.map((team) => ({
        teamName: normalizeSubmittedName(team.teamName),
        shipType: normalizeSubmittedName(team.shipType),
        color: normalizeSubmittedName(team.color) || 'unknown',
        players: dedupeNames(team.players),
    })),
});

const serializeTeamDraftSeed = (teams: TeamDraft[]): string => JSON.stringify(
    teams.map((team) => ({
        key: normalizeSubmittedName(team.key),
        color: normalizeSubmittedName(team.color) || 'unknown',
        teamName: normalizeSubmittedName(team.teamName),
        shipType: normalizeSubmittedName(team.shipType),
        players: dedupeNames(team.players),
    }))
);

export const OcrCorrectionModal: React.FC<OcrCorrectionModalProps> = ({
    isOpen,
    onClose,
    onAcceptAll,
    screenshots,
    embedded = false,
}) => {
    const {
        sessionTeams,
        sessionShipTypes,
        pilotRegistry,
        addToRegistry,
        selectedTeammates,
        setSelectedTeammates,
        setSelectedOpponents,
        setSessionTeams,
        setSessionShipTypes,
    } = useGameData();
    const { activeUser, setToast } = useUIState();
    const {
        setPlayerName,
        recordOcrCorrection,
        recordOcrAliasCorrection,
        recordTeamIdentityCorrection,
        resolveTeamIdentity,
        ocrCorrections,
        ocrAliasModel,
        recordCalibrationSample,
        ocrMode,
        ocrBatchAcceptThreshold,
        setOcrBatchAcceptThreshold,
        pendingMatchData,
        setPendingMatchData,
    } = useAppStore();

    const [corrections, setCorrections] = useState<Record<string, string>>({});
    const [ignored, setIgnored] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});
    const [activeInputPlayer, setActiveInputPlayer] = useState<string | null>(null);
    const [pendingBatchAction, setPendingBatchAction] = useState<PendingBatchAction>(null);
    const seededTeamDraft = useMemo(() => {
        const base = buildTeamDraftFromPendingData(pendingMatchData, activeUser, sessionTeams, sessionShipTypes);
        return base.map((team) => {
            const resolved = resolveTeamIdentity(team.teamName, team.color);
            return {
                ...team,
                teamName: resolved.teamName || team.teamName,
                color: resolved.color || team.color,
            };
        });
    }, [activeUser, pendingMatchData, resolveTeamIdentity, sessionShipTypes, sessionTeams]);
    const seededTeamDraftSignature = useMemo(
        () => serializeTeamDraftSeed(seededTeamDraft),
        [seededTeamDraft]
    );
    const [teamDraft, setTeamDraft] = useState<TeamDraft[]>(() => seededTeamDraft);
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
    const [isHelpBannerDismissed, setIsHelpBannerDismissed] = useState<boolean>(() => (
        embedded || getStoredHelpBannerDismissed()
    ));
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const scrollBodyRef = useRef<HTMLDivElement | null>(null);
    const suppressSeedSyncRef = useRef(false);
    const teamDraftSeedRef = useRef<string>('');
    const initialTeamDraftRef = useRef<TeamDraft[]>([]);
    const [dropdownAnchor, setDropdownAnchor] = useState<DropdownAnchor | null>(null);
    const teamAssignmentRosterListId = useId();
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen && pendingBatchAction === null);
    const { announce } = useAriaLiveRegion(isOpen);
    const reviewScreenshots = useMemo(() => (
        (screenshots || [])
            .map((entry) => String(entry || '').trim())
            .filter((entry) => entry.length > 0)
            .filter((entry) => entry.startsWith('data:image/') || IMAGE_FILE_PATTERN.test(entry))
    ), [screenshots]);
    const updateDropdownAnchor = useCallback((playerName: string | null) => {
        if (!playerName) {
            setDropdownAnchor(null);
            return;
        }
        const input = inputRefs.current[playerName];
        if (!input) {
            setDropdownAnchor(null);
            return;
        }
        const rect = input.getBoundingClientRect();
        const viewportPadding = 8;
        const maxDropdownWidth = Math.min(360, window.innerWidth - (viewportPadding * 2));
        const width = Math.max(220, Math.min(Math.max(rect.width, 240), maxDropdownWidth));
        const left = Math.max(
            viewportPadding,
            Math.min(rect.left, window.innerWidth - width - viewportPadding)
        );
        const approxDropdownHeight = 260;
        const minDropdownHeight = 96;
        const maxDropdownHeight = 320;
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
        const spaceAbove = Math.max(0, rect.top - viewportPadding);
        let placeAbove = spaceBelow < approxDropdownHeight && spaceAbove > spaceBelow;
        let availableSpace = placeAbove ? spaceAbove : spaceBelow;
        if (availableSpace < minDropdownHeight) {
            const alternateSpace = placeAbove ? spaceBelow : spaceAbove;
            if (alternateSpace > availableSpace) {
                placeAbove = !placeAbove;
                availableSpace = alternateSpace;
            }
        }
        const fallbackMinHeight = Math.min(minDropdownHeight, Math.max(spaceAbove, spaceBelow));
        const maxHeight = Math.max(
            fallbackMinHeight,
            Math.min(maxDropdownHeight, availableSpace)
        );
        if (maxHeight <= 0) {
            setDropdownAnchor(null);
            return;
        }
        const anchorTop = placeAbove ? (rect.top - 8) : (rect.bottom + 8);
        const top = placeAbove
            ? Math.max(viewportPadding + maxHeight, anchorTop)
            : Math.max(viewportPadding, Math.min(anchorTop, window.innerHeight - viewportPadding - maxHeight));
        setDropdownAnchor({
            top,
            left,
            width,
            maxHeight,
            placeAbove,
        });
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setCorrections({});
        setIgnored(new Set());
        setSearchQuery({});
        setActiveInputPlayer(null);
        setDropdownAnchor(null);
        setPendingBatchAction(null);
        setTeamDraft(seededTeamDraft);
        initialTeamDraftRef.current = seededTeamDraft.map((team) => ({
            ...team,
            players: [...(team.players || [])],
        }));
        teamDraftSeedRef.current = seededTeamDraftSignature;
        setLightboxIdx(null);
    }, [isOpen, seededTeamDraft, seededTeamDraftSignature]);

    useEffect(() => {
        if (!isOpen) return;
        if (suppressSeedSyncRef.current) {
            suppressSeedSyncRef.current = false;
            teamDraftSeedRef.current = seededTeamDraftSignature;
            return;
        }
        if (teamDraftSeedRef.current === seededTeamDraftSignature) return;
        setTeamDraft(seededTeamDraft);
        teamDraftSeedRef.current = seededTeamDraftSignature;
    }, [isOpen, seededTeamDraft, seededTeamDraftSignature]);

    useEffect(() => {
        const activePlayer = activeInputPlayer;
        if (!activePlayer) {
            setDropdownAnchor(null);
            return;
        }
        const queryValue = String(searchQuery[activePlayer] || '').trim();
        if (!queryValue) {
            setDropdownAnchor(null);
            return;
        }
        const syncPosition = () => updateDropdownAnchor(activePlayer);
        syncPosition();
        const onFrame = () => syncPosition();
        const frame = window.requestAnimationFrame(onFrame);
        window.addEventListener('resize', syncPosition);
        window.addEventListener('scroll', syncPosition, true);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', syncPosition);
            window.removeEventListener('scroll', syncPosition, true);
        };
    }, [activeInputPlayer, searchQuery, updateDropdownAnchor]);

    useEffect(() => {
        if (lightboxIdx === null || reviewScreenshots.length === 0) return;
        announce(`Opened screenshot ${lightboxIdx + 1} of ${reviewScreenshots.length}.`, 'polite');
    }, [lightboxIdx, reviewScreenshots.length, announce]);

    // Collect all detected players from the editable team draft.
    const detectedPlayers = useMemo(() => {
        const players: DetectedPlayer[] = [];
        if (teamDraft.length === 0) return players;

        teamDraft.forEach((team) => {
            team.players.forEach((name) => {
                // Check if this name has a prior correction
                const priorCorrection = ocrCorrections?.[name];
                players.push({
                    name,
                    teamColor: team.color,
                    teamName: team.teamName,
                    shipType: team.shipType || sessionShipTypes?.[team.color] || sessionShipTypes?.[name],
                    confidence: priorCorrection ? 95 : 70 // Simulated - in real impl, store confidence from OCR
                });
            });
        });
        return players;
    }, [teamDraft, sessionShipTypes, ocrCorrections]);
    const fuzzyMatchByPlayer = useMemo<Record<string, string>>(() => {
        if (!Array.isArray(pilotRegistry) || pilotRegistry.length === 0) return {};
        const registryByKey = new Map<string, string>();
        pilotRegistry.forEach((pilot) => {
            const key = normalizeNameKey(pilot);
            if (!key || registryByKey.has(key)) return;
            registryByKey.set(key, pilot);
        });
        const next: Record<string, string> = {};
        teamDraft.forEach((team) => {
            (team.players || []).forEach((rawName) => {
                const cleaned = normalizeSubmittedName(rawName);
                const key = normalizeNameKey(cleaned);
                if (!cleaned || !key) return;
                if (registryByKey.has(key)) return;
                const threshold = cleaned.length > 8 ? 2 : 1;
                const match = findClosestMatch(cleaned, pilotRegistry, threshold);
                if (!match) return;
                if (normalizeNameKey(match) === key) return;
                next[key] = match;
            });
        });
        return next;
    }, [pilotRegistry, teamDraft]);
    const inferredFriendlyTeamIndex = useMemo(() => {
        if (teamDraft.length === 0) return -1;
        const activeUserKey = normalizeNameKey(activeUser || '');
        if (activeUserKey) {
            const directMatchIndex = teamDraft.findIndex((team) => (
                team.players.some((player) => normalizeNameKey(player) === activeUserKey)
            ));
            if (directMatchIndex >= 0) return directMatchIndex;
        }
        const teammateKeys = new Set(
            (selectedTeammates || [])
                .map((name) => normalizeNameKey(name))
                .filter(Boolean)
        );
        if (teammateKeys.size === 0) return -1;
        let bestIndex = -1;
        let bestScore = 0;
        teamDraft.forEach((team, index) => {
            const score = team.players.reduce((sum, player) => (
                teammateKeys.has(normalizeNameKey(player)) ? sum + 1 : sum
            ), 0);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });
        return bestScore > 0 ? bestIndex : -1;
    }, [activeUser, selectedTeammates, teamDraft]);
    const displayFriendlyTeamIndex = useMemo(() => {
        if (teamDraft.length === 0) return -1;
        return inferredFriendlyTeamIndex >= 0 ? inferredFriendlyTeamIndex : 0;
    }, [inferredFriendlyTeamIndex, teamDraft.length]);
    const friendlyPlayerKeys = useMemo(() => {
        if (displayFriendlyTeamIndex < 0) return new Set<string>();
        return new Set(
            (teamDraft[displayFriendlyTeamIndex]?.players || [])
                .map((name) => normalizeNameKey(name))
                .filter(Boolean)
        );
    }, [displayFriendlyTeamIndex, teamDraft]);

    useEffect(() => {
        if (!isOpen || teamDraft.length === 0) return;
        const friendlyTeamIndex = inferredFriendlyTeamIndex >= 0 ? inferredFriendlyTeamIndex : 0;
        const friendlyTeam = teamDraft[friendlyTeamIndex];
        const activeUserKey = normalizeNameKey(activeUser || '');
        const nextTeammates = dedupeNames(
            (friendlyTeam?.players || []).filter((name) => {
                const key = normalizeNameKey(name);
                if (!key) return false;
                return activeUserKey ? key !== activeUserKey : true;
            })
        );
        const nextOpponentTeams = teamDraft
            .map((team, index) => ({ team, index }))
            .filter(({ index }) => index !== friendlyTeamIndex)
            .map(({ team, index }) => ({
                teamName: normalizeSubmittedName(team.teamName) || `Enemy Team ${index + 1}`,
                shipType: normalizeSubmittedName(team.shipType),
                color: normalizeSubmittedName(team.color) || 'unknown',
                players: dedupeNames((team.players || []).map((name) => normalizeSubmittedName(name))),
            }))
            .filter((team) => team.players.length > 0 || team.shipType || team.teamName);
        const currentSnapshot = serializeTeamDraftSnapshot(
            Array.isArray(pendingMatchData?.teammates)
                ? pendingMatchData.teammates.map((name) => normalizeSubmittedName(String(name || '')))
                : [],
            Array.isArray(pendingMatchData?.opponentTeams)
                ? pendingMatchData.opponentTeams.map((team) => ({
                    teamName: String(team.teamName || ''),
                    shipType: String(team.shipType || ''),
                    color: String(team.color || ''),
                    players: (team.players || []).map((name) => String(name || '')),
                }))
                : [],
            String(pendingMatchData?.ship || ''),
        );
        const nextSnapshot = serializeTeamDraftSnapshot(
            nextTeammates,
            nextOpponentTeams,
            friendlyTeam?.shipType || '',
        );
        if (currentSnapshot === nextSnapshot) return;
        suppressSeedSyncRef.current = true;
        setPendingMatchData({
            ...(pendingMatchData || {}),
            teammates: nextTeammates,
            opponents: dedupeNames(nextOpponentTeams.flatMap((team) => team.players)),
            opponentTeams: nextOpponentTeams,
            ship: friendlyTeam?.shipType || String(pendingMatchData?.ship || ''),
        });
    }, [activeUser, inferredFriendlyTeamIndex, isOpen, pendingMatchData, setPendingMatchData, teamDraft]);

    // Filter pilot registry for autocomplete
    const getFilteredRegistry = (playerName: string) => {
        const query = normalizeNameKey(searchQuery[playerName] || '');
        if (!query) return pilotRegistry.slice(0, 10);
        const foldedQuery = foldLikelyOcrDigits(query);
        const minScore = query.length >= 6 ? 58 : 52;
        return pilotRegistry
            .map((pilot) => {
                const normalizedPilot = normalizeNameKey(pilot);
                const foldedPilot = foldLikelyOcrDigits(normalizedPilot);
                const containsBoost = normalizedPilot.includes(query) ? 35 : 0;
                const prefixBoost = normalizedPilot.startsWith(query) ? 15 : 0;
                const exactBoost = normalizedPilot === query ? 100 : 0;
                const score = Math.max(
                    similarityScore(query, normalizedPilot),
                    similarityScore(foldedQuery, foldedPilot)
                ) + containsBoost + prefixBoost + exactBoost;
                return { pilot, score };
            })
            .filter((entry) => entry.score >= minScore)
            .sort((a, b) => b.score - a.score || a.pilot.localeCompare(b.pilot))
            .slice(0, 10)
            .map((entry) => entry.pilot);
    };

    const handleCorrection = (ocrName: string, correctedName: string) => {
        const normalizedCorrected = normalizeSubmittedName(correctedName);
        if (!normalizedCorrected) return;
        setCorrections(prev => ({ ...prev, [ocrName]: normalizedCorrected }));
        setSearchQuery(prev => ({ ...prev, [ocrName]: normalizedCorrected }));
    };

    const commitTypedCorrection = (ocrName: string, rawValue: string) => {
        const normalized = normalizeSubmittedName(rawValue);
        if (!normalized) return;
        handleCorrection(ocrName, normalized);
    };

    const handleIgnore = (name: string, announceChange = true) => {
        setIgnored(prev => new Set([...prev, name]));
        setCorrections(prev => {
            const { [name]: _, ...rest } = prev;
            return rest;
        });
        if (announceChange) {
            announce(`Ignored ${name} for this review.`, 'polite');
        }
    };

    const handleUnignore = (name: string) => {
        setIgnored(prev => {
            const next = new Set(prev);
            next.delete(name);
            return next;
        });
        announce(`${name} restored to review queue.`, 'polite');
    };

    const handleAcceptNewPlayer = (name: string) => {
        if (!pilotRegistry.includes(name)) {
            addToRegistry(name);
            Logger.info('OcrCorrection', `Added new player to registry: ${name}`);
        }
        handleCorrection(name, name);
        announce(`Accepted ${name} as a new player.`, 'polite');
    };

    const handleSubmitCorrections = () => {
        let corrected = 0;
        let added = 0;
        const correctionContext = embedded ? 'matchstats' : 'lobby';
        const confidenceByName = new Map(detectedPlayers.map(player => [player.name, Number(player.confidence || 0)]));
        const calibrationMode = normalizeOcrCalibrationMode(ocrMode);
        const effectiveCorrections: Record<string, string> = { ...corrections };
        Object.entries(searchQuery).forEach(([ocrName, queryValue]) => {
            const normalized = normalizeSubmittedName(queryValue);
            if (!normalized) return;
            effectiveCorrections[ocrName] = normalized;
        });

        Object.entries(effectiveCorrections).forEach(([ocrName, correctedName]) => {
            if (ignored.has(ocrName)) return;
            const normalizedOcrName = String(ocrName || '').trim().toLowerCase();
            const normalizedCorrectedName = String(correctedName || '').trim().toLowerCase();

            recordCalibrationSample?.({
                predictedConfidence: confidenceByName.get(ocrName) ?? 0,
                wasCorrect: normalizedOcrName.length > 0 && normalizedOcrName === normalizedCorrectedName,
                ocrMode: calibrationMode,
                fieldType: 'player',
                timestamp: Date.now(),
            });

            if (ocrName !== correctedName) {
                // Record correction for future matching
                recordOcrAliasCorrection?.(ocrName, correctedName, {
                    source: 'review_modal',
                    context: correctionContext,
                    confidenceWeight: 1,
                });
                recordOcrCorrection?.(ocrName, correctedName);
                setPlayerName(ocrName, correctedName);
                corrected++;
                Logger.info('OcrCorrection', `Linked "${ocrName}" -> "${correctedName}"`);
            } else {
                // Accept as-is (already in registry from handleAcceptNewPlayer)
                added++;
            }
        });

        Logger.info('OcrCorrection', `Corrections applied: ${corrected} linked, ${added} accepted as-is, ${ignored.size} ignored`);

        const resolvedTeams = teamDraft
            .map((team) => {
                const normalizedPlayers = dedupeNames(
                    team.players
                        .map((rawName) => {
                            const correctedName = ignored.has(rawName)
                                ? rawName
                                : (effectiveCorrections[rawName] || rawName);
                            return String(correctedName || '').trim();
                        })
                        .filter(Boolean)
                );
                return {
                    ...team,
                    players: normalizedPlayers,
                    shipType: String(team.shipType || '').trim(),
                };
            })
            .filter((team) => team.players.length > 0);

        const nextSessionTeams: Record<string, string[]> = {};
        const nextShipTypes: Record<string, string> = {};
        const usedTeamKeys = new Set<string>();

        resolvedTeams.forEach((team, index) => {
            let teamKey = String(team.key || '').trim();
            if (!teamKey) {
                teamKey = team.teamName
                    ? `${team.color}: ${team.teamName}`
                    : `${team.color || 'unknown'} Team ${index + 1}`;
            }
            while (usedTeamKeys.has(teamKey)) {
                teamKey = `${teamKey} (${index + 1})`;
            }
            usedTeamKeys.add(teamKey);
            nextSessionTeams[teamKey] = [...team.players];

            if (!team.shipType) return;
            const colorKey = String(team.color || '').trim().toLowerCase();
            if (colorKey) {
                nextShipTypes[colorKey] = team.shipType;
            }
            nextShipTypes[teamKey] = team.shipType;
            team.players.forEach((playerName) => {
                if (!playerName) return;
                nextShipTypes[playerName] = team.shipType;
            });
        });
        const baselineByKey = new Map(
            (initialTeamDraftRef.current || []).map((team, index) => [
                String(team.key || `${index}`),
                team,
            ])
        );
        resolvedTeams.forEach((team, index) => {
            const baselineTeam = baselineByKey.get(String(team.key || `${index}`))
                || initialTeamDraftRef.current[index];
            if (!baselineTeam) return;
            const previousName = normalizeSubmittedName(String(baselineTeam.teamName || `Team ${index + 1}`));
            const nextName = normalizeSubmittedName(String(team.teamName || `Team ${index + 1}`));
            const previousColor = normalizeSubmittedName(String(baselineTeam.color || 'unknown')).toLowerCase() || 'unknown';
            const nextColor = normalizeSubmittedName(String(team.color || 'unknown')).toLowerCase() || 'unknown';
            if (previousName === nextName && previousColor === nextColor) return;
            recordTeamIdentityCorrection?.(previousName, nextName, {
                rawColor: previousColor,
                correctedColor: nextColor,
                context: correctionContext,
                source: 'review_modal',
            });
        });

        setSessionTeams(nextSessionTeams);
        setSessionShipTypes(nextShipTypes, 'manual');

        const activeUserKey = normalizeNameKey(activeUser || '');
        let friendlyTeamIndex = resolvedTeams.findIndex((team) => (
            team.players.some((player) => normalizeNameKey(player) === activeUserKey)
        ));
        if (friendlyTeamIndex < 0) {
            const teammateKeys = new Set(
                (selectedTeammates || [])
                    .map((name) => normalizeNameKey(name))
                    .filter(Boolean)
            );
            if (teammateKeys.size > 0) {
                let bestScore = 0;
                let bestIndex = -1;
                resolvedTeams.forEach((team, index) => {
                    const overlapScore = team.players.reduce((score, player) => (
                        teammateKeys.has(normalizeNameKey(player)) ? score + 1 : score
                    ), 0);
                    if (overlapScore > bestScore) {
                        bestScore = overlapScore;
                        bestIndex = index;
                    }
                });
                if (bestScore > 0) {
                    friendlyTeamIndex = bestIndex;
                }
            }
        }
        if (friendlyTeamIndex < 0 && resolvedTeams.length > 0) {
            friendlyTeamIndex = 0;
        }

        const friendlyPlayers = friendlyTeamIndex >= 0
            ? resolvedTeams[friendlyTeamIndex].players
            : [];
        const nextTeammates = dedupeNames(
            friendlyPlayers.filter((name) => {
                const key = normalizeNameKey(name);
                if (!key) return false;
                return activeUserKey ? key !== activeUserKey : true;
            })
        );
        const nextOpponents = dedupeNames(
            resolvedTeams.flatMap((team, index) => (
                index === friendlyTeamIndex ? [] : team.players
            )).filter((name) => {
                const key = normalizeNameKey(name);
                if (!key) return false;
                return activeUserKey ? key !== activeUserKey : true;
            })
        );

        setSelectedTeammates(nextTeammates);
        setSelectedOpponents(nextOpponents);
        setPendingMatchData({
            ...(pendingMatchData || {}),
            teammates: nextTeammates,
            opponents: nextOpponents,
            opponentTeams: resolvedTeams.map((team) => ({
                teamName: team.teamName || '',
                shipType: team.shipType || '',
                color: team.color || 'unknown',
                players: [...(team.players || [])],
            })),
        });

        if (corrected > 0 && reviewScreenshots.length > 0) {
            try {
                const api = getElectronAPI();
                if (api?.invoke) {
                    const firstScreenshot = String(reviewScreenshots[0] || '');
                    const screenshotBase64 = firstScreenshot.replace(/^data:image\/\w+;base64,/, '');
                    const payload = {
                        screenshotBase64,
                        teammates: nextTeammates,
                        opponentTeams: resolvedTeams.map((team) => ({
                            teamName: team.teamName || '',
                            teamColor: team.color || '',
                            players: team.players || [],
                        })),
                        modifiers: [],
                        meta: {
                            source: 'ocr-correction-modal',
                            timestamp: new Date().toISOString(),
                        },
                    };
                    void api.invoke('ocr-corpus-add-corrected-sample', payload).catch((error: unknown) => {
                        Logger.warn('OcrCorrection', 'Failed to add corrected OCR sample to corpus', error);
                        return undefined;
                    });
                }
            } catch {
                // Non-blocking: corpus auto-growth must never block review apply.
            }
        }

        announce(`Applied ${corrected + added} correction decisions.`, 'polite');
        onAcceptAll();
    };

    const applyBatchAccept = (threshold: number) => {
        const eligible = getHighConfidenceBatchEligible(detectedPlayers, corrections, ignored, threshold);
        if (eligible.length === 0) return;

        eligible.forEach((player) => {
            const priorCorrection = ocrCorrections?.[player.name];
            handleCorrection(player.name, priorCorrection?.correctedTo || player.name);
        });
        announce(`Auto-filled ${eligible.length} high-confidence players.`, 'polite');
        Logger.info('OcrBatch', `Batch accepted ${eligible.length} players at ${threshold}% threshold`);
    };

    const applyBatchIgnore = (threshold: number) => {
        const eligible = getLowConfidenceBatchEligible(detectedPlayers, corrections, ignored, threshold);
        if (eligible.length === 0) return;

        eligible.forEach((player) => {
            handleIgnore(player.name, false);
        });
        announce(`Ignored ${eligible.length} low-confidence players.`, 'polite');
        Logger.info('OcrBatch', `Batch ignored ${eligible.length} players below ${threshold}% threshold`);
    };

    const handleAcceptAllHigh = () => {
        applyBatchAccept(ocrBatchAcceptThreshold);
    };

    const handleIgnoreNext = () => {
        const nextUnresolved = detectedPlayers.find((player) => (
            !ignored.has(player.name) &&
            !corrections[player.name]
        ));
        if (!nextUnresolved) return;
        handleIgnore(nextUnresolved.name);
    };

    const highEligibleCount = getHighConfidenceBatchEligible(detectedPlayers, corrections, ignored, ocrBatchAcceptThreshold).length;
    const lowEligibleCount = getLowConfidenceBatchEligible(detectedPlayers, corrections, ignored, ocrBatchAcceptThreshold).length;
    const confirmTitle = pendingBatchAction === 'accept' ? 'Batch Accept Players' : 'Batch Ignore Players';
    const confirmMessage = pendingBatchAction === 'accept'
        ? `Accept all players with ${ocrBatchAcceptThreshold}%+ confidence?`
        : `Ignore all players with confidence below ${ocrBatchAcceptThreshold}%?`;
    const confirmCount = pendingBatchAction === 'accept' ? highEligibleCount : lowEligibleCount;

    const handleConfirmBatchAction = () => {
        if (pendingBatchAction === 'accept') {
            applyBatchAccept(ocrBatchAcceptThreshold);
        } else if (pendingBatchAction === 'ignore') {
            applyBatchIgnore(ocrBatchAcceptThreshold);
        }
        setPendingBatchAction(null);
    };

    const closeLightbox = () => {
        setLightboxIdx(null);
        announce('Closed screenshot preview.', 'polite');
    };

    const dismissHelpBanner = () => {
        setIsHelpBannerDismissed(true);
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(OCR_REVIEW_HELP_DISMISSED_STORAGE_KEY, '1');
            }
        } catch {
            // Ignore localStorage failures so review flow remains functional.
        }
    };

    const updateTeamShip = (teamIndex: number, shipType: string) => {
        setTeamDraft((prev) => prev.map((team, index) => (
            index === teamIndex ? { ...team, shipType } : team
        )));
    };

    const updateTeamName = (teamIndex: number, teamName: string) => {
        setTeamDraft((prev) => prev.map((team, index) => (
            index === teamIndex ? { ...team, teamName } : team
        )));
    };

    const updateTeamColor = (teamIndex: number, color: string) => {
        setTeamDraft((prev) => prev.map((team, index) => (
            index === teamIndex ? { ...team, color } : team
        )));
    };

    const updateTeamPlayerName = (teamIndex: number, playerIndex: number, nextName: string) => {
        setTeamDraft((prev) => prev.map((team, index) => {
            if (index !== teamIndex) return team;
            const nextPlayers = [...team.players];
            nextPlayers[playerIndex] = nextName;
            return { ...team, players: nextPlayers };
        }));
    };

    const addTeamPlayer = (teamIndex: number, playerName: string) => {
        const normalizedPlayer = normalizeSubmittedName(playerName);
        if (!normalizedPlayer) return;
        setTeamDraft((prev) => prev.map((team, index) => {
            if (index !== teamIndex) return team;
            const nextPlayers = dedupeNames([...(team.players || []), normalizedPlayer]);
            return { ...team, players: nextPlayers };
        }));
    };

    const removeTeamPlayer = (teamIndex: number, playerIndex: number) => {
        const removedName = teamDraft[teamIndex]?.players[playerIndex] || '';
        setTeamDraft((prev) => prev.map((team, index) => {
            if (index !== teamIndex) return team;
            return {
                ...team,
                players: team.players.filter((_, idx) => idx !== playerIndex),
            };
        }));
        if (removedName) {
            announce(`Removed ${removedName} from team assignment.`, 'polite');
        }
    };

    const moveTeamPlayer = useCallback((
        fromTeamIndex: number,
        fromPlayerIndex: number,
        toTeamIndex: number,
        toPlayerIndex?: number | null
    ) => {
        const moveResult = tryMoveOpponentPlayerBetweenTeams(teamDraft, {
            fromTeamIndex,
            fromPlayerIndex,
            toTeamIndex,
            toPlayerIndex,
            preventDuplicateNames: true,
            normalizeName: (value) => normalizeNameKey(String(value || '')),
        });
        if (moveResult.reason === 'duplicate') {
            const duplicateName = moveResult.movedPlayer || 'Player';
            const targetTeamName = teamDraft[toTeamIndex]?.teamName || `Team ${toTeamIndex + 1}`;
            announce(`${duplicateName} is already in ${targetTeamName}.`, 'assertive');
            setToast({ message: `${duplicateName} already exists in ${targetTeamName}.`, type: 'warning' });
            return;
        }
        if (moveResult.reason !== 'moved') return;
        const movedName = teamDraft[fromTeamIndex]?.players[fromPlayerIndex] || '';
        const targetTeamName = teamDraft[toTeamIndex]?.teamName || teamDraft[toTeamIndex]?.color || `Team ${toTeamIndex + 1}`;
        setTeamDraft(moveResult.teams);
        if (movedName) {
            announce(`Moved ${movedName} to ${targetTeamName}.`, 'polite');
        }
    }, [teamDraft, announce, setToast]);

    const shortcutsEnabled = isOpen && pendingBatchAction === null && activeInputPlayer === null;
    useKeyboardShortcuts([
        { key: 'Enter', ctrl: true, handler: () => handleSubmitCorrections() },
        {
            key: 'Escape',
            handler: () => {
                if (lightboxIdx !== null) {
                    closeLightbox();
                    return;
                }
                onClose();
            }
        },
        { key: 'a', ctrl: true, handler: () => handleAcceptAllHigh() },
        { key: 'i', ctrl: true, handler: () => handleIgnoreNext() },
    ], shortcutsEnabled);

    if (!isOpen) return null;

    const getConfidenceBg = (conf: number) => {
        if (conf >= 80) return 'bg-success-soft border-success-soft';
        if (conf >= 40) return 'bg-warning-soft border-warning-soft';
        return 'bg-danger-soft border-danger-soft';
    };

    return (
        <>
            <div
                className={embedded
                    ? 'w-full h-full min-h-0 flex flex-col overflow-hidden'
                    : 'fixed inset-0 md3-dialog-scrim z-top-second flex items-start justify-center p-4 overflow-y-auto animate-fade-in'}
                onClick={embedded ? undefined : onClose}
            >
                <div
                    ref={focusTrapRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={dialogTitleId}
                    aria-describedby={isHelpBannerDismissed ? undefined : dialogDescriptionId}
                    className={embedded
                        ? 'ocr-correction-dialog ocr-correction-dialog--embedded w-full h-full min-h-0 flex flex-col overflow-hidden'
                        : 'ocr-correction-dialog md3-dialog rounded-modal w-full max-w-2xl h-[85vh] max-h-85vh my-2 flex flex-col animate-scale-in overflow-hidden'}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="min-w-0">
                                <h2 id={dialogTitleId} className="text-body font-bold truncate">OCR Review</h2>
                                <p className="text-label-xs text-md-sys-on-surface/62 truncate">
                                    Review player names, team grouping, and ship assignment.
                                </p>
                            </div>
                            {!embedded && (
                                <span className="md3-chip text-label-xs font-mono shrink-0">
                                    {detectedPlayers.length} detected
                                </span>
                            )}
                        </div>
                        {embedded ? (
                            <button
                                type="button"
                                onClick={onClose}
                                className="md3-btn-text inline-flex items-center gap-1.5"
                                title="Back to result tab"
                                aria-label="Back to result tab"
                            >
                                <ArrowLeft size={14} />
                                Back to Result
                            </button>
                        ) : (
                            <button onClick={onClose} className="md3-icon-btn" title="Close" aria-label="Close OCR correction dialog">
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    <div
                        ref={scrollBodyRef}
                        className="ocr-correction-body flex-1 min-h-0 overflow-y-auto custom-scrollbar md3-dialog-content overscroll-contain"
                        tabIndex={0}
                    >
                        {!isHelpBannerDismissed && (
                            <div className="md3-banner md3-banner--info ocr-correction-help-banner">
                                <Info size={16} className="mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-body font-medium">How this helps</p>
                                    <p id={dialogDescriptionId} className="text-label-sm opacity-60 mt-0.5">
                                        Pick the real player name for each OCR guess, then press <span className="font-semibold">Apply and Learn</span>.
                                    </p>
                                    <p className="text-label-sm opacity-60 mt-0.5">
                                        These links are remembered, so OCR gets better in future matches.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={dismissHelpBanner}
                                    className="md3-icon-btn ml-2 flex-shrink-0"
                                    aria-label="Dismiss help banner"
                                    title="Dismiss help"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <div className="md3-card p-3 mb-3 border border-md-sys-outline/20 ocr-correction-batch-card">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-col">
                                    <span className="text-label-sm font-bold uppercase text-md-sys-on-surface/70">Batch Operations</span>
                                    <span className="text-label-xs font-mono text-md-sys-on-surface/50">{ocrBatchAcceptThreshold}% threshold</span>
                                </div>
                                <div className="flex items-center gap-2 max-w-[200px] flex-1">
                                    <button
                                        type="button"
                                        onClick={() => setOcrBatchAcceptThreshold(Math.min(OCR_BATCH_THRESHOLD_MAX, ocrBatchAcceptThreshold - OCR_BATCH_THRESHOLD_STEP))}
                                        className="md3-icon-btn h-6 w-6 shrink-0"
                                        aria-label="Lower batch confidence threshold"
                                        title="Lower threshold"
                                    >
                                        <Minus size={12} />
                                    </button>
                                    <div className="flex-1 px-1 py-1">
                                        <input
                                            type="range"
                                            min={OCR_BATCH_THRESHOLD_MIN}
                                            max={OCR_BATCH_THRESHOLD_MAX}
                                            step={OCR_BATCH_THRESHOLD_STEP}
                                            value={ocrBatchAcceptThreshold}
                                            onChange={(event) => setOcrBatchAcceptThreshold(Number(event.target.value))}
                                            className="ocr-threshold-slider w-full h-8 cursor-pointer touch-manipulation"
                                            aria-label="Batch confidence threshold"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setOcrBatchAcceptThreshold(Math.min(OCR_BATCH_THRESHOLD_MAX, ocrBatchAcceptThreshold + OCR_BATCH_THRESHOLD_STEP))}
                                        className="md3-icon-btn h-6 w-6 shrink-0"
                                        aria-label="Raise batch confidence threshold"
                                        title="Raise threshold"
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 ocr-correction-batch-actions">
                                <button
                                    type="button"
                                    onClick={() => setPendingBatchAction('accept')}
                                    disabled={highEligibleCount === 0}
                                    className="md3-btn-tonal disabled:opacity-disabled"
                                >
                                    Accept {highEligibleCount} High Confidence
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPendingBatchAction('ignore')}
                                    disabled={lowEligibleCount === 0}
                                    className="md3-btn-text text-warning disabled:opacity-disabled"
                                >
                                    Ignore {lowEligibleCount} Low Confidence
                                </button>
                            </div>
                        </div>

                        {teamDraft.length > 0 && (
                            <section className="md3-card p-3 mb-3 border border-md-sys-outline/20 ocr-team-assignment-shell">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-label-sm font-bold uppercase opacity-60 flex items-center gap-1">
                                        <Users size={14} />
                                        Team Assignment
                                    </span>
                                    <span className="text-label-sm opacity-60">
                                        Drag players between cards, then apply to learn.
                                    </span>
                                </div>
                                {pilotRegistry.length > 0 && (
                                    <datalist id={teamAssignmentRosterListId}>
                                        {pilotRegistry.map((pilot) => (
                                            <option key={`team-assignment-${pilot}`} value={pilot} />
                                        ))}
                                    </datalist>
                                )}
                                <OcrTeamAssignmentBoard
                                    teams={teamDraft}
                                    shipOptions={SHIPS}
                                    rosterSuggestionsId={pilotRegistry.length > 0 ? teamAssignmentRosterListId : undefined}
                                    friendlyTeamIndex={displayFriendlyTeamIndex}
                                    compact={embedded}
                                    allowColorEdit={true}
                                    fuzzyMatches={fuzzyMatchByPlayer}
                                    onTeamNameChange={updateTeamName}
                                    onTeamColorChange={updateTeamColor}
                                    onTeamShipChange={updateTeamShip}
                                    onPlayerChange={updateTeamPlayerName}
                                    onPlayerRemove={removeTeamPlayer}
                                    onPlayerAdd={addTeamPlayer}
                                    onPlayerMove={moveTeamPlayer}
                                    dataTestId="ocr-team-assignment-board"
                                />
                            </section>
                        )}

                        {/* Player List */}
                        <div className="space-y-4">
                            {reviewScreenshots.length > 0 && (
                                <div className="sticky top-0 z-20 md3-card p-2 border border-md-sys-outline/15 bg-md-sys-surface/95 backdrop-blur-sm">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-label-sm font-bold uppercase opacity-60 flex items-center gap-1">
                                            <ImageIcon size={14} />
                                            Screenshot References
                                        </span>
                                        <span className="text-label-sm opacity-60">{reviewScreenshots.length} image(s)</span>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {reviewScreenshots.map((imagePath, index) => (
                                            <button
                                                key={`${imagePath}-${index}`}
                                                type="button"
                                                onClick={() => setLightboxIdx(index)}
                                                className="rounded-control border border-md-sys-outline/20 p-1 bg-md-sys-surface min-w-[92px] hover:border-md-sys-primary/40 transition-all"
                                                aria-label={`Open screenshot ${index + 1}`}
                                            >
                                                <div className="w-[82px] h-[56px] rounded overflow-hidden bg-md-sys-on-surface/5">
                                                    <LocalImage
                                                        src={imagePath}
                                                        alt={`Reference screenshot ${index + 1}`}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <div className="mt-1 flex items-center justify-center gap-1 text-label-xs opacity-70">
                                                    <Eye size={10} />
                                                    #{index + 1}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {detectedPlayers.length === 0 ? (
                                <div className="text-center opacity-60 py-8">
                                    <p className="text-body font-medium">No players detected</p>
                                    <p className="text-label-sm mt-1">
                                        Capture a Crew Hub or Tactical Map screenshot first, then return here to review.
                                    </p>
                                </div>
                            ) : (
                                detectedPlayers.map((player, idx) => {
                                    const isIgnored = ignored.has(player.name);
                                    const hasCorrected = corrections[player.name];
                                    const priorCorrection = ocrCorrections?.[player.name];
                                    const conf = player.confidence || 70;
                                    const filteredRegistry = getFilteredRegistry(player.name);
                                    const isFriendlyDetectedPlayer = friendlyPlayerKeys.has(normalizeNameKey(player.name));
                                    const learningCount = Math.max(1, Number(priorCorrection?.count || 1));
                                    const learningTooltip = getLearningMetadata(ocrAliasModel, player.name)
                                        || `Learned from ${learningCount} correction${learningCount === 1 ? '' : 's'}`;
                                    const inputValue = Object.prototype.hasOwnProperty.call(searchQuery, player.name)
                                        ? (searchQuery[player.name] || '')
                                        : (corrections[player.name] || priorCorrection?.correctedTo || player.name);
                                    const showPortalDropdown = (
                                        activeInputPlayer === player.name
                                        && String(searchQuery[player.name] || '').trim().length > 0
                                        && !!dropdownAnchor
                                        && typeof document !== 'undefined'
                                    );

                                    return (
                                        <div
                                            key={`${player.name}-${idx}`}
                                            className={`ocr-detected-player-card md3-card p-3 rounded-card border transition-all ${isIgnored
                                                ? 'bg-md-sys-on-surface/5 border-md-sys-outline-variant/30 opacity-50'
                                                : hasCorrected
                                                    ? 'bg-success-soft border-success-soft'
                                                    : getConfidenceBg(conf)
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                {/* Player Info */}
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    {/* Team Color Badge */}
                                                    <div
                                                        className="w-3 h-8 rounded-full flex-shrink-0"
                                                        style={{
                                                            backgroundColor: player.teamColor.toLowerCase() === 'unknown'
                                                                ? 'var(--md-sys-color-outline-variant)'
                                                                : player.teamColor.toLowerCase()
                                                        }}
                                                    />

                                                    {/* Name & Details */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold truncate">{player.name}</span>
                                                            {isFriendlyDetectedPlayer && (
                                                                <span className="ocr-teammate-chip ocr-teammate-chip--compact" title="Friendly teammate">
                                                                    <Shield size={10} />
                                                                    Teammate
                                                                </span>
                                                            )}
                                                            {priorCorrection && (
                                                                <span
                                                                    className="text-label-sm bg-info-soft text-info px-1.5 py-0.5 rounded"
                                                                    title={learningTooltip}
                                                                >
                                                                    Learned ({learningCount}x)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="mt-1 max-w-220px">
                                                            <ConfidenceMeter confidence={conf} size="sm" />
                                                        </div>
                                                        {player.shipType && (
                                                            <div className="text-label-sm opacity-60 mt-0.5">
                                                                Ship: {player.shipType}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                {isIgnored ? (
                                                    <button
                                                        onClick={() => handleUnignore(player.name)}
                                                        className="md3-btn-text text-label-sm"
                                                    >
                                                        Undo Ignore
                                                    </button>
                                                ) : (
                                                    <div className="ocr-detected-player-actions flex items-center gap-2">
                                                        {/* Correction Dropdown */}
                                                        <div className={`relative ${activeInputPlayer === player.name ? 'z-30' : ''}`}>
                                                            <div className="ocr-roster-search-field md3-textfield md3-textfield--outlined flex items-center gap-1 px-2 py-1 bg-md-sys-surface-container-highest">
                                                                <Search size={12} className="opacity-60" />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Search roster or type name..."
                                                                    ref={(node) => {
                                                                        inputRefs.current[player.name] = node;
                                                                    }}
                                                                    value={inputValue}
                                                                    onFocus={() => {
                                                                        setActiveInputPlayer(player.name);
                                                                        if (!Object.prototype.hasOwnProperty.call(searchQuery, player.name)) {
                                                                            setSearchQuery(prev => ({ ...prev, [player.name]: inputValue }));
                                                                        }
                                                                        window.requestAnimationFrame(() => updateDropdownAnchor(player.name));
                                                                    }}
                                                                    onBlur={() => {
                                                                        setActiveInputPlayer((current) => (current === player.name ? null : current));
                                                                        commitTypedCorrection(player.name, searchQuery[player.name] || inputValue);
                                                                    }}
                                                                    onChange={e => {
                                                                        setSearchQuery(prev => ({ ...prev, [player.name]: e.target.value }));
                                                                        window.requestAnimationFrame(() => updateDropdownAnchor(player.name));
                                                                    }}
                                                                    onKeyDown={(event) => {
                                                                        if (event.key === 'Enter') {
                                                                            event.preventDefault();
                                                                            commitTypedCorrection(player.name, searchQuery[player.name] || inputValue);
                                                                        }
                                                                        event.stopPropagation();
                                                                    }}
                                                                    className="ocr-roster-search-input bg-transparent text-body w-60 min-w-0 outline-none caret-current"
                                                                />
                                                            </div>
                                                        </div>
                                                        {showPortalDropdown && createPortal(
                                                            <div
                                                                className="ocr-roster-dropdown md3-card rounded-lg shadow-xl overflow-y-auto custom-scrollbar overscroll-contain border border-md-sys-outline/20 bg-md-sys-surface-container-highest p-0"
                                                                onWheel={(event) => event.stopPropagation()}
                                                                style={{
                                                                    position: 'fixed',
                                                                    top: dropdownAnchor.top,
                                                                    left: dropdownAnchor.left,
                                                                    width: dropdownAnchor.width,
                                                                    maxHeight: dropdownAnchor.maxHeight,
                                                                    zIndex: 1200,
                                                                    transform: dropdownAnchor.placeAbove ? 'translateY(-100%)' : undefined,
                                                                }}
                                                            >
                                                                {filteredRegistry.map((p) => (
                                                                    <button
                                                                        key={p}
                                                                        onMouseDown={(event) => event.preventDefault()}
                                                                        onClick={() => handleCorrection(player.name, p)}
                                                                        className="ocr-roster-dropdown-item w-full text-left px-3 py-1.5 text-body text-md-sys-on-surface hover:bg-md-sys-on-surface/10 truncate"
                                                                    >
                                                                        {p}
                                                                    </button>
                                                                ))}
                                                                {filteredRegistry.length === 0 && (
                                                                    <div className="ocr-roster-dropdown-empty px-3 py-2 text-label-sm text-md-sys-on-surface/70">
                                                                        No matching pilots found. Use "+ New" to add this name.
                                                                    </div>
                                                                )}
                                                            </div>,
                                                            document.body
                                                        )}

                                                        {/* Accept as New */}
                                                        {!pilotRegistry.includes(player.name) && !hasCorrected && (
                                                            <button
                                                                onClick={() => handleAcceptNewPlayer(player.name)}
                                                                className="md3-btn-text text-label-sm text-success whitespace-nowrap"
                                                            >
                                                                + New
                                                            </button>
                                                        )}

                                                        {/* Ignore */}
                                                        <button
                                                            onClick={() => handleIgnore(player.name)}
                                                            className="md3-btn-text text-label-sm text-danger"
                                                        >
                                                            Ignore
                                                        </button>

                                                        {/* Checkmark if corrected */}
                                                        {hasCorrected && (
                                                            <Check size={16} className="text-success" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Show correction target */}
                                            {hasCorrected && hasCorrected !== player.name && (
                                                <div className="mt-2 text-label-sm text-success flex items-center gap-1">
                                                    <span className="opacity-60">Linked to:</span>
                                                    <span className="font-semibold">{hasCorrected}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* All-resolved hint */}
                        {detectedPlayers.length > 0 &&
                            detectedPlayers.every(p => corrections[p.name] || ignored.has(p.name)) && (
                                <div className="px-3 py-2 text-center text-label-sm text-success font-medium">
                                    All players reviewed. Press "Apply Corrections" to save.
                                </div>
                            )}

                        <div className="px-3 py-2 text-label-sm border-t border-md-sys-outline/15 bg-md-sys-surface-container-low text-md-sys-on-surface/80 flex items-center flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Ctrl+Enter</kbd>
                                Apply
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Esc</kbd>
                                Close
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Ctrl+A</kbd>
                                Auto-fill
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded bg-md-sys-surface3 border border-md-sys-outline/20 font-mono text-label-xs">Ctrl+I</kbd>
                                Ignore Next
                            </span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="md3-dialog-actions w-full justify-between">
                        <button onClick={onClose} className="md3-btn-text">
                            {embedded ? 'Back to Result' : 'Close for Now'}
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleAcceptAllHigh}
                                className="md3-btn-tonal"
                                title="Auto-fill players that already have strong confidence"
                            >
                                Auto Fill Confident
                            </button>
                            <button
                                onClick={handleSubmitCorrections}
                                className="md3-btn-filled flex items-center gap-2"
                                title="Save all reviewed links so future OCR can reuse them"
                            >
                                <Check size={16} />
                                Apply and Learn
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <BatchActionConfirmDialog
                isOpen={pendingBatchAction !== null}
                title={confirmTitle}
                message={confirmMessage}
                affectedCount={confirmCount}
                onConfirm={handleConfirmBatchAction}
                onCancel={() => setPendingBatchAction(null)}
                confirmLabel={pendingBatchAction === 'accept' ? 'Accept Players' : 'Ignore Players'}
            />
            {lightboxIdx !== null && reviewScreenshots[lightboxIdx] && (
                <div
                    className="fixed inset-0 z-top bg-scrim-90 flex items-center justify-center p-8"
                    onClick={closeLightbox}
                >
                    <button
                        type="button"
                        onClick={closeLightbox}
                        className="absolute top-4 right-4 text-on-scrim-muted hover:text-on-scrim z-10"
                        aria-label="Close screenshot preview"
                    >
                        <X size={24} />
                    </button>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Screenshot ${lightboxIdx + 1} of ${reviewScreenshots.length}`}
                        onClick={(event) => event.stopPropagation()}
                        className="max-w-full max-h-full"
                    >
                        <LocalImage
                            src={reviewScreenshots[lightboxIdx]}
                            alt={`Screenshot ${lightboxIdx + 1}`}
                            className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                        />
                        <div className="text-center mt-2 text-label-sm text-on-scrim-muted font-bold">
                            Screenshot {lightboxIdx + 1} of {reviewScreenshots.length}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};




import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import {
    Users, Search, Star, Edit2, Trash2, ChevronRight, ChevronDown, Merge,
    Undo2, ScanEye, Swords, Handshake, TrendingUp, X, Plus,
    Check, AlertTriangle, Image as ImageIcon
} from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import type { RosterEntryMeta } from '../store/slices/createDataSlice';
import { resolvePlayerProfileDisplayName } from '../store/slices/createMappingSlice';
import type { Match } from '../types';
import { getShipColor, SHIPS, CHARACTERS, WEAPONS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT } from '../types';
import { buildAliasVariantMap } from '../utils/ocrNameResolver';
import { isOcrNoise, normalizeOcrName, similarityScore } from '../utils/stringUtils';
import { buildRosterMergeSuggestionGroups, type RosterMergeSuggestionGroup } from '../utils/rosterMergeSuggestions';
import { getPerkCatalog, getProspectorEquipmentCatalog, getProspectorWeaponCatalog, getShipCatalog } from './patch/patchEntityCatalog';
import { LocalImage } from './LocalImage';
import { useShallow } from 'zustand/react/shallow';
import Logger from '../utils/logger';

type SortMode = 'alpha' | 'favorites' | 'recent' | 'encounters';
type PlayerFilterMode = 'all' | 'roster' | 'tracked-only' | 'needs-review';
type PlayerHubMode = 'roster' | 'ocr-work';

interface PlayerDetail {
    name: string;
    isFavorite: boolean;
    isRoster: boolean;
    isTrackedOnly: boolean;
    isDetected: boolean;
    needsReview: boolean;
    rosterMeta: RosterEntryMeta | null;
    note: string;
    asTeammate: { wins: number; total: number } | null;
    asOpponent: { wins: number; total: number } | null;
    totalEncounters: number;
    encounterMatchIds: number[];
    firstSeen: number | null;
    lastSeen: number | null;
    shipsObserved: Record<string, number>;
    teamsObserved: Record<string, number>;
    ocrSightings: number;
    manualSightings: number;
    lastOcrConfidence: number | null;
    profileIds: string[];
}

interface AliasInsight {
    label: string;
    count?: number;
    source: 'manual' | 'learned';
}

interface DuplicateCandidate {
    name: string;
    score: number;
    similarity: number;
    reasons: string[];
    totalEncounters: number;
}

interface EncounterSnapshot {
    totalEncounters: number;
    encounterMatchIds: number[];
    firstSeen: number | null;
    lastSeen: number | null;
    asTeammate: { wins: number; total: number } | null;
    asOpponent: { wins: number; total: number } | null;
}

const normalizeNameKey = (value: string | null | undefined): string => (
    normalizeOcrName(String(value || '')).toLowerCase()
);
const normalizeEntityLabel = (value: string | null | undefined): string => (
    normalizeNameKey(value)
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b\d+\s*player\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);
const buildEntityNameSet = (values: string[]): Set<string> => new Set(
    values
        .map((value) => normalizeEntityLabel(value))
        .filter(Boolean)
);
const SHIP_NAME_SET = buildEntityNameSet(getShipCatalog([...(SHIPS || [])]));
const PROSPECTOR_NAME_SET = buildEntityNameSet([...(CHARACTERS || [])]);
const WEAPON_NAME_SET = buildEntityNameSet([
    ...(WEAPONS || []),
    ...getProspectorWeaponCatalog([...(CHARACTER_WEAPONS || [])]),
]);
const EQUIPMENT_NAME_SET = buildEntityNameSet(getProspectorEquipmentCatalog([...(CHARACTER_EQUIPMENT || [])]));
const PERK_NAME_SET = buildEntityNameSet(getPerkCatalog());
const NON_PLAYER_NAME_HINTS = [
    'drone', 'trap', 'shield', 'repair', 'teleport', 'reloader', 'grenade',
    'plasma', 'foam', 'can', 'dash', 'boom', 'launcher', 'rifle', 'cannon',
    'beam', 'privateer', 'bastion', 'scout', 'hunter', 'outlaw', 'boarder',
    'defender', 'inventor', 'salvager', 'factory', 'smash', 'explorer', 'bomber',
] as const;
const GUID_HEX_PATTERN = /^[A-F0-9]{32}$/i;

const normalizeGuidKey = (value: string | null | undefined): string => (
    String(value || '')
        .replace(/[{}-]/g, '')
        .trim()
        .toUpperCase()
);

const lookupUidName = (lookup: Record<string, string> | undefined, value: string | null | undefined): string => {
    const guid = normalizeGuidKey(value);
    if (!guid || !lookup) return '';
    return String(
        lookup[guid]
        || lookup[guid.toLowerCase()]
        || lookup[guid.toUpperCase()]
        || ''
    ).trim();
};

const getStatusChipClassName = (type: 'roster' | 'tracked' | 'detected'): string => {
    if (type === 'detected') return 'bg-info-soft text-info border border-info/20';
    if (type === 'tracked') return 'bg-warning-soft/40 text-warning border border-warning-soft';
    return 'bg-success/10 text-success border border-success/20';
};

const getPlayerStatusChips = (pilot: Pick<PlayerDetail, 'isRoster' | 'isTrackedOnly' | 'isDetected'>) => {
    const chips: Array<{ key: 'roster' | 'tracked' | 'detected'; label: string }> = [];
    if (pilot.isRoster) chips.push({ key: 'roster', label: 'Roster' });
    if (pilot.isTrackedOnly) chips.push({ key: 'tracked', label: 'Tracked' });
    if (pilot.isDetected) chips.push({ key: 'detected', label: 'Detected' });
    return chips;
};

const getMatchOpponentNames = (match: Match): string[] => {
    const opponentsFromTeams = Array.isArray(match.opponentTeams)
        ? match.opponentTeams.flatMap((team) => (Array.isArray(team.players) ? team.players : []))
        : [];
    return [
        ...(Array.isArray(match.opponents) ? match.opponents : []),
        ...opponentsFromTeams,
    ];
};

const IS_DEV_BUILD = import.meta.env.DEV || process.env.NODE_ENV !== 'production';
const DEFAULT_ROSTER_VIEWPORT_HEIGHT = 640;
const ROSTER_GRID_ROW_HEIGHT = 74;
const ROSTER_GRID_OVERSCAN_ROWS = 3;

const PlayerHub: React.FC = () => {
    const {
        pilotRegistry,
        rosterEntryMeta,
        favorites,
        pilotNotes,
        pilotAliases,
        toggleFavorite,
        updatePilotNote,
        removeFromRegistry,
        renamePilot,
        mergePilots,
        undoLastMerge,
        mergeHistory,
        activeMergeNotificationId,
        dismissActiveMergeNotification,
        pendingReviews,
        dismissedRosterMergePairKeys,
        dismissRosterMergeSuggestionPairs,
        dismissedRosterCandidateKeys,
        dismissRosterCandidateKeys,
        addToRegistry,
        confirmRosterEntry,
        removePendingReview,
        addPilotAlias,
        removePilotAlias,
        matches,
        playerProfiles,
        knownMappings,
        uidMappings,
        setDrillDownTarget,
        ocrCorrections,
        ocrAliasModel,
        ocrAutoApplyMinScore,
        recordOcrAliasCorrection,
        removeOcrAliasCorrection,
    } = useAppStore(useShallow((state) => ({
        pilotRegistry: state.pilotRegistry,
        rosterEntryMeta: state.rosterEntryMeta,
        favorites: state.favorites,
        pilotNotes: state.pilotNotes,
        pilotAliases: state.pilotAliases,
        toggleFavorite: state.toggleFavorite,
        updatePilotNote: state.updatePilotNote,
        removeFromRegistry: state.removeFromRegistry,
        renamePilot: state.renamePilot,
        mergePilots: state.mergePilots,
        undoLastMerge: state.undoLastMerge,
        mergeHistory: state.mergeHistory,
        activeMergeNotificationId: state.activeMergeNotificationId,
        dismissActiveMergeNotification: state.dismissActiveMergeNotification,
        pendingReviews: state.pendingReviews,
        dismissedRosterMergePairKeys: state.dismissedRosterMergePairKeys,
        dismissRosterMergeSuggestionPairs: state.dismissRosterMergeSuggestionPairs,
        dismissedRosterCandidateKeys: state.dismissedRosterCandidateKeys,
        dismissRosterCandidateKeys: state.dismissRosterCandidateKeys,
        addToRegistry: state.addToRegistry,
        confirmRosterEntry: state.confirmRosterEntry,
        removePendingReview: state.removePendingReview,
        addPilotAlias: state.addPilotAlias,
        removePilotAlias: state.removePilotAlias,
        matches: state.matches,
        playerProfiles: state.playerProfiles,
        knownMappings: state.knownMappings,
        uidMappings: state.uidMappings,
        setDrillDownTarget: state.setDrillDownTarget,
        ocrCorrections: state.ocrCorrections,
        ocrAliasModel: state.ocrAliasModel,
        ocrAutoApplyMinScore: state.ocrAutoApplyMinScore,
        recordOcrAliasCorrection: state.recordOcrAliasCorrection,
        removeOcrAliasCorrection: state.removeOcrAliasCorrection,
    })));
    const { setActiveView, setToast } = useUIState();

    const [searchTerm, setSearchTerm] = useState('');
    const [ocrSearchTerm, setOcrSearchTerm] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('favorites');
    const [playerFilterMode, setPlayerFilterMode] = useState<PlayerFilterMode>('all');
    const [panelMode, setPanelMode] = useState<PlayerHubMode>('roster');
    const [selectedPilot, setSelectedPilot] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState<string | null>(null);
    const [noteValue, setNoteValue] = useState('');
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [mergeTarget, setMergeTarget] = useState<string | null>(null);
    const [mergeSearch, setMergeSearch] = useState('');
    const [mergeKeepName, setMergeKeepName] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [showFullProfile, setShowFullProfile] = useState(false);
    const [showAliases, setShowAliases] = useState(false);
    const [newAliasValue, setNewAliasValue] = useState('');
    const [pendingCandidateEdits, setPendingCandidateEdits] = useState<Record<string, string>>({});
    const [sourcePreview, setSourcePreview] = useState<{ src: string; label: string } | null>(null);
    const [possibleMergesExpanded, setPossibleMergesExpanded] = useState(false);
    const [rosterViewportWidth, setRosterViewportWidth] = useState<number>(() => (
        typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0
            ? window.innerWidth
            : 1280
    ));
    const [rosterViewportHeight, setRosterViewportHeight] = useState(DEFAULT_ROSTER_VIEWPORT_HEIGHT);
    const [rosterScrollTop, setRosterScrollTop] = useState(0);
    const hadPossibleMergesRef = useRef(false);
    const mergeKeepNameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rosterScrollRef = useRef<HTMLDivElement | null>(null);
    const uniquePilotRegistry = useMemo(() => Array.from(new Set(pilotRegistry || [])), [pilotRegistry]);
    const rosterNameSet = useMemo(() => new Set(uniquePilotRegistry), [uniquePilotRegistry]);
    const aliasVariantMap = useMemo(() => buildAliasVariantMap(ocrAliasModel), [ocrAliasModel]);
    const normalizedPilotNameMap = useMemo(() => {
        const lookup = new Map<string, string>();
        uniquePilotRegistry.forEach((name) => {
            const key = normalizeNameKey(name);
            if (!key || lookup.has(key)) return;
            lookup.set(key, name);
            (pilotAliases[name] || []).forEach((alias) => {
                const aliasKey = normalizeNameKey(alias);
                if (!aliasKey || lookup.has(aliasKey)) return;
                lookup.set(aliasKey, name);
            });
        });
        return lookup;
    }, [pilotAliases, uniquePilotRegistry]);
    const resolveTrackedProfileRosterName = useMemo(() => (
        (displayName: string): string | undefined => {
            const directKey = normalizeNameKey(displayName);
            if (!directKey) return undefined;
            const directRosterName = normalizedPilotNameMap.get(directKey);
            if (directRosterName) return directRosterName;

            const directCorrection = ocrCorrections[displayName] || ocrCorrections[normalizeOcrName(displayName)];
            if (directCorrection?.count >= 2) {
                const correctedKey = normalizeNameKey(directCorrection.correctedTo);
                if (correctedKey) {
                    const correctedRosterName = normalizedPilotNameMap.get(correctedKey);
                    if (correctedRosterName) return correctedRosterName;
                }
            }

            for (const [canonicalName, variants] of Object.entries(aliasVariantMap)) {
                if (!(variants || []).some((variant) => normalizeNameKey(variant) === directKey)) continue;
                const canonicalKey = normalizeNameKey(canonicalName);
                if (!canonicalKey) continue;
                const canonicalRosterName = normalizedPilotNameMap.get(canonicalKey);
                if (canonicalRosterName) return canonicalRosterName;
            }

            return undefined;
        }
    ), [aliasVariantMap, normalizedPilotNameMap, ocrCorrections]);
    const shouldHideTrackedProfile = useMemo(() => (
        (
            profileId: string,
            profile: { sightings?: number; ocrSightings?: number; manualSightings?: number } | null | undefined,
            displayName: string,
            rosterName: string | undefined
        ): boolean => {
            if (rosterName) return false;
            if (isOcrNoise(displayName)) return true;

            const sightings = Number(profile?.sightings || 0);
            const ocrSightings = Number(profile?.ocrSightings || 0);
            const manualSightings = Number(profile?.manualSightings || 0);
            if (sightings <= 0 && ocrSightings <= 0 && manualSightings <= 0) {
                return true;
            }

            const mappedShip = lookupUidName(uidMappings?.ships, profileId);
            const mappedWeapon = lookupUidName(uidMappings?.weapons, profileId);
            const mappedEquipment = lookupUidName(uidMappings?.equipment, profileId);
            const mappedPerk = lookupUidName(uidMappings?.perks, profileId);
            if (mappedShip || mappedWeapon || mappedEquipment || mappedPerk) {
                return true;
            }

            const normalizedDisplayName = normalizeEntityLabel(displayName);
            if (!normalizedDisplayName) return true;

            const normalizedProfileId = normalizeEntityLabel(profileId);
            const guidLikeProfileId = GUID_HEX_PATTERN.test(normalizeGuidKey(profileId));
            const isExactShipLikeEntity = (
                SHIP_NAME_SET.has(normalizedDisplayName)
                || WEAPON_NAME_SET.has(normalizedDisplayName)
                || EQUIPMENT_NAME_SET.has(normalizedDisplayName)
                || PERK_NAME_SET.has(normalizedDisplayName)
            );
            if (isExactShipLikeEntity && (guidLikeProfileId || normalizedProfileId === normalizedDisplayName)) {
                return true;
            }

            if (PROSPECTOR_NAME_SET.has(normalizedDisplayName) && guidLikeProfileId) {
                return true;
            }

            const hasNonPlayerHint = NON_PLAYER_NAME_HINTS.some((hint) => normalizedDisplayName.includes(hint));
            if (hasNonPlayerHint && guidLikeProfileId) {
                return true;
            }

            return false;
        }
    ), [uidMappings]);
    const trackedProfilesByPilot = useMemo(() => {
        const profilesByPilot = new Map<string, string[]>();

        uniquePilotRegistry.forEach((name) => {
            profilesByPilot.set(name, []);
        });

        const trackedOnlyNameByKey = new Map<string, string>();

        Object.entries(playerProfiles || {}).forEach(([profileId, profile]) => {
            const displayName = resolvePlayerProfileDisplayName(profileId, profile, knownMappings);
            if (!displayName) return;
            const key = normalizeNameKey(displayName);
            if (!key) return;
            const rosterName = resolveTrackedProfileRosterName(displayName);
            if (shouldHideTrackedProfile(profileId, profile, displayName, rosterName)) return;
            const pilotName = rosterName || trackedOnlyNameByKey.get(key) || displayName;
            if (!rosterName && !trackedOnlyNameByKey.has(key)) trackedOnlyNameByKey.set(key, pilotName);
            const existingProfileIds = profilesByPilot.get(pilotName) || [];
            if (!existingProfileIds.includes(profileId)) existingProfileIds.push(profileId);
            profilesByPilot.set(pilotName, existingProfileIds);
        });

        return profilesByPilot;
    }, [knownMappings, playerProfiles, resolveTrackedProfileRosterName, shouldHideTrackedProfile, uniquePilotRegistry]);
    const allTrackedPilots = useMemo(() => ([
        ...uniquePilotRegistry,
        ...Array.from(trackedProfilesByPilot.keys()).filter((name) => !rosterNameSet.has(name)),
    ]), [rosterNameSet, trackedProfilesByPilot, uniquePilotRegistry]);
    const pendingRosterCandidates = useMemo(() => {
        const seen = new Set<string>();
        return (pendingReviews || [])
            .filter((review) => review.type === 'roster_candidate' && review.value && review.value.trim().length > 0)
            .filter((review) => {
                const key = review.value.trim().toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [pendingReviews]);

    useEffect(() => {
        setPendingCandidateEdits((prev) => {
            const next: Record<string, string> = {};
            pendingRosterCandidates.forEach((candidate) => {
                const existing = prev[candidate.id];
                next[candidate.id] = typeof existing === 'string' ? existing : candidate.value;
            });
            return next;
        });
    }, [pendingRosterCandidates]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const handleResize = () => {
            if (Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
                setRosterViewportWidth(window.innerWidth);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const node = rosterScrollRef.current;
        if (!node) return undefined;
        const measure = () => {
            const nextHeight = node.clientHeight || DEFAULT_ROSTER_VIEWPORT_HEIGHT;
            setRosterViewportHeight(nextHeight);
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => measure());
        observer.observe(node);
        return () => observer.disconnect();
    }, [pendingRosterCandidates.length, panelMode, searchTerm]);

    useEffect(() => {
        setRosterScrollTop(0);
        if (rosterScrollRef.current) {
            rosterScrollRef.current.scrollTop = 0;
        }
    }, [playerFilterMode, searchTerm, sortMode, panelMode]);

    const filteredOcrCandidates = useMemo(() => {
        const query = ocrSearchTerm.trim().toLowerCase();
        if (!query) return pendingRosterCandidates;
        return pendingRosterCandidates.filter((candidate) => {
            const editedValue = String(pendingCandidateEdits[candidate.id] ?? candidate.value).trim().toLowerCase();
            return editedValue.includes(query);
        });
    }, [ocrSearchTerm, pendingCandidateEdits, pendingRosterCandidates]);

    const activeMergeNotification = useMemo(() => {
        if (!activeMergeNotificationId) return null;
        return (mergeHistory || []).find((entry) => entry.id === activeMergeNotificationId) || null;
    }, [activeMergeNotificationId, mergeHistory]);

    const deferredPilotRegistry = useDeferredValue(uniquePilotRegistry);
    const favoritePilotNames = useMemo(() => (
        new Set((favorites || []).map((entry) => String(entry || '').trim()).filter(Boolean))
    ), [favorites]);
    const rosterCandidateMatchMap = useMemo(() => {
        const lookup = new Map<string, string | null>();
        if (panelMode !== 'ocr-work') return lookup;
        pendingRosterCandidates.forEach((candidate) => {
            const key = normalizeNameKey(candidate.value);
            lookup.set(candidate.id, key ? (normalizedPilotNameMap.get(key) || null) : null);
        });
        return lookup;
    }, [normalizedPilotNameMap, panelMode, pendingRosterCandidates]);
    const possibleMergeGroups = useMemo(() => {
        if (panelMode !== 'ocr-work') return [] as RosterMergeSuggestionGroup[];
        return buildRosterMergeSuggestionGroups({
            pilotRegistry: deferredPilotRegistry,
            pilotAliases,
            pendingReviews,
            dismissedPairKeys: dismissedRosterMergePairKeys,
            autoMergeThresholdPct: Math.round((Number(ocrAutoApplyMinScore) || 0.83) * 100),
        });
    }, [dismissedRosterMergePairKeys, ocrAutoApplyMinScore, panelMode, pendingReviews, pilotAliases, deferredPilotRegistry]);

    const findRosterMatch = (value: string): string | null => {
        const normalizedValue = normalizeNameKey(value);
        if (!normalizedValue) return null;
        return normalizedPilotNameMap.get(normalizedValue) || null;
    };

    useEffect(() => {
        setShowFullProfile(false);
        setShowAliases(false);
        setNewAliasValue('');
    }, [selectedPilot]);

    useEffect(() => {
        if (!activeMergeNotification?.id) return undefined;
        const timer = window.setTimeout(() => {
            dismissActiveMergeNotification();
        }, 10_000);
        return () => window.clearTimeout(timer);
    }, [activeMergeNotification?.id, dismissActiveMergeNotification]);

    useEffect(() => {
        return () => {
            if (mergeKeepNameTimerRef.current !== null) clearTimeout(mergeKeepNameTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (possibleMergeGroups.length === 0) {
            hadPossibleMergesRef.current = false;
            setPossibleMergesExpanded(false);
            return;
        }
        if (!hadPossibleMergesRef.current) {
            setPossibleMergesExpanded(true);
        }
        hadPossibleMergesRef.current = true;
    }, [possibleMergeGroups.length]);

    const learnedAliasInsightsByTarget = useMemo(() => {
        const learnedByTarget = new Map<string, Map<string, AliasInsight>>();
        Object.values(ocrAliasModel?.entries || {}).forEach((entries) => {
            entries.forEach((entry) => {
                const targetKey = normalizeNameKey(entry.targetName);
                const rawKey = normalizeNameKey(entry.rawKey);
                if (!targetKey || !rawKey || rawKey === targetKey) return;
                const targetAliases = learnedByTarget.get(targetKey) || new Map<string, AliasInsight>();
                const existing = targetAliases.get(rawKey);
                const count = Number(entry.count || 0);
                if (existing) {
                    existing.count = (existing.count || 0) + count;
                } else {
                    targetAliases.set(rawKey, {
                        label: String(entry.rawKey || '').trim(),
                        count,
                        source: 'learned',
                    });
                }
                learnedByTarget.set(targetKey, targetAliases);
            });
        });
        const normalized = new Map<string, AliasInsight[]>();
        learnedByTarget.forEach((entries, targetKey) => {
            normalized.set(
                targetKey,
                Array.from(entries.values()).sort((left, right) => (
                    (right.count || 0) - (left.count || 0)
                    || left.label.localeCompare(right.label)
                ))
            );
        });
        return normalized;
    }, [ocrAliasModel]);

    const identityKeysByPilot = useMemo(() => {
        const lookup = new Map<string, Set<string>>();
        allTrackedPilots.forEach((name) => {
            const keys = new Set<string>();
            const normalizedName = normalizeNameKey(name);
            const isRoster = rosterNameSet.has(name);
            const rosterName = isRoster ? name : (normalizedPilotNameMap.get(normalizedName) || name);
            if (normalizedName) keys.add(normalizedName);
            (trackedProfilesByPilot.get(name) || []).forEach((profileId) => {
                const profileIdKey = normalizeNameKey(profileId);
                if (profileIdKey && profileIdKey !== normalizedName) keys.add(profileIdKey);
            });
            (pilotAliases[rosterName] || []).forEach((alias) => {
                const aliasKey = normalizeNameKey(alias);
                if (aliasKey && aliasKey !== normalizedName) keys.add(aliasKey);
            });
            (learnedAliasInsightsByTarget.get(normalizedName) || []).forEach((alias) => {
                const aliasKey = normalizeNameKey(alias.label);
                if (aliasKey && aliasKey !== normalizedName) keys.add(aliasKey);
            });
            lookup.set(name, keys);
        });
        return lookup;
    }, [allTrackedPilots, learnedAliasInsightsByTarget, normalizedPilotNameMap, pilotAliases, rosterNameSet, trackedProfilesByPilot]);

    const pilotNamesByIdentityKey = useMemo(() => {
        const lookup = new Map<string, Set<string>>();
        identityKeysByPilot.forEach((keys, pilotName) => {
            keys.forEach((key) => {
                const pilots = lookup.get(key) || new Set<string>();
                pilots.add(pilotName);
                lookup.set(key, pilots);
            });
        });
        return lookup;
    }, [identityKeysByPilot]);

    const getKnownAliasKeys = useMemo(() => (
        (name: string): Set<string> => new Set(identityKeysByPilot.get(name) || [])
    ), [identityKeysByPilot]);

    const encounterSnapshotsByPilot = useMemo(() => {
        const snapshots = new Map<string, EncounterSnapshot>();
        allTrackedPilots.forEach((name) => {
            snapshots.set(name, {
                totalEncounters: 0,
                encounterMatchIds: [],
                firstSeen: null,
                lastSeen: null,
                asTeammate: null,
                asOpponent: null,
            });
        });

        const collectPilots = (names: string[]): Set<string> => {
            const matched = new Set<string>();
            names.forEach((name) => {
                const key = normalizeNameKey(name);
                if (!key) return;
                (pilotNamesByIdentityKey.get(key) || new Set<string>()).forEach((pilotName) => matched.add(pilotName));
            });
            return matched;
        };

        const touchSeen = (snapshot: EncounterSnapshot, timestamp: number) => {
            if (!Number.isFinite(timestamp) || timestamp <= 0) return;
            snapshot.firstSeen = snapshot.firstSeen === null ? timestamp : Math.min(snapshot.firstSeen, timestamp);
            snapshot.lastSeen = snapshot.lastSeen === null ? timestamp : Math.max(snapshot.lastSeen, timestamp);
        };

        const recordEncounter = (snapshot: EncounterSnapshot, matchId: number, timestamp: number) => {
            if (Number.isFinite(matchId) && !snapshot.encounterMatchIds.includes(matchId)) {
                snapshot.encounterMatchIds.push(matchId);
                snapshot.totalEncounters = snapshot.encounterMatchIds.length;
            }
            touchSeen(snapshot, timestamp);
        };

        (matches || [])
            .filter((match) => match?.result !== 'Ongoing')
            .forEach((match) => {
                const matchId = Number(match?.id);
                const timestamp = Number(match?.timestamp || 0);
                const teammatePilots = collectPilots(Array.isArray(match.teammates) ? match.teammates : []);
                const opponentPilots = collectPilots(getMatchOpponentNames(match));

                teammatePilots.forEach((pilotName) => {
                    const snapshot = snapshots.get(pilotName);
                    if (!snapshot) return;
                    recordEncounter(snapshot, matchId, timestamp);
                    snapshot.asTeammate = snapshot.asTeammate || { wins: 0, total: 0 };
                    snapshot.asTeammate.total += 1;
                    if (match.result === 'Win') snapshot.asTeammate.wins += 1;
                });

                opponentPilots.forEach((pilotName) => {
                    const snapshot = snapshots.get(pilotName);
                    if (!snapshot) return;
                    recordEncounter(snapshot, matchId, timestamp);
                    snapshot.asOpponent = snapshot.asOpponent || { wins: 0, total: 0 };
                    snapshot.asOpponent.total += 1;
                    if (match.result === 'Win') snapshot.asOpponent.wins += 1;
                });
            });

        return snapshots;
    }, [allTrackedPilots, matches, pilotNamesByIdentityKey]);

    const rosterModel = useMemo(() => {
        const startedAt = performance.now();
        const mergeObservedCounts = (profileIds: string[], key: 'shipsObserved' | 'teamsObserved') => {
            return profileIds.reduce<Record<string, number>>((acc, profileId) => {
                const observed = playerProfiles?.[profileId]?.[key] || {};
                Object.entries(observed).forEach(([label, count]) => {
                    acc[label] = (acc[label] || 0) + Number(count || 0);
                });
                return acc;
            }, {});
        };
        const getAggregateTimestamp = (profileIds: string[], key: 'firstSeen' | 'lastSeen', mode: 'min' | 'max') => {
            const values = profileIds
                .map((profileId) => Number(playerProfiles?.[profileId]?.[key] || 0))
                .filter((value) => Number.isFinite(value) && value > 0);
            if (values.length === 0) return null;
            return mode === 'min' ? Math.min(...values) : Math.max(...values);
        };
        const getAggregateLastOcrConfidence = (profileIds: string[]) => {
            const ranked = (profileIds
                .map((profileId) => playerProfiles?.[profileId])
                .filter(Boolean) as Array<NonNullable<NonNullable<typeof playerProfiles>[string]>>)
                .sort((left, right) => Number(right.lastSeen || 0) - Number(left.lastSeen || 0));
            const profileWithConfidence = ranked.find((profile) => Number.isFinite(profile.lastOcrConfidence));
            return profileWithConfidence?.lastOcrConfidence ?? null;
        };

        const enrichedPilots = allTrackedPilots.map((name) => {
            const normalizedName = normalizeNameKey(name);
            const isRoster = rosterNameSet.has(name);
            const rosterName = isRoster ? name : (normalizedPilotNameMap.get(normalizedName) || name);
            const profileIds = trackedProfilesByPilot.get(name) || [];
            const encounterSnapshot = encounterSnapshotsByPilot.get(name);
            const rosterMeta = rosterEntryMeta?.[normalizedName] || null;
            const isDetected = rosterMeta?.origin === 'ocr' && rosterMeta?.status === 'detected';
            const isTrackedOnly = !isRoster && profileIds.length > 0;
            const totalEncounters = encounterSnapshot?.totalEncounters || 0;
            if (!isRoster && !isDetected && totalEncounters <= 0) {
                return null;
            }
            return {
                name,
                isFavorite: isRoster && favoritePilotNames.has(name),
                isRoster,
                isTrackedOnly,
                isDetected,
                needsReview: isDetected || isTrackedOnly,
                rosterMeta,
                note: isRoster ? (pilotNotes[rosterName] || '') : '',
                asTeammate: encounterSnapshot?.asTeammate || null,
                asOpponent: encounterSnapshot?.asOpponent || null,
                totalEncounters,
                encounterMatchIds: encounterSnapshot?.encounterMatchIds || [],
                firstSeen: encounterSnapshot?.firstSeen ?? getAggregateTimestamp(profileIds, 'firstSeen', 'min'),
                lastSeen: encounterSnapshot?.lastSeen ?? getAggregateTimestamp(profileIds, 'lastSeen', 'max'),
                shipsObserved: mergeObservedCounts(profileIds, 'shipsObserved'),
                teamsObserved: mergeObservedCounts(profileIds, 'teamsObserved'),
                ocrSightings: profileIds.reduce((sum, profileId) => sum + Number(playerProfiles?.[profileId]?.ocrSightings || 0), 0),
                manualSightings: profileIds.reduce((sum, profileId) => sum + Number(playerProfiles?.[profileId]?.manualSightings || 0), 0),
                lastOcrConfidence: getAggregateLastOcrConfidence(profileIds),
                profileIds,
            } satisfies PlayerDetail;
        }).filter(Boolean) as PlayerDetail[];
        const enrichedPilotsByName = new Map(enrichedPilots.map((pilot) => [pilot.name, pilot]));
        if (IS_DEV_BUILD) {
            Logger.debug('PlayerHub', 'Derived roster model', {
                durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
                pilotCount: allTrackedPilots.length,
                pendingCandidateCount: pendingRosterCandidates.length,
                panelMode,
            });
        }
        return {
            enrichedPilots,
            enrichedPilotsByName,
        };
    }, [
        encounterSnapshotsByPilot,
        favoritePilotNames,
        panelMode,
        pendingRosterCandidates.length,
        pilotNotes,
        playerProfiles,
        rosterEntryMeta,
        allTrackedPilots,
        normalizedPilotNameMap,
        rosterNameSet,
        trackedProfilesByPilot,
    ]);
    const enrichedPilots = rosterModel.enrichedPilots;
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const rosteredPlayerCount = useMemo(() => enrichedPilots.filter((pilot) => pilot.isRoster).length, [enrichedPilots]);
    const trackedOnlyPlayerCount = useMemo(() => enrichedPilots.filter((pilot) => pilot.isTrackedOnly).length, [enrichedPilots]);
    const needsReviewPlayerCount = useMemo(() => enrichedPilots.filter((pilot) => pilot.needsReview).length, [enrichedPilots]);

    const filtered = useMemo(() => {
        let list = enrichedPilots;
        if (playerFilterMode === 'roster') {
            list = list.filter((pilot) => pilot.isRoster);
        } else if (playerFilterMode === 'tracked-only') {
            list = list.filter((pilot) => pilot.isTrackedOnly);
        } else if (playerFilterMode === 'needs-review') {
            list = list.filter((pilot) => pilot.needsReview);
        }
        if (deferredSearchTerm) {
            const q = deferredSearchTerm.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        list = [...list].sort((a, b) => {
            if (a.isRoster !== b.isRoster) return a.isRoster ? -1 : 1;
            switch (sortMode) {
                case 'favorites':
                    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
                    return a.name.localeCompare(b.name);
                case 'alpha':
                    return a.name.localeCompare(b.name);
                case 'recent':
                    return (b.lastSeen || 0) - (a.lastSeen || 0);
                case 'encounters':
                    return b.totalEncounters - a.totalEncounters;
                default:
                    return 0;
            }
        });
        return list;
    }, [deferredSearchTerm, enrichedPilots, playerFilterMode, sortMode]);

    const selected = useMemo(() => {
        if (!selectedPilot) return null;
        return rosterModel.enrichedPilotsByName.get(selectedPilot) || null;
    }, [rosterModel.enrichedPilotsByName, selectedPilot]);
    const selectedStatusChips = selected ? getPlayerStatusChips(selected) : [];

    const selectedAliasInsights = useMemo(() => {
        if (!selected) return { manual: [] as AliasInsight[], learned: [] as AliasInsight[] };
        const selectedKey = normalizeNameKey(selected.name);
        const rosterName = selected.isRoster ? selected.name : (normalizedPilotNameMap.get(selectedKey) || selected.name);
        if (!selected.isRoster) {
            return {
                manual: [] as AliasInsight[],
                learned: learnedAliasInsightsByTarget.get(selectedKey) || [],
            };
        }
        const manual = (pilotAliases[rosterName] || [])
            .map((alias) => String(alias || '').trim())
            .filter(Boolean)
            .filter((alias, index, list) => (
                normalizeNameKey(alias) !== selectedKey
                && list.findIndex((candidate) => normalizeNameKey(candidate) === normalizeNameKey(alias)) === index
            ))
            .map((alias) => ({ label: alias, source: 'manual' as const }));
        const learned = (learnedAliasInsightsByTarget.get(selectedKey) || [])
            .filter((entry) => !manual.some((alias) => normalizeNameKey(alias.label) === normalizeNameKey(entry.label)));
        return { manual, learned };
    }, [learnedAliasInsightsByTarget, normalizedPilotNameMap, pilotAliases, selected]);

    const duplicateCandidates = useMemo(() => {
        if (!selected || !selected.isRoster) return [] as DuplicateCandidate[];
        const selectedKey = normalizeOcrName(selected.name || '').toLowerCase();
        const selectedAliasKeys = getKnownAliasKeys(selected.name);

        return enrichedPilots
            .filter((candidate) => candidate.name !== selected.name && candidate.isRoster)
            .map((candidate) => {
                const candidateKey = normalizeOcrName(candidate.name || '').toLowerCase();
                const candidateAliasKeys = getKnownAliasKeys(candidate.name);
                const reasons: string[] = [];
                const sharedAliasKeys = Array.from(selectedAliasKeys).filter((aliasKey) => (
                    aliasKey !== selectedKey
                    && aliasKey !== candidateKey
                    && candidateAliasKeys.has(aliasKey)
                ));
                const directAliasMatch = selectedAliasKeys.has(candidateKey) || candidateAliasKeys.has(selectedKey);
                const similarity = similarityScore(selected.name, candidate.name);

                if (directAliasMatch) reasons.push('listed as a former or alias name');
                if (sharedAliasKeys.length > 0) reasons.push(`${sharedAliasKeys.length} shared alias variant${sharedAliasKeys.length === 1 ? '' : 's'}`);
                if (similarity >= 92) reasons.push(`very close spelling (${similarity}%)`);
                else if (similarity >= 78) reasons.push(`similar spelling (${similarity}%)`);

                if (reasons.length === 0) return null;

                const score = Math.min(
                    100,
                    similarity
                    + (directAliasMatch ? 25 : 0)
                    + (sharedAliasKeys.length * 12)
                );
                return {
                    name: candidate.name,
                    score,
                    similarity,
                    reasons,
                    totalEncounters: candidate.totalEncounters,
                } satisfies DuplicateCandidate;
            })
            .filter((candidate): candidate is DuplicateCandidate => Boolean(candidate))
            .sort((left, right) => {
                if (right.score !== left.score) return right.score - left.score;
                if (right.totalEncounters !== left.totalEncounters) return right.totalEncounters - left.totalEncounters;
                return left.name.localeCompare(right.name);
            })
            .slice(0, 6);
    }, [enrichedPilots, getKnownAliasKeys, selected]);

    const selectedTopShip = useMemo(() => {
        if (!selected) return null;
        const top = Object.entries(selected.shipsObserved || {}).sort((a, b) => b[1] - a[1])[0];
        return top || null;
    }, [selected]);

    const selectedPatternSignals = useMemo(() => {
        if (!selected) return { topTeammate: null as [string, number] | null, topOpponent: null as [string, number] | null };

        const toNameKey = (value: string) => normalizeNameKey(value);
        const toDisplayName = (value: string) => String(value || '').trim();
        const selectedKeys = getKnownAliasKeys(selected.name);
        if (selectedKeys.size === 0) return { topTeammate: null as [string, number] | null, topOpponent: null as [string, number] | null };

        const teammateCounts = new Map<string, { name: string; count: number }>();
        const opponentCounts = new Map<string, { name: string; count: number }>();

        const incrementCounter = (counter: Map<string, { name: string; count: number }>, name: string) => {
            const cleaned = toDisplayName(name);
            const key = toNameKey(cleaned);
            if (!cleaned || !key || selectedKeys.has(key)) return;
            const canonicalName = (() => {
                const matches = Array.from(pilotNamesByIdentityKey.get(key) || []);
                if (matches.length === 0) return cleaned;
                return matches.sort((left, right) => {
                    const leftIsRoster = Boolean(normalizedPilotNameMap.get(normalizeNameKey(left)));
                    const rightIsRoster = Boolean(normalizedPilotNameMap.get(normalizeNameKey(right)));
                    if (leftIsRoster !== rightIsRoster) return leftIsRoster ? -1 : 1;
                    return left.localeCompare(right);
                })[0];
            })();
            const canonicalKey = toNameKey(canonicalName);
            if (!canonicalKey || selectedKeys.has(canonicalKey)) return;
            const current = counter.get(canonicalKey);
            if (current) {
                current.count += 1;
                return;
            }
            counter.set(canonicalKey, { name: canonicalName, count: 1 });
        };

        (matches || []).forEach((match) => {
            const teamNames = [
                toDisplayName(match.player),
                ...(Array.isArray(match.teammates) ? match.teammates.map(toDisplayName) : []),
            ].filter(Boolean);

            const dedupedTeam = new Map<string, string>();
            teamNames.forEach((name) => {
                const key = toNameKey(name);
                if (!key || dedupedTeam.has(key)) return;
                dedupedTeam.set(key, name);
            });

            const opponentsFromTeams = Array.isArray(match.opponentTeams)
                ? match.opponentTeams.flatMap((team) => (Array.isArray(team.players) ? team.players : []))
                : [];
            const allOpponents = [
                ...(Array.isArray(match.opponents) ? match.opponents : []),
                ...opponentsFromTeams,
            ].map(toDisplayName).filter(Boolean);

            const dedupedOpponents = new Map<string, string>();
            allOpponents.forEach((name) => {
                const key = toNameKey(name);
                if (!key || dedupedOpponents.has(key)) return;
                dedupedOpponents.set(key, name);
            });

            const selectedInFriendly = Array.from(dedupedTeam.keys()).some((key) => selectedKeys.has(key));
            const selectedInEnemy = Array.from(dedupedOpponents.keys()).some((key) => selectedKeys.has(key));
            if (!selectedInFriendly && !selectedInEnemy) return;

            if (selectedInFriendly) {
                dedupedTeam.forEach((name, key) => {
                    if (!selectedKeys.has(key)) incrementCounter(teammateCounts, name);
                });
                dedupedOpponents.forEach((name) => {
                    incrementCounter(opponentCounts, name);
                });
                return;
            }

            dedupedOpponents.forEach((name, key) => {
                if (!selectedKeys.has(key)) incrementCounter(teammateCounts, name);
            });
            dedupedTeam.forEach((name) => {
                incrementCounter(opponentCounts, name);
            });
        });

        const pickTop = (counter: Map<string, { name: string; count: number }>): [string, number] | null => {
            const sorted = Array.from(counter.values()).sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.name.localeCompare(b.name);
            });
            const top = sorted[0];
            return top ? [top.name, top.count] : null;
        };

        return {
            topTeammate: pickTop(teammateCounts),
            topOpponent: pickTop(opponentCounts),
        };
    }, [getKnownAliasKeys, matches, normalizedPilotNameMap, pilotNamesByIdentityKey, selected]);

    const rosterColumnCount = rosterViewportWidth >= 1536 ? 3 : 2;
    const rosterTotalRows = Math.ceil(filtered.length / rosterColumnCount);
    const rosterVisibleRowStart = Math.max(0, Math.floor(rosterScrollTop / ROSTER_GRID_ROW_HEIGHT) - ROSTER_GRID_OVERSCAN_ROWS);
    const rosterVisibleRowEnd = Math.min(
        rosterTotalRows,
        Math.ceil((rosterScrollTop + rosterViewportHeight) / ROSTER_GRID_ROW_HEIGHT) + ROSTER_GRID_OVERSCAN_ROWS
    );
    const rosterVisibleStartIndex = rosterVisibleRowStart * rosterColumnCount;
    const rosterVisibleEndIndex = Math.min(filtered.length, rosterVisibleRowEnd * rosterColumnCount);
    const rosterVisiblePilots = filtered.slice(rosterVisibleStartIndex, rosterVisibleEndIndex);
    const rosterVisibleOffsetY = rosterVisibleRowStart * ROSTER_GRID_ROW_HEIGHT;
    const rosterTotalHeight = Math.max(rosterTotalRows * ROSTER_GRID_ROW_HEIGHT, rosterViewportHeight);

    const selectedTopTeammate = selectedPatternSignals.topTeammate;
    const selectedTopOpponent = selectedPatternSignals.topOpponent;

    const handleStartNote = (pilot: string) => {
        setEditingNote(pilot);
        setNoteValue(pilotNotes[pilot] || '');
    };

    const handleSaveNote = () => {
        if (editingNote) {
            updatePilotNote(editingNote, noteValue);
            setEditingNote(null);
        }
    };

    const handleStartRename = (pilot: string) => {
        setRenaming(pilot);
        setRenameValue(pilot);
    };

    const handleSaveRename = () => {
        if (renaming && renameValue.trim() && renameValue !== renaming) {
            const trimmedValue = renameValue.trim();
            const normalizedRenameValue = normalizeNameKey(trimmedValue);
            const collisionCandidate = normalizedRenameValue
                ? normalizedPilotNameMap.get(normalizedRenameValue)
                : null;
            const collision = collisionCandidate && collisionCandidate !== renaming
                ? collisionCandidate
                : null;
            if (collision) {
                setShowFullProfile(true);
                setMergeTarget(collision);
                setMergeKeepName(collision);
                setMergeSearch(collision);
                setToast({
                    message: `Rename collides with "${collision}". Review a merge instead.`,
                    type: 'warning',
                });
                setRenaming(null);
                return;
            }
            renamePilot(renaming, trimmedValue);
            if (selectedPilot === renaming) setSelectedPilot(renameValue.trim());
        }
        setRenaming(null);
    };

    const handleAddAlias = (kind: 'manual' | 'learned') => {
        if (!selected || !selected.isRoster) return;
        const trimmedAlias = normalizeOcrName(newAliasValue);
        if (!trimmedAlias) return;
        const trimmedKey = normalizeNameKey(trimmedAlias);
        const selectedKey = normalizeNameKey(selected.name);
        const rosterName = selected.name;
        if (!trimmedKey || trimmedKey === selectedKey) return;
        const manualExists = selectedAliasInsights.manual.some((alias) => normalizeNameKey(alias.label) === trimmedKey);
        const learnedExists = selectedAliasInsights.learned.some((alias) => normalizeNameKey(alias.label) === trimmedKey);
        if ((kind === 'manual' && manualExists) || (kind === 'learned' && learnedExists)) return;
        if (kind === 'manual') {
            addPilotAlias(rosterName, trimmedAlias);
        }
        recordOcrAliasCorrection(trimmedAlias, rosterName, {
            source: 'manual_correction',
            context: 'unknown',
            confidenceWeight: 1,
        });
        setNewAliasValue('');
        setShowAliases(true);
    };

    const handleRemoveAlias = (pilotName: string, alias: string) => {
        removePilotAlias(pilotName, alias);
        removeOcrAliasCorrection(alias, pilotName);
    };

    const handleRemoveLearnedVariant = (pilotName: string, alias: string) => {
        removeOcrAliasCorrection(alias, pilotName);
    };

    const handleMerge = () => {
        if (!selectedPilot || !mergeTarget || !mergeKeepName) return;
        const removeName = mergeKeepName === selectedPilot ? mergeTarget : selectedPilot;
        mergePilots(removeName, mergeKeepName);
        setSelectedPilot(mergeKeepName);
        setMergeTarget(null);
        if (mergeKeepNameTimerRef.current !== null) clearTimeout(mergeKeepNameTimerRef.current);
        mergeKeepNameTimerRef.current = setTimeout(() => setMergeKeepName(null), 3000);
        setMergeSearch('');
    };

    const handleDelete = (pilot: string) => {
        removeFromRegistry(pilot);
        if (selectedPilot === pilot) setSelectedPilot(null);
        setConfirmDelete(null);
    };

    const handleConfirmDetectedEntry = (pilot: string) => {
        confirmRosterEntry(pilot, 'ocr');
        setToast({ message: `Confirmed "${pilot}" in the roster`, type: 'success' });
    };

    const handlePromoteTrackedEntry = (player: PlayerDetail) => {
        if (player.isRoster) return;
        addToRegistry(player.name, {
            origin: player.ocrSightings > 0 ? 'ocr' : 'manual',
            status: 'confirmed',
        });
        setToast({ message: `Added "${player.name}" to the roster`, type: 'success' });
    };

    const handleDismissDetectedEntry = (pilot: string) => {
        removeFromRegistry(pilot);
        if (selectedPilot === pilot) setSelectedPilot(null);
        setToast({ message: `Dismissed detected roster entry "${pilot}"`, type: 'info' });
    };

    const timeAgo = (ts: number | null) => {
        if (!ts) return 'Never';
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    const winRate = (stats: { wins: number; total: number } | null) => {
        if (!stats || stats.total === 0) return null;
        return Math.round((stats.wins / stats.total) * 100);
    };

    const handleOpenFullProfile = (player: PlayerDetail) => {
        const teammateTotal = player.asTeammate?.total || 0;
        const opponentTotal = player.asOpponent?.total || 0;
        const drillType = teammateTotal >= opponentTotal ? 'Teammate' : 'Opponent';
        setDrillDownTarget({
            name: player.name,
            type: drillType,
            ...(player.encounterMatchIds.length > 0 ? {
                matchIds: player.encounterMatchIds,
                encounterScope: 'all' as const,
            } : {}),
        });
        setActiveView('analytics');
    };

    const mergeCandidates = useMemo(() => {
        if (!selectedPilot) return [];
        const q = mergeSearch.toLowerCase();
        return enrichedPilots
            .filter((pilot) => pilot.isRoster && pilot.name !== selectedPilot && (!q || pilot.name.toLowerCase().includes(q)))
            .slice(0, 20);
    }, [enrichedPilots, selectedPilot, mergeSearch]);

    const clearResolvedRosterCandidates = (
        candidate: { id: string; value: string; canonicalTargetKey?: string | null | undefined },
        resolvedValue: string,
        action: 'approve' | 'merge' | 'dismiss'
    ) => {
        const candidateKey = normalizeOcrName(candidate.value || '').toLowerCase();
        const resolvedKey = normalizeOcrName(resolvedValue || '').toLowerCase();
        (pendingReviews || [])
            .filter((review) => {
                if (review.type !== 'roster_candidate') return false;
                const reviewKey = normalizeOcrName(review.value || '').toLowerCase();
                if (review.id === candidate.id) return true;
                if (candidateKey && reviewKey === candidateKey) return true;
                if (candidate.canonicalTargetKey && review.canonicalTargetKey === candidate.canonicalTargetKey) return true;
                if (action === 'merge' && resolvedKey && reviewKey === resolvedKey) return true;
                return false;
            })
            .forEach((review) => removePendingReview(review.id));
        setPendingCandidateEdits((prev) => {
            const next = { ...prev };
            delete next[candidate.id];
            return next;
        });
    };

    const mergeRosterCandidateIntoExisting = (
        candidate: {
            id: string;
            value: string;
            canonicalTargetKey?: string | null | undefined;
        },
        targetName: string,
        overrideValue?: string
    ) => {
        const rawValue = String(overrideValue ?? candidate.value).trim();
        const resolvedTarget = normalizeOcrName(targetName);
        if (!rawValue || !resolvedTarget) return;
        const normalizedRaw = normalizeOcrName(rawValue);
        if (normalizedRaw.toLowerCase() !== resolvedTarget.toLowerCase()) {
            recordOcrAliasCorrection(normalizedRaw, resolvedTarget, {
                source: 'review_modal',
                context: 'unknown',
                confidenceWeight: 1,
            });
        }
        addToRegistry(resolvedTarget, { origin: 'ocr', status: 'confirmed' });
        clearResolvedRosterCandidates(candidate, resolvedTarget, 'merge');
        setSelectedPilot(resolvedTarget);
        setToast({
            message: `Merged OCR candidate "${rawValue}" into "${resolvedTarget}"`,
            type: 'success',
        });
    };

    const resolveRosterCandidate = (
        candidate: { id: string; value: string },
        action: 'approve' | 'dismiss',
        overrideValue?: string
    ) => {
        const value = String(overrideValue ?? candidate.value).trim();
        if (!value) return;
        if (action === 'approve') {
            const existingMatch = findRosterMatch(value);
            if (existingMatch) {
                clearResolvedRosterCandidates(candidate, existingMatch, 'approve');
                setSelectedPilot(existingMatch);
                setToast({ message: `"${existingMatch}" is already in the roster. Review merge suggestions instead.`, type: 'info' });
                return;
            }
            addToRegistry(value, { origin: 'ocr', status: 'confirmed' });
            setToast({ message: `Added "${value}" to roster as a new player`, type: 'success' });
        }
        if (action === 'dismiss') {
            const dismissKey = normalizeOcrName(candidate.value || '').toLowerCase();
            if (dismissKey) dismissRosterCandidateKeys([dismissKey]);
        }
        clearResolvedRosterCandidates(candidate, value, action);
        if (action === 'dismiss') {
            setToast({ message: `Dismissed pending roster candidate "${value}"`, type: 'info' });
        }
    };

    const handleMergeSuggestionGroup = (group: RosterMergeSuggestionGroup) => {
        if (!group.canonicalName || group.variants.length === 0) return;
        group.variants.forEach((variant) => {
            mergePilots(variant.name, group.canonicalName);
        });
        setSelectedPilot(group.canonicalName);
        setToast({
            message: `Merged ${group.variants.length} roster variant${group.variants.length === 1 ? '' : 's'} into "${group.canonicalName}"`,
            type: 'success',
        });
    };

    const handleDismissMergeSuggestionGroup = (group: RosterMergeSuggestionGroup) => {
        dismissRosterMergeSuggestionPairs(group.pairKeys);
        setToast({
            message: `Dismissed possible merge suggestion for "${group.canonicalName}"`,
            type: 'info',
        });
    };

    const renderOcrWorkbench = (containerClassName: string) => (
        <div className={containerClassName}>
            <div className={`md3-card mg-surface shadow-lg p-3 border flex flex-col gap-2 h-full min-h-0 ${panelMode === 'ocr-work'
                ? 'border-info/40 ring-1 ring-info/25'
                : 'border-md-sys-outline/12'
                }`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ScanEye size={14} className="text-info" />
                        <div className="text-label-sm font-semibold uppercase tracking-wide text-info">OCR Roster Workbench</div>
                    </div>
                    <span className="text-label-xs font-bold px-2 py-0.5 rounded-pill bg-info-soft text-info">
                        {pendingRosterCandidates.length}
                    </span>
                </div>
                <p className="text-label-xs text-md-sys-on-surface/62">
                    Review OCR-detected roster names, add them as new pilots, or merge them into an existing identity without hiding your roster list.
                </p>
                {possibleMergeGroups.length === 0 ? (
                    <div className="px-1 text-label-xs text-md-sys-on-surface/50">
                        No merge candidates found
                    </div>
                ) : (
                    <div className="rounded-xl border border-warning-soft bg-warning-soft/20">
                        <button
                            type="button"
                            onClick={() => setPossibleMergesExpanded((prev) => !prev)}
                            className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left"
                            aria-expanded={possibleMergesExpanded}
                            aria-label={`${possibleMergesExpanded ? 'Collapse' : 'Expand'} possible merges`}
                        >
                            <div>
                                <div className="text-label-sm font-semibold uppercase tracking-wide text-warning">Possible Merges</div>
                                <div className="text-label-xs text-md-sys-on-surface/62">
                                    {possibleMergeGroups.length} roster merge candidate{possibleMergeGroups.length === 1 ? '' : 's'} need review
                                </div>
                            </div>
                            <div className={`transition-transform ${possibleMergesExpanded ? 'rotate-90' : ''}`}>
                                <ChevronRight size={14} className="text-warning" />
                            </div>
                        </button>
                        {possibleMergesExpanded && (
                            <div className="px-3 pb-3 flex flex-col gap-2">
                                {possibleMergeGroups.map((group) => (
                                    <div key={group.pairKeys.join('|')} className="rounded-lg border border-warning-soft/80 bg-md-sys-surface px-3 py-2.5 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-label-sm font-semibold text-warning truncate">
                                                    Merge into {group.canonicalName}
                                                </div>
                                                <div className="text-label-xs text-md-sys-on-surface/58">
                                                    Highest similarity: {Math.round(group.score)}%
                                                </div>
                                            </div>
                                            <span className="text-label-xs font-bold px-2 py-0.5 rounded-pill bg-warning-soft text-warning shrink-0">
                                                {group.variants.length + 1} names
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <span className="px-2 py-1 rounded-pill bg-warning text-ink-strong text-label-xs font-bold">
                                                Keep {group.canonicalName}
                                            </span>
                                            {group.variants.map((variant) => (
                                                <span
                                                    key={`${group.canonicalName}-${variant.name}`}
                                                    className="px-2 py-1 rounded-pill bg-md-sys-on-surface/8 text-label-xs font-semibold text-md-sys-on-surface/72"
                                                >
                                                    {variant.name} ({Math.round(variant.score)}%)
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => handleMergeSuggestionGroup(group)}
                                                className="flex-1 h-8 rounded-md text-label-xs font-bold bg-warning text-ink-strong hover:brightness-95"
                                                aria-label={`Merge possible roster variants into ${group.canonicalName}`}
                                            >
                                                Merge
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDismissMergeSuggestionGroup(group)}
                                                className="flex-1 h-8 rounded-md text-label-xs font-bold bg-md-sys-on-surface/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/15"
                                                aria-label={`Dismiss possible merge suggestions for ${group.canonicalName}`}
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40 pointer-events-none" />
                    <input
                        type="text"
                        value={ocrSearchTerm}
                        onChange={(event) => setOcrSearchTerm(event.target.value)}
                        placeholder="Search OCR candidates..."
                        className="w-full md3-textfield--outlined rounded-xl pl-8 pr-8 py-1.5 text-label-sm outline-none"
                    />
                    {ocrSearchTerm && (
                        <button
                            type="button"
                            onClick={() => setOcrSearchTerm('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                            aria-label="Clear OCR candidate search"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
                <div className="flex-1 min-h-0">
                    {pendingRosterCandidates.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center py-8 text-md-sys-on-surface/40">
                            <ScanEye size={24} className="mb-2 opacity-40" />
                            <span className="text-label-sm font-semibold">No pending OCR roster candidates</span>
                        </div>
                    ) : filteredOcrCandidates.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center py-8 text-md-sys-on-surface/40">
                            <Search size={20} className="mb-2 opacity-40" />
                            <span className="text-label-sm font-semibold">No OCR candidates match your search</span>
                        </div>
                    ) : (
                        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar pr-1">
                            <div className="flex flex-col gap-2 content-start">
                                {filteredOcrCandidates.map((candidate) => {
                                    const pendingValue = pendingCandidateEdits[candidate.id] ?? candidate.value;
                                    const sourceScreenshotPath = String(candidate.sourceCapture?.screenshotPath || '').trim();
                                    const sourceScreenshotLabel = String(candidate.sourceCapture?.screenshotLabel || 'Captured Screenshot').trim() || 'Captured Screenshot';
                                    const sourceCapturedAt = Number(candidate.sourceCapture?.capturedAt || 0);
                                    const sourceCapturedLabel = Number.isFinite(sourceCapturedAt) && sourceCapturedAt > 0
                                        ? new Date(sourceCapturedAt).toLocaleString()
                                        : '';
                                    const normalizedPendingValue = normalizeOcrName(pendingValue);
                                    const existingRosterMatch = rosterCandidateMatchMap.get(candidate.id) ?? findRosterMatch(pendingValue);
                                    const mergeSuggestions = [
                                        candidate.bestMatch && normalizeOcrName(candidate.bestMatch).toLowerCase() !== normalizeOcrName(candidate.value).toLowerCase()
                                            ? {
                                                name: normalizeOcrName(candidate.bestMatch),
                                                score: Number(candidate.bestScore || 0),
                                                kind: 'best' as const,
                                            }
                                            : null,
                                        ...((candidate.suggestions || []).map((suggestion) => ({
                                            name: normalizeOcrName(suggestion.name),
                                            score: Number(suggestion.score || 0),
                                            kind: 'suggestion' as const,
                                        }))),
                                    ]
                                        .filter((entry): entry is { name: string; score: number; kind: 'best' | 'suggestion' } => Boolean(entry?.name))
                                        .filter((entry, index, list) => (
                                            normalizeOcrName(entry.name).toLowerCase() !== normalizedPendingValue.toLowerCase()
                                            && (!existingRosterMatch || normalizeOcrName(entry.name).toLowerCase() !== normalizeOcrName(existingRosterMatch).toLowerCase())
                                            && list.findIndex((candidateEntry) => normalizeOcrName(candidateEntry.name).toLowerCase() === normalizeOcrName(entry.name).toLowerCase()) === index
                                        ))
                                        .slice(0, 4);
                                    return (
                                        <div key={candidate.id} className="rounded-xl border border-md-sys-outline/14 bg-md-sys-surface-container p-2.5 space-y-2">
                                            <input
                                                type="text"
                                                value={pendingValue}
                                                onChange={(event) => setPendingCandidateEdits((prev) => ({
                                                    ...prev,
                                                    [candidate.id]: event.target.value,
                                                }))}
                                                onKeyDown={(event) => {
                                                    event.stopPropagation();
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        resolveRosterCandidate(candidate, 'approve', pendingValue);
                                                    }
                                                }}
                                                className="md3-textfield md3-textfield--outlined w-full text-label-sm font-semibold"
                                                aria-label={`Pending OCR roster candidate ${candidate.id}`}
                                            />
                                            {sourceScreenshotPath && (
                                                <div className="rounded-lg border border-md-sys-outline/16 bg-md-sys-surface px-2 py-1.5 flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-label-xs font-semibold truncate text-md-sys-on-surface/75">
                                                            Source: {sourceScreenshotLabel}
                                                        </div>
                                                        {sourceCapturedLabel && (
                                                            <div className="text-label-xs text-md-sys-on-surface/50 truncate">
                                                                Captured: {sourceCapturedLabel}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSourcePreview({ src: sourceScreenshotPath, label: sourceScreenshotLabel })}
                                                        className="h-7 px-2 rounded-md text-label-xs font-bold bg-info/15 text-info hover:bg-info/25 inline-flex items-center gap-1 shrink-0"
                                                    >
                                                        <ImageIcon size={12} />
                                                        View Source
                                                    </button>
                                                </div>
                                            )}
                                            {(existingRosterMatch || mergeSuggestions.length > 0) && (
                                                <div className="rounded-lg border border-warning-soft bg-warning-soft/30 px-2.5 py-2 space-y-2">
                                                    <div className="text-label-xs font-semibold uppercase tracking-wide text-warning">
                                                        Possible existing identity
                                                    </div>
                                                    {existingRosterMatch && (
                                                        <div className="flex gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => mergeRosterCandidateIntoExisting(candidate, existingRosterMatch, pendingValue)}
                                                                className="flex-1 flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left bg-md-sys-surface hover:bg-md-sys-surface-container-high"
                                                            >
                                                                <span className="text-label-sm font-semibold text-md-sys-on-surface truncate">
                                                                    Use existing: {existingRosterMatch}
                                                                </span>
                                                                <span className="text-label-xs font-bold uppercase text-warning">Match</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { addPilotAlias(existingRosterMatch, pendingValue); resolveRosterCandidate(candidate, 'dismiss', pendingValue); }}
                                                                className="px-2.5 py-1.5 rounded-md text-label-xs font-bold bg-md-sys-primary/15 text-md-sys-primary hover:bg-md-sys-primary/25 shrink-0"
                                                                title={`Add "${pendingValue}" as alias of ${existingRosterMatch}`}
                                                            >
                                                                As alias
                                                            </button>
                                                        </div>
                                                    )}
                                                    {mergeSuggestions.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {mergeSuggestions.map((suggestion) => (
                                                                <div key={`${candidate.id}-${suggestion.name}-${suggestion.kind}`} className="flex rounded-md overflow-hidden">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => mergeRosterCandidateIntoExisting(candidate, suggestion.name, pendingValue)}
                                                                        className="px-2.5 py-1.5 text-label-xs font-bold bg-warning text-ink-strong hover:brightness-95"
                                                                    >
                                                                        Merge into {suggestion.name}
                                                                        {suggestion.score > 0 ? ` (${Math.round(suggestion.score)}%)` : ''}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { addPilotAlias(suggestion.name, pendingValue); resolveRosterCandidate(candidate, 'dismiss', pendingValue); }}
                                                                        className="px-2 py-1.5 text-label-xs font-bold bg-md-sys-primary/20 text-md-sys-primary hover:bg-md-sys-primary/30 border-l border-ink-strong/10"
                                                                        title={`Add "${pendingValue}" as alias of ${suggestion.name}`}
                                                                    >
                                                                        as alias
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => resolveRosterCandidate(candidate, 'approve', pendingValue)}
                                                    className="flex-1 h-8 rounded-md text-label-xs font-bold bg-success/15 text-success hover:bg-success/25 disabled:opacity-disabled"
                                                    disabled={!pendingValue.trim() || !!existingRosterMatch}
                                                >
                                                    Add as New
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => resolveRosterCandidate(candidate, 'dismiss', pendingValue)}
                                                    className="flex-1 h-8 rounded-md text-label-xs font-bold bg-md-sys-on-surface/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/15"
                                                    disabled={!pendingValue.trim()}
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div data-tour="view-players" className="players-solid-scope players-shell-surface w-full flex-1 h-full min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] gap-4 overflow-visible rounded-2xl">
            {/* Column 1: Roster List */}
            <div className="w-full lg:w-full shrink-0 flex flex-col gap-3 h-full min-h-0">
                <div className="md3-card mg-surface shadow-lg p-4 flex flex-col gap-3 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
                                <Users size={16} />
                            </div>
                            <div>
                                <h2 className="text-body font-bold text-md-sys-on-surface uppercase tracking-tight">Players</h2>
                                <span className="text-label-xs text-md-sys-on-surface/60">
                                    {rosteredPlayerCount} rostered
                                    {trackedOnlyPlayerCount > 0 ? ` · ${trackedOnlyPlayerCount} tracked only` : ''}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        <button
                            type="button"
                            onClick={() => setPanelMode('ocr-work')}
                            className={`h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all ${panelMode === 'ocr-work'
                                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                                }`}
                        >
                            OCR Work {pendingRosterCandidates.length > 0 ? `(${pendingRosterCandidates.length})` : ''}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPanelMode('roster')}
                            className={`h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all ${panelMode === 'roster'
                                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                                }`}
                        >
                            Details
                        </button>
                    </div>

                    <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40 pointer-events-none" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search players..."
                            className="w-full md3-textfield--outlined rounded-xl pl-10 pr-12 py-2 text-label-sm outline-none"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10" aria-label="Clear player search">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="flex gap-1">
                        {([
                            { id: 'favorites', label: 'Pinned' },
                            { id: 'alpha', label: 'A-Z' },
                            { id: 'recent', label: 'Recent' },
                            { id: 'encounters', label: 'Most Seen' },
                        ] as { id: SortMode; label: string }[]).map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSortMode(s.id)}
                                className={`flex-1 h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all ${sortMode === s.id
                                    ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                    : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                                    }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        {([
                            { id: 'all', label: 'All', count: enrichedPilots.length },
                            { id: 'roster', label: 'Roster', count: rosteredPlayerCount },
                            { id: 'tracked-only', label: 'Tracked Only', count: trackedOnlyPlayerCount },
                            { id: 'needs-review', label: 'Needs Review', count: needsReviewPlayerCount },
                        ] as { id: PlayerFilterMode; label: string; count: number }[]).map((filter) => (
                            <button
                                key={filter.id}
                                type="button"
                                onClick={() => setPlayerFilterMode(filter.id)}
                                className={`h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all ${playerFilterMode === filter.id
                                    ? 'bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer'
                                    : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                                    }`}
                            >
                                {filter.label} {filter.count > 0 ? `(${filter.count})` : ''}
                            </button>
                        ))}
                    </div>
                </div>

                {activeMergeNotification && (() => {
                    const ago = Math.round((Date.now() - activeMergeNotification.timestamp) / 1000);
                    const agoLabel = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                    return (
                        <div className="flex items-center justify-between gap-2 bg-warning-soft border border-warning-soft rounded-xl px-3 py-2 shrink-0">
                            <span className="text-label-xs text-warning truncate">
                                Merged <strong>{activeMergeNotification.sourceName}</strong> → <strong>{activeMergeNotification.targetName}</strong> ({agoLabel})
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => undoLastMerge()}
                                    className="flex items-center gap-1 px-2 py-1 bg-warning-soft hover:bg-warning hover:text-ink-strong text-warning rounded text-label-xs font-bold transition-colors shrink-0"
                                >
                                    <Undo2 size={10} /> Undo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => dismissActiveMergeNotification()}
                                    className="flex items-center gap-1 px-2 py-1 bg-md-sys-on-surface/10 hover:bg-md-sys-on-surface/15 text-warning rounded text-label-xs font-bold transition-colors shrink-0"
                                    aria-label="Dismiss merge notification"
                                    title="Dismiss merge notification"
                                >
                                    <X size={10} />
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {pendingRosterCandidates.length > 0 && (
                    <div className="md3-card mg-surface shadow-lg p-3 border border-info/20 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="text-label-sm font-semibold uppercase tracking-wide text-info">OCR Roster Work</div>
                            <span className="text-label-xs font-bold px-2 py-0.5 rounded-pill bg-info-soft text-info">
                                {pendingRosterCandidates.length}
                            </span>
                        </div>
                        <p className="text-label-xs text-md-sys-on-surface/62">
                            OCR found pending roster names. Review them in the dedicated workbench.
                        </p>
                        <button
                            type="button"
                            onClick={() => setPanelMode('ocr-work')}
                            className={`h-8 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all ${panelMode === 'ocr-work'
                                ? 'bg-info text-md-sys-on-info'
                                : 'bg-info-soft text-info hover:bg-info-soft-strong'
                                }`}
                        >
                            {panelMode === 'ocr-work' ? 'OCR work active' : 'Open OCR work'}
                        </button>
                    </div>
                )}

                <div className="flex-1 min-h-0 flex flex-col gap-3">
                    {filtered.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-md-sys-on-surface/40">
                            <Users size={32} className="mb-2 opacity-40" />
                            <span className="text-label-sm font-semibold">
                                {searchTerm ? 'No tracked players match your search' : 'No tracked players yet'}
                            </span>
                        </div>
                    ) : (
                        <div
                            ref={rosterScrollRef}
                            data-testid="playerhub-roster-viewport"
                            onScroll={(event) => setRosterScrollTop(event.currentTarget.scrollTop)}
                            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1"
                        >
                            <div style={{ height: `${rosterTotalHeight}px` }}>
                                <div
                                    className="grid grid-cols-2 2xl:grid-cols-3 gap-1.5 content-start"
                                    style={{ transform: `translateY(${rosterVisibleOffsetY}px)` }}
                                >
                                {rosterVisiblePilots.map((pilot) => {
                                    const statusChips = getPlayerStatusChips(pilot);
                                    return (
                                    <button
                                        key={pilot.name}
                                        onClick={() => {
                                            setSelectedPilot(pilot.name);
                                            setShowFullProfile(false);
                                        }}
                                        className={`player-list-item w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all group ${selectedPilot === pilot.name
                                            ? 'bg-md-sys-primary/10 border border-md-sys-primary/20 text-md-sys-on-surface'
                                            : 'hover:bg-md-sys-on-surface/5 text-md-sys-on-surface/60'
                                            }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {pilot.isFavorite && <Star size={10} className="text-warning fill-amber-400 shrink-0" />}
                                                <span className="player-list-name text-label-sm font-semibold truncate">{pilot.name}</span>
                                                {statusChips.map((chip) => (
                                                    <span
                                                        key={`${pilot.name}-${chip.key}`}
                                                        className={`shrink-0 px-1.5 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide ${getStatusChipClassName(chip.key)}`}
                                                    >
                                                        {chip.label}
                                                    </span>
                                                ))}
                                            </div>
                                            {pilot.totalEncounters > 0 && (
                                                <span className="text-label-xs text-md-sys-on-surface/40">
                                                    {pilot.totalEncounters} encounter{pilot.totalEncounters !== 1 ? 's' : ''}
                                                    {pilot.lastSeen ? ` | ${timeAgo(pilot.lastSeen)}` : ''}
                                                </span>
                                            )}
                                        </div>
                                        {pilot.isRoster && pilot.note && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-md-sys-primary/40 shrink-0" title="Has note" />
                                        )}
                                        <ChevronRight size={14} className="text-md-sys-on-surface/40 group-hover:text-md-sys-on-surface/40 shrink-0" />
                                    </button>
                                    );
                                })}
                                </div>
                            </div>
                        </div>
                    )}
                    {renderOcrWorkbench('lg:hidden shrink-0')}
                </div>
            </div>

            {/* Column 2: Detail / OCR workbench */}
            <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col overflow-hidden gap-3">
                <div className="md3-card mg-surface shadow-lg p-4 shrink-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/48">
                                {panelMode === 'ocr-work' ? 'Roster Workbench' : 'Player Details'}
                            </div>
                            <div className="mt-1 text-body font-semibold text-md-sys-on-surface">
                                {panelMode === 'ocr-work'
                                    ? `${pendingRosterCandidates.length} OCR candidate${pendingRosterCandidates.length === 1 ? '' : 's'} ready for review`
                                    : (selected
                                        ? `${selected.name} profile loaded`
                                        : 'Choose a tracked player to load the profile panel')}
                            </div>
                            <div className="mt-1 text-label-sm text-md-sys-on-surface/58">
                                {panelMode === 'ocr-work'
                                    ? 'Review OCR-detected names in the same pane as the profile workspace so the tab feels like one system instead of three separate columns.'
                                    : 'Roster stays visible first while tracked-only players stay visible in the same workspace for review and promotion.'}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => setPanelMode('roster')}
                                className={`h-8 rounded-lg px-4 text-label-xs font-bold uppercase tracking-wide transition-all ${panelMode === 'roster'
                                    ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                    : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                                    }`}
                            >
                                Details
                            </button>
                            <button
                                type="button"
                                onClick={() => setPanelMode('ocr-work')}
                                className={`h-8 rounded-lg px-4 text-label-xs font-bold uppercase tracking-wide transition-all ${panelMode === 'ocr-work'
                                    ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                    : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                                    }`}
                            >
                                OCR Work {pendingRosterCandidates.length > 0 ? `(${pendingRosterCandidates.length})` : ''}
                            </button>
                        </div>
                    </div>
                </div>

                {panelMode === 'ocr-work' ? (
                    <div className="flex-1 min-h-0">
                        {renderOcrWorkbench('h-full min-h-0')}
                    </div>
                ) : !selected ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-md-sys-on-surface/40">
                        <Users size={48} className="mb-3 opacity-40" />
                        <span className="text-body font-semibold">
                            Select a player to view details
                        </span>
                        <span className="text-label-sm mt-1 opacity-60">
                            {rosteredPlayerCount} rostered · {trackedOnlyPlayerCount} tracked only
                        </span>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                    <div className="flex flex-col gap-4">
                        {/* Header Card */}
                        <div className="md3-card mg-surface shadow-lg p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-12 h-12 rounded-2xl bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center text-body font-bold">
                                        {selected.name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        {renaming === selected.name ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={renameValue}
                                                    onChange={e => setRenameValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
                                                    className="md3-textfield--outlined rounded-lg px-2 py-1 text-body font-bold w-40"
                                                    autoFocus
                                                />
                                                <button onClick={handleSaveRename} className="text-success" aria-label="Save player name"><Check size={16} /></button>
                                                <button onClick={() => setRenaming(null)} className="text-md-sys-on-surface/40" aria-label="Cancel rename"><X size={16} /></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 min-w-0">
                                                <h2 className="text-body font-bold text-md-sys-on-surface truncate">{selected.name}</h2>
                                                {selectedStatusChips.map((chip) => (
                                                    <span
                                                        key={`selected-${chip.key}`}
                                                        className={`shrink-0 px-2 py-0.5 rounded-pill text-label-xs font-bold uppercase tracking-wide ${getStatusChipClassName(chip.key)}`}
                                                    >
                                                        {chip.label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {selected.totalEncounters > 0 && (
                                                <span className="text-label-xs text-md-sys-on-surface/60">
                                                    {selected.totalEncounters} encounters
                                                </span>
                                            )}
                                            {selected.lastSeen && (
                                                <span className="text-label-xs text-md-sys-on-surface/40">
                                                    · Last seen {timeAgo(selected.lastSeen)}
                                                </span>
                                            )}
                                            {selected.firstSeen && (
                                                <span className="text-label-xs text-md-sys-on-surface/40">
                                                    · First seen {timeAgo(selected.firstSeen)}
                                                </span>
                                            )}
                                        </div>
                                        {selected.isTrackedOnly && (
                                            <div className="mt-1 text-label-xs text-md-sys-on-surface/52">
                                                Tracked from sightings and analytics, but not yet promoted into the roster.
                                            </div>
                                        )}
                                        {selected.rosterMeta?.origin === 'ocr' && (
                                            <div className="mt-1 text-label-xs text-md-sys-on-surface/52">
                                                {selected.isDetected
                                                    ? 'Auto-added from OCR and still awaiting confirmation.'
                                                    : 'Originally learned from OCR and confirmed into the roster.'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                    {selected.isDetected && (
                                        <>
                                            <button
                                                onClick={() => handleConfirmDetectedEntry(selected.name)}
                                                className="px-3 h-8 rounded-lg bg-success text-white text-label-xs font-bold uppercase tracking-wide flex items-center gap-1"
                                                title="Confirm detected roster entry"
                                                aria-label="Confirm detected roster entry"
                                            >
                                                <Check size={12} />
                                                Confirm
                                            </button>
                                            <button
                                                onClick={() => handleDismissDetectedEntry(selected.name)}
                                                className="px-3 h-8 rounded-lg bg-md-sys-on-surface/10 text-md-sys-on-surface/70 text-label-xs font-bold uppercase tracking-wide flex items-center gap-1 hover:bg-md-sys-on-surface/15"
                                                title="Dismiss detected roster entry"
                                                aria-label="Dismiss detected roster entry"
                                            >
                                                <X size={12} />
                                                Dismiss
                                            </button>
                                        </>
                                    )}
                                    {selected.isTrackedOnly ? (
                                        <button
                                            type="button"
                                            onClick={() => handlePromoteTrackedEntry(selected)}
                                            className="px-3 h-8 rounded-lg bg-md-sys-primary text-md-sys-onPrimary text-label-xs font-bold uppercase tracking-wide flex items-center gap-1"
                                            title="Add tracked player to roster"
                                            aria-label="Add tracked player to roster"
                                        >
                                            <Plus size={12} />
                                            Add to Roster
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => toggleFavorite(selected.name)}
                                                className={`md3-icon-btn w-8 h-8 ${selected.isFavorite ? 'text-warning' : 'text-md-sys-on-surface/40'}`}
                                                title={selected.isFavorite ? 'Unpin' : 'Pin'}
                                                aria-label={selected.isFavorite ? 'Unpin player' : 'Pin player'}
                                            >
                                                <Star size={14} className={selected.isFavorite ? 'fill-amber-400' : ''} />
                                            </button>
                                            <button
                                                onClick={() => handleStartRename(selected.name)}
                                                className="md3-icon-btn w-8 h-8 text-md-sys-on-surface/40"
                                                title="Rename"
                                                aria-label="Rename player"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowFullProfile(true);
                                                    setMergeTarget(selected.name);
                                                }}
                                                className="md3-icon-btn w-8 h-8 text-md-sys-on-surface/40"
                                                title="Merge with another player"
                                                aria-label="Merge player"
                                            >
                                                <Merge size={14} />
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(selected.name)}
                                                className="md3-icon-btn w-8 h-8 text-md-sys-error/60 hover:text-md-sys-error"
                                                title="Remove from roster"
                                                aria-label="Remove player from roster"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {selected.isRoster && confirmDelete === selected.name && (
                                <div className="mt-3 bg-md-sys-errorContainer/20 border border-md-sys-error/20 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <span className="text-label-sm text-md-sys-error font-semibold flex items-center gap-2">
                                        <AlertTriangle size={14} /> Delete {selected.name} from the roster?
                                    </span>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleDelete(selected.name)} className="px-3 py-1 bg-md-sys-error text-md-sys-onError rounded-lg text-label-xs font-bold">Delete</button>
                                        <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 bg-md-sys-on-surface/10 rounded-lg text-label-xs font-bold">Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="md3-card mg-surface shadow-lg p-4">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Top 5 Snapshot</div>
                                <button
                                    type="button"
                                    onClick={() => setShowFullProfile((prev) => !prev)}
                                    className="text-label-xs font-bold uppercase tracking-wide text-md-sys-primary hover:text-md-sys-primary/80"
                                >
                                    {showFullProfile ? 'Hide Full Profile' : 'View Full Profile'}
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-2.5">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50">Teammate Win Rate</div>
                                    <div className="text-title font-bold text-md-sys-on-surface">
                                        {winRate(selected.asTeammate) !== null ? `${winRate(selected.asTeammate)}%` : '--'}
                                    </div>
                                </div>
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-2.5">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50">Opponent Win Rate</div>
                                    <div className="text-title font-bold text-md-sys-on-surface">
                                        {winRate(selected.asOpponent) !== null ? `${winRate(selected.asOpponent)}%` : '--'}
                                    </div>
                                </div>
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-2.5">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50">Total Encounters</div>
                                    <div className="text-title font-bold text-md-sys-on-surface">{selected.totalEncounters}</div>
                                </div>
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-2.5">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50">Top Ship Seen</div>
                                    <div className="text-title font-bold text-md-sys-on-surface">
                                        {selectedTopShip ? `${selectedTopShip[0].split('(')[0].trim()} (${selectedTopShip[1]})` : '--'}
                                    </div>
                                </div>
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-2.5 md:col-span-2">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50">Pattern Signals</div>
                                    <div className="mt-1 text-label-sm text-md-sys-on-surface/70">
                                        Wingmate: {selectedTopTeammate ? `${selectedTopTeammate[0]} (${selectedTopTeammate[1]})` : '--'} {' | '}
                                        Opponent: {selectedTopOpponent ? `${selectedTopOpponent[0]} (${selectedTopOpponent[1]})` : '--'}
                                    </div>
                                </div>
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-2.5 md:col-span-2">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50">Identity Context</div>
                                    <div className="mt-1 text-label-sm text-md-sys-on-surface/70">
                                        Former names: {selectedAliasInsights.manual.length} {' | '}
                                        Learned OCR variants: {selectedAliasInsights.learned.length} {' | '}
                                        Possible duplicates: {duplicateCandidates.length}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleOpenFullProfile(selected)}
                                    className="px-3 py-1.5 rounded-control text-label-sm font-bold bg-md-sys-primary text-md-sys-onPrimary"
                                >
                                    Open Analytics Profile
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('recording')}
                                    className="px-3 py-1.5 rounded-control text-label-sm font-bold bg-md-sys-on-surface/10 text-md-sys-on-surface/70"
                                >
                                    Back to Recording
                                </button>
                                {selected.isRoster ? (
                                    <div className="mt-2 w-full">
                                        <button
                                            type="button"
                                            onClick={() => setShowAliases(prev => !prev)}
                                            className="flex items-center gap-1 text-label-xs font-bold uppercase tracking-wide text-md-sys-primary hover:text-md-sys-primary/80"
                                        >
                                            <ChevronDown size={12} className={`transition-transform ${showAliases ? 'rotate-180' : ''}`} />
                                            Manage OCR Aliases
                                        </button>
                                        {showAliases && (
                                            <div className="mt-2 rounded-xl border border-md-sys-outline/12 bg-md-sys-on-surface/[0.04] p-3">
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div>
                                                        <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/48 mb-2">
                                                            Former names
                                                        </div>
                                                        <div className="flex flex-wrap gap-1 min-h-[24px]">
                                                            {selectedAliasInsights.manual.length === 0 ? (
                                                                <span className="text-label-xs text-md-sys-on-surface/40">No former names yet.</span>
                                                            ) : selectedAliasInsights.manual.map((alias) => (
                                                                <span
                                                                    key={`manual-manage-${alias.label}`}
                                                                    className="flex items-center gap-1 px-2 py-0.5 rounded-control bg-md-sys-primary/10 text-md-sys-primary text-label-xs font-semibold"
                                                                >
                                                                    {alias.label}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveAlias(selected.name, alias.label)}
                                                                        className="hover:text-danger"
                                                                        aria-label={`Remove former name ${alias.label}`}
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/48 mb-2">
                                                            OCR variants
                                                        </div>
                                                        <div className="flex flex-wrap gap-1 min-h-[24px]">
                                                            {selectedAliasInsights.learned.length === 0 ? (
                                                                <span className="text-label-xs text-md-sys-on-surface/40">No OCR variants yet.</span>
                                                            ) : selectedAliasInsights.learned.map((alias) => (
                                                                <span
                                                                    key={`learned-manage-${alias.label}`}
                                                                    className="flex items-center gap-1 px-2 py-0.5 rounded-control bg-info-soft text-info text-label-xs font-semibold border border-info/15"
                                                                >
                                                                    {alias.label}
                                                                    {alias.count ? <span className="opacity-65">x{alias.count}</span> : null}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveLearnedVariant(selected.name, alias.label)}
                                                                        className="hover:text-danger"
                                                                        aria-label={`Remove OCR variant ${alias.label}`}
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newAliasValue}
                                                        onChange={(event) => setNewAliasValue(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') handleAddAlias('manual');
                                                        }}
                                                        placeholder="Add former name or OCR variant..."
                                                        className="flex-1 h-8 md3-textfield--outlined text-label-sm outline-none px-2"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddAlias('manual')}
                                                        disabled={!newAliasValue.trim()}
                                                        aria-label="Add former name"
                                                        className="h-8 px-2 md3-btn-tonal rounded-control text-label-sm font-bold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Plus size={12} />
                                                        Add Former Name
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddAlias('learned')}
                                                        disabled={!newAliasValue.trim()}
                                                        aria-label="Add OCR variant"
                                                        className="h-8 px-2 rounded-control text-label-sm font-bold flex items-center gap-1 bg-info-soft text-info border border-info/15 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <ScanEye size={12} />
                                                        Add OCR Variant
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="mt-2 w-full rounded-xl border border-md-sys-outline/12 bg-md-sys-on-surface/[0.04] px-3 py-2.5 text-label-sm text-md-sys-on-surface/60">
                                        Add this tracked player to the roster before storing notes, aliases, or merge decisions.
                                    </div>
                                )}
                            </div>
                        </div>

                        {showFullProfile && (
                        <>

                        {/* Merge UI */}
                        {mergeTarget && (
                            <div className="md3-card mg-surface shadow-lg p-4 border-2 border-warning-soft">
                                <div className="flex items-center gap-2 mb-3">
                                    <Merge size={14} className="text-warning" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-warning">Merge Players</span>
                                </div>
                                <p className="text-label-sm text-md-sys-on-surface/60 mb-3">
                                    Select a player to merge with <strong>{selected.name}</strong>. All match data will be combined.
                                </p>
                                <input
                                    value={mergeSearch}
                                    onChange={e => setMergeSearch(e.target.value)}
                                    placeholder="Search for player to merge..."
                                    className="w-full md3-textfield--outlined rounded-xl px-3 py-2 text-label-sm outline-none mb-2"
                                    autoFocus
                                />
                                <div className="max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                                    {mergeCandidates.map(c => (
                                        <button
                                            key={c.name}
                                            onClick={() => { setMergeTarget(c.name); setMergeKeepName(selected.name); }}
                                            className={`text-left px-3 py-1.5 rounded-lg text-label-sm transition-all ${mergeTarget === c.name && mergeKeepName
                                                ? 'bg-warning-soft text-warning font-semibold'
                                                : 'hover:bg-md-sys-on-surface/5 text-md-sys-on-surface/60'
                                                }`}
                                        >
                                            {c.name}
                                            {c.totalEncounters > 0 && <span className="opacity-60 ml-2">({c.totalEncounters})</span>}
                                        </button>
                                    ))}
                                </div>
                                {mergeKeepName && mergeTarget !== selected.name && (
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-label-sm text-md-sys-on-surface/60">Keep name:</span>
                                        <button
                                            onClick={() => setMergeKeepName(selected.name)}
                                            className={`px-2 py-1 rounded-lg text-label-xs font-bold ${mergeKeepName === selected.name ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-on-surface/10'}`}
                                        >
                                            {selected.name}
                                        </button>
                                        <button
                                            onClick={() => setMergeKeepName(mergeTarget)}
                                            className={`px-2 py-1 rounded-lg text-label-xs font-bold ${mergeKeepName === mergeTarget ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-on-surface/10'}`}
                                        >
                                            {mergeTarget}
                                        </button>
                                    </div>
                                )}
                                <div className="mt-3 flex gap-2">
                                    <button
                                        onClick={handleMerge}
                                        disabled={!mergeKeepName || mergeTarget === selected.name}
                                        className="px-4 py-2 bg-warning text-ink-strong rounded-xl text-label-sm font-bold disabled:opacity-disabled"
                                    >
                                        Merge
                                    </button>
                                    <button
                                        onClick={() => { setMergeTarget(null); setMergeKeepName(null); setMergeSearch(''); }}
                                        className="px-4 py-2 bg-md-sys-on-surface/10 rounded-xl text-label-sm font-bold"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* As Teammate */}
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Handshake size={14} className="text-success" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">As Teammate</span>
                                </div>
                                {selected.asTeammate ? (
                                    <div>
                                        <div className="text-display-sm font-black text-md-sys-on-surface">
                                            {winRate(selected.asTeammate)}%
                                        </div>
                                        <div className="text-label-xs text-md-sys-on-surface/60 mt-1">
                                            {selected.asTeammate.wins}W / {selected.asTeammate.total - selected.asTeammate.wins}L
                                            <span className="ml-1 opacity-60">({selected.asTeammate.total} games)</span>
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-label-sm text-md-sys-on-surface/40">No teammate data</span>
                                )}
                            </div>

                            {/* As Opponent */}
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Swords size={14} className="text-danger" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">As Opponent</span>
                                </div>
                                {selected.asOpponent ? (
                                    <div>
                                        <div className="text-display-sm font-black text-md-sys-on-surface">
                                            {winRate(selected.asOpponent)}%
                                        </div>
                                        <div className="text-label-xs text-md-sys-on-surface/60 mt-1">
                                            {selected.asOpponent.wins}W / {selected.asOpponent.total - selected.asOpponent.wins}L
                                            <span className="ml-1 opacity-60">({selected.asOpponent.total} games)</span>
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-label-sm text-md-sys-on-surface/40">No opponent data</span>
                                )}
                            </div>
                        </div>

                        {/* Ships Observed */}
                        {Object.keys(selected.shipsObserved).length > 0 && (
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp size={14} className="text-md-sys-primary" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Ships Observed</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(selected.shipsObserved)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([ship, count]) => (
                                            <span
                                                key={ship}
                                                className="px-2.5 py-1 rounded-lg text-label-xs font-semibold border border-md-sys-outline/10"
                                                style={{ color: getShipColor(ship), backgroundColor: `${getShipColor(ship)}15` }}
                                            >
                                                {ship.split('(')[0].trim()} ×{count}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* OCR Intelligence */}
                        {(selected.ocrSightings > 0 || selected.manualSightings > 0) && (
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <ScanEye size={14} className="text-info" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Detection History</span>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <div className="text-body font-bold text-md-sys-on-surface">{selected.ocrSightings}</div>
                                        <div className="text-label-xs text-md-sys-on-surface/40">OCR Detections</div>
                                    </div>
                                    <div>
                                        <div className="text-body font-bold text-md-sys-on-surface">{selected.manualSightings}</div>
                                        <div className="text-label-xs text-md-sys-on-surface/40">Manual Entries</div>
                                    </div>
                                    {selected.lastOcrConfidence !== null && (
                                        <div>
                                            <div className="text-body font-bold text-md-sys-on-surface">{selected.lastOcrConfidence}%</div>
                                            <div className="text-label-xs text-md-sys-on-surface/40">Last OCR Confidence</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="md3-card mg-surface shadow-lg p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                    <ImageIcon size={14} className="text-info" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Former Names & OCR Variants</span>
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-3">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50 mb-2">Former names</div>
                                    {selectedAliasInsights.manual.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedAliasInsights.manual.map((alias) => (
                                                <span
                                                    key={`manual-alias-${alias.label}`}
                                                    className="px-2.5 py-1 rounded-lg text-label-xs font-semibold bg-md-sys-primary/10 text-md-sys-primary border border-md-sys-primary/20"
                                                >
                                                    {alias.label}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-label-sm text-md-sys-on-surface/45">No former names recorded yet.</div>
                                    )}
                                </div>
                                <div className="rounded-lg bg-md-sys-on-surface/6 p-3">
                                    <div className="text-label-xs uppercase tracking-wide text-md-sys-on-surface/50 mb-2">Learned OCR variants</div>
                                    {selectedAliasInsights.learned.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedAliasInsights.learned.slice(0, 8).map((alias) => (
                                                <span
                                                    key={`learned-alias-${alias.label}`}
                                                    className="px-2.5 py-1 rounded-lg text-label-xs font-semibold bg-info-soft text-info border border-info/15"
                                                >
                                                    {alias.label}
                                                    {alias.count ? <span className="ml-1 opacity-65">x{alias.count}</span> : null}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-label-sm text-md-sys-on-surface/45">No learned OCR variants for this player yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {duplicateCandidates.length > 0 && (
                            <div className="md3-card mg-surface shadow-lg p-4 border border-warning-soft">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle size={14} className="text-warning" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-warning">Possible Duplicates</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {duplicateCandidates.map((candidate) => (
                                        <div
                                            key={`duplicate-${candidate.name}`}
                                            className="rounded-lg border border-warning-soft bg-warning-soft/30 px-3 py-2 flex items-start justify-between gap-3"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-body font-bold text-md-sys-on-surface truncate">{candidate.name}</div>
                                                <div className="mt-1 text-label-xs text-md-sys-on-surface/55">
                                                    Confidence {candidate.score}% · {candidate.totalEncounters} encounters
                                                </div>
                                                <div className="mt-1 text-label-sm text-md-sys-on-surface/70">
                                                    {candidate.reasons.join(' · ')}
                                                </div>
                                            </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowFullProfile(true);
                                                        setMergeTarget(candidate.name);
                                                        setMergeKeepName(selected.name);
                                                        setMergeSearch(candidate.name);
                                                }}
                                                className="px-3 py-1.5 rounded-control text-label-xs font-bold uppercase bg-warning text-ink-strong shrink-0"
                                            >
                                                Review Merge
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        <div className="md3-card mg-surface shadow-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Edit2 size={14} className="text-md-sys-on-surface/40" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Notes</span>
                                </div>
                                {selected.isRoster && editingNote !== selected.name && (
                                    <button
                                        onClick={() => handleStartNote(selected.name)}
                                        className="text-label-xs font-bold text-md-sys-primary hover:text-md-sys-primary/80"
                                    >
                                        {selected.note ? 'Edit' : 'Add Note'}
                                    </button>
                                )}
                            </div>
                            {!selected.isRoster ? (
                                <p className="text-label-sm text-md-sys-on-surface/45">
                                    Promote this tracked player into the roster before saving notes.
                                </p>
                            ) : editingNote === selected.name ? (
                                <div className="flex flex-col gap-2">
                                    <textarea
                                        value={noteValue}
                                        onChange={e => setNoteValue(e.target.value)}
                                        className="md3-textfield--outlined rounded-xl px-3 py-2 text-label-sm outline-none resize-none h-24"
                                        placeholder="Add notes about this player..."
                                        autoFocus
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 text-label-xs font-bold rounded-lg bg-md-sys-on-surface/10">Cancel</button>
                                        <button onClick={handleSaveNote} className="px-3 py-1.5 text-label-xs font-bold rounded-lg bg-md-sys-primary text-md-sys-onPrimary">Save</button>
                                    </div>
                                </div>
                            ) : selected.note ? (
                                <p className="text-label-sm text-md-sys-on-surface/60 whitespace-pre-wrap">{selected.note}</p>
                            ) : (
                                <p className="text-label-sm text-md-sys-on-surface/40 italic">No notes yet</p>
                            )}
                        </div>

                        {/* Teams Observed */}
                        {Object.keys(selected.teamsObserved).length > 0 && (
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Users size={14} className="text-md-sys-secondary" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Teams Observed</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(selected.teamsObserved)
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 10)
                                        .map(([team, count]) => (
                                            <span
                                                key={team}
                                                className="px-2.5 py-1 rounded-lg text-label-xs font-semibold bg-md-sys-on-surface/5 text-md-sys-on-surface/60 border border-md-sys-outline/10"
                                            >
                                                {team} ×{count}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}
                        </>
                        )}
                    </div>
                    </div>
                )}
            </div>
            {sourcePreview && (
                <div
                    className="fixed inset-0 z-top bg-scrim-90 flex items-center justify-center p-6"
                    onClick={() => setSourcePreview(null)}
                >
                    <button
                        type="button"
                        onClick={() => setSourcePreview(null)}
                        className="absolute top-4 right-4 text-on-scrim-muted hover:text-on-scrim z-10"
                        aria-label="Close source screenshot preview"
                    >
                        <X size={22} />
                    </button>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={sourcePreview.label || 'Source screenshot'}
                        onClick={(event) => event.stopPropagation()}
                        className="max-w-full max-h-full"
                    >
                        <LocalImage
                            src={sourcePreview.src}
                            alt={sourcePreview.label || 'Source screenshot'}
                            className="max-w-full max-h-[88vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                        />
                        <div className="text-center mt-2 text-label-sm text-on-scrim-muted font-bold">
                            {sourcePreview.label || 'Source screenshot'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlayerHub;



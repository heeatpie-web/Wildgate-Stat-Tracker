import React, { useState, useMemo, useEffect, useRef, useDeferredValue, useCallback } from 'react';
import {
    Users, Star, Edit2, Trash2, ChevronRight, ChevronDown, Merge,
    ScanEye, Swords, Handshake, TrendingUp, X, Plus,
    Check, AlertTriangle, Image as ImageIcon
} from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { resolvePlayerProfileDisplayName } from '../store/slices/createMappingSlice';
import type { PendingReview, RosterEntryMeta } from '../store/slices/createDataSlice';
import { ROSTER_ARCHIVE_THRESHOLD_MS, isRosterEntryArchived } from '../store/slices/createDataSlice';
import { selectActiveRosterNames } from '../store/slices/createDataSlice';
import type { Match } from '../types';
import { getShipColor } from '../types';
import { buildAliasVariantMap } from '../utils/ocrNameResolver';
import { isOcrNoise, normalizeOcrName, similarityScore } from '../utils/stringUtils';
import { buildRosterMergeSuggestionGroups, type RosterMergeSuggestionGroup } from '../utils/rosterMergeSuggestions';
import { createRosterFuzzyMatcher, type RosterFuzzyMatch } from '../utils/ocr/rosterFuzzyMatch';
import { LocalImage } from './LocalImage';
import { useShallow } from 'zustand/react/shallow';
import Logger from '../utils/logger';
import { resolveEncounterRole } from '../utils/playerEncounterRoles';
import {
    EQUIPMENT_NAME_SET,
    GUID_HEX_PATTERN,
    IS_DEV_BUILD,
    NON_PLAYER_NAME_HINTS,
    PERK_NAME_SET,
    PROSPECTOR_NAME_SET,
    SHIP_NAME_SET,
    WEAPON_NAME_SET,
} from './playerHub/playerHubConstants';
import { PlayerHubOcrWorkbench } from './playerHub/PlayerHubOcrWorkbench';
import { PlayerHubMergesPanel } from './playerHub/PlayerHubMergesPanel';
import { PlayerHubRosterColumn } from './playerHub/PlayerHubRosterColumn';
import type {
    AliasInsight,
    DuplicateCandidate,
    EncounterMatchListItem,
    EncounterSnapshot,
    PlayerDetail,
    PlayerFilterMode,
    PlayerHubMode,
    RoleConflictWorkbenchItem,
    SortMode,
} from './playerHub/playerHubTypes';
import {
    formatEncounterDisplayTimestamp,
    formatRelativeEncounterTimestamp,
    getMatchOpponentNames,
    getPlayerStatusChips,
    getStatusChipClassName,
    lookupUidName,
    normalizeEntityLabel,
    normalizeGuidKey,
    normalizeNameKey,
} from './playerHub/playerHubUtils';

// Archiving keeps the default "Active" list small so large (1000+) rosters stay
// responsive. Roster entries carry a persisted `archived` status set by the
// recurring 60-day sweep (see App.tsx) and by the explicit Archive action;
// anyone seen again is automatically unarchived because recordPlayerSighting
// clears the flag. Favorites are never auto-archived — un-favoriting makes
// them eligible again. Tracked-only pilots have no roster meta, so they fall
// back to the same window, plus their own manual archive override.
const isPilotActive = (
    pilot: {
        isRoster?: boolean;
        isFavorite?: boolean;
        isManuallyArchived?: boolean;
        lastSeen?: number | null;
        rosterMeta?: { status?: string } | null;
    },
    now: number,
): boolean => {
    if (isRosterEntryArchived(pilot.rosterMeta as RosterEntryMeta | null)) return false;
    if (!pilot.isRoster && pilot.isManuallyArchived) return false;
    if (pilot.isFavorite) return true;
    if (pilot.isRoster) return true;
    if (pilot.lastSeen == null) return true;
    return (now - pilot.lastSeen) <= ROSTER_ARCHIVE_THRESHOLD_MS;
};

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
        archiveRosterEntry,
        unarchiveRosterEntry,
        archivedTrackedPilotKeys,
        archiveTrackedPilot,
        unarchiveTrackedPilot,
        archiveTrackedPilotsBatch,
        archiveStaleRosterEntries,
        renamePilot,
        mergePilots,
        mergePilotsBatch,
        mergePilotGroupsBatch,
        undoLastMerge,
        mergeHistory,
        activeMergeNotificationId,
        dismissActiveMergeNotification,
        recentAutoMergeApplications,
        recordAutoMergeApplication,
        clearAutoMergeApplication,
        undoAutoMergeApplication,
        recentAutoMergeDismissals,
        recordAutoMergeDismissal,
        restoreAutoMergeDismissal,
        pendingReviews,
        dismissedRosterMergePairKeys,
        dismissRosterMergeSuggestionPairs,
        dismissedRosterCandidateKeys,
        addToRegistry,
        confirmRosterEntry,
        removePendingReviews,
        applyRosterCandidateResolution,
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
        ocrBatchAcceptThreshold,
        setOcrBatchAcceptThreshold,
        playerEncounterRoleCorrections,
        recordOcrAliasCorrection,
        removeOcrAliasCorrection,
        recordPlayerEncounterRoleCorrection,
        getPlayerEncounterRoleCorrection,
    } = useAppStore(useShallow((state) => ({
        pilotRegistry: state.pilotRegistry,
        rosterEntryMeta: state.rosterEntryMeta,
        favorites: state.favorites,
        pilotNotes: state.pilotNotes,
        pilotAliases: state.pilotAliases,
        toggleFavorite: state.toggleFavorite,
        updatePilotNote: state.updatePilotNote,
        removeFromRegistry: state.removeFromRegistry,
        archiveRosterEntry: state.archiveRosterEntry,
        unarchiveRosterEntry: state.unarchiveRosterEntry,
        archivedTrackedPilotKeys: state.archivedTrackedPilotKeys,
        archiveTrackedPilot: state.archiveTrackedPilot,
        unarchiveTrackedPilot: state.unarchiveTrackedPilot,
        archiveTrackedPilotsBatch: state.archiveTrackedPilotsBatch,
        archiveStaleRosterEntries: state.archiveStaleRosterEntries,
        renamePilot: state.renamePilot,
        mergePilots: state.mergePilots,
        mergePilotsBatch: state.mergePilotsBatch,
        mergePilotGroupsBatch: state.mergePilotGroupsBatch,
        undoLastMerge: state.undoLastMerge,
        mergeHistory: state.mergeHistory,
        activeMergeNotificationId: state.activeMergeNotificationId,
        dismissActiveMergeNotification: state.dismissActiveMergeNotification,
        recentAutoMergeApplications: state.recentAutoMergeApplications,
        recordAutoMergeApplication: state.recordAutoMergeApplication,
        clearAutoMergeApplication: state.clearAutoMergeApplication,
        undoAutoMergeApplication: state.undoAutoMergeApplication,
        recentAutoMergeDismissals: state.recentAutoMergeDismissals,
        recordAutoMergeDismissal: state.recordAutoMergeDismissal,
        restoreAutoMergeDismissal: state.restoreAutoMergeDismissal,
        pendingReviews: state.pendingReviews,
        dismissedRosterMergePairKeys: state.dismissedRosterMergePairKeys,
        dismissRosterMergeSuggestionPairs: state.dismissRosterMergeSuggestionPairs,
        dismissedRosterCandidateKeys: state.dismissedRosterCandidateKeys,
        addToRegistry: state.addToRegistry,
        confirmRosterEntry: state.confirmRosterEntry,
        removePendingReviews: state.removePendingReviews,
        applyRosterCandidateResolution: state.applyRosterCandidateResolution,
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
        ocrBatchAcceptThreshold: state.ocrBatchAcceptThreshold,
        setOcrBatchAcceptThreshold: state.setOcrBatchAcceptThreshold,
        playerEncounterRoleCorrections: state.playerEncounterRoleCorrections,
        recordOcrAliasCorrection: state.recordOcrAliasCorrection,
        removeOcrAliasCorrection: state.removeOcrAliasCorrection,
        recordPlayerEncounterRoleCorrection: state.recordPlayerEncounterRoleCorrection,
        getPlayerEncounterRoleCorrection: state.getPlayerEncounterRoleCorrection,
    })));
    const {
        setActiveView,
        setToast,
        setSmartCapturesFocusMatchId,
        playerHubFocusName,
        setPlayerHubFocusName,
        activeUser,
        setShowReviewQueue,
    } = useUIState();
    const activeUserKey = React.useMemo(() => normalizeNameKey(activeUser || ''), [activeUser]);
    const fuzzyReviewCount = React.useMemo(() => (
        (pendingReviews || []).filter((review) => review.type === 'roster_candidate' && Number(review.bestScore || 0) >= 70).length
    ), [pendingReviews]);

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
    const [ocrWorkbenchActiveTab, setOcrWorkbenchActiveTab] = useState<'candidates' | 'conflicts'>('candidates');
    const [rosterPage, setRosterPage] = useState(0);
    const hadPossibleMergesRef = useRef(false);
    const mergeKeepNameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rosterScrollRef = useRef<HTMLDivElement | null>(null);
    const uniquePilotRegistry = useMemo(() => Array.from(new Set(pilotRegistry || [])), [pilotRegistry]);
    const rosterNameSet = useMemo(() => new Set(uniquePilotRegistry), [uniquePilotRegistry]);
    const activePilotRegistry = useMemo(
        () => selectActiveRosterNames(uniquePilotRegistry, rosterEntryMeta),
        [rosterEntryMeta, uniquePilotRegistry]
    );
    const aliasVariantMap = useMemo(() => buildAliasVariantMap(ocrAliasModel), [ocrAliasModel]);
    // Reverse index: normalized variant key -> canonical name(s). Built once so
    // resolveTrackedProfileRosterName can do an O(1) lookup instead of scanning
    // every alias group per profile (previously O(profiles x aliases x variants)).
    const aliasVariantCanonicalsByKey = useMemo(() => {
        const lookup = new Map<string, string[]>();
        Object.entries(aliasVariantMap).forEach(([canonicalName, variants]) => {
            (variants || []).forEach((variant) => {
                const variantKey = normalizeNameKey(variant);
                if (!variantKey) return;
                const existing = lookup.get(variantKey);
                if (existing) {
                    if (!existing.includes(canonicalName)) existing.push(canonicalName);
                } else {
                    lookup.set(variantKey, [canonicalName]);
                }
            });
        });
        return lookup;
    }, [aliasVariantMap]);
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

            const canonicals = aliasVariantCanonicalsByKey.get(directKey);
            if (canonicals) {
                for (const canonicalName of canonicals) {
                    const canonicalKey = normalizeNameKey(canonicalName);
                    if (!canonicalKey) continue;
                    const canonicalRosterName = normalizedPilotNameMap.get(canonicalKey);
                    if (canonicalRosterName) return canonicalRosterName;
                }
            }

            return undefined;
        }
    ), [aliasVariantCanonicalsByKey, normalizedPilotNameMap, ocrCorrections]);
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
    // Defer the inputs that drive the expensive identity/encounter cascade so a
    // roster confirm/add/merge (or a mid-game telemetry match write) commits and
    // paints immediately; the heavy O(matches) recompute then runs at low priority.
    const deferredAllTrackedPilots = useDeferredValue(allTrackedPilots);
    const deferredMatches = useDeferredValue(matches);
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
        setRosterPage(0);
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

    const deferredPilotRegistry = useDeferredValue(activePilotRegistry);
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
    // Live fuzzy match of each pending candidate against the CURRENT roster, so
    // the workbench surfaces "merge into existing pilot" suggestions for near
    // misses (parity with the OCR Correction modal's fuzzyMatchByPlayer). Exact
    // matches are already handled by rosterCandidateMatchMap, so skip those.
    const rosterCandidateFuzzyMap = useMemo(() => {
        const lookup = new Map<string, RosterFuzzyMatch | null>();
        if (panelMode !== 'ocr-work') return lookup;
        const matcher = createRosterFuzzyMatcher(uniquePilotRegistry);
        pendingRosterCandidates.forEach((candidate) => {
            if (rosterCandidateMatchMap.get(candidate.id)) {
                lookup.set(candidate.id, null);
                return;
            }
            lookup.set(candidate.id, matcher.resolve(candidate.value));
        });
        return lookup;
    }, [panelMode, pendingRosterCandidates, rosterCandidateMatchMap, uniquePilotRegistry]);
    const possibleMergeGroups = useMemo(() => {
        if (panelMode !== 'merges') return [] as RosterMergeSuggestionGroup[];
        const startedAt = performance.now();
        const groups = buildRosterMergeSuggestionGroups({
            pilotRegistry: deferredPilotRegistry,
            pilotAliases,
            pendingReviews,
            dismissedPairKeys: dismissedRosterMergePairKeys,
            autoMergeThresholdPct: Math.round((Number(ocrAutoApplyMinScore) || 0.83) * 100),
        });
        if (IS_DEV_BUILD) {
            Logger.debug('PlayerHub', 'Derived roster merge suggestions', {
                durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
                pilotCount: deferredPilotRegistry.length,
                pendingReviewCount: pendingReviews.length,
                groupCount: groups.length,
            });
        }
        return groups;
    }, [dismissedRosterMergePairKeys, ocrAutoApplyMinScore, panelMode, pendingReviews, pilotAliases, deferredPilotRegistry]);

    const findRosterMatch = useCallback((value: string): string | null => {
        const normalizedValue = normalizeNameKey(value);
        if (!normalizedValue) return null;
        return normalizedPilotNameMap.get(normalizedValue) || null;
    }, [normalizedPilotNameMap]);

    useEffect(() => {
        setShowAliases(false);
        setNewAliasValue('');
        setEditingNote(null);
        setRenaming(null);
        setConfirmDelete(null);
        setMergeTarget(null);
        setMergeSearch('');
        setMergeKeepName(null);
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
        const rawLookup = new Map<string, Set<string>>();
        const keyOwnerCounts = new Map<string, number>();
        deferredAllTrackedPilots.forEach((name) => {
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
            rawLookup.set(name, keys);
            keys.forEach((key) => {
                keyOwnerCounts.set(key, (keyOwnerCounts.get(key) || 0) + 1);
            });
        });

        const lookup = new Map<string, Set<string>>();
        rawLookup.forEach((keys, pilotName) => {
            const canonicalKey = normalizeNameKey(pilotName);
            const uniqueKeys = new Set<string>();
            keys.forEach((key) => {
                if (key === canonicalKey || (keyOwnerCounts.get(key) || 0) === 1) {
                    uniqueKeys.add(key);
                }
            });
            if (canonicalKey) uniqueKeys.add(canonicalKey);
            lookup.set(pilotName, uniqueKeys);
        });

        return lookup;
    }, [deferredAllTrackedPilots, learnedAliasInsightsByTarget, normalizedPilotNameMap, pilotAliases, rosterNameSet, trackedProfilesByPilot]);

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
        // Use Sets during construction for O(1) dedup instead of O(n) Array.includes
        const encounterIdSets = new Map<string, Set<number>>();
        const conflictIdSets = new Map<string, Set<number>>();
        deferredAllTrackedPilots.forEach((name) => {
            snapshots.set(name, {
                totalEncounters: 0,
                encounterMatchIds: [],
                roleConflictMatchIds: [],
                firstSeen: null,
                lastSeen: null,
                asTeammate: null,
                asOpponent: null,
            });
            encounterIdSets.set(name, new Set());
            conflictIdSets.set(name, new Set());
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

        const recordEncounter = (snapshot: EncounterSnapshot, idSet: Set<number>, matchId: number, timestamp: number) => {
            if (Number.isFinite(matchId) && !idSet.has(matchId)) {
                idSet.add(matchId);
                snapshot.totalEncounters = idSet.size;
            }
            touchSeen(snapshot, timestamp);
        };

        (deferredMatches || [])
            .filter((match) => match?.result !== 'Ongoing')
            .forEach((match) => {
                const matchId = Number(match?.id);
                const timestamp = Number(match?.timestamp || 0);
                const friendlyNames = [
                    String(match.player || '').trim(),
                    ...(Array.isArray(match.teammates) ? match.teammates : []),
                ];
                const friendlyKeys = new Set(friendlyNames.map(normalizeNameKey).filter(Boolean));
                const opponentNames = getMatchOpponentNames(match);
                const opponentKeys = new Set(opponentNames.map(normalizeNameKey).filter(Boolean));
                const encounteredPilots = new Set<string>([
                    ...collectPilots(friendlyNames),
                    ...collectPilots(opponentNames),
                ]);

                encounteredPilots.forEach((pilotName) => {
                    const snapshot = snapshots.get(pilotName);
                    if (!snapshot) return;
                    const idSet = encounterIdSets.get(pilotName)!;
                    recordEncounter(snapshot, idSet, matchId, timestamp);
                    const resolvedRole = resolveEncounterRole({
                        selectedKeys: getKnownAliasKeys(pilotName),
                        friendlyKeys,
                        opponentKeys,
                        correctedRole: getPlayerEncounterRoleCorrection(matchId, pilotName),
                    });

                    if (resolvedRole === 'conflict') {
                        const conflictSet = conflictIdSets.get(pilotName)!;
                        if (Number.isFinite(matchId) && !conflictSet.has(matchId)) {
                            conflictSet.add(matchId);
                        }
                        return;
                    }

                    if (resolvedRole === 'teammate') {
                        snapshot.asTeammate = snapshot.asTeammate || { wins: 0, total: 0 };
                        snapshot.asTeammate.total += 1;
                        if (match.result === 'Win') snapshot.asTeammate.wins += 1;
                    }

                    if (resolvedRole === 'opponent') {
                        snapshot.asOpponent = snapshot.asOpponent || { wins: 0, total: 0 };
                        snapshot.asOpponent.total += 1;
                        if (match.result === 'Win') snapshot.asOpponent.wins += 1;
                    }
                });
            });

        // Flush Sets to arrays on the snapshots
        snapshots.forEach((snapshot, name) => {
            snapshot.encounterMatchIds = Array.from(encounterIdSets.get(name) || []);
            snapshot.roleConflictMatchIds = Array.from(conflictIdSets.get(name) || []);
        });

        return snapshots;
    }, [deferredAllTrackedPilots, getKnownAliasKeys, getPlayerEncounterRoleCorrection, deferredMatches, pilotNamesByIdentityKey, playerEncounterRoleCorrections]);

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
            const roleConflictMatchIds = encounterSnapshot?.roleConflictMatchIds || [];
            if (!isRoster && !isDetected && totalEncounters <= 0) {
                return null;
            }
            return {
                name,
                // isFavorite / note are overlaid in a cheap pass below so toggling a
                // favorite or editing a note does NOT recompute the whole roster
                // aggregation (the prior cause of multi-second player-management lag).
                isFavorite: false,
                isRoster,
                isTrackedOnly,
                isManuallyArchived: false,
                isDetected,
                needsReview: isDetected || isTrackedOnly || roleConflictMatchIds.length > 0,
                rosterMeta,
                note: '',
                asTeammate: encounterSnapshot?.asTeammate || null,
                asOpponent: encounterSnapshot?.asOpponent || null,
                totalEncounters,
                encounterMatchIds: encounterSnapshot?.encounterMatchIds || [],
                roleConflictMatchIds,
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
        if (IS_DEV_BUILD) {
            Logger.debug('PlayerHub', 'Derived roster model', {
                durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
                pilotCount: allTrackedPilots.length,
            });
        }
        return {
            enrichedPilots,
        };
    }, [
        encounterSnapshotsByPilot,
        playerProfiles,
        rosterEntryMeta,
        allTrackedPilots,
        normalizedPilotNameMap,
        rosterNameSet,
        trackedProfilesByPilot,
    ]);
    const archivedTrackedKeys = useMemo(
        () => new Set((archivedTrackedPilotKeys || []).map((key) => normalizeNameKey(key))),
        [archivedTrackedPilotKeys]
    );
    // Cheap overlay: apply favorite + note state without recomputing the heavy
    // per-pilot aggregation above. Only roster pilots can be favorited / noted;
    // tracked-only pilots instead get the manual archive override applied here.
    const enrichedPilots = useMemo(() => (
        rosterModel.enrichedPilots.map((pilot) => (
            pilot.isRoster
                ? { ...pilot, isFavorite: favoritePilotNames.has(pilot.name), note: pilotNotes[pilot.name] || '' }
                : { ...pilot, isManuallyArchived: archivedTrackedKeys.has(normalizeNameKey(pilot.name)) }
        ))
    ), [rosterModel.enrichedPilots, favoritePilotNames, pilotNotes, archivedTrackedKeys]);
    const enrichedPilotsByName = useMemo(
        () => new Map(enrichedPilots.map((pilot) => [pilot.name, pilot])),
        [enrichedPilots]
    );
    useEffect(() => {
        if (!playerHubFocusName) return;
        const focusKey = normalizeNameKey(playerHubFocusName);
        if (!focusKey) {
            setPlayerHubFocusName(null);
            return;
        }
        const focusedPilot = enrichedPilots.find((pilot) => normalizeNameKey(pilot.name) === focusKey) || null;
        setPanelMode('roster');
        if (focusedPilot) {
            setSearchTerm(focusedPilot.name);
            setSelectedPilot(focusedPilot.name);
        } else {
            setSearchTerm(playerHubFocusName);
        }
        setPlayerHubFocusName(null);
    }, [enrichedPilots, playerHubFocusName, setPlayerHubFocusName]);
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const rosteredPlayerCount = useMemo(() => enrichedPilots.filter((pilot) => pilot.isRoster).length, [enrichedPilots]);
    const trackedOnlyPlayerCount = useMemo(() => enrichedPilots.filter((pilot) => pilot.isTrackedOnly).length, [enrichedPilots]);
    const needsReviewPlayerCount = useMemo(() => enrichedPilots.filter((pilot) => pilot.needsReview).length, [enrichedPilots]);
    const activePlayerCount = useMemo(() => { const now = Date.now(); return enrichedPilots.filter((pilot) => isPilotActive(pilot, now)).length; }, [enrichedPilots]);
    const archivedPlayerCount = useMemo(() => { const now = Date.now(); return enrichedPilots.filter((pilot) => !isPilotActive(pilot, now)).length; }, [enrichedPilots]);

    const filtered = useMemo(() => {
        let list = enrichedPilots;
        const nowTs = Date.now();
        if (playerFilterMode === 'active') {
            list = list.filter((pilot) => isPilotActive(pilot, nowTs));
        } else if (playerFilterMode === 'archived') {
            list = list.filter((pilot) => !isPilotActive(pilot, nowTs));
        } else if (playerFilterMode === 'roster') {
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
        return enrichedPilotsByName.get(selectedPilot) || null;
    }, [enrichedPilotsByName, selectedPilot]);
    const selectedStatusChips = selected ? getPlayerStatusChips(selected) : [];
    const roleConflictWorkbenchItems = useMemo(() => {
        const matchesById = new Map(
            (matches || []).map((match) => [Number(match.id), match] as const)
        );

        return enrichedPilots
            .flatMap((pilot) => pilot.roleConflictMatchIds.map((matchId) => {
                const match = matchesById.get(Number(matchId));
                if (!match) return null;
                const timestamp = Number(match.timestamp || 0);
                return {
                    key: `${pilot.name}:${matchId}`,
                    playerName: pilot.name,
                    matchId: Number(match.id),
                    displayTimestamp: formatEncounterDisplayTimestamp(match),
                    relativeTimestamp: formatRelativeEncounterTimestamp(timestamp),
                    shipLabel: String(match.ship || 'Unknown ship').split('(')[0].trim() || 'Unknown ship',
                    result: match.result,
                } satisfies RoleConflictWorkbenchItem;
            }))
            .filter((item): item is RoleConflictWorkbenchItem => Boolean(item))
            .sort((left, right) => {
                const leftTimestamp = matchesById.get(left.matchId)?.timestamp || 0;
                const rightTimestamp = matchesById.get(right.matchId)?.timestamp || 0;
                if (rightTimestamp !== leftTimestamp) return rightTimestamp - leftTimestamp;
                if (left.playerName !== right.playerName) return left.playerName.localeCompare(right.playerName);
                return right.matchId - left.matchId;
            });
    }, [enrichedPilots, matches]);
    const ocrWorkbenchCount = pendingRosterCandidates.length + roleConflictWorkbenchItems.length;

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

    const ROSTER_PAGE_SIZE = 50;
    const rosterTotalPages = Math.max(1, Math.ceil(filtered.length / ROSTER_PAGE_SIZE));
    const rosterClampedPage = Math.min(rosterPage, rosterTotalPages - 1);
    const rosterPageStart = rosterClampedPage * ROSTER_PAGE_SIZE;
    const rosterPageEnd = Math.min(filtered.length, rosterPageStart + ROSTER_PAGE_SIZE);
    const rosterVisiblePilots = filtered.slice(rosterPageStart, rosterPageEnd);

    const selectedTopTeammate = selectedPatternSignals.topTeammate;
    const selectedTopOpponent = selectedPatternSignals.topOpponent;
    const selectedEncounterMatches = useMemo(() => {
        if (!selected || selected.encounterMatchIds.length === 0) return [] as EncounterMatchListItem[];

        const selectedKeys = getKnownAliasKeys(selected.name);
        if (selectedKeys.size === 0) return [] as EncounterMatchListItem[];

        const matchesById = new Map(
            (matches || []).map((match) => [Number(match.id), match] as const)
        );

        return selected.encounterMatchIds
            .map((matchId) => matchesById.get(Number(matchId)))
            .filter((match): match is Match => Boolean(match))
            .map((match) => {
                const friendlyNames = [
                    String(match.player || '').trim(),
                    ...(Array.isArray(match.teammates) ? match.teammates.map((name) => String(name || '').trim()) : []),
                ].filter(Boolean);
                const opponentNames = getMatchOpponentNames(match)
                    .map((name) => String(name || '').trim())
                    .filter(Boolean);
                const friendlyKeys = new Set(friendlyNames.map(normalizeNameKey).filter(Boolean));
                const opponentKeys = new Set(opponentNames.map(normalizeNameKey).filter(Boolean));
                const resolvedRole = resolveEncounterRole({
                    selectedKeys,
                    friendlyKeys,
                    opponentKeys,
                    correctedRole: getPlayerEncounterRoleCorrection(Number(match.id), selected.name),
                });
                const roleLabel = resolvedRole === 'conflict'
                    ? 'Needs review'
                    : resolvedRole === 'teammate'
                        ? 'Teammate'
                        : resolvedRole === 'opponent'
                            ? 'Opponent'
                            : 'Encounter';
                const timestamp = Number(match.timestamp || 0);
                return {
                    id: Number(match.id),
                    label: Number.isFinite(Number(match.canonicalMatchNumber))
                        ? `Match ${Number(match.canonicalMatchNumber)}`
                        : `Match #${match.id}`,
                    displayTimestamp: formatEncounterDisplayTimestamp(match),
                    relativeTimestamp: formatRelativeEncounterTimestamp(timestamp),
                    roleLabel,
                    result: match.result,
                    shipLabel: String(match.ship || 'Unknown ship').split('(')[0].trim() || 'Unknown ship',
                    timestamp,
                } satisfies EncounterMatchListItem;
            })
            .sort((left, right) => {
                if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
                return right.id - left.id;
            });
    }, [getKnownAliasKeys, getPlayerEncounterRoleCorrection, matches, playerEncounterRoleCorrections, selected]);

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

    // Tracked-only (non-roster) pilots have no rosterEntryMeta entry to carry an
    // archived status, so they use the separate archivedTrackedPilotKeys override
    // instead of promoting them into the formal roster as a side effect.
    const handleArchivePilot = (pilot: PlayerDetail) => {
        if (pilot.isRoster) {
            archiveRosterEntry(pilot.name);
        } else {
            archiveTrackedPilot(pilot.name);
        }
        setToast({ message: `${pilot.name} archived`, type: 'info' });
    };

    const handleUnarchivePilot = (pilot: PlayerDetail) => {
        if (pilot.isRoster) {
            unarchiveRosterEntry(pilot.name);
        } else {
            unarchiveTrackedPilot(pilot.name);
        }
        setToast({ message: `${pilot.name} restored to the active roster`, type: 'success' });
    };

    // Bulk sweep: roster entries use the store's own threshold-based sweep;
    // tracked-only pilots have no rosterEntryMeta entry to sweep, so they're
    // matched here (by the same lastSeen threshold) and archived in one batch.
    const handleArchiveStale = () => {
        const rosterResult = archiveStaleRosterEntries({ protectedKeys: favorites });
        const now = Date.now();
        const staleTrackedNames = enrichedPilots
            .filter((pilot) => (
                !pilot.isRoster
                && !pilot.isManuallyArchived
                && pilot.lastSeen != null
                && (now - pilot.lastSeen) > ROSTER_ARCHIVE_THRESHOLD_MS
            ))
            .map((pilot) => pilot.name);
        const trackedResult = archiveTrackedPilotsBatch(staleTrackedNames);
        const total = rosterResult.archivedCount + trackedResult.archivedCount;
        setToast({
            message: total > 0
                ? `Archived ${total} stale player${total === 1 ? '' : 's'}`
                : 'No stale players to archive',
            type: total > 0 ? 'success' : 'info',
        });
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

    const handleDelete = (pilot: PlayerDetail) => {
        // Roster members are actually removed from the registry; tracked-only
        // pilots (never added to the roster) have nothing to remove there, so
        // "Delete" for them means the same thing the Archive action already
        // does elsewhere: hide from the active list until seen again.
        if (pilot.isRoster) {
            removeFromRegistry(pilot.name);
        } else {
            archiveTrackedPilot(pilot.name);
        }
        if (selectedPilot === pilot.name) setSelectedPilot(null);
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

    const handleOpenMatchInSmartCaptures = (matchId: number) => {
        if (!Number.isFinite(matchId)) return;
        setSmartCapturesFocusMatchId(matchId);
        setActiveView('smart-captures');
    };

    const handleResolveRoleConflict = (matchId: number, playerName: string, role: 'teammate' | 'opponent') => {
        recordPlayerEncounterRoleCorrection(matchId, playerName, role);
        setToast({
            message: `Counted ${playerName} as ${role} for match #${matchId}`,
            type: 'success',
        });
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
        action: 'approve' | 'merge' | 'dismiss',
        options: { skipStoreUpdate?: boolean } = {}
    ): string[] => {
        const candidateKey = normalizeOcrName(candidate.value || '').toLowerCase();
        const resolvedKey = normalizeOcrName(resolvedValue || '').toLowerCase();
        const idsToRemove = (pendingReviews || [])
            .filter((review) => {
                if (review.type !== 'roster_candidate') return false;
                const reviewKey = normalizeOcrName(review.value || '').toLowerCase();
                if (review.id === candidate.id) return true;
                if (candidateKey && reviewKey === candidateKey) return true;
                if (candidate.canonicalTargetKey && review.canonicalTargetKey === candidate.canonicalTargetKey) return true;
                if (action === 'merge' && resolvedKey && reviewKey === resolvedKey) return true;
                return false;
            })
            .map((review) => review.id);
        if (idsToRemove.length > 0 && !options.skipStoreUpdate) removePendingReviews(idsToRemove);
        setPendingCandidateEdits((prev) => {
            const next = { ...prev };
            idsToRemove.forEach((id) => { delete next[id]; });
            delete next[candidate.id];
            return next;
        });
        return idsToRemove;
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
        const removeReviewIds = clearResolvedRosterCandidates(candidate, resolvedTarget, 'merge', { skipStoreUpdate: true });
        applyRosterCandidateResolution({
            registryEntries: [{ name: resolvedTarget, meta: { origin: 'ocr', status: 'confirmed' } }],
            removeReviewIds,
        });
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
            const removeReviewIds = clearResolvedRosterCandidates(candidate, value, action, { skipStoreUpdate: true });
            applyRosterCandidateResolution({
                registryEntries: [{ name: value, meta: { origin: 'ocr', status: 'confirmed' } }],
                removeReviewIds,
            });
            setToast({ message: `Added "${value}" to roster as a new player`, type: 'success' });
            return;
        }
        if (action === 'dismiss') {
            const dismissKey = normalizeOcrName(candidate.value || '').toLowerCase();
            const removeReviewIds = clearResolvedRosterCandidates(candidate, value, action, { skipStoreUpdate: true });
            applyRosterCandidateResolution({
                removeReviewIds,
                dismissCandidateKeys: dismissKey ? [dismissKey] : [],
            });
        }
        if (action === 'dismiss') {
            setToast({ message: `Dismissed pending roster candidate "${value}"`, type: 'info' });
        }
    };

    const handleMergeSuggestionGroup = (group: RosterMergeSuggestionGroup) => {
        if (!group.canonicalName || group.variants.length === 0) return;
        mergePilotsBatch(
            group.canonicalName,
            group.variants.map((v) => v.name)
        );
        if (group.pairKeys.length > 0) dismissRosterMergeSuggestionPairs(group.pairKeys);
        if (group.tier === 'auto') {
            const latestMergeId = useAppStore.getState().mergeHistory?.[0]?.id;
            if (latestMergeId) {
                recordAutoMergeApplication({
                    pairKeys: group.pairKeys,
                    targetName: group.canonicalName,
                    targetDisplayName: group.canonicalDisplayName,
                    sourceNames: group.variants.map((v) => v.name),
                    sourceDisplayNames: group.variants.map((v) => v.displayName),
                    mergeHistoryId: latestMergeId,
                });
            }
        }
        setSelectedPilot(group.canonicalName);
        setToast({
            message: `Merged ${group.variants.length} roster variant${group.variants.length === 1 ? '' : 's'} into "${group.canonicalDisplayName}"`,
            type: 'success',
        });
    };

    const handleApproveAllAutoMerges = (groups: RosterMergeSuggestionGroup[]) => {
        const applicable = groups.filter((group) => group.canonicalName && group.variants.length > 0);
        if (applicable.length === 0) return;
        // Single store update covering every group - one O(matches) pass
        // instead of one full match-history rewrite per group.
        mergePilotGroupsBatch(
            applicable.map((group) => ({
                targetName: group.canonicalName,
                sourceNames: group.variants.map((v) => v.name),
            }))
        );
        const allPairKeys = applicable.flatMap((group) => group.pairKeys);
        if (allPairKeys.length > 0) dismissRosterMergeSuggestionPairs(allPairKeys);

        const latestMergeId = useAppStore.getState().mergeHistory?.[0]?.id;
        if (latestMergeId) {
            applicable.forEach((group) => {
                recordAutoMergeApplication({
                    pairKeys: group.pairKeys,
                    targetName: group.canonicalName,
                    targetDisplayName: group.canonicalDisplayName,
                    sourceNames: group.variants.map((v) => v.name),
                    sourceDisplayNames: group.variants.map((v) => v.displayName),
                    mergeHistoryId: latestMergeId,
                });
            });
        }

        setToast({
            message: `Approved ${applicable.length} auto-merge suggestion${applicable.length === 1 ? '' : 's'}`,
            type: 'success',
        });
    };

    const handleDismissMergeSuggestionGroup = (group: RosterMergeSuggestionGroup) => {
        dismissRosterMergeSuggestionPairs(group.pairKeys);
        if (group.tier === 'auto') {
            recordAutoMergeDismissal({
                pairKeys: group.pairKeys,
                canonicalName: group.canonicalName,
                canonicalDisplayName: group.canonicalDisplayName,
                variantNames: group.variants.map((v) => v.name),
                variantDisplayNames: group.variants.map((v) => v.displayName),
            });
        }
        setToast({
            message: `Dismissed possible merge suggestion for "${group.canonicalDisplayName}"`,
            type: 'info',
        });
    };

    const handleUndoAutoMergeApplication = (id: string) => {
        const undone = undoAutoMergeApplication(id);
        if (undone) {
            setToast({ message: 'Undid auto-merge', type: 'info' });
            return;
        }
        clearAutoMergeApplication(id);
        setToast({
            message: 'A newer merge was applied since — undo is no longer possible. Removed from history.',
            type: 'info',
        });
    };

    const handleRestoreAutoMergeDismissal = (id: string) => {
        const restored = restoreAutoMergeDismissal(id);
        if (restored) {
            setToast({ message: 'Restored dismissed merge suggestion', type: 'info' });
        }
    };

    const handleBatchAcceptHighConfidence = (candidates: PendingReview[]) => {
        let accepted = 0;
        const registryEntries: Array<{ name: string; meta: { origin: 'ocr'; status: 'confirmed' } }> = [];
        const removeReviewIds: string[] = [];
        candidates.forEach((candidate) => {
            const value = String(pendingCandidateEdits[candidate.id] ?? candidate.value).trim();
            if (!value) return;
            const existingMatch = findRosterMatch(value);
            if (existingMatch) {
                removeReviewIds.push(...clearResolvedRosterCandidates(candidate, existingMatch, 'approve', { skipStoreUpdate: true }));
            } else {
                registryEntries.push({ name: value, meta: { origin: 'ocr', status: 'confirmed' } });
                removeReviewIds.push(...clearResolvedRosterCandidates(candidate, value, 'approve', { skipStoreUpdate: true }));
            }
            accepted += 1;
        });
        if (accepted > 0) {
            applyRosterCandidateResolution({ registryEntries, removeReviewIds });
        }
        if (accepted > 0) {
            setToast({
                message: `Accepted ${accepted} OCR candidate${accepted === 1 ? '' : 's'} into the roster`,
                type: 'success',
            });
        }
    };

    const handleBatchDismissLowConfidence = (candidates: PendingReview[]) => {
        const dismissKeys: string[] = [];
        const removeReviewIds: string[] = [];
        candidates.forEach((candidate) => {
            const value = String(pendingCandidateEdits[candidate.id] ?? candidate.value).trim();
            const dismissKey = normalizeOcrName(candidate.value || '').toLowerCase();
            if (dismissKey) dismissKeys.push(dismissKey);
            removeReviewIds.push(...clearResolvedRosterCandidates(candidate, value, 'dismiss', { skipStoreUpdate: true }));
        });
        if (dismissKeys.length > 0) {
            applyRosterCandidateResolution({ removeReviewIds, dismissCandidateKeys: dismissKeys });
            setToast({
                message: `Dismissed ${dismissKeys.length} low-confidence OCR candidate${dismissKeys.length === 1 ? '' : 's'}`,
                type: 'info',
            });
        }
    };


    const ocrWorkbenchSharedProps = {
        panelMode,
        ocrWorkbenchCount,
        roleConflictWorkbenchItems,
        onResolveRoleConflict: handleResolveRoleConflict,
        onOpenMatchInSmartCaptures: handleOpenMatchInSmartCaptures,
        activeTab: ocrWorkbenchActiveTab,
        onActiveTabChange: setOcrWorkbenchActiveTab,
        ocrSearchTerm,
        setOcrSearchTerm,
        pendingRosterCandidates,
        filteredOcrCandidates,
        pendingCandidateEdits,
        setPendingCandidateEdits,
        rosterCandidateMatchMap,
        rosterCandidateFuzzyMap,
        rosterNames: uniquePilotRegistry,
        findRosterMatch,
        mergeRosterCandidateIntoExisting,
        resolveRosterCandidate,
        addPilotAlias,
        onSourcePreview: setSourcePreview,
        onBatchAcceptHighConfidence: handleBatchAcceptHighConfidence,
        onBatchDismissLowConfidence: handleBatchDismissLowConfidence,
        ocrBatchAcceptThreshold,
        setOcrBatchAcceptThreshold,
    };

    return (
        <div data-tour="view-players" className="players-solid-scope players-shell-surface w-full flex-1 h-full min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(24rem,34rem)_minmax(0,1fr)] gap-4 overflow-visible rounded-2xl">
            {/* Column 1: Roster List */}
            <PlayerHubRosterColumn
                activeUserKey={activeUserKey}
                panelMode={panelMode}
                setPanelMode={setPanelMode}
                rosteredPlayerCount={rosteredPlayerCount}
                activePlayerCount={activePlayerCount}
                archivedPlayerCount={archivedPlayerCount}
                trackedOnlyPlayerCount={trackedOnlyPlayerCount}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                sortMode={sortMode}
                setSortMode={setSortMode}
                playerFilterMode={playerFilterMode}
                setPlayerFilterMode={setPlayerFilterMode}
                onArchiveStale={handleArchiveStale}
                enrichedPilots={enrichedPilots}
                needsReviewPlayerCount={needsReviewPlayerCount}
                activeMergeNotification={activeMergeNotification}
                onUndoLastMerge={undoLastMerge}
                onDismissActiveMergeNotification={dismissActiveMergeNotification}
                pendingRosterCandidates={pendingRosterCandidates}
                filtered={filtered}
                rosterScrollRef={rosterScrollRef}
                rosterVisiblePilots={rosterVisiblePilots}
                rosterPage={rosterClampedPage}
                rosterTotalPages={rosterTotalPages}
                rosterPageStart={rosterPageStart}
                rosterPageEnd={rosterPageEnd}
                rosterTotalCount={filtered.length}
                onRosterPageChange={setRosterPage}
                selectedPilot={selectedPilot}
                setSelectedPilot={setSelectedPilot}
                timeAgo={timeAgo}
            />

            {/* Column 2: Detail / OCR workbench */}
            <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col overflow-hidden gap-3">
                {/* Header toolbar */}
                <div className="rounded-card overflow-hidden border border-md-sys-outline/10 mg-surface shadow-xl shrink-0">
                    <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold tracking-tight text-md-sys-on-surface truncate">
                                {panelMode === 'ocr-work'
                                    ? 'OCR Workbench'
                                    : panelMode === 'merges'
                                        ? 'Possible Merges'
                                        : selected
                                            ? selected.name
                                            : 'Player Details'}
                            </h2>
                            <p className="text-label-sm text-md-sys-on-surface/40 font-medium truncate">
                                {panelMode === 'ocr-work'
                                    ? `${pendingRosterCandidates.length} candidate${pendingRosterCandidates.length !== 1 ? 's' : ''} to review`
                                    : panelMode === 'merges'
                                        ? `${possibleMergeGroups.length} possible duplicate${possibleMergeGroups.length !== 1 ? 's' : ''} to review`
                                        : selected
                                            ? `${selected.totalEncounters} encounter${selected.totalEncounters !== 1 ? 's' : ''}${selected.lastSeen ? ` · ${timeAgo(selected.lastSeen)}` : ''}`
                                            : 'Select a player to view their profile'}
                            </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => setPanelMode('roster')}
                                className={`h-8 px-3 rounded-control text-label-xs font-semibold transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${
                                    panelMode === 'roster'
                                        ? 'border-md-sys-primary/30 bg-md-sys-primary/10 text-md-sys-primary'
                                        : 'border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06]'
                                }`}
                                style={panelMode !== 'roster' ? { background: 'var(--md-sys-color-surface-container-high)' } : undefined}
                            >
                                Details
                            </button>
                            <button
                                type="button"
                                onClick={() => setPanelMode('ocr-work')}
                                className={`h-8 px-3 rounded-control text-label-xs font-semibold transition-all border inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/35 ${
                                    panelMode === 'ocr-work'
                                        ? 'border-info/30 bg-info/10 text-info'
                                        : 'border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06]'
                                }`}
                                style={panelMode !== 'ocr-work' ? { background: 'var(--md-sys-color-surface-container-high)' } : undefined}
                            >
                                OCR Work
                                {pendingRosterCandidates.length > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-pill text-[10px] font-bold leading-none ${
                                        panelMode === 'ocr-work' ? 'bg-info/20 text-info' : 'bg-info/15 text-info'
                                    }`}>
                                        {pendingRosterCandidates.length}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPanelMode('merges')}
                                className={`h-8 px-3 rounded-control text-label-xs font-semibold transition-all border inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/35 ${
                                    panelMode === 'merges'
                                        ? 'border-warning/30 bg-warning/10 text-warning'
                                        : 'border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06]'
                                }`}
                                style={panelMode !== 'merges' ? { background: 'var(--md-sys-color-surface-container-high)' } : undefined}
                            >
                                Merges
                                {possibleMergeGroups.length > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-pill text-[10px] font-bold leading-none ${
                                        panelMode === 'merges' ? 'bg-warning/20 text-warning' : 'bg-warning/15 text-warning'
                                    }`}>
                                        {possibleMergeGroups.length}
                                    </span>
                                )}
                            </button>
                            {fuzzyReviewCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowReviewQueue(true)}
                                    className="h-8 px-3 rounded-control text-label-xs font-semibold transition-all border inline-flex items-center gap-1.5 border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/35"
                                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                    title="Open the fuzzy-match review queue"
                                >
                                    Review Queue
                                    <span className="px-1.5 py-0.5 rounded-pill text-[10px] font-bold leading-none bg-info/15 text-info">
                                        {fuzzyReviewCount}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {panelMode === 'ocr-work' ? (
                    <div className="flex-1 min-h-0">
                        <PlayerHubOcrWorkbench {...ocrWorkbenchSharedProps} containerClassName="h-full min-h-0" />
                    </div>
                ) : panelMode === 'merges' ? (
                    <div className="flex-1 min-h-0">
                        <PlayerHubMergesPanel
                            containerClassName="h-full min-h-0"
                            possibleMergeGroups={possibleMergeGroups}
                            activeMergeNotification={activeMergeNotification}
                            onUndoLastMerge={undoLastMerge}
                            recentAutoMergeApplications={recentAutoMergeApplications}
                            recentAutoMergeDismissals={recentAutoMergeDismissals}
                            onUndoAutoMergeApplication={handleUndoAutoMergeApplication}
                            onRestoreAutoMergeDismissal={handleRestoreAutoMergeDismissal}
                            onMergeSuggestionGroup={handleMergeSuggestionGroup}
                            onDismissMergeSuggestionGroup={handleDismissMergeSuggestionGroup}
                            onApproveAllAutoMerges={handleApproveAllAutoMerges}
                        />
                    </div>
                ) : !selected ? (
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="relative overflow-hidden rounded-card border border-md-sys-outline/10 p-4" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                                <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-10 bg-md-sys-primary" />
                                <div className="text-label-sm font-bold uppercase tracking-wide text-md-sys-on-surface/60 mb-1">Total Players</div>
                                <div className="text-2xl font-black tracking-tight text-md-sys-on-surface">{enrichedPilots.length}</div>
                            </div>
                            <div className="relative overflow-hidden rounded-card border border-md-sys-outline/10 p-4" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                                <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-15 bg-success" />
                                <div className="text-label-sm font-bold uppercase tracking-wide text-md-sys-on-surface/60 mb-1">Rostered</div>
                                <div className="text-2xl font-black tracking-tight text-success">{rosteredPlayerCount}</div>
                            </div>
                            <div className="relative overflow-hidden rounded-card border border-md-sys-outline/10 p-4" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                                <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-15 bg-info" />
                                <div className="text-label-sm font-bold uppercase tracking-wide text-md-sys-on-surface/60 mb-1">Tracked</div>
                                <div className="text-2xl font-black tracking-tight text-info">{trackedOnlyPlayerCount}</div>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center text-md-sys-on-surface/40">
                            <Users size={40} className="mb-3 opacity-30" />
                            <span className="text-body font-semibold">Select a player to view details</span>
                            <span className="text-label-sm mt-1 opacity-60">Click any player in the list on the left</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                    <div className="flex flex-col gap-4 w-full max-w-[72rem] mx-auto">
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
                                                {activeUserKey && normalizeNameKey(selected.name) === activeUserKey && (
                                                    <span className="shrink-0 px-2 py-0.5 rounded-pill text-label-xs font-black uppercase tracking-wide bg-md-sys-primary/15 text-md-sys-primary border border-md-sys-primary/25" title="This is you">YOU</span>
                                                )}
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
                                    {selected.isTrackedOnly && (
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
                                    )}
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
                                        title={selected.isRoster ? 'Remove from roster' : 'Archive (hide from the active list)'}
                                        aria-label={selected.isRoster ? 'Remove player from roster' : 'Archive player'}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {confirmDelete === selected.name && (
                                <div className="mt-3 bg-md-sys-errorContainer/20 border border-md-sys-error/20 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <span className="text-label-sm text-md-sys-error font-semibold flex items-center gap-2">
                                        <AlertTriangle size={14} />
                                        {selected.isRoster
                                            ? `Delete ${selected.name} from the roster?`
                                            : `Archive ${selected.name} and hide them from the active list?`}
                                    </span>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleDelete(selected)} className="px-3 py-1 bg-md-sys-error text-md-sys-onError rounded-lg text-label-xs font-bold">
                                            {selected.isRoster ? 'Delete' : 'Archive'}
                                        </button>
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
                                {(isRosterEntryArchived(selected.rosterMeta) || selected.isManuallyArchived) ? (
                                    <button
                                        type="button"
                                        onClick={() => handleUnarchivePilot(selected)}
                                        className="px-3 py-1.5 rounded-control text-label-sm font-bold bg-success-soft text-success"
                                        title="Return this pilot to the active roster and OCR matching"
                                    >
                                        Unarchive
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleArchivePilot(selected)}
                                        className="px-3 py-1.5 rounded-control text-label-sm font-bold bg-md-sys-on-surface/10 text-md-sys-on-surface/70"
                                        title="Hide from the active roster and stop matching OCR reads against this pilot. Seeing them again restores them automatically."
                                    >
                                        Archive
                                    </button>
                                )}
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

                        <div className="md3-card mg-surface shadow-lg p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <div className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">
                                        Encounter Matches
                                    </div>
                                    <div className="mt-1 text-label-xs text-md-sys-on-surface/45">
                                        Click any match to open it in Smart Captures.
                                    </div>
                                </div>
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">
                                    {selectedEncounterMatches.length} match{selectedEncounterMatches.length === 1 ? '' : 'es'}
                                </div>
                            </div>
                            {selectedEncounterMatches.length === 0 ? (
                                <div className="rounded-xl border border-md-sys-outline/12 bg-md-sys-on-surface/[0.04] px-3 py-3 text-label-sm text-md-sys-on-surface/45">
                                    No saved encounters for this player yet.
                                </div>
                            ) : (
                                <div className="max-h-72 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2">
                                    {selectedEncounterMatches.map((match) => (
                                        <button
                                            key={`encounter-match-${match.id}`}
                                            type="button"
                                            onClick={() => handleOpenMatchInSmartCaptures(match.id)}
                                            aria-label={`Open match #${match.id} in Smart Captures`}
                                            className="group w-full rounded-xl border border-md-sys-outline/12 bg-md-sys-on-surface/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-md-sys-on-surface/[0.07]"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-label-sm font-bold text-md-sys-on-surface">
                                                            {match.label}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded-pill text-label-xs font-bold uppercase tracking-wide ${match.result === 'Win'
                                                            ? 'bg-success/12 text-success border border-success/20'
                                                            : match.result === 'Loss'
                                                                ? 'bg-danger/12 text-danger border border-danger/20'
                                                                : 'bg-warning-soft/40 text-warning border border-warning-soft'
                                                            }`}>
                                                            {match.result}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-pill text-label-xs font-bold uppercase tracking-wide bg-md-sys-primary/10 text-md-sys-primary border border-md-sys-primary/15">
                                                            {match.roleLabel}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 text-label-sm text-md-sys-on-surface/65 truncate">
                                                        {match.displayTimestamp}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label-xs text-md-sys-on-surface/45">
                                                        <span style={{ color: getShipColor(match.shipLabel) }}>{match.shipLabel}</span>
                                                        <span>{match.relativeTimestamp}</span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-1 text-label-xs font-bold uppercase tracking-wide text-md-sys-primary group-hover:text-md-sys-primary/80">
                                                    Smart Captures
                                                    <ChevronRight size={12} />
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
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
                                {mergeKeepName && mergeTarget !== selected.name && (
                                    <p className="mt-3 text-label-sm text-md-sys-on-surface/60">
                                        "{mergeKeepName === selected.name ? mergeTarget : selected.name}" will be kept as a former name / alias of "{mergeKeepName}"
                                    </p>
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
export { PlayerHub };

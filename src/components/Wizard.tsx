import React, { useState } from 'react';
import {
    Clock,
    HeartCrack,
    Target,
    Sword,
    Gem,
    Scan,
    X,
    Users,
    ChevronDown,
    CheckCircle2,
    Wrench,
    RefreshCw,
} from 'lucide-react';
import { Match, SHIPS, WEAPONS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT, getTelemetryLoadoutSourceLabel } from '../types';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useMatchSubmission } from '../hooks/useMatchSubmission';
import { OcrCorrectionModal } from './OcrCorrectionModal';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';
import type { OCRProcessRuntimeOptions } from '../utils/electronBridge';
import { rerunOCRMulti } from '../utils/artifactService';
import { buildOcrNameSourceMap } from '../utils/ocr/nameSourceHints';
import {
    getEliminatorDisplayLabel,
    getPrimaryEliminatedByTeamValue,
    isEliminatedByTeamMatch,
} from '../utils/eliminatorTeam';

type WizardTab = 'result' | 'ocr';
const MAX_SHIP_WEAPONS = 10;
const MAX_PROSPECTOR_SLOTS = 3;
const MODAL_FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const getFocusableElements = (container: HTMLElement | null): HTMLElement[] => {
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR))
        .filter((element) => (
            element.tabIndex >= 0
            && element.getAttribute('aria-hidden') !== 'true'
            && (!element.hasAttribute('disabled'))
            && (element.offsetParent !== null || element === document.activeElement)
        ));
};

const parseDurationToSeconds = (value: string): number | null => {
    const parts = String(value || '').split(':').map((part) => Number(part));
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
    return Math.max(0, (parts[0] * 60) + parts[1]);
};

const formatDurationOffset = (seconds: number): string => {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    if (minutes > 0) return `${minutes}m${remaining.toString().padStart(2, '0')}s`;
    return `${remaining}s`;
};

export const Wizard: React.FC = () => {
    const {
        pendingMatchData,
        pendingPlacement, setPendingPlacement,
        pendingArtifactType, setPendingArtifactType,
        pendingKilledBy, setPendingKilledBy,
        pendingKilledByShip, setPendingKilledByShip,
        sessionTeams, sessionShipTypes,
        setSelectedTeammates,
        setSelectedOpponents,
        setSelectedReachModifiers,
        setSessionTeams,
        setSessionShipTypes,
        timeMin, setTimeMin,
        timeSec, setTimeSec,
        damageTaken, setDamageTaken,
        kills, setKills,
        poiEasy, setPoiEasy,
        poiMedium, setPoiMedium,
        poiEpic, setPoiEpic,
    } = useGameData();

    const { showWizard, setShowWizard, isOverlayMode, activeMode, activeUser, pushNotification, requestSmartCapture } = useUIState();
    const { processFinalSubmission, submitting } = useMatchSubmission();
    const ocrMode = useAppStore((state) => state.ocrMode);
    const ocrRegions = useAppStore((state) => state.ocrRegions);
    const [selectedWinType, setSelectedWinType] = useState<'Combat' | 'Artifact' | null>(null);
    const [requestedOcrReviewMatchId, setRequestedOcrReviewMatchId] = useState<number | null | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<WizardTab>('result');
    const [loadoutExpanded, setLoadoutExpanded] = useState(false);
    const [isRerunningOcr, setIsRerunningOcr] = useState(false);
    const isWizardOpen = Boolean(showWizard);
    const lastTimeSyncMatchIdRef = React.useRef<number | null>(null);
    const dialogRef = React.useRef<HTMLDivElement | null>(null);
    const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
    const previousFocusedElementRef = React.useRef<HTMLElement | null>(null);
    const titleId = React.useId();
    const descriptionId = React.useId();

    React.useEffect(() => {
        if (isWizardOpen && isOverlayMode) {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        }
    }, [isOverlayMode, isWizardOpen]);

    React.useEffect(() => {
        if (!isWizardOpen) {
            setActiveTab('result');
            setLoadoutExpanded(false);
            setSelectedWinType(null);
            lastTimeSyncMatchIdRef.current = null;
            return;
        }
        // Restore win type when reopening a previously submitted match (re-edit flow)
        const subType = pendingMatchData?.subType;
        if (subType === 'Combat' || subType === 'Artifact') {
            setSelectedWinType(subType as 'Combat' | 'Artifact');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isWizardOpen]);

    React.useEffect(() => {
        if (!isWizardOpen) return;
        previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const focusTimer = window.setTimeout(() => {
            if (closeButtonRef.current) {
                closeButtonRef.current.focus();
                return;
            }
            const focusable = getFocusableElements(dialogRef.current);
            if (focusable.length > 0) {
                focusable[0].focus();
                return;
            }
            dialogRef.current?.focus();
        }, 0);
        const onKeyDown = (event: KeyboardEvent) => {
            if (!dialogRef.current) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setShowWizard(null);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = getFocusableElements(dialogRef.current);
            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;
            const activeInsideDialog = !!(activeElement && dialogRef.current.contains(activeElement));
            if (event.shiftKey) {
                if (!activeInsideDialog || activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
                return;
            }
            if (!activeInsideDialog || activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', onKeyDown, true);
            const previous = previousFocusedElementRef.current;
            if (previous && document.contains(previous)) {
                previous.focus();
            }
        };
    }, [isWizardOpen, setShowWizard]);

    React.useEffect(() => {
        if (!showWizard) return;
        if (showWizard === 'Loss' && selectedWinType === 'Combat') {
            if (!pendingPlacement || pendingPlacement < 2 || pendingPlacement > 5) {
                setPendingPlacement(2);
            }
            return;
        }
        if (pendingPlacement != null) setPendingPlacement(null);
    }, [pendingPlacement, selectedWinType, setPendingPlacement, showWizard]);

    React.useEffect(() => {
        if (!showWizard || !pendingMatchData) return;
        const pendingId = Number((pendingMatchData as Match | null)?.id || 0);
        const forceSync = Number.isInteger(pendingId)
            && pendingId > 0
            && lastTimeSyncMatchIdRef.current !== pendingId;
        if (!forceSync && ((timeMin || '').trim() || (timeSec || '').trim())) return;
        const raw = String(pendingMatchData.time || '').trim();
        const parts = raw.split(':');
        if (parts.length !== 2) return;
        const mm = String(parts[0] || '').replace(/[^0-9]/g, '').slice(0, 2);
        const ss = String(parts[1] || '').replace(/[^0-9]/g, '').slice(0, 2);
        if (!mm && !ss) return;
        setTimeMin(mm.padStart(2, '0'));
        setTimeSec(ss.padStart(2, '0'));
        if (forceSync) {
            lastTimeSyncMatchIdRef.current = pendingId;
        }
    }, [pendingMatchData, setTimeMin, setTimeSec, showWizard, timeMin, timeSec]);

    React.useEffect(() => {
        const onRequestOcrReview = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ matchId?: number }>;
            const requestedMatchId = Number(customEvt?.detail?.matchId || 0);
            if (Number.isInteger(requestedMatchId) && requestedMatchId > 0) {
                setRequestedOcrReviewMatchId(requestedMatchId);
                return;
            }
            setRequestedOcrReviewMatchId(null);
        };
        window.addEventListener('wizard:request-ocr-review', onRequestOcrReview as EventListener);
        return () => window.removeEventListener('wizard:request-ocr-review', onRequestOcrReview as EventListener);
    }, []);

    React.useEffect(() => {
        if (requestedOcrReviewMatchId === undefined) return;
        if (!showWizard || !pendingMatchData) return;
        const pendingMatchId = Number((pendingMatchData as Match | null)?.id || 0);
        if (
            requestedOcrReviewMatchId === null
            || !Number.isInteger(pendingMatchId)
            || pendingMatchId <= 0
            || pendingMatchId === requestedOcrReviewMatchId
        ) {
            setActiveTab('ocr');
            setRequestedOcrReviewMatchId(undefined);
        }
    }, [pendingMatchData, requestedOcrReviewMatchId, showWizard]);

    React.useEffect(() => {
        if (showWizard) return;
        if (requestedOcrReviewMatchId !== undefined) {
            setRequestedOcrReviewMatchId(undefined);
        }
    }, [requestedOcrReviewMatchId, showWizard]);

    const detectedPlayerCount = React.useMemo(() => {
        if (!sessionTeams) return 0;
        return Object.values(sessionTeams).reduce((sum, players) => sum + (players as string[]).length, 0);
    }, [sessionTeams]);

    const wizardReviewScreenshots = React.useMemo(() => {
        const artifacts = Array.isArray(pendingMatchData?.artifacts)
            ? pendingMatchData.artifacts
            : [];
        return artifacts
            .map((entry) => String(entry || '').trim())
            .filter((entry) => entry.length > 0)
            .filter((entry) => entry.startsWith('data:image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(entry));
    }, [pendingMatchData?.artifacts]);

    React.useEffect(() => {
        if (!isWizardOpen || !pendingMatchData || !Array.isArray(pendingMatchData.opponentTeams)) return;
        let changed = false;
        const nextOpponentTeams = pendingMatchData.opponentTeams.map((team) => {
            const currentShip = String(team.shipType || '').trim();
            if (currentShip) return team;
            const teamNameKey = String(team.teamName || '').trim();
            const colorKey = String(team.color || '').trim();
            const colorLower = colorKey.toLowerCase();
            const fallbackShip = String(
                sessionShipTypes?.[teamNameKey]
                || sessionShipTypes?.[colorKey]
                || sessionShipTypes?.[colorLower]
                || ''
            ).trim();
            if (!fallbackShip) return team;
            changed = true;
            return { ...team, shipType: fallbackShip };
        });
        if (!changed) return;
        useAppStore.getState().setPendingMatchData({
            ...pendingMatchData,
            opponentTeams: nextOpponentTeams,
        });
    }, [isWizardOpen, pendingMatchData, sessionShipTypes]);

    const defeatedTeams = React.useMemo(() => {
        const normalizeKey = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
        const activePlayerKey = normalizeKey(activeUser || pendingMatchData?.player || '');
        const friendlyKeys = new Set(
            [
                activePlayerKey,
                ...(Array.isArray(pendingMatchData?.teammates) ? pendingMatchData.teammates.map((name) => normalizeKey(name)) : []),
            ].filter(Boolean)
        );
        const fromOpponentTeams = Array.isArray(pendingMatchData?.opponentTeams)
            ? pendingMatchData.opponentTeams.map((team) => ({
                teamName: String(team.teamName || '').trim() || 'Unknown Team',
                shipType: String(team.shipType || '').trim(),
                players: Array.isArray(team.players) ? team.players.map((p) => String(p || '').trim()).filter(Boolean) : [],
                color: String(team.color || '').trim(),
            }))
            : [];
        const filteredTeams = (fromOpponentTeams.length > 0 ? fromOpponentTeams : Object.entries(sessionTeams || {}).map(([teamName, players]) => ({
            teamName,
            shipType: String(sessionShipTypes?.[teamName] || '').trim(),
            players: (players || []).map((p) => String(p || '').trim()).filter(Boolean),
            color: teamName,
        })))
            .filter((team) => !team.players.some((player) => friendlyKeys.has(normalizeKey(player))));
        const deduped = new Map<string, typeof filteredTeams[number]>();
        filteredTeams.forEach((team) => {
            const dedupeKey = String(getPrimaryEliminatedByTeamValue(team) || getEliminatorDisplayLabel(team) || team.teamName || '').trim().toLowerCase();
            if (!dedupeKey) return;
            const existing = deduped.get(dedupeKey);
            if (!existing || (!existing.shipType && team.shipType)) {
                deduped.set(dedupeKey, team);
            }
        });
        return Array.from(deduped.values());
    }, [activeUser, pendingMatchData?.opponentTeams, pendingMatchData?.player, pendingMatchData?.teammates, sessionShipTypes, sessionTeams]);

    if (!showWizard || !pendingMatchData) return null;

    const selectedResult = showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
        ? showWizard
        : null;
    const hasSelectedResult = selectedResult !== null;
    const isDefeat = selectedResult === 'Loss';
    const title = !hasSelectedResult ? 'Match Result' : (isDefeat ? 'Defeat' : selectedResult);
    const hasSelectedOutcomeType = selectedResult === 'Draw' || selectedWinType !== null;
    const hasValidCombatLossPlacement = (
        selectedResult !== 'Loss'
        || selectedWinType !== 'Combat'
        || (pendingPlacement != null && pendingPlacement >= 2 && pendingPlacement <= 5)
    );
    const canFinalizeResult = hasSelectedResult && hasSelectedOutcomeType && hasValidCombatLossPlacement;
    const normalizedPendingOcrState = String(pendingMatchData?.ocrState || '').trim().toLowerCase();
    const hasPendingOcrReview = normalizedPendingOcrState === 'reviewing';
    const hasSavedOcrReview = normalizedPendingOcrState === 'saved' || Boolean(pendingMatchData?.ocrReviewedAt);
    const finalizeButtonLabel = (() => {
        if (!hasSelectedResult) return 'Select Match Result';
        if (selectedResult === 'Draw') return 'Finalize Draw';
        if (!hasSelectedOutcomeType) return selectedResult === 'Loss' ? 'Choose Loss Type' : 'Choose Win Type';
        if (!hasValidCombatLossPlacement) return 'Select Placement';
        if (hasPendingOcrReview) return 'Open OCR Review';
        return selectedResult === 'Loss'
            ? `Finalize ${selectedWinType} Loss`
            : `Finalize ${selectedWinType} Win`;
    })();

    const cardClass = `wizard-card rounded-2xl border border-md-sys-outline/14 shadow-sm bg-md-sys-surface-container ${isOverlayMode ? 'p-4' : 'p-5'}`;
    const labelClass = 'wizard-section-label text-label-sm font-black uppercase tracking-widest text-md-sys-on-surface/92 mb-2 block';
    const inputBaseClass = 'wizard-input wizard-input-control bg-md-sys-surface-container-high font-bold outline-none text-center rounded-xl border border-md-sys-outline/24 text-md-sys-on-surface/95 transition-all focus:border-md-sys-primary/45 focus:bg-md-sys-surface-container-highest';

    const pendingLoadout = pendingMatchData.loadout || {
        hero: null,
        ship: null,
        shipWeapons: [],
        weapons: [],
        equipment: [],
        characterWeapons: [],
        characterEquipment: [],
        perks: [],
        shipPerks: [],
        characterPerks: [],
    };
    const shipWeaponEntriesFromLegacy = (pendingLoadout.weapons || [])
        .filter((entry) => !/tertiary\s+(weapon|equipment)/i.test(String(entry || '')))
        .slice(0, MAX_SHIP_WEAPONS)
        .reduce<Record<string, number>>((acc, weapon) => {
            const cleaned = String(weapon || '').trim();
            if (!cleaned) return acc;
            acc[cleaned] = (acc[cleaned] || 0) + 1;
            return acc;
        }, {});
    const shipWeaponEntries = (pendingLoadout.shipWeapons || []).length > 0
        ? (pendingLoadout.shipWeapons || [])
            .map((entry) => ({
                name: String(entry?.name || '').trim(),
                quantity: Math.max(0, Math.min(MAX_SHIP_WEAPONS, Math.floor(Number(entry?.quantity || 0)))),
            }))
            .filter((entry) => entry.name && entry.quantity > 0)
            .slice(0, MAX_SHIP_WEAPONS)
        : Object.entries(shipWeaponEntriesFromLegacy).map(([name, quantity]) => ({ name, quantity }));
    const shipWeaponCountMap = shipWeaponEntries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.name] = entry.quantity;
        return acc;
    }, {});
    const shipWeaponTotal = Object.values(shipWeaponCountMap).reduce((sum, quantity) => sum + quantity, 0);
    const hasTelemetryLoadout = shipWeaponTotal > 0
        || (pendingLoadout.characterWeapons?.length || 0) > 0
        || (pendingLoadout.characterEquipment?.length || 0) > 0;
    const hasTelemetryShipLoadout = shipWeaponTotal > 0;
    const hasTelemetryProspectorLoadout = (pendingLoadout.characterWeapons?.length || 0) > 0
        || (pendingLoadout.characterEquipment?.length || 0) > 0;
    const latestTelemetryLoadoutSource = pendingMatchData?.telemetryConsistency?.loadoutSaves?.length
        ? pendingMatchData.telemetryConsistency.loadoutSaves[pendingMatchData.telemetryConsistency.loadoutSaves.length - 1].source
        : null;
    const loadoutSourceBadgeLabel = getTelemetryLoadoutSourceLabel(latestTelemetryLoadoutSource) || 'Telemetry';
    const displayedCharacterWeapons = pendingLoadout.characterWeapons || [];
    const displayedCharacterEquipment = pendingLoadout.characterEquipment || [];
    const displayedPerks = (() => {
        const perkPool = [
            ...(pendingLoadout.characterPerks || []),
            ...(pendingLoadout.shipPerks || []),
            ...(pendingLoadout.perks || []),
            ...(pendingMatchData.perks || []),
        ];
        return Array.from(new Set(
            perkPool
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
        ));
    })();
    const telemetryDurationSeconds = typeof pendingMatchData?.telemetryConsistency?.telemetryDurationSeconds === 'number'
        ? pendingMatchData.telemetryConsistency.telemetryDurationSeconds
        : null;
    const telemetryDurationToleranceSeconds = typeof pendingMatchData?.telemetryConsistency?.durationToleranceSeconds === 'number'
        ? pendingMatchData.telemetryConsistency.durationToleranceSeconds
        : 45;
    const enteredDurationSeconds = (
        (timeMin || '').trim() || (timeSec || '').trim()
    )
        ? (Math.max(0, Number.parseInt(timeMin || '0', 10) || 0) * 60) + Math.max(0, Number.parseInt(timeSec || '0', 10) || 0)
        : parseDurationToSeconds(String(pendingMatchData?.time || ''));
    const telemetryDurationDelta = (
        telemetryDurationSeconds != null && enteredDurationSeconds != null
    )
        ? Math.abs(enteredDurationSeconds - telemetryDurationSeconds)
        : null;
    const hasDurationMismatch = telemetryDurationDelta != null && telemetryDurationDelta > telemetryDurationToleranceSeconds;

    const updatePendingLoadout = (
        key: 'characterWeapons' | 'characterEquipment',
        item: string
    ) => {
        const maxSlots = MAX_PROSPECTOR_SLOTS;
        const existing = Array.isArray(pendingLoadout[key]) ? [...pendingLoadout[key]] : [];
        const idx = existing.findIndex((entry) => entry.toLowerCase() === item.toLowerCase());
        let next = existing;
        if (idx >= 0) {
            next = existing.filter((entry) => entry.toLowerCase() !== item.toLowerCase());
        } else if (existing.length < maxSlots) {
            next = [...existing, item];
        }
        useAppStore.getState().setPendingMatchData({
            ...pendingMatchData,
            loadout: {
                ...pendingLoadout,
                [key]: next,
            },
        });
    };
    const updateShipWeaponQuantity = (weaponName: string, quantity: number) => {
        const normalizedName = String(weaponName || '').trim();
        if (!normalizedName) return;
        const boundedQty = Math.max(0, Math.min(MAX_SHIP_WEAPONS, Math.floor(quantity)));
        const nextMap: Record<string, number> = { ...shipWeaponCountMap };
        if (boundedQty === 0) {
            delete nextMap[normalizedName];
        } else {
            nextMap[normalizedName] = boundedQty;
        }
        const nextEntries = Object.entries(nextMap)
            .map(([name, qty]) => ({ name, quantity: qty }))
            .filter((entry) => entry.quantity > 0)
            .slice(0, MAX_SHIP_WEAPONS);
        const flatWeapons: string[] = [];
        nextEntries.forEach((entry) => {
            for (let idx = 0; idx < entry.quantity; idx += 1) {
                if (flatWeapons.length >= MAX_SHIP_WEAPONS) break;
                flatWeapons.push(entry.name);
            }
        });
        useAppStore.getState().setPendingMatchData({
            ...pendingMatchData,
            loadout: {
                ...pendingLoadout,
                shipWeapons: nextEntries,
                weapons: flatWeapons,
            },
        });
    };

    const applyEliminatorTeam = (teamName: string, color?: string, shipType?: string) => {
        const teamSelection = { teamName, color: color || '' };
        const eliminatedByValue = getPrimaryEliminatedByTeamValue(teamSelection);
        setPendingKilledBy(getEliminatorDisplayLabel(teamSelection));
        if (shipType) setPendingKilledByShip(shipType);
        useAppStore.getState().setPendingMatchData({
            ...pendingMatchData,
            eliminatedByTeam: eliminatedByValue || undefined,
        });
    };

    const handleWizardSmartCaptureRequest = () => {
        setActiveTab('ocr');
        const pendingMatchId = Number((pendingMatchData as Match | null)?.id || 0);
        const requestId = requestSmartCapture({
            activeUser: activeUser || null,
            source: 'wizard',
            matchId: Number.isInteger(pendingMatchId) && pendingMatchId > 0 ? pendingMatchId : null,
            requestId: `wizard-${Date.now()}`,
        });
        window.dispatchEvent(new CustomEvent('smart-capture-request', {
            detail: {
                activeUser: activeUser || null,
                source: 'wizard',
                requestId,
                matchId: Number.isInteger(pendingMatchId) && pendingMatchId > 0 ? pendingMatchId : null,
                forceOcr: true,
            }
        }));
        pushNotification({
            message: 'Smart Capture requested from wizard.',
            type: 'info',
            source: 'wizard',
            durationMs: 10_000,
            deepLink: { type: 'openWizard', result: selectedResult || undefined },
        });
    };

    const handleWizardRerunOcr = async () => {
        const imagePaths = wizardReviewScreenshots;
        if (imagePaths.length === 0) {
            pushNotification({
                message: 'No screenshot artifacts are attached to this match.',
                type: 'warning',
                source: 'wizard',
                durationMs: 7000,
                deepLink: { type: 'openWizard', result: selectedResult || undefined },
            });
            return;
        }

        const runtimeOptions: OCRProcessRuntimeOptions = {
            forceUncached: true,
        };

        setIsRerunningOcr(true);
        pushNotification({
            message: `Re-running OCR for ${imagePaths.length} screenshot${imagePaths.length === 1 ? '' : 's'}...`,
            type: 'info',
            source: 'wizard',
            durationMs: 8000,
            deepLink: { type: 'openWizard', result: selectedResult || undefined },
        });

        try {
            // Use server-side multi-image merge (rerunOCRMulti) so that
            // ocrMerger.mergeCaptures properly cross-enriches crew-hub
            // player data with tactical-map team/ship data.
            const rerun = await rerunOCRMulti(
                imagePaths,
                activeUser || '',
                ocrMode,
                ocrRegions,
                runtimeOptions,
            );
            const perFileResults = rerun.perFile || [];
            const successfulCount = perFileResults.filter(f => f.success).length;
            const failedCount = perFileResults.length - successfulCount;
            const mergedData = rerun.data;
            const nameSources = buildOcrNameSourceMap(perFileResults);
            if (!mergedData || successfulCount === 0) {
                pushNotification({
                    message: 'OCR rerun failed for all artifacts.',
                    type: 'error',
                    source: 'wizard',
                    durationMs: 9000,
                    deepLink: { type: 'openWizard', result: selectedResult || undefined },
                });
                return;
            }

            const dedupeNames = (names: string[]): string[] => Array.from(new Set(
                names
                    .map((entry) => String(entry || '').trim())
                    .filter(Boolean)
            ));
            const safePlayerName = (entry: unknown): string =>
                typeof entry === 'string' ? entry : (entry as { name?: string })?.name || '';
            const nextTeammates = dedupeNames((mergedData.teammates || []).map(safePlayerName));
            const nextOpponentTeams = (mergedData.opponentTeams || []).map((team: any, index: number) => ({
                teamName: String(team.teamName || `Enemy Team ${index + 1}`).trim() || `Enemy Team ${index + 1}`,
                shipType: String(team.shipType || '').trim(),
                color: String(team.color || 'unknown').trim() || 'unknown',
                players: dedupeNames((team.players || []).map(safePlayerName)),
            })).filter((team: { players: string[]; shipType: string; teamName: string }) => team.players.length > 0 || team.shipType || team.teamName);
            const nextOpponents = dedupeNames(nextOpponentTeams.flatMap((team: { players: string[] }) => team.players));
            const nextModifiers = dedupeNames((mergedData.reachModifiers || []).map((entry: any) => String(entry?.name || entry || '').trim()));
            const rerunShip = String(mergedData.playerShip?.shipType || '').trim();
            const latestPending = (useAppStore.getState().pendingMatchData || pendingMatchData || {}) as Partial<Match>;
            const captainSeed = String(activeUser || latestPending.player || 'You').trim() || 'You';
            const friendlyShipSeed = rerunShip || String(latestPending.ship || '').trim();
            const detectedFriendlyShipName = String(
                mergedData.playerShipName
                || latestPending.ocrDebug?.playerShipName
                || ''
            ).trim();
            const detectedFriendlyTeamName = String(
                mergedData.playerTeamName
                || mergedData.playerShip?.teamName
                || latestPending.ocrDebug?.playerTeamName
                || latestPending.ocrDebug?.playerShipTeamName
                || ''
            ).trim();
            const friendlyTeamLabel = detectedFriendlyShipName || detectedFriendlyTeamName || captainSeed || 'Friendly Team';
            const friendlyTeamKey = `friendly:${friendlyTeamLabel}`;
            const friendlyMembers = dedupeNames([captainSeed, ...nextTeammates]);
            const nextSessionTeams: Record<string, string[]> = {};
            if (friendlyMembers.length > 0) {
                nextSessionTeams[friendlyTeamKey] = friendlyMembers;
            }
            nextOpponentTeams.forEach((team) => {
                const colorKey = String(team.color || 'unknown').trim() || 'unknown';
                if (team.players.length > 0) {
                    nextSessionTeams[colorKey] = [...team.players];
                }
            });
            const nextSessionShipTypes: Record<string, string> = {};
            if (friendlyShipSeed) {
                nextSessionShipTypes[friendlyTeamKey] = friendlyShipSeed;
                nextSessionShipTypes.friendly = friendlyShipSeed;
                nextSessionShipTypes[captainSeed] = friendlyShipSeed;
                nextTeammates.forEach((name) => {
                    nextSessionShipTypes[name] = friendlyShipSeed;
                });
            }
            nextOpponentTeams.forEach((team) => {
                const teamShip = String(team.shipType || '').trim();
                if (!teamShip) return;
                const colorKey = String(team.color || 'unknown').trim() || 'unknown';
                nextSessionShipTypes[colorKey] = teamShip;
                team.players.forEach((name) => {
                    nextSessionShipTypes[name] = teamShip;
                });
            });

            setSelectedTeammates(nextTeammates);
            setSelectedOpponents(nextOpponents);
            setSessionTeams(nextSessionTeams);
            setSessionShipTypes(nextSessionShipTypes, 'ocr');
            if (nextModifiers.length > 0) {
                setSelectedReachModifiers(nextModifiers, 'manual');
            }

            useAppStore.getState().setPendingMatchData({
                ...latestPending,
                ship: rerunShip || String(latestPending.ship || ''),
                teammates: nextTeammates.length > 0 ? nextTeammates : (latestPending.teammates || []),
                opponents: nextOpponents.length > 0 ? nextOpponents : (latestPending.opponents || []),
                opponentTeams: nextOpponentTeams.length > 0 ? nextOpponentTeams : (latestPending.opponentTeams || []),
                reachModifiers: nextModifiers.length > 0 ? nextModifiers : (latestPending.reachModifiers || []),
                ocrState: 'reviewing',
                ocrDebug: {
                    ...(latestPending.ocrDebug || {}),
                    rawText: mergedData.rawText,
                    confidence: mergedData.overallConfidence,
                    hazards: Array.isArray(mergedData.hazards)
                        ? Array.from(new Set(mergedData.hazards.map((hazard: unknown) => String(hazard || '').trim()).filter(Boolean)))
                        : undefined,
                    source: mergedData.ocrSource || latestPending.ocrDebug?.source,
                    fallbackReason: mergedData.ocrFallbackReason,
                    cloudError: mergedData.ocrCloudError,
                    geminiError: mergedData.ocrGeminiError,
                    mergeStats: mergedData.mergeStats,
                    playerTeamName: String(mergedData.playerTeamName || mergedData.playerShip?.teamName || latestPending.ocrDebug?.playerTeamName || '').trim() || undefined,
                    playerShipTeamName: String(mergedData.playerShip?.teamName || mergedData.playerTeamName || latestPending.ocrDebug?.playerShipTeamName || '').trim() || undefined,
                    playerShipName: String(mergedData.playerShipName || mergedData.playerTeamName || mergedData.playerShip?.teamName || latestPending.ocrDebug?.playerShipName || '').trim() || undefined,
                    nameSources: Object.keys(nameSources).length > 0 ? nameSources : undefined,
                    timestamp: Date.now(),
                },
            });

            const total = perFileResults.length;
            const rerunSummary = failedCount > 0
                ? `OCR rerun complete: ${successfulCount}/${total} succeeded.`
                : `OCR rerun complete: ${successfulCount}/${total} succeeded.`;
            pushNotification({
                message: rerunSummary,
                type: failedCount > 0 ? 'warning' : 'success',
                source: 'wizard',
                durationMs: 10_000,
                deepLink: { type: 'openWizard', result: selectedResult || undefined },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'OCR rerun failed';
            pushNotification({
                message: `OCR rerun failed: ${message}`,
                type: 'error',
                source: 'wizard',
                durationMs: 10_000,
                deepLink: { type: 'openWizard', result: selectedResult || undefined },
            });
        } finally {
            setIsRerunningOcr(false);
        }
    };

    return (
        <div className="wizard-scrim fixed inset-0 md3-dialog-scrim backdrop-blur-none z-top flex items-start justify-center p-4 overflow-hidden animate-fade-in" onClick={() => setShowWizard(null)}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className={`wizard-shell overflow-hidden rounded-2_5rem w-full my-2 shadow-2xl flex flex-col animate-scale-in border border-md-sys-outline/24 bg-md-sys-surface-container-highest text-md-sys-on-surface ${isOverlayMode ? 'max-w-2xl h-[calc(100vh-2rem)] max-h-90vh' : 'max-w-3xl h-[calc(100vh-2rem)] max-h-95vh'}`}
                onClick={e => e.stopPropagation()}
            >
                <span id={descriptionId} className="sr-only">
                    Review and submit match outcome, OCR roster alignment, and match details.
                </span>
                <div id={titleId} className={`wizard-header ${isOverlayMode ? 'py-3 px-5 text-label-sm' : 'py-5 px-8 text-xl'} font-bold uppercase tracking-wide-20 bg-md-sys-surface-container-high border-b border-md-sys-outline/14 text-md-sys-on-surface flex items-center justify-center gap-3 relative`}>
                    <div className={`w-2 h-2 rounded-full ${!hasSelectedResult ? 'bg-info' : (isDefeat ? 'bg-md-sys-error' : 'bg-success')} animate-pulse`} />
                    {title}
                    <button ref={closeButtonRef} onClick={() => setShowWizard(null)} className="absolute right-4 md3-icon-btn opacity-40 hover:opacity-100 hover:bg-md-sys-error/10 hover:text-md-sys-error transition-all" aria-label="Close match wizard">
                        <X size={isOverlayMode ? 18 : 24} />
                    </button>
                </div>

                <div className="px-4 pt-3 wizard-tabs-wrap">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('result')}
                            className={`wizard-tab-btn rounded-2xl py-3 text-label-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'result' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'}`}
                        >
                            Result
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('ocr')}
                            className={`wizard-tab-btn rounded-2xl py-3 text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'ocr' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'}`}
                        >
                            <Users size={16} />
                            {hasSavedOcrReview && !hasPendingOcrReview ? 'Review Again' : 'OCR Review'} {detectedPlayerCount > 0 ? `(${detectedPlayerCount})` : ''}
                            {hasSavedOcrReview && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black tracking-normal ${activeTab === 'ocr' ? 'bg-white/20 text-current' : 'bg-success-soft text-success'}`}>
                                    Reviewed
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {activeTab === 'result' ? (
                    <div className={`overflow-y-auto overscroll-contain flex-1 flex flex-col ${isOverlayMode ? 'gap-3 px-4 py-4' : 'gap-5 px-8 py-6'} custom-scrollbar`}>
                        {hasSavedOcrReview && (
                            <div className="rounded-2xl border border-success/20 bg-success-soft px-4 py-3 text-label-sm text-success flex items-center justify-between gap-3">
                                <span className="font-semibold">OCR review saved.</span>
                                {pendingMatchData?.ocrReviewedAt ? (
                                    <span className="font-mono text-label-xs opacity-80">
                                        {new Date(Number(pendingMatchData.ocrReviewedAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                ) : null}
                            </div>
                        )}
                        <div className={cardClass}>
                            <span className={labelClass}>Outcome</span>
                            <div className="grid grid-cols-3 gap-2">
                                {(['Win', 'Loss', 'Draw'] as const).map((result) => (
                                    <button
                                        key={result}
                                        type="button"
                                        onClick={() => {
                                            setShowWizard(result);
                                            setSelectedWinType(null);
                                        }}
                                        className={`wizard-outcome-btn rounded-2xl py-3.5 text-label-sm font-bold uppercase tracking-widest transition-all ${selectedResult === result
                                            ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg'
                                            : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'
                                            }`}
                                    >
                                        {result}
                                    </button>
                                ))}
                            </div>
                            {selectedResult === 'Loss' && selectedWinType === 'Combat' && (
                                <div className="mt-2">
                                    <span className="text-label-sm font-bold uppercase text-md-sys-on-surface/80 block mb-1">Placement</span>
                                    <select
                                        className={`w-full ${inputBaseClass} py-2 text-body`}
                                        value={pendingPlacement && pendingPlacement >= 2 && pendingPlacement <= 5 ? pendingPlacement : 2}
                                        onChange={(e) => {
                                            const next = Number.parseInt(e.target.value, 10);
                                            if (!Number.isFinite(next)) {
                                                setPendingPlacement(2);
                                                return;
                                            }
                                            setPendingPlacement(Math.min(5, Math.max(2, next)));
                                        }}
                                    >
                                        {[2, 3, 4, 5].map((place) => (
                                            <option key={place} value={place}>
                                                {place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {(selectedResult === 'Win' || selectedResult === 'Loss') && (
                            <div className="flex gap-2 w-full">
                                <button onClick={() => setSelectedWinType('Combat')} className={`flex-1 ${isOverlayMode ? 'py-3.5 text-label-sm' : 'py-4 text-body'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg scale-102' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'}`}>
                                    <Sword size={16} /> {selectedResult === 'Loss' ? 'Combat Defeat' : 'Combat Win'}
                                </button>
                                <button onClick={() => setSelectedWinType('Artifact')} className={`flex-1 ${isOverlayMode ? 'py-3.5 text-label-sm' : 'py-4 text-body'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong shadow-lg scale-102' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'}`}>
                                    <Gem size={16} /> {selectedResult === 'Loss' ? 'Artifact Defeat' : 'Artifact Win'}
                                </button>
                            </div>
                        )}
                        {(selectedResult === 'Win' || selectedResult === 'Loss') && !selectedWinType && (
                            <div className="text-label-sm text-md-sys-on-surface/92 -mt-2">
                                Pick whether this was a Combat or Artifact outcome.
                            </div>
                        )}

                        <div className={`grid grid-cols-1 md:grid-cols-3 ${isOverlayMode ? 'gap-2.5' : 'gap-4'}`}>
                            <div className={`${cardClass} flex flex-col items-center bg-md-sys-primary/5`}>
                                <Clock size={16} className="text-md-sys-primary/70 mb-1" />
                                <span className={labelClass}>Time</span>
                                <div className="wizard-time-row" data-testid="wizard-time-row">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={2}
                                        placeholder="00"
                                        aria-label="Minutes"
                                        value={timeMin}
                                        onChange={(e) => {
                                            const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                                            setTimeMin(next);
                                        }}
                                        className={`wizard-time-input font-mono tabular-nums h-11 leading-tight ${inputBaseClass} ${isOverlayMode ? 'text-base py-1' : 'text-xl py-2'}`}
                                    />
                                    <span className="wizard-time-separator">:</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={2}
                                        placeholder="00"
                                        aria-label="Seconds"
                                        value={timeSec}
                                        onChange={(e) => {
                                            const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                                            if (!next) {
                                                setTimeSec('');
                                                return;
                                            }
                                            const bounded = Math.min(59, Number(next));
                                            setTimeSec(String(bounded).padStart(next.length, '0'));
                                        }}
                                        className={`wizard-time-input font-mono tabular-nums h-11 leading-tight ${inputBaseClass} ${isOverlayMode ? 'text-base py-1' : 'text-xl py-2'}`}
                                    />
                                </div>
                            </div>
                            <div className={`${cardClass} flex flex-col items-center bg-danger/5`}>
                                <HeartCrack size={16} className="text-danger/60 mb-1" />
                                <span className={labelClass}>Damage</span>
                                <input type="text" placeholder="0" value={damageTaken} onChange={(e) => setDamageTaken(e.target.value.replace(/[^0-9]/g, ''))} className={`w-12 ${inputBaseClass} ${isOverlayMode ? 'text-base py-1' : 'text-xl py-2'} border-danger/10 focus:border-danger/30`} />
                            </div>
                            <div className={`${cardClass} flex flex-col items-center bg-success/5`}>
                                <Target size={16} className="text-success/60 mb-1" />
                                <span className={labelClass}>Ship Eliminations</span>
                                <span className={`${isOverlayMode ? 'text-xl' : 'text-2xl'} font-black text-md-sys-on-surface`}>
                                    {Object.values(kills || {}).reduce((a, b) => a + (Number(b) || 0), 0)}
                                </span>
                            </div>
                        </div>
                        {telemetryDurationSeconds != null && (
                            <div className={cardClass}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-label-sm font-bold uppercase tracking-widest text-md-sys-on-surface/80">
                                        Telemetry Duration: {Math.floor(telemetryDurationSeconds / 60).toString().padStart(2, '0')}:{String(telemetryDurationSeconds % 60).padStart(2, '0')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const mm = Math.floor(telemetryDurationSeconds / 60);
                                            const ss = telemetryDurationSeconds % 60;
                                            setTimeMin(String(mm).padStart(2, '0'));
                                            setTimeSec(String(ss).padStart(2, '0'));
                                            pushNotification({
                                                message: 'Duration set from telemetry.',
                                                type: 'success',
                                                source: 'wizard',
                                                deepLink: { type: 'openWizard', result: selectedResult || undefined },
                                            });
                                        }}
                                        className="px-2.5 py-1 rounded-lg text-label-sm font-bold md3-btn-tonal"
                                    >
                                        Use Telemetry Duration
                                    </button>
                                </div>
                                {hasDurationMismatch && telemetryDurationDelta != null && (
                                    <div className="mt-1 text-label-sm text-warning">
                                        Duration mismatch: off by {formatDurationOffset(telemetryDurationDelta)}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={cardClass}>
                            <div className="flex items-center justify-between mb-4">
                                <span className={labelClass + ' mb-0'}>Ship Eliminations</span>
                                <ChevronDown size={14} className="opacity-40" />
                            </div>
                            <div className={`grid ${isOverlayMode ? 'grid-cols-3' : 'grid-cols-4'} gap-2`}>
                                {[...SHIPS, 'AI Legion'].map(ship => {
                                    const shortName = ship.split('(')[0].trim();
                                    const currentVal = kills?.[shortName] || 0;
                                    const isAiLegion = shortName.toLowerCase() === 'ai legion';
                                    return (
                                        <div
                                            key={ship}
                                            data-testid={isAiLegion ? 'wizard-ai-legion-kill-card' : undefined}
                                            className={`wizard-kill-card flex flex-col items-center rounded-2xl p-3 border transition-all group ${isAiLegion
                                                ? 'wizard-kill-card--ai-legion ai-legion-chip'
                                                : 'bg-md-sys-surface-container-high border-md-sys-outline/5 hover:border-md-sys-primary/40'
                                                }`}
                                        >
                                            <span className={`wizard-kill-label text-label-xs font-bold uppercase mb-2 truncate w-full text-center ${isAiLegion ? 'wizard-kill-label--ai-legion ai-legion-chip__label' : 'opacity-40'
                                                }`}>{shortName}</span>
                                            <div className="flex items-center w-full justify-between">
                                                <button onClick={() => setKills({ ...kills, [shortName]: Math.max(0, currentVal - 1) })} className={`wizard-kill-stepper w-6 h-6 flex items-center justify-center rounded-lg transition-all ${isAiLegion
                                                    ? 'wizard-kill-stepper--ai-legion'
                                                    : 'hover:bg-md-sys-error/10 text-md-sys-on-surface/60 hover:text-md-sys-error'
                                                    }`}>-</button>
                                                <span className={`wizard-kill-value font-mono font-bold text-body ${isAiLegion ? 'wizard-kill-value--ai-legion ai-legion-chip__value' : ''}`}>{currentVal}</span>
                                                <button onClick={() => setKills({ ...kills, [shortName]: currentVal + 1 })} className={`wizard-kill-stepper w-6 h-6 flex items-center justify-center rounded-lg transition-all ${isAiLegion
                                                    ? 'wizard-kill-stepper--ai-legion'
                                                    : 'hover:bg-success/10 text-md-sys-on-surface/60 hover:text-success'
                                                    }`}>+</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={cardClass}>
                            <div className="flex items-center justify-between mb-2">
                                <span className={labelClass + ' mb-0 flex items-center gap-2'}>
                                    <Wrench size={14} /> Ship Weapons
                                </span>
                                <span className="text-label-sm text-md-sys-on-surface/70">
                                    {shipWeaponTotal}/{MAX_SHIP_WEAPONS}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {shipWeaponEntries.length > 0 ? (
                                    shipWeaponEntries.map((entry) => (
                                        <div key={entry.name} className="flex items-center justify-between gap-2 rounded-xl border border-md-sys-outline/12 px-2.5 py-1.5 mg-surface-high">
                                            <span className="text-label-sm font-bold">{entry.name}</span>
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => updateShipWeaponQuantity(entry.name, entry.quantity - 1)}
                                                    className="w-7 h-7 rounded-control md3-surface inline-flex items-center justify-center text-md-sys-on-surface/70 hover:text-md-sys-on-surface"
                                                >
                                                    -
                                                </button>
                                                <span className="min-w-[1.5rem] text-center font-black text-label-sm">{entry.quantity}</span>
                                                <button
                                                    type="button"
                                                    disabled={shipWeaponTotal >= MAX_SHIP_WEAPONS}
                                                    onClick={() => updateShipWeaponQuantity(entry.name, entry.quantity + 1)}
                                                    className="w-7 h-7 rounded-control md3-surface inline-flex items-center justify-center text-md-sys-on-surface/70 hover:text-md-sys-on-surface disabled:opacity-disabled"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-label-sm text-md-sys-on-surface/62">No ship weapons selected.</div>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                    {WEAPONS
                                        .filter((weapon) => shipWeaponCountMap[weapon] == null)
                                        .map((weapon) => (
                                            <button
                                                key={weapon}
                                                type="button"
                                                disabled={shipWeaponTotal >= MAX_SHIP_WEAPONS}
                                                onClick={() => updateShipWeaponQuantity(weapon, 1)}
                                                className="px-2 py-1 rounded-md text-label-sm font-semibold transition-all mg-surface-high opacity-80 hover:opacity-100 disabled:opacity-40"
                                            >
                                                + {weapon}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        </div>

                        <div className={cardClass}>
                            <button
                                type="button"
                                onClick={() => setLoadoutExpanded((prev) => !prev)}
                                className="w-full flex items-center justify-between"
                            >
                                <span className={labelClass + ' mb-0 flex items-center gap-2'}>
                                    <Wrench size={14} /> Prospector Loadout
                                    {hasTelemetryProspectorLoadout && (
                                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-soft text-success px-2 py-0.5 text-label-xs font-semibold" title="Detected loadout data">
                                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                            Telemetry
                                        </span>
                                    )}
                                </span>
                                <div className="flex gap-1.5 items-center overflow-hidden">
                                    {displayedCharacterWeapons.length > 0 ? displayedCharacterWeapons.slice(0, MAX_PROSPECTOR_SLOTS).map((w, i) => (
                                        <span key={`w-${i}`} className="px-1.5 py-0.5 rounded bg-md-sys-surface-container-highest text-md-sys-on-surface text-[10px] font-bold uppercase truncate max-w-[80px]">{w}</span>
                                    )) : <span className="text-label-xs opacity-40">No Weapons</span>}
                                    <span className="opacity-20 mx-1">|</span>
                                    {displayedCharacterEquipment.length > 0 ? displayedCharacterEquipment.slice(0, MAX_PROSPECTOR_SLOTS).map((e, i) => (
                                        <span key={`e-${i}`} className="px-1.5 py-0.5 rounded bg-md-sys-surface-container-highest text-md-sys-on-surface text-[10px] font-bold uppercase truncate max-w-[80px]">{e}</span>
                                    )) : <span className="text-label-xs opacity-40">No Equipment</span>}
                                    {(displayedCharacterWeapons.length + displayedCharacterEquipment.length + displayedPerks.length) > 4 && (
                                        <span className="text-label-xs font-semibold opacity-50">+{(displayedCharacterWeapons.length + displayedCharacterEquipment.length + displayedPerks.length) - 4}</span>
                                    )}
                                </div>
                            </button>
                            {(loadoutExpanded || !hasTelemetryLoadout) && (
                                <div className="mt-3 space-y-3 max-h-[20rem] overflow-y-auto custom-scrollbar pr-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1 rounded-pill bg-md-sys-surface-container-high px-2 py-0.5 text-label-xs font-semibold text-md-sys-on-surface/80">
                                            Ship: {String(pendingLoadout.ship || pendingMatchData.ship || '--')}
                                        </span>
                                        {hasTelemetryShipLoadout && (
                                            <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-2 py-0.5 text-label-xs font-semibold">
                                                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                                Ship Telemetry
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1 rounded-pill bg-md-sys-surface-container-high px-2 py-0.5 text-label-xs font-semibold text-md-sys-on-surface/80">
                                            Prospector: {String(pendingLoadout.hero || pendingMatchData.hero || '--')}
                                        </span>
                                        {hasTelemetryProspectorLoadout && (
                                            <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-2 py-0.5 text-label-xs font-semibold">
                                                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                                Prospector Telemetry
                                            </span>
                                        )}
                                    </div>
                                    {displayedPerks.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-label-xs font-bold uppercase opacity-50">Perks</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {displayedPerks.map((perk) => (
                                                    <span
                                                        key={perk}
                                                        className="px-2 py-0.5 rounded-pill bg-md-sys-surface-container-high text-md-sys-on-surface text-label-xs font-semibold"
                                                    >
                                                        {perk}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-label-xs font-bold uppercase opacity-50">Weapons (max {MAX_PROSPECTOR_SLOTS})</span>
                                            {hasTelemetryLoadout && displayedCharacterWeapons.length > 0 && (
                                                <span
                                                    data-testid="wizard-telemetry-prospector-weapons"
                                                    className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-2 py-0.5 text-label-xs font-semibold"
                                                    title="Loadout source from telemetry"
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                                    {loadoutSourceBadgeLabel}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {CHARACTER_WEAPONS.map((weapon) => {
                                                const selected = displayedCharacterWeapons.some((entry) => entry.toLowerCase() === weapon.toLowerCase());
                                                const disabled = !selected && displayedCharacterWeapons.length >= MAX_PROSPECTOR_SLOTS;
                                                return (
                                                    <button
                                                        key={weapon}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => updatePendingLoadout('characterWeapons', weapon)}
                                                        className={`px-2 py-1 rounded-md text-label-sm font-semibold transition-all ${selected ? 'bg-success-soft text-success ring-1 ring-success/40' : 'mg-surface-high opacity-70 hover:opacity-100'} disabled:opacity-40`}
                                                    >
                                                        {weapon}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-label-xs font-bold uppercase opacity-50">Equipment (max {MAX_PROSPECTOR_SLOTS})</span>
                                            {hasTelemetryLoadout && displayedCharacterEquipment.length > 0 && (
                                                <span
                                                    data-testid="wizard-telemetry-prospector-equipment"
                                                    className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-2 py-0.5 text-label-xs font-semibold"
                                                    title="Loadout source from telemetry"
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                                    {loadoutSourceBadgeLabel}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {CHARACTER_EQUIPMENT.map((equipment) => {
                                                const selected = displayedCharacterEquipment.some((entry) => entry.toLowerCase() === equipment.toLowerCase());
                                                const disabled = !selected && displayedCharacterEquipment.length >= MAX_PROSPECTOR_SLOTS;
                                                return (
                                                    <button
                                                        key={equipment}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => updatePendingLoadout('characterEquipment', equipment)}
                                                        className={`px-2 py-1 rounded-md text-label-sm font-semibold transition-all ${selected ? 'bg-success-soft text-success ring-1 ring-success/40' : 'mg-surface-high opacity-70 hover:opacity-100'} disabled:opacity-40`}
                                                    >
                                                        {equipment}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {activeMode === 'Artifact Brawl' && (
                            <div className={cardClass}>
                                <span className={labelClass}>Mission Objectives</span>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { label: 'Easy', val: poiEasy, set: setPoiEasy, border: 'border-success-soft' },
                                        { label: 'Med', val: poiMedium, set: setPoiMedium, border: 'border-warning-soft' },
                                        { label: 'Epic', val: poiEpic, set: setPoiEpic, border: 'border-accent-soft' }
                                    ].map((item) => (
                                        <div key={item.label} className={`relative ${isOverlayMode ? 'py-2' : 'py-3'} rounded-2xl mg-surface-high border ${item.border} flex flex-col items-center group cursor-pointer active:scale-95 transition-all`} onClick={() => item.set(item.val + 1)} onContextMenu={(e) => { e.preventDefault(); item.set(Math.max(0, item.val - 1)); }}>
                                            <span className="text-label-sm font-bold text-md-sys-on-surface/70 mb-1">{item.label}</span>
                                            <span className="text-xl font-bold">{item.val}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isDefeat && (
                            <div className={cardClass}>
                                <span className={labelClass}>Eliminated By</span>
                                {defeatedTeams.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {defeatedTeams.map((team, index) => {
                                            const isSelected = isEliminatedByTeamMatch(pendingMatchData?.eliminatedByTeam, team);
                                            return (
                                                <button
                                                    key={`${team.teamName}-${index}`}
                                                    type="button"
                                                    onClick={() => applyEliminatorTeam(team.teamName, team.color, team.shipType)}
                                                    className={`px-2.5 py-1 rounded-xl text-label-sm font-bold uppercase border transition-all ${isSelected ? 'border-md-sys-primary bg-md-sys-primary/10 shadow-lg' : 'border-md-sys-outline/10 mg-surface-high opacity-75 hover:opacity-100'}`}
                                                >
                                                    {getEliminatorDisplayLabel({ teamName: team.teamName, color: team.color }) || team.teamName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <input type="text" className={`w-full ${inputBaseClass} py-2 text-body placeholder:opacity-40`} placeholder="Eliminator team color/name..." value={pendingKilledBy || ''} onChange={e => setPendingKilledBy(e.target.value)} />
                                    <input type="text" className={`w-full ${inputBaseClass} py-2 text-body placeholder:opacity-40`} placeholder="Killer ship..." value={pendingKilledByShip || ''} onChange={e => setPendingKilledByShip(e.target.value)} />
                                </div>
                            </div>
                        )}

                        <button onClick={handleWizardSmartCaptureRequest} className="w-full py-3 rounded-2xl mg-surface-high border border-md-sys-outline/15 text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:border-md-sys-primary/30 hover:bg-md-sys-primary/5 transition-all">
                            <Scan size={14} /> Smart Capture
                        </button>

                        <button
                            onClick={() => {
                                if (hasPendingOcrReview) {
                                    setActiveTab('ocr');
                                    return;
                                }
                                processFinalSubmission(selectedResult === 'Draw' ? 'Combat' : (selectedWinType || 'Combat'));
                            }}
                            disabled={submitting || !canFinalizeResult}
                            className={`w-full ${isOverlayMode ? 'py-4' : 'py-5'} rounded-3xl font-bold uppercase tracking-wide-30 text-label-sm transition-all shadow-xl active:scale-95 ${submitting ? 'opacity-disabled grayscale' : (!canFinalizeResult ? 'opacity-disabled grayscale' : (selectedResult === 'Draw' ? 'bg-info text-ink-strong' : (selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong' : 'bg-md-sys-primary text-md-sys-onPrimary')))}`
                            }
                        >
                            {submitting ? 'Synchronizing...' : finalizeButtonLabel}
                        </button>
                    </div>
                ) : (
                        <div
                        data-testid="wizard-ocr-tab-panel"
                        className={`flex-1 min-h-0 flex flex-col ${isOverlayMode ? 'px-4 py-4 gap-3' : 'px-8 py-6 gap-4'}`}
                    >
                        <div className="flex items-center gap-3 rounded-xl mg-surface border border-md-sys-outline/10 px-4 py-2.5">
                            <span className="text-label-sm font-bold text-md-sys-on-surface/70 whitespace-nowrap">Review Panel</span>
                            <span className="text-label-xs text-md-sys-on-surface/45 hidden sm:inline">·</span>
                            <span className="text-label-xs text-md-sys-on-surface/45 truncate hidden sm:inline">Correct players before final submit</span>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleWizardRerunOcr();
                                }}
                                disabled={isRerunningOcr}
                                className="ml-auto px-3 py-1.5 rounded-lg text-label-xs font-bold md3-btn-tonal inline-flex items-center gap-1.5 shrink-0"
                                title="Re-run OCR across bundled screenshot artifacts"
                            >
                                <RefreshCw size={12} />
                                {isRerunningOcr ? 'Re-running...' : 'Re-run OCR'}
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar">
                            <OcrCorrectionModal
                                isOpen={true}
                                embedded={true}
                                onClose={() => setActiveTab('result')}
                                onAcceptAll={() => setShowWizard(null)}
                                screenshots={wizardReviewScreenshots}
                            />
                        </div>
                    </div>
                )}

                <div className="p-4 flex justify-center border-t border-md-sys-outline/5">
                    <button onClick={() => setShowWizard(null)} className="text-label-sm font-bold uppercase tracking-widest text-md-sys-on-surface/70 hover:text-md-sys-on-surface transition-colors flex items-center gap-2">
                        <CheckCircle2 size={14} />
                        {activeTab === 'result' ? 'Abort Submission' : 'Close Review'}
                    </button>
                </div>
            </div>
        </div>
    );
};

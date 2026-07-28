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
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';
import { bundleMatchArtifacts, rerunOCRMulti } from '../utils/artifactService';
import {
    buildRerunOcrCallGroups,
    classifyArtifactScreenshotBucket,
} from '../utils/artifactScreenshotBuckets';
import {
    buildOcrNameConfidenceMapFromExtractedData,
    buildOcrNameSourceMap,
} from '../utils/ocr/nameSourceHints';
import {
    buildAliasVariantMap,
    buildOcrCandidatePool,
    resolveOcrName,
} from '../utils/ocrNameResolver';
import { selectActiveRosterNames } from '../store/slices/createDataSlice';
import {
    getEliminatorDisplayLabel,
    getPrimaryEliminatedByTeamValue,
    isEliminatedByTeamMatch,
} from '../utils/eliminatorTeam';
import { UNKNOWN_PLAYER_LABELS } from '../utils/constants';

type WizardTab = 'result' | 'ocr';
const MAX_SHIP_WEAPONS = 10;
const MAX_PROSPECTOR_SLOTS = 2;
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

const dedupeWizardNames = (values: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>();
    const deduped: string[] = [];
    values.forEach((value) => {
        const normalized = String(value || '').trim();
        const key = normalized.toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(normalized);
    });
    return deduped;
};

interface EmbeddedOcrFooterActions {
    discard: () => void;
    saveAndClose: () => void;
    commitDraft: () => boolean;
}

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
        updateMatch,
    } = useGameData();

    const { showWizard, setShowWizard, isOverlayMode, activeMode, activeUser, pushNotification, requestSmartCapture } = useUIState();
    const { processFinalSubmission, saveResultDraft, discardTelemetryDraft, submitting } = useMatchSubmission();
    const ocrMode = useAppStore((state) => state.ocrMode);
    const ocrRegions = useAppStore((state) => state.ocrRegions);
    const wizardCloseOnOcrApply = useAppStore((state) => state.wizardCloseOnOcrApply);
    const addPilotAlias = useAppStore((state) => state.addPilotAlias);
    const setPendingDraftData = useAppStore((state) => state.setPendingMatchData);
    const pendingStoreMatch = useAppStore((state) => {
        const pendingId = Number(state.pendingMatchData?.id || 0);
        if (!Number.isInteger(pendingId) || pendingId <= 0) return null;
        return state.matches.find((match) => match.id === pendingId) || null;
    });
    const [selectedWinType, setSelectedWinType] = useState<'Combat' | 'Artifact' | null>(null);
    const [activeTab, setActiveTab] = useState<WizardTab>('result');
    const [guidedResultStep, setGuidedResultStep] = useState<'stats' | 'team-review' | 'save'>('stats');
    const [isRerunningOcr, setIsRerunningOcr] = useState(false);
    const [isProspectorLoadoutExpanded, setIsProspectorLoadoutExpanded] = useState(false);
    const [embeddedOcrFooterActions, setEmbeddedOcrFooterActions] = useState<EmbeddedOcrFooterActions | null>(null);
    const isWizardOpen = Boolean(showWizard);
    const lastTimeSyncMatchIdRef = React.useRef<number | null>(null);
    const dialogRef = React.useRef<HTMLDivElement | null>(null);
    const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
    const previousFocusedElementRef = React.useRef<HTMLElement | null>(null);
    const titleId = React.useId();
    const descriptionId = React.useId();
    const selectedResultFromDraft = (
        pendingMatchData?.result === 'Win'
        || pendingMatchData?.result === 'Loss'
        || pendingMatchData?.result === 'Draw'
    )
        ? pendingMatchData.result
        : null;

    React.useEffect(() => {
        if (isWizardOpen && isOverlayMode) {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        }
    }, [isOverlayMode, isWizardOpen]);

    React.useEffect(() => {
        if (!isWizardOpen) {
            setActiveTab('result');
            setGuidedResultStep('stats');
            setSelectedWinType(null);
            setIsProspectorLoadoutExpanded(false);
            lastTimeSyncMatchIdRef.current = null;
            return;
        }
        const initialTab = useAppStore.getState().wizardInitialTab;
        if (initialTab === 'ocr') {
            useAppStore.getState().setWizardInitialTab(null);
            setActiveTab('ocr');
            return;
        }
        // Restore win type when reopening a previously submitted match (re-edit flow)
        const subType = pendingMatchData?.subType;
        if (subType === 'Combat' || subType === 'Artifact') {
            setSelectedWinType(subType as 'Combat' | 'Artifact');
        } else {
            setSelectedWinType(null);
        }
        const draftResult = (
            pendingMatchData?.result === 'Win'
            || pendingMatchData?.result === 'Loss'
            || pendingMatchData?.result === 'Draw'
        )
            ? pendingMatchData.result
            : null;
        const restoredPlacement = Number(pendingMatchData?.placement);
        if (draftResult === 'Loss' && subType === 'Combat' && Number.isInteger(restoredPlacement) && restoredPlacement >= 2 && restoredPlacement <= 5) {
            setPendingPlacement(restoredPlacement);
        } else if (pendingPlacement != null) {
            setPendingPlacement(null);
        }
        const hasOutcomeType = draftResult === 'Draw' || subType === 'Combat' || subType === 'Artifact';
        const hasValidPlacement = draftResult !== 'Loss'
            || subType !== 'Combat'
            || (Number.isInteger(restoredPlacement) && restoredPlacement >= 2 && restoredPlacement <= 5);
        const hasCompletedOcrReview = (
            String(pendingMatchData?.ocrState || '').trim().toLowerCase() === 'saved'
            || Boolean(pendingMatchData?.ocrReviewedAt)
        );
        if (!draftResult || !hasOutcomeType || !hasValidPlacement) {
            setGuidedResultStep('stats');
        } else if (hasCompletedOcrReview) {
            setGuidedResultStep('save');
        } else {
            setGuidedResultStep('team-review');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isWizardOpen, pendingMatchData?.ocrReviewedAt, pendingMatchData?.ocrState, pendingMatchData?.placement, pendingMatchData?.result, pendingMatchData?.subType]);

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
        const effectiveResult = selectedResultFromDraft || (showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
            ? showWizard
            : null);
        const effectiveSubType = selectedWinType || (pendingMatchData?.subType === 'Combat' || pendingMatchData?.subType === 'Artifact'
            ? pendingMatchData.subType
            : null);
        if (effectiveResult !== 'Loss' || effectiveSubType !== 'Combat') {
            if (pendingPlacement != null) setPendingPlacement(null);
        }
    }, [pendingMatchData?.subType, pendingPlacement, selectedResultFromDraft, selectedWinType, setPendingPlacement, showWizard]);

    React.useEffect(() => {
        if (!isWizardOpen || !pendingMatchData) return;
        const artifactFromSource = String(pendingMatchData.artifactSource || '').trim();
        const artifactFromModifiers = Array.isArray(pendingMatchData.reachModifiers)
            ? pendingMatchData.reachModifiers.find((modifier) => String(modifier || '').startsWith('Artifact:'))
            : '';
        const nextArtifactType = artifactFromSource
            || String(artifactFromModifiers || '').split(':').slice(1).join(':').trim();
        if (nextArtifactType) {
            if (pendingArtifactType !== nextArtifactType) setPendingArtifactType(nextArtifactType);
            return;
        }
        if (pendingArtifactType) {
            setPendingArtifactType('');
        }
    }, [isWizardOpen, pendingArtifactType, pendingMatchData, setPendingArtifactType]);

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
    const deferredWizardReviewScreenshots = React.useDeferredValue(wizardReviewScreenshots);

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

    const selectedResult = selectedResultFromDraft || (showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
        ? showWizard
        : null);
    const hasSelectedResult = selectedResult !== null;
    const isDefeat = selectedResult === 'Loss';
    const title = !hasSelectedResult ? 'Match Result' : (isDefeat ? 'Defeat' : selectedResult);
    const hasSelectedOutcomeType = selectedResult === 'Draw' || selectedWinType !== null;
    const hasValidCombatLossPlacement = (
        selectedResult !== 'Loss'
        || selectedWinType !== 'Combat'
        || (pendingPlacement != null && pendingPlacement >= 2 && pendingPlacement <= 5)
    );
    const hasCompleteResultPath = hasSelectedResult && hasSelectedOutcomeType && hasValidCombatLossPlacement;
    const showGuidedDetails = hasSelectedResult && hasSelectedOutcomeType && hasValidCombatLossPlacement;
    const showTeamReviewStep = showGuidedDetails && (guidedResultStep === 'team-review' || guidedResultStep === 'save');
    const showSaveStep = showGuidedDetails && guidedResultStep === 'save';
    const normalizedPendingOcrState = String(pendingMatchData?.ocrState || '').trim().toLowerCase();
    const isPendingOcrProcessing = normalizedPendingOcrState === 'processing';
    const hasPendingOcrReview = normalizedPendingOcrState === 'reviewing';
    const hasSavedOcrReview = normalizedPendingOcrState === 'saved' || Boolean(pendingMatchData?.ocrReviewedAt);
    const isTelemetryDraftPending = pendingStoreMatch?.subType === 'Telemetry Draft';
    const handleReturnToResultTab = React.useCallback(() => {
        React.startTransition(() => setActiveTab('result'));
    }, []);

    const handleAbortSubmission = React.useCallback(async () => {
        if (activeTab === 'ocr') {
            handleReturnToResultTab();
            return;
        }
        if (!isTelemetryDraftPending || !pendingStoreMatch?.id) {
            setShowWizard(null);
            return;
        }
        const confirmed = window.confirm(
            'Discard this telemetry draft? Recorded screenshots will be deleted and the pending Smart Captures match will be removed.'
        );
        if (!confirmed) return;
        await discardTelemetryDraft(pendingStoreMatch.id);
    }, [activeTab, discardTelemetryDraft, handleReturnToResultTab, isTelemetryDraftPending, pendingStoreMatch, setShowWizard]);
    const abortButtonLabel = activeTab === 'ocr'
        ? 'Back to Result'
        : (isTelemetryDraftPending ? 'Discard Match Draft' : 'Abort Submission');

    React.useEffect(() => {
        if (!isWizardOpen || !showGuidedDetails) {
            setGuidedResultStep('stats');
            return;
        }
        if (hasSavedOcrReview && activeTab === 'result') {
            setGuidedResultStep('save');
        }
    }, [activeTab, hasSavedOcrReview, isWizardOpen, showGuidedDetails]);

    const canFinalizeResult = hasCompleteResultPath;
    const submissionSubType = selectedResult === 'Draw' ? 'Combat' : (selectedWinType || 'Combat');
    const normalizedLossPlacement = Number.isFinite(Number(pendingPlacement))
        ? Math.min(5, Math.max(2, Number(pendingPlacement)))
        : null;
    const commitWizardState = React.useCallback(() => {
        if (hasPendingOcrReview) {
            embeddedOcrFooterActions?.commitDraft();
        }
        const latestPending = useAppStore.getState().pendingMatchData;
        if (!latestPending) return false;

        const normalizedOcrState = String(latestPending.ocrState || '').trim().toLowerCase();
        const shouldFinalizeOcr = normalizedOcrState === 'reviewing'
            || normalizedOcrState === 'ready'
            || Number(latestPending.ocrReviewedAt) > 0;

        const activePlayerKey = String(latestPending.player || activeUser || '').trim().toLowerCase();
        const nextTeammates = dedupeWizardNames(
            Array.isArray(latestPending.teammates) ? latestPending.teammates : []
        ).filter((name) => name.toLowerCase() !== activePlayerKey);
        const nextOpponents = dedupeWizardNames([
            ...(Array.isArray(latestPending.opponents) ? latestPending.opponents : []),
            ...((latestPending.opponentTeams || []).flatMap((team) => team.players || [])),
        ]).filter((name) => name.toLowerCase() !== activePlayerKey);
        const nextKills = Object.entries({
            ...(latestPending.kills || {}),
            ...(kills || {}),
        }).reduce<Record<string, number>>((acc, [ship, value]) => {
            const parsed = Number(value) || 0;
            if (parsed > 0) {
                acc[ship] = parsed;
            }
            return acc;
        }, {});
        const reviewedAt = shouldFinalizeOcr
            ? (
                Number(latestPending.ocrReviewedAt) > 0
                    ? Number(latestPending.ocrReviewedAt)
                    : Date.now()
            )
            : undefined;
        const nextTime = (timeMin || timeSec)
            ? `${timeMin || '00'}:${timeSec || '00'}`
            : latestPending.time;
        const nextPlacement = selectedResult === 'Win'
            ? 1
            : (selectedResult === 'Loss' && submissionSubType === 'Combat'
                ? (normalizedLossPlacement ?? latestPending.placement ?? undefined)
                : undefined);

        setSelectedTeammates(nextTeammates);
        setSelectedOpponents(nextOpponents);
        setPendingDraftData({
            ...latestPending,
            result: selectedResult || latestPending.result,
            subType: submissionSubType,
            placement: nextPlacement,
            time: nextTime,
            damageTaken: Math.max(
                Number(latestPending.damageTaken) || 0,
                Number.parseInt(String(damageTaken || ''), 10) || 0
            ),
            poiEasy: Math.max(Number(latestPending.poiEasy) || 0, Number(poiEasy) || 0),
            poiMedium: Math.max(Number(latestPending.poiMedium) || 0, Number(poiMedium) || 0),
            poiEpic: Math.max(Number(latestPending.poiEpic) || 0, Number(poiEpic) || 0),
            kills: Object.keys(nextKills).length > 0 ? nextKills : latestPending.kills,
            killedBy: pendingKilledBy || latestPending.killedBy || undefined,
            killedByShip: pendingKilledByShip || latestPending.killedByShip || undefined,
            teammates: nextTeammates,
            opponents: nextOpponents,
            ocrReviewedAt: reviewedAt,
            ocrState: shouldFinalizeOcr ? 'saved' : latestPending.ocrState,
        });
        return shouldFinalizeOcr;
    }, [
        activeUser,
        damageTaken,
        embeddedOcrFooterActions,
        hasPendingOcrReview,
        kills,
        normalizedLossPlacement,
        pendingKilledBy,
        pendingKilledByShip,
        poiEasy,
        poiEpic,
        poiMedium,
        selectedResult,
        setPendingDraftData,
        setSelectedOpponents,
        setSelectedTeammates,
        submissionSubType,
        timeMin,
        timeSec,
    ]);
    const disableEmbeddedOcrFooterActions = isPendingOcrProcessing || isRerunningOcr;
    const embeddedOcrFooterBusyTitle = isPendingOcrProcessing
        ? 'Wait for OCR processing to finish before applying review'
        : (isRerunningOcr
            ? 'Wait for OCR rerun to finish before applying review'
            : undefined);
    const handleFinalizeWizardSave = React.useCallback(() => {
        if (!canFinalizeResult || submitting) return;
        commitWizardState();
        void processFinalSubmission(submissionSubType);
    }, [canFinalizeResult, commitWizardState, processFinalSubmission, submissionSubType, submitting]);
    const handleCloseAfterEmbeddedOcrSave = React.useCallback(() => {
        if (canFinalizeResult && !submitting) {
            handleFinalizeWizardSave();
            return;
        }
        setShowWizard(null);
    }, [canFinalizeResult, handleFinalizeWizardSave, setShowWizard, submitting]);
    const submitResultsHint = (() => {
        if (!hasSelectedResult) return 'Select Win, Loss, or Draw to submit.';
        if (!hasSelectedOutcomeType) {
            return selectedResult === 'Loss'
                ? 'Choose Combat Defeat or Artifact Defeat to submit.'
                : 'Choose Combat Win or Artifact Win to submit.';
        }
        if (!hasValidCombatLossPlacement) {
            return 'Select your placement for a combat defeat to submit.';
        }
        return '';
    })();

    if (!showWizard || !pendingMatchData) return null;

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
    const displayedCharacterWeapons = (pendingLoadout.characterWeapons || []).slice(0, MAX_PROSPECTOR_SLOTS);
    const displayedCharacterEquipment = (pendingLoadout.characterEquipment || []).slice(0, MAX_PROSPECTOR_SLOTS);
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
    const hasTelemetryLoadout = shipWeaponTotal > 0
        || (pendingLoadout.characterWeapons?.length || 0) > 0
        || (pendingLoadout.characterEquipment?.length || 0) > 0;
    const hasTelemetryShipLoadout = shipWeaponTotal > 0;
    const hasTelemetryProspectorLoadout = (pendingLoadout.characterWeapons?.length || 0) > 0
        || (pendingLoadout.characterEquipment?.length || 0) > 0
        || displayedPerks.length > 0;
    const latestTelemetryLoadoutSource = pendingMatchData?.telemetryConsistency?.loadoutSaves?.length
        ? pendingMatchData.telemetryConsistency.loadoutSaves[pendingMatchData.telemetryConsistency.loadoutSaves.length - 1].source
        : null;
    const loadoutSourceBadgeLabel = getTelemetryLoadoutSourceLabel(latestTelemetryLoadoutSource) || 'Telemetry';
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
    const syncResultDraft = (result: 'Win' | 'Loss' | 'Draw') => {
        setGuidedResultStep('stats');
        const nextDraft: Partial<Match> = {
            ...pendingMatchData,
            result,
            subType: result === 'Draw'
                ? 'Combat'
                : (
                    pendingMatchData.subType === 'Combat' || pendingMatchData.subType === 'Artifact'
                        ? pendingMatchData.subType
                        : undefined
                ),
            placement: result === 'Loss' ? pendingMatchData.placement : undefined,
        };
        setPendingDraftData(nextDraft);
        setShowWizard(result);
        if (result !== 'Loss') {
            setPendingPlacement(null);
        }
        if (result === 'Draw') {
            setSelectedWinType(null);
            return;
        }
        if (pendingMatchData.subType === 'Combat' || pendingMatchData.subType === 'Artifact') {
            setSelectedWinType(pendingMatchData.subType);
            return;
        }
        setSelectedWinType(null);
    };
    const syncSubTypeDraft = (subType: 'Combat' | 'Artifact') => {
        setGuidedResultStep('stats');
        setSelectedWinType(subType);
        if (selectedResult === 'Loss' && subType !== 'Combat') {
            setPendingPlacement(null);
        }
        setPendingDraftData({
            ...pendingMatchData,
            result: selectedResult || pendingMatchData.result,
            subType,
            placement: selectedResult === 'Loss' && subType === 'Combat'
                ? pendingMatchData.placement
                : undefined,
        });
    };

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
        React.startTransition(() => setActiveTab('ocr'));
        const pendingMatchId = Number((pendingMatchData as Match | null)?.id || 0);
        const requestId = requestSmartCapture({
            activeUser: activeUser || null,
            source: 'wizard',
            matchId: Number.isInteger(pendingMatchId) && pendingMatchId > 0 ? pendingMatchId : null,
            requestId: `wizard-${Date.now()}`,
            forceOcr: true,
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
        // Bundle screenshots from disk before OCR so images taken during the match
        // are available even if finalizeSubmission hasn't run yet.
        const matchId = Number(pendingMatchData?.id || 0);
        let imagePaths = wizardReviewScreenshots;
        if (matchId > 0) {
            const storeMatchStartTime = useAppStore.getState().matchStartTime;
            const matchStart = typeof storeMatchStartTime === 'number' && storeMatchStartTime > 0
                ? storeMatchStartTime
                : Date.now() - 10 * 60 * 1000;
            const newlyBundled = await bundleMatchArtifacts(matchId, matchStart, Date.now());
            if (newlyBundled.length > 0) {
                const existing = Array.isArray(pendingMatchData?.artifacts) ? pendingMatchData.artifacts : [];
                const seen = new Set(existing);
                const added = newlyBundled.filter(p => !seen.has(p));
                if (added.length > 0) {
                    const merged = [...existing, ...added];
                    setPendingDraftData({ ...(pendingMatchData as Record<string, unknown>), artifacts: merged });
                    imagePaths = merged
                        .map(e => String(e || '').trim())
                        .filter(e => e.length > 0)
                        .filter(e => e.startsWith('data:image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(e));
                }
            }
        }
        const bucketedPaths = {
            crew_hub: [] as string[],
            tactical_map: [] as string[],
            result: [] as string[],
            other: [] as string[],
        };
        imagePaths.forEach((entry) => {
            const cleaned = String(entry || '').trim();
            if (!cleaned) return;
            const bucket = classifyArtifactScreenshotBucket(cleaned);
            const existing = bucketedPaths[bucket];
            if (existing.some((value) => value.toLowerCase() === cleaned.toLowerCase())) return;
            existing.push(cleaned);
        });
        const buckets = buildRerunOcrCallGroups(bucketedPaths);
        const totalImageCount = buckets.reduce((sum, bucket) => sum + bucket.paths.length, 0);
        if (totalImageCount === 0) {
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
            performanceMode: useAppStore.getState().performanceMode || false,
        };

        setIsRerunningOcr(true);
        pushNotification({
            message: `Re-running OCR for ${totalImageCount} screenshot${totalImageCount === 1 ? '' : 's'}...`,
            type: 'info',
            source: 'wizard',
            durationMs: 8000,
            deepLink: { type: 'openWizard', result: selectedResult || undefined },
        });

        try {
            // Use server-side multi-image merge (rerunOCRMulti) so that
            // ocrMerger.mergeCaptures properly cross-enriches crew-hub
            // player data with tactical-map team/ship data.
            const perFileResults: Array<{ imagePath: string; success: boolean; error?: string; data?: OCRExtractedData }> = [];
            let mergedData: OCRExtractedData | undefined;
            // Buckets are separate IPC calls, so each one is told where it sits in
            // the overall run. Otherwise the progress bar restarts per bucket.
            let progressBaseIndex = 0;
            for (const bucket of buckets) {
                const rerun = await rerunOCRMulti(
                    bucket.paths,
                    activeUser || '',
                    ocrMode,
                    ocrRegions,
                    { ...runtimeOptions, progressBaseIndex, progressTotalCount: totalImageCount },
                );
                progressBaseIndex += bucket.paths.length;
                perFileResults.push(...(rerun.perFile || []));
                if (bucket.isPrimary && rerun.data) {
                    mergedData = rerun.data;
                } else if (!mergedData && rerun.data) {
                    mergedData = rerun.data;
                }
            }
            const successfulCount = perFileResults.filter(f => f.success).length;
            const failedCount = perFileResults.length - successfulCount;
            const nameSources = buildOcrNameSourceMap(perFileResults);
            const nameConfidence = buildOcrNameConfidenceMapFromExtractedData(mergedData);
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

            // A rerun returns raw OCR strings. The first-scan path canonicalizes
            // every name against the roster before it reaches the store, so without
            // this the OCR tab shows "add to roster" for pilots already on it.
            const rerunState = useAppStore.getState();
            const activeRosterNames = selectActiveRosterNames(
                rerunState.pilotRegistry,
                rerunState.rosterEntryMeta,
            );
            const rerunCandidates = buildOcrCandidatePool({ seedNames: activeRosterNames });
            const rerunAliasVariantMap = buildAliasVariantMap(rerunState.ocrAliasModel);
            const canonicalName = (rawName: string): string => {
                const cleaned = String(rawName || '').trim();
                if (!cleaned) return '';
                // Roster candidates only — deliberately no bundled-lexicon fallback.
                // The goal here is to make roster members recognizable as roster
                // members; remapping onto a lexicon name that is not on the roster
                // buys nothing and can overwrite a legitimate read with a
                // superficially similar stock name.
                if (rerunCandidates.length === 0) return cleaned;
                // Never blank out a name we could not resolve — keep what OCR read.
                return resolveOcrName({
                    rawName: cleaned,
                    candidates: rerunCandidates,
                    ocrCorrections: rerunState.ocrCorrections,
                    aliasModel: rerunState.ocrAliasModel,
                    aliasVariantMap: rerunAliasVariantMap,
                    variantMinScore: 55,
                    shortThreshold: 1,
                    longThreshold: 2,
                }) || cleaned;
            };
            const dedupeNames = (names: string[]): string[] => Array.from(new Set(
                names
                    .map((entry) => String(entry || '').trim())
                    .filter(Boolean)
            ));
            /** Dedupe for player names only — modifiers must not be roster-matched. */
            const dedupePlayerNames = (names: string[]): string[] => Array.from(new Set(
                names
                    .map((entry) => canonicalName(entry))
                    .filter(Boolean)
            ));
            const safePlayerName = (entry: unknown): string =>
                typeof entry === 'string' ? entry : (entry as { name?: string })?.name || '';
            const nextTeammates = dedupePlayerNames(
                (mergedData.teammates || []).map(safePlayerName).filter((name) => {
                    const n = String(name || '').toLowerCase().trim();
                    return n && !UNKNOWN_PLAYER_LABELS.has(n);
                })
            );
            const nextOpponentTeams = (mergedData.opponentTeams || []).map((team: any, index: number) => ({
                teamName: String(team.teamName || `Enemy Team ${index + 1}`).trim() || `Enemy Team ${index + 1}`,
                shipType: String(team.shipType || '').trim(),
                color: String(team.color || 'unknown').trim() || 'unknown',
                players: dedupePlayerNames((team.players || []).map(safePlayerName)),
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
                    nameConfidence: Object.keys(nameConfidence).length > 0
                        ? nameConfidence
                        : latestPending.ocrDebug?.nameConfidence,
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
        <div className="wizard-scrim fixed inset-0 md3-dialog-scrim z-top flex items-start justify-center p-4 overflow-hidden animate-fade-in" onClick={() => setShowWizard(null)}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className={`wizard-shell overflow-hidden rounded-2_5rem w-full my-2 shadow-2xl flex flex-col animate-scale-in border border-md-sys-outline/24 bg-md-sys-surface-container-highest text-md-sys-on-surface ${isOverlayMode ? 'max-w-7xl h-[calc(100vh-2rem)] max-h-90vh' : 'max-w-7xl h-[calc(100vh-2rem)] max-h-95vh'}`}
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
                                            syncResultDraft(result);
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
                        </div>

                        {(selectedResult === 'Win' || selectedResult === 'Loss') && (
                            <div className="flex gap-2 w-full">
                                <button onClick={() => syncSubTypeDraft('Combat')} className={`flex-1 ${isOverlayMode ? 'py-3.5 text-label-sm' : 'py-4 text-body'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg scale-102' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'}`}>
                                    <Sword size={16} /> {selectedResult === 'Loss' ? 'Combat Defeat' : 'Combat Win'}
                                </button>
                                <button onClick={() => syncSubTypeDraft('Artifact')} className={`flex-1 ${isOverlayMode ? 'py-3.5 text-label-sm' : 'py-4 text-body'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong shadow-lg scale-102' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'}`}>
                                    <Gem size={16} /> {selectedResult === 'Loss' ? 'Artifact Defeat' : 'Artifact Win'}
                                </button>
                            </div>
                        )}
                        {selectedResult === 'Loss' && selectedWinType === 'Combat' && (
                            <div className="mt-2">
                                <span className="text-label-sm font-bold uppercase text-md-sys-on-surface/80 block mb-1">Placement</span>
                                <div className="grid grid-cols-4 gap-2">
                                    {[2, 3, 4, 5].map((place) => {
                                        const isSelected = pendingPlacement === place;
                                        const label = place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
                                        return (
                                            <button
                                                key={place}
                                                type="button"
                                                onClick={() => {
                                                    setPendingPlacement(place);
                                                    setPendingDraftData({
                                                        ...pendingMatchData,
                                                        placement: place,
                                                    });
                                                }}
                                                className={`rounded-2xl py-3 text-label-sm font-bold uppercase tracking-wide transition-all ${isSelected
                                                    ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg'
                                                    : 'bg-md-sys-surface-container-high text-md-sys-on-surface/80 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'
                                                    }`}
                                                aria-label={label}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {(selectedResult === 'Win' || selectedResult === 'Loss') && !selectedWinType && (
                            <div className="text-label-sm text-md-sys-on-surface/92 -mt-2">
                                Pick whether this was a Combat or Artifact outcome.
                            </div>
                        )}
                        {selectedResult === 'Loss' && selectedWinType === 'Combat' && !hasValidCombatLossPlacement && (
                            <div className="text-label-sm text-md-sys-on-surface/92 -mt-2">
                                Choose your placement to continue.
                            </div>
                        )}

                        {showGuidedDetails && (
                            <>
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
                            </>
                        )}

                        {showGuidedDetails && guidedResultStep === 'stats' && (
                            <button
                                type="button"
                                onClick={() => setGuidedResultStep('team-review')}
                                className="w-full py-3 rounded-2xl bg-md-sys-primary text-md-sys-onPrimary text-label-sm font-bold uppercase tracking-widest transition-all hover:brightness-105"
                            >
                                Continue to Team Review
                            </button>
                        )}

                        {showTeamReviewStep && (
                            <div className={cardClass}>
                                <span className={labelClass}>Team Review</span>
                                <div className="space-y-3">
                                    <div className="text-label-sm text-md-sys-on-surface/72">
                                        Review OCR roster alignment and prospector loadout before the final save step.
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <div className="rounded-2xl border border-md-sys-outline/12 px-3 py-2 mg-surface-high">
                                            <div className="text-label-xs font-bold uppercase opacity-55">Detected Players</div>
                                            <div className="mt-1 text-body font-black">{detectedPlayerCount}</div>
                                        </div>
                                        <div className="rounded-2xl border border-md-sys-outline/12 px-3 py-2 mg-surface-high">
                                            <div className="text-label-xs font-bold uppercase opacity-55">Evidence</div>
                                            <div className="mt-1 text-body font-black">{wizardReviewScreenshots.length}</div>
                                        </div>
                                        <div className="rounded-2xl border border-md-sys-outline/12 px-3 py-2 mg-surface-high">
                                            <div className="text-label-xs font-bold uppercase opacity-55">OCR Status</div>
                                            <div className="mt-1 text-body font-black">{isPendingOcrProcessing ? 'Processing' : (hasSavedOcrReview ? 'Reviewed' : (hasPendingOcrReview ? 'Needs Review' : 'Ready'))}</div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                React.startTransition(() => setActiveTab('ocr'));
                                                setGuidedResultStep(hasSavedOcrReview ? 'save' : 'team-review');
                                            }}
                                            className="flex-1 py-3 rounded-2xl mg-surface-high border border-md-sys-outline/15 text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:border-md-sys-primary/30 hover:bg-md-sys-primary/5 transition-all"
                                        >
                                            <Users size={14} />
                                            {hasSavedOcrReview ? 'Review Again' : 'Open OCR Review'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setGuidedResultStep('save')}
                                            className="flex-1 py-3 rounded-2xl bg-md-sys-surface-container-high text-md-sys-on-surface text-label-sm font-bold uppercase tracking-widest transition-all hover:bg-md-sys-surface-container-highest"
                                        >
                                            Continue to Save
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showSaveStep && (
                            <>
                                <button onClick={handleWizardSmartCaptureRequest} className="w-full py-3 rounded-2xl mg-surface-high border border-md-sys-outline/15 text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:border-md-sys-primary/30 hover:bg-md-sys-primary/5 transition-all">
                                    <Scan size={14} /> Smart Capture
                                </button>
                            </>
                        )}
                    </div>
                ) : null}

                <div
                    data-testid="wizard-ocr-tab-panel"
                    className={`${activeTab === 'ocr' ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col' : 'hidden'} ${isOverlayMode ? 'px-4 py-4 gap-3' : 'px-8 py-6 gap-4'}`}
                >
                        <div className={cardClass}>
                            <div className="flex items-center justify-between gap-2">
                                <span className={labelClass + ' mb-0 flex items-center gap-2'}>
                                    <Wrench size={14} /> Prospector Loadout
                                </span>
                                {hasTelemetryProspectorLoadout && (
                                    <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft text-success px-2 py-0.5 text-label-xs font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                        {loadoutSourceBadgeLabel}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                data-testid="wizard-prospector-summary-toggle"
                                onClick={() => setIsProspectorLoadoutExpanded((current) => !current)}
                                className="mt-3 w-full rounded-2xl border border-md-sys-outline/10 px-3 py-2.5 text-left inline-flex items-center gap-3 mg-surface-high hover:bg-md-sys-surface-container-high transition-colors"
                            >
                                <span className="text-label-sm font-semibold text-md-sys-on-surface/80">
                                    {`Weapons: ${displayedCharacterWeapons.length} · Equipment: ${displayedCharacterEquipment.length} · Perk: ${displayedPerks.length}`}
                                </span>
                                <ChevronDown size={14} className={`ml-auto transition-transform ${isProspectorLoadoutExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            {isProspectorLoadoutExpanded && (
                                <div className="mt-3 space-y-3">
                                    <div>
                                        <div className="text-label-xs font-bold uppercase opacity-55">Weapons</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {displayedCharacterWeapons.length > 0 ? displayedCharacterWeapons.slice(0, MAX_PROSPECTOR_SLOTS).map((weapon) => (
                                                <span key={weapon} className="px-2 py-0.5 rounded-pill bg-md-sys-surface-container-high text-md-sys-on-surface text-label-xs font-semibold">
                                                    {weapon}
                                                </span>
                                            )) : (
                                                <span className="text-label-sm text-md-sys-on-surface/55">No weapons selected.</span>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-label-xs font-bold uppercase opacity-55">Equipment</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {displayedCharacterEquipment.length > 0 ? displayedCharacterEquipment.slice(0, MAX_PROSPECTOR_SLOTS).map((equipment) => (
                                                <span key={equipment} className="px-2 py-0.5 rounded-pill bg-md-sys-surface-container-high text-md-sys-on-surface text-label-xs font-semibold">
                                                    {equipment}
                                                </span>
                                            )) : (
                                                <span className="text-label-sm text-md-sys-on-surface/55">No equipment selected.</span>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-label-xs font-bold uppercase opacity-55">Perks</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {displayedPerks.length > 0 ? displayedPerks.map((perk) => (
                                                <span key={perk} className="px-2 py-0.5 rounded-pill bg-md-sys-surface-container-high text-md-sys-on-surface text-label-xs font-semibold">
                                                    {perk}
                                                </span>
                                            )) : (
                                                <span className="text-label-sm text-md-sys-on-surface/55">No perks selected.</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-3 pt-1">
                                        <div>
                                            <div className="text-label-xs font-bold uppercase opacity-55 mb-1">Edit Weapons</div>
                                            <div className="flex flex-wrap gap-1.5">
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
                                            <div className="text-label-xs font-bold uppercase opacity-55 mb-1">Edit Equipment</div>
                                            <div className="flex flex-wrap gap-1.5">
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
                                </div>
                            )}
                        </div>
                        <div data-testid="wizard-ocr-review-shell" className="relative">
                            <div className={isPendingOcrProcessing ? 'pointer-events-none opacity-60' : undefined}>
                                <OcrCorrectionModal
                                    isOpen={true}
                                    isActive={activeTab === 'ocr'}
                                    embedded={true}
                                    hideFooterActions={true}
                                    autoAcceptOnSaveAndApply={wizardCloseOnOcrApply}
                                    onEmbeddedFooterActionsChange={setEmbeddedOcrFooterActions}
                                    onClose={handleReturnToResultTab}
                                    onRequestRerunOcr={() => {
                                        void handleWizardRerunOcr();
                                    }}
                                    rerunOcrDisabled={isRerunningOcr || isPendingOcrProcessing}
                                    isRerunningOcr={isRerunningOcr}
                                    onAddAlias={addPilotAlias}
                                    onAcceptAll={() => {
                                        const latestPending = useAppStore.getState().pendingMatchData;
                                        const matchId = latestPending?.id;
                                        if (matchId) {
                                            const existingMatch = useAppStore.getState().matches.find(m => m.id === matchId);
                                            if (existingMatch) {
                                                updateMatch({
                                                    ...existingMatch,
                                                    ...latestPending,
                                                    ocrReviewedAt: Date.now(),
                                                    ocrState: 'saved',
                                                } as Match);
                                            }
                                        }
                                        if (wizardCloseOnOcrApply) {
                                            handleCloseAfterEmbeddedOcrSave();
                                            return;
                                        }
                                        React.startTransition(() => setActiveTab('result'));
                                    }}
                                    screenshots={deferredWizardReviewScreenshots}
                                />
                            </div>
                            {isPendingOcrProcessing && (
                                <div
                                    data-testid="wizard-ocr-processing-overlay"
                                    className="absolute inset-0 z-10 flex items-center justify-center bg-md-sys-surface/78"
                                >
                                    <div className="pointer-events-none rounded-2xl border border-md-sys-outline/12 bg-md-sys-surface-container-high px-5 py-4 text-center shadow-lg">
                                        <div className="flex items-center justify-center gap-2 text-label-sm font-bold uppercase tracking-wide text-md-sys-primary">
                                            <RefreshCw size={14} className="animate-spin" />
                                            Processing OCR
                                        </div>
                                        <div className="mt-2 text-label-sm text-md-sys-on-surface/65">
                                            OCR is still running in the background. Review fields will unlock automatically when processing completes.
                                        </div>
                                        <div className="wg-indeterminate-bar mt-3" aria-hidden="true" />
                                    </div>
                                </div>
                            )}
                        </div>
                </div>

                <div className="sticky bottom-0 z-10 border-t border-md-sys-outline/5 bg-md-sys-surface px-4 py-4 shadow-[0_-10px_24px_rgba(15,23,42,0.14)] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={() => {
                            void handleAbortSubmission();
                        }}
                        disabled={activeTab === 'result' && submitting}
                        className="text-label-sm font-bold uppercase tracking-widest text-md-sys-on-surface/70 hover:text-md-sys-on-surface transition-colors inline-flex items-center gap-2 justify-center sm:justify-start"
                    >
                        <CheckCircle2 size={14} />
                        {submitting && activeTab === 'result' && isTelemetryDraftPending ? 'Discarding...' : abortButtonLabel}
                    </button>
                    {activeTab === 'result' && (
                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[24rem] sm:items-end">
                            {submitResultsHint ? (
                                <div
                                    data-testid="wizard-submit-footer-hint"
                                    className="text-label-sm font-semibold text-md-sys-on-surface/78 text-center sm:text-right"
                                >
                                    {submitResultsHint}
                                </div>
                            ) : null}
                            {!submitResultsHint && hasPendingOcrReview ? (
                                <div
                                    data-testid="wizard-auto-apply-ocr-hint"
                                    className="text-label-sm font-semibold text-md-sys-primary text-center sm:text-right"
                                >
                                    OCR review will be auto-applied when you save.
                                </div>
                            ) : null}
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!canFinalizeResult) return;
                                        commitWizardState();
                                        saveResultDraft(submissionSubType);
                                    }}
                                    disabled={submitting || !canFinalizeResult}
                                    className={`w-full sm:w-auto min-w-[12rem] px-5 py-3 rounded-2xl font-bold uppercase tracking-wide-30 text-label-sm transition-all border border-md-sys-outline/18 ${submitting || !canFinalizeResult ? 'opacity-disabled grayscale' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/82 hover:bg-md-sys-surface-container-highest hover:text-md-sys-on-surface'}`}
                                >
                                    Save Results Only
                                </button>
                                <button
                                    onClick={() => {
                                        handleFinalizeWizardSave();
                                    }}
                                    disabled={submitting || !canFinalizeResult}
                                    data-testid="wizard-submit-results-button"
                                    className={`w-full sm:w-auto min-w-[12rem] px-5 py-3 rounded-2xl font-bold uppercase tracking-wide-30 text-label-sm transition-all shadow-xl active:scale-95 ${submitting ? 'opacity-disabled grayscale' : (!canFinalizeResult ? 'opacity-disabled grayscale' : (selectedResult === 'Draw' ? 'bg-info text-ink-strong' : (selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong' : 'bg-md-sys-primary text-md-sys-onPrimary')))}`}
                                >
                                    {submitting ? 'Synchronizing...' : 'Submit Results'}
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab === 'ocr' && embeddedOcrFooterActions && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <button
                                type="button"
                                onClick={embeddedOcrFooterActions.discard}
                                disabled={disableEmbeddedOcrFooterActions}
                                className="w-full sm:w-auto px-5 py-3 rounded-2xl font-bold uppercase tracking-wide-30 text-label-sm border border-danger/22 bg-danger-soft text-danger transition-colors hover:bg-danger-soft-strong disabled:opacity-disabled disabled:cursor-not-allowed disabled:hover:bg-danger-soft"
                                title={embeddedOcrFooterBusyTitle || 'Discard all OCR review edits and return to results'}
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={embeddedOcrFooterActions.saveAndClose}
                                disabled={disableEmbeddedOcrFooterActions}
                                className="w-full sm:w-auto px-5 py-3 rounded-2xl font-bold uppercase tracking-wide-30 text-label-sm bg-md-sys-primary text-md-sys-onPrimary shadow-xl active:scale-95 transition-all disabled:opacity-disabled disabled:cursor-not-allowed disabled:active:scale-100"
                                title={embeddedOcrFooterBusyTitle || (wizardCloseOnOcrApply ? 'Save reviewed OCR corrections and close the wizard' : 'Save reviewed OCR corrections and apply them')}
                            >
                                {wizardCloseOnOcrApply ? 'Save and Close' : 'Save and Apply'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

import React, { useId, useMemo, useState } from 'react';
import { X, Check, User, Ship, Search, Info } from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
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
import { buildCooccurrenceMatrix, getTeammateSuggestions, type TeamSuggestion } from '../utils/patternRecognition';
import { ConfidenceMeter } from './ConfidenceMeter';
import { BatchActionConfirmDialog } from './BatchActionConfirmDialog';
import Logger from '../utils/logger';

interface OcrCorrectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAcceptAll: () => void;
}

interface DetectedPlayer {
    name: string;
    teamColor: string;
    teamName?: string;
    shipType?: string;
    confidence?: number;
}

type PendingBatchAction = 'accept' | 'ignore' | null;

export const OcrCorrectionModal: React.FC<OcrCorrectionModalProps> = ({ isOpen, onClose, onAcceptAll }) => {
    const { sessionTeams, sessionShipTypes, pilotRegistry, addToRegistry, matches } = useGameData();
    const {
        setPlayerName,
        recordOcrCorrection,
        ocrCorrections,
        ocrAliasModel,
        recordCalibrationSample,
        ocrMode,
        ocrBatchAcceptThreshold,
        setOcrBatchAcceptThreshold,
    } = useAppStore();

    const [corrections, setCorrections] = useState<Record<string, string>>({});
    const [ignored, setIgnored] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});
    const [activeInputPlayer, setActiveInputPlayer] = useState<string | null>(null);
    const [pendingBatchAction, setPendingBatchAction] = useState<PendingBatchAction>(null);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen && pendingBatchAction === null);
    const { announce } = useAriaLiveRegion(isOpen);

    // Collect all detected players from session
    const detectedPlayers = useMemo(() => {
        const players: DetectedPlayer[] = [];
        if (!sessionTeams) return players;

        Object.entries(sessionTeams).forEach(([teamKey, teamPlayers]) => {
            const [color, teamName] = teamKey.includes(':') ? teamKey.split(':').map(s => s.trim()) : [teamKey, undefined];
            (teamPlayers as string[]).forEach(name => {
                // Check if this name has a prior correction
                const priorCorrection = ocrCorrections?.[name];
                players.push({
                    name,
                    teamColor: color,
                    teamName,
                    shipType: sessionShipTypes?.[name],
                    confidence: priorCorrection ? 95 : 70 // Simulated - in real impl, store confidence from OCR
                });
            });
        });
        return players;
    }, [sessionTeams, sessionShipTypes, ocrCorrections]);

    // Filter pilot registry for autocomplete
    const getFilteredRegistry = (playerName: string) => {
        const query = searchQuery[playerName]?.toLowerCase() || '';
        if (!query) return pilotRegistry.slice(0, 10);
        return pilotRegistry.filter(p => p.toLowerCase().includes(query)).slice(0, 10);
    };

    const handleCorrection = (ocrName: string, correctedName: string) => {
        setCorrections(prev => ({ ...prev, [ocrName]: correctedName }));
        setSearchQuery(prev => ({ ...prev, [ocrName]: correctedName }));
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
        const confidenceByName = new Map(detectedPlayers.map(player => [player.name, Number(player.confidence || 0)]));
        const calibrationMode = normalizeOcrCalibrationMode(ocrMode);

        Object.entries(corrections).forEach(([ocrName, correctedName]) => {
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

    const suggestionTarget = useMemo(() => (
        detectedPlayers.find((player) => (
            !ignored.has(player.name)
            && !corrections[player.name]
            && !pilotRegistry.includes(player.name)
        )) || null
    ), [detectedPlayers, ignored, corrections, pilotRegistry]);

    const cooccurrenceMatrix = useMemo(
        () => buildCooccurrenceMatrix(matches || [], { maxMatches: 1000 }),
        [matches]
    );

    const teammateSuggestions = useMemo<TeamSuggestion[]>(() => {
        const detectedNames = detectedPlayers
            .filter((player) => !ignored.has(player.name))
            .map((player) => corrections[player.name] || player.name);
        return getTeammateSuggestions(detectedNames, cooccurrenceMatrix, {
            maxSuggestions: 5,
            minLikelihood: 25,
        });
    }, [detectedPlayers, ignored, corrections, cooccurrenceMatrix]);

    const handleApplySuggestion = (suggestedName: string) => {
        if (!suggestionTarget) return;
        handleCorrection(suggestionTarget.name, suggestedName);
        Logger.info('OcrPattern', `Applied teammate suggestion "${suggestedName}" to "${suggestionTarget.name}"`);
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

    const shortcutsEnabled = isOpen && pendingBatchAction === null && activeInputPlayer === null;
    useKeyboardShortcuts([
        { key: 'Enter', ctrl: true, handler: () => handleSubmitCorrections() },
        { key: 'Escape', handler: () => onClose() },
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
            className="fixed inset-0 md3-dialog-scrim z-top-second flex items-start justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={onClose}
        >
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                className="md3-dialog rounded-modal w-full max-w-2xl max-h-85vh my-2 flex flex-col animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <User size={20} className="text-md-sys-primary" />
                        <h2 id={dialogTitleId} className="text-title font-bold">Review and Correct Detected Players</h2>
                        <span className="md3-chip text-label-sm font-mono">
                            {detectedPlayers.length} found
                        </span>
                    </div>
                    <button onClick={onClose} className="md3-icon-btn" title="Close" aria-label="Close OCR correction dialog">
                        <X size={18} />
                    </button>
                </div>

                <div className="md3-banner md3-banner--info">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-body font-medium">How this helps</p>
                        <p id={dialogDescriptionId} className="text-label-sm opacity-60 mt-0.5">
                            Pick the real player name for each OCR guess, then press <span className="font-semibold">Apply and Learn</span>.
                        </p>
                        <p className="text-label-sm opacity-60 mt-0.5">
                            These links are remembered, so OCR gets better in future matches.
                        </p>
                    </div>
                </div>

                <div className="md3-card p-3 mb-3 border border-md-sys-outline/20">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-label-sm font-bold uppercase opacity-60">Batch Operations</span>
                        <span className="text-label-sm font-mono">{ocrBatchAcceptThreshold}% threshold</span>
                    </div>
                    <input
                        type="range"
                        min={OCR_BATCH_THRESHOLD_MIN}
                        max={OCR_BATCH_THRESHOLD_MAX}
                        step={OCR_BATCH_THRESHOLD_STEP}
                        value={ocrBatchAcceptThreshold}
                        onChange={(event) => setOcrBatchAcceptThreshold(Number(event.target.value))}
                        className="w-full mt-2 accent-md-sys-primary"
                        aria-label="Batch confidence threshold"
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
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

                {teammateSuggestions.length > 0 && (
                    <div className="md3-card p-3 mb-3 bg-info-soft border border-info-soft">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-label-sm font-bold uppercase text-info">Likely Teammates</span>
                            <span className="text-label-sm font-mono text-info">{teammateSuggestions.length}</span>
                        </div>
                        <p className="text-label-sm opacity-60 mt-1">
                            Suggestions are based on teammate co-occurrence in your recent matches.
                        </p>
                        <div className="mt-2 space-y-2">
                            {teammateSuggestions.map((suggestion) => (
                                <button
                                    key={suggestion.player}
                                    type="button"
                                    onClick={() => handleApplySuggestion(suggestion.player)}
                                    disabled={!suggestionTarget}
                                    className="w-full text-left rounded-control border border-info-soft bg-md-sys-surface/70 px-2 py-1.5 disabled:opacity-disabled hover:bg-md-sys-surface"
                                    title={suggestion.reason}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold">{suggestion.player}</span>
                                        <span className="text-label-sm font-mono text-info">{suggestion.likelihood}%</span>
                                    </div>
                                    <div className="text-label-xs opacity-60 mt-0.5">
                                        {suggestion.reason} - {suggestion.encounters} encounters - {suggestion.winRate}% win rate
                                    </div>
                                </button>
                            ))}
                        </div>
                        <p className="text-label-xs opacity-60 mt-2">
                            {suggestionTarget
                                ? `Click a suggestion to fill unresolved OCR name "${suggestionTarget.name}".`
                                : 'All unresolved names are already handled. Suggestions are view-only right now.'}
                        </p>
                    </div>
                )}

                {/* Player List */}
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar md3-dialog-content">
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
                            const learningCount = Math.max(1, Number(priorCorrection?.count || 1));
                            const learningTooltip = getLearningMetadata(ocrAliasModel, player.name)
                                || `Learned from ${learningCount} correction${learningCount === 1 ? '' : 's'}`;

                            return (
                                <div
                                    key={`${player.name}-${idx}`}
                                    className={`md3-card p-3 rounded-card border transition-all ${
                                        isIgnored
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
                                                    <div className="flex items-center gap-1 text-label-sm opacity-60 mt-0.5">
                                                        <Ship size={10} />
                                                        {player.shipType}
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
                                            <div className="flex items-center gap-2">
                                                {/* Correction Dropdown */}
                                                <div className="relative">
                                                    <div className="md3-textfield md3-textfield--outlined flex items-center gap-1 px-2 py-1">
                                                        <Search size={12} className="opacity-60" />
                                                        <input
                                                            type="text"
                                                            placeholder="Search roster or type name..."
                                                            value={
                                                                Object.prototype.hasOwnProperty.call(searchQuery, player.name)
                                                                    ? (searchQuery[player.name] || '')
                                                                    : (corrections[player.name] || '')
                                                            }
                                                            onFocus={() => {
                                                                setActiveInputPlayer(player.name);
                                                                if (!Object.prototype.hasOwnProperty.call(searchQuery, player.name) && corrections[player.name]) {
                                                                    setSearchQuery(prev => ({ ...prev, [player.name]: corrections[player.name] }));
                                                                }
                                                            }}
                                                            onBlur={() => {
                                                                setActiveInputPlayer((current) => (current === player.name ? null : current));
                                                            }}
                                                            onChange={e => setSearchQuery(prev => ({ ...prev, [player.name]: e.target.value }))}
                                                            onKeyDown={(event) => event.stopPropagation()}
                                                            className="bg-transparent text-body w-40 outline-none caret-current"
                                                        />
                                                    </div>

                                                    {/* Autocomplete Dropdown */}
                                                    {activeInputPlayer === player.name && searchQuery[player.name] && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 md3-card rounded-lg shadow-xl z-10 max-h-32 overflow-y-auto">
                                                            {getFilteredRegistry(player.name).map(p => (
                                                                <button
                                                                    key={p}
                                                                    onMouseDown={(event) => event.preventDefault()}
                                                                    onClick={() => handleCorrection(player.name, p)}
                                                                    className="w-full text-left px-3 py-1.5 text-body hover:bg-md-sys-on-surface/10 truncate"
                                                                >
                                                                    {p}
                                                                </button>
                                                            ))}
                                                            {getFilteredRegistry(player.name).length === 0 && (
                                                                <div className="px-3 py-2 text-label-sm opacity-60">No matching pilots found. Use "+ New" to add this name.</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

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

                {/* Footer */}
                <div className="md3-dialog-actions w-full justify-between">
                    <button
                        onClick={onClose}
                        className="md3-btn-text"
                    >
                        Close for Now
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
        </>
    );
};




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
import { Match, SHIPS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT } from '../types';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useMatchSubmission } from '../hooks/useMatchSubmission';
import { OcrCorrectionModal } from './OcrCorrectionModal';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';

type WizardTab = 'result' | 'ocr';

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
        timeMin, setTimeMin,
        timeSec, setTimeSec,
        damageTaken, setDamageTaken,
        kills, setKills,
        poiEasy, setPoiEasy,
        poiMedium, setPoiMedium,
        poiEpic, setPoiEpic,
    } = useGameData();

    const { showWizard, setShowWizard, isOverlayMode, activeMode, activeUser, setToast, requestSmartCapture } = useUIState();
    const { processFinalSubmission, submitting } = useMatchSubmission();
    const [selectedWinType, setSelectedWinType] = useState<'Combat' | 'Artifact' | 'Objective'>('Combat');
    const [requestedOcrReviewMatchId, setRequestedOcrReviewMatchId] = useState<number | null | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<WizardTab>('result');
    const [loadoutExpanded, setLoadoutExpanded] = useState(false);

    React.useEffect(() => {
        if (showWizard && isOverlayMode) {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        }
    }, [showWizard, isOverlayMode]);

    React.useEffect(() => {
        if (!showWizard) {
            setActiveTab('result');
            setLoadoutExpanded(false);
        }
    }, [showWizard]);

    React.useEffect(() => {
        if (activeMode === 'Artifact Brawl') return;
        if (selectedWinType === 'Artifact') setSelectedWinType('Combat');
    }, [activeMode, selectedWinType]);

    React.useEffect(() => {
        if (!showWizard) return;
        if (showWizard === 'Win') {
            if (pendingPlacement !== 1) setPendingPlacement(1);
            return;
        }
        if (showWizard === 'Loss') {
            if (!pendingPlacement || pendingPlacement < 2 || pendingPlacement > 5) {
                setPendingPlacement(2);
            }
            return;
        }
        if (pendingPlacement != null) setPendingPlacement(null);
    }, [pendingPlacement, setPendingPlacement, showWizard]);

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
            || (Number.isInteger(pendingMatchId) && pendingMatchId > 0 && pendingMatchId === requestedOcrReviewMatchId)
        ) {
            setActiveTab('ocr');
            setRequestedOcrReviewMatchId(undefined);
        }
    }, [pendingMatchData, requestedOcrReviewMatchId, showWizard]);

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

    const defeatedTeams = React.useMemo(() => {
        const fromOpponentTeams = Array.isArray(pendingMatchData?.opponentTeams)
            ? pendingMatchData.opponentTeams.map((team) => ({
                teamName: String(team.teamName || '').trim() || 'Unknown Team',
                shipType: String(team.shipType || '').trim(),
                players: Array.isArray(team.players) ? team.players.map((p) => String(p || '').trim()).filter(Boolean) : [],
                color: String(team.color || '').trim(),
            }))
            : [];
        if (fromOpponentTeams.length > 0) return fromOpponentTeams;
        return Object.entries(sessionTeams || {}).map(([teamName, players]) => ({
            teamName,
            shipType: String(sessionShipTypes?.[teamName] || '').trim(),
            players: (players || []).map((p) => String(p || '').trim()).filter(Boolean),
            color: teamName,
        }));
    }, [pendingMatchData?.opponentTeams, sessionShipTypes, sessionTeams]);

    if (!showWizard || !pendingMatchData) return null;

    const isDefeat = showWizard === 'Loss';
    const title = isDefeat ? 'Defeat' : showWizard;

    const cardClass = `mg-surface rounded-2xl border border-md-sys-outline/10 shadow-sm ${isOverlayMode ? 'p-3' : 'p-5'}`;
    const labelClass = 'text-label-sm font-bold uppercase tracking-widest opacity-60 mb-1.5 block';
    const inputBaseClass = 'mg-surface-primary bg-md-sys-primary/5 font-bold outline-none text-center rounded-xl border border-md-sys-primary/10 transition-all focus:border-md-sys-primary/40 focus:bg-md-sys-primary/10';

    const pendingLoadout = pendingMatchData.loadout || {
        hero: null,
        ship: null,
        weapons: [],
        equipment: [],
        characterWeapons: [],
        characterEquipment: [],
    };
    const hasTelemetryLoadout = (pendingLoadout.characterWeapons?.length || 0) > 0 || (pendingLoadout.characterEquipment?.length || 0) > 0;
    const displayedCharacterWeapons = (pendingLoadout.characterWeapons || []).slice(0, 2);
    const displayedCharacterEquipment = (pendingLoadout.characterEquipment || []).slice(0, 2);
    const loadoutSummary = [
        displayedCharacterWeapons.length > 0 ? `W: ${displayedCharacterWeapons.join(', ')}` : 'W: --',
        displayedCharacterEquipment.length > 0 ? `E: ${displayedCharacterEquipment.join(', ')}` : 'E: --',
    ].join(' | ');
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
        const existing = Array.isArray(pendingLoadout[key]) ? [...pendingLoadout[key]] : [];
        const idx = existing.findIndex((entry) => entry.toLowerCase() === item.toLowerCase());
        let next = existing;
        if (idx >= 0) {
            next = existing.filter((entry) => entry.toLowerCase() !== item.toLowerCase());
        } else if (existing.length < 2) {
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

    const applyEliminatorTeam = (teamName: string, shipType?: string, players?: string[]) => {
        const preferredPlayer = Array.isArray(players) && players.length > 0 ? players[0] : '';
        if (preferredPlayer) setPendingKilledBy(preferredPlayer);
        else setPendingKilledBy(teamName);
        if (shipType) setPendingKilledByShip(shipType);
        useAppStore.getState().setPendingMatchData({ ...pendingMatchData, eliminatedByTeam: teamName });
    };

    const handleWizardSmartCapture = () => {
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
            }
        }));
        setToast({ message: 'Smart Capture requested from wizard.', type: 'info' });
    };

    return (
        <div className="fixed inset-0 md3-dialog-scrim z-top flex items-start justify-center p-4 overflow-y-auto mg-blur animate-fade-in" onClick={() => setShowWizard(null)}>
            <div
                className={`mg-surface overflow-hidden rounded-2_5rem w-full my-2 shadow-2xl flex flex-col animate-scale-in border border-md-sys-outline/20 ${isOverlayMode ? 'max-w-2xl max-h-90vh' : 'max-w-3xl max-h-95vh'}`}
                onClick={e => e.stopPropagation()}
            >
                <div className={`${isOverlayMode ? 'py-3 px-5 text-label-sm' : 'py-5 px-8 text-xl'} font-bold uppercase tracking-wide-20 mg-surface-high border-b border-md-sys-outline/10 text-md-sys-on-surface flex items-center justify-center gap-3 relative`}>
                    <div className={`w-2 h-2 rounded-full ${isDefeat ? 'bg-md-sys-error' : 'bg-success'} animate-pulse`} />
                    {title}
                    <button onClick={() => setShowWizard(null)} className="absolute right-4 md3-icon-btn opacity-40 hover:opacity-100 hover:bg-md-sys-error/10 hover:text-md-sys-error transition-all" aria-label="Close match wizard">
                        <X size={isOverlayMode ? 18 : 24} />
                    </button>
                </div>

                <div className="px-4 pt-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('result')}
                            className={`rounded-xl py-2 text-label-sm font-bold uppercase tracking-widest ${activeTab === 'result' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'mg-surface-high opacity-70 hover:opacity-100'}`}
                        >
                            Result
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('ocr')}
                            className={`rounded-xl py-2 text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${activeTab === 'ocr' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'mg-surface-high opacity-70 hover:opacity-100'}`}
                        >
                            <Users size={14} />
                            OCR Review {detectedPlayerCount > 0 ? `(${detectedPlayerCount})` : ''}
                        </button>
                    </div>
                </div>

                {activeTab === 'result' ? (
                    <div className={`overflow-y-auto flex-1 flex flex-col ${isOverlayMode ? 'gap-3 px-4 py-4' : 'gap-5 px-8 py-6'} custom-scrollbar`}>
                        <div className={cardClass}>
                            <span className={labelClass}>Outcome</span>
                            <div className="grid grid-cols-3 gap-2">
                                {(['Win', 'Loss', 'Draw'] as const).map((result) => (
                                    <button
                                        key={result}
                                        type="button"
                                        onClick={() => {
                                            setShowWizard(result);
                                            if (result === 'Win') {
                                                setPendingPlacement(1);
                                            } else if (result !== 'Loss') {
                                                setPendingPlacement(null);
                                            } else if (!pendingPlacement || pendingPlacement < 2 || pendingPlacement > 5) {
                                                setPendingPlacement(2);
                                            }
                                        }}
                                        className={`rounded-xl py-2 text-label-sm font-bold uppercase tracking-widest transition-all ${showWizard === result
                                            ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg'
                                            : 'mg-surface-high opacity-70 hover:opacity-100'
                                            }`}
                                    >
                                        {result}
                                    </button>
                                ))}
                            </div>
                            {showWizard === 'Loss' && (
                                <div className="mt-2">
                                    <span className="text-label-xs font-bold uppercase opacity-50 block mb-1">Placement</span>
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

                        <div className="flex gap-2 w-full">
                            {activeMode === 'Artifact Brawl' ? (
                                <>
                                    <button onClick={() => setSelectedWinType('Combat')} className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}>
                                        <Sword size={16} /> {showWizard === 'Loss' ? 'Combat Defeat' : 'Combat Win'}
                                    </button>
                                    <button onClick={() => setSelectedWinType('Artifact')} className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}>
                                        <Gem size={16} /> {showWizard === 'Loss' ? 'Artifact Defeat' : 'Artifact Win'}
                                    </button>
                                </>
                            ) : activeMode === 'Fleet Battle' ? (
                                <>
                                    <button onClick={() => setSelectedWinType('Combat')} className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}>
                                        <Sword size={16} /> Combat
                                    </button>
                                    <button onClick={() => setSelectedWinType('Objective')} className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Objective' ? 'bg-info text-ink-strong shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}>
                                        <Target size={16} /> Objective
                                    </button>
                                </>
                            ) : null}
                        </div>

                        <div className={`grid grid-cols-3 ${isOverlayMode ? 'gap-2' : 'gap-4'}`}>
                            <div className={`${cardClass} flex flex-col items-center bg-md-sys-primary/5`}>
                                <Clock size={16} className="text-md-sys-primary/60 mb-1" />
                                <span className={labelClass}>Time</span>
                                <div className="flex items-center gap-1">
                                    <input type="number" placeholder="00" value={timeMin} onChange={(e) => setTimeMin(e.target.value)} className={`w-8 ${inputBaseClass} ${isOverlayMode ? 'text-base py-1' : 'text-xl py-2'}`} />
                                    <span className="font-bold opacity-40">:</span>
                                    <input type="number" placeholder="00" value={timeSec} onChange={(e) => setTimeSec(e.target.value)} className={`w-8 ${inputBaseClass} ${isOverlayMode ? 'text-base py-1' : 'text-xl py-2'}`} />
                                </div>
                            </div>
                            <div className={`${cardClass} flex flex-col items-center bg-danger/5`}>
                                <HeartCrack size={16} className="text-danger/60 mb-1" />
                                <span className={labelClass}>Damage</span>
                                <input type="text" placeholder="0" value={damageTaken} onChange={(e) => setDamageTaken(e.target.value.replace(/[^0-9]/g, ''))} className={`w-12 ${inputBaseClass} ${isOverlayMode ? 'text-base py-1' : 'text-xl py-2'} border-danger/10 focus:border-danger/30`} />
                            </div>
                            <div className={`${cardClass} flex flex-col items-center bg-success/5`}>
                                <Target size={16} className="text-success/60 mb-1" />
                                <span className={labelClass}>Elims</span>
                                <span className={`${isOverlayMode ? 'text-xl' : 'text-2xl'} font-black text-md-sys-on-surface`}>
                                    {Object.values(kills || {}).reduce((a, b) => a + (Number(b) || 0), 0)}
                                </span>
                            </div>
                        </div>
                        {telemetryDurationSeconds != null && (
                            <div className={cardClass}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-label-sm font-bold uppercase tracking-widest opacity-60">
                                        Telemetry Duration: {Math.floor(telemetryDurationSeconds / 60).toString().padStart(2, '0')}:{String(telemetryDurationSeconds % 60).padStart(2, '0')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const mm = Math.floor(telemetryDurationSeconds / 60);
                                            const ss = telemetryDurationSeconds % 60;
                                            setTimeMin(String(mm).padStart(2, '0'));
                                            setTimeSec(String(ss).padStart(2, '0'));
                                            setToast({ message: 'Duration set from telemetry.', type: 'success' });
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
                                <span className={labelClass + ' mb-0'}>Tactical Breakdown</span>
                                <ChevronDown size={14} className="opacity-40" />
                            </div>
                            <div className={`grid ${isOverlayMode ? 'grid-cols-3' : 'grid-cols-4'} gap-2`}>
                                {[...SHIPS, 'AI Legion'].map(ship => {
                                    const shortName = ship.split('(')[0].trim();
                                    const currentVal = kills?.[shortName] || 0;
                                    return (
                                        <div key={ship} className="flex flex-col items-center mg-surface-high rounded-xl p-2 border border-md-sys-outline/5 hover:border-md-sys-primary/20 transition-all group">
                                            <span className="text-label-xs font-bold opacity-40 uppercase mb-2 truncate w-full text-center">{shortName}</span>
                                            <div className="flex items-center w-full justify-between">
                                                <button onClick={() => setKills({ ...kills, [shortName]: Math.max(0, currentVal - 1) })} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-md-sys-error/10 text-md-sys-on-surface/60 hover:text-md-sys-error transition-all">-</button>
                                                <span className="font-mono font-bold text-body">{currentVal}</span>
                                                <button onClick={() => setKills({ ...kills, [shortName]: currentVal + 1 })} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-success/10 text-md-sys-on-surface/60 hover:text-success transition-all">+</button>
                                            </div>
                                        </div>
                                    );
                                })}
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
                                    {hasTelemetryLoadout && <span className="w-2 h-2 rounded-full bg-success" title="Telemetry-populated loadout" />}
                                </span>
                                <span className="text-label-sm opacity-60 truncate">{loadoutSummary}</span>
                            </button>
                            {(loadoutExpanded || !hasTelemetryLoadout) && (
                                <div className="mt-3 space-y-3">
                                    <div>
                                        <span className="text-label-xs font-bold uppercase opacity-50">Character Weapons (max 2)</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {CHARACTER_WEAPONS.map((weapon) => {
                                                const selected = displayedCharacterWeapons.some((entry) => entry.toLowerCase() === weapon.toLowerCase());
                                                const disabled = !selected && displayedCharacterWeapons.length >= 2;
                                                return (
                                                    <button
                                                        key={weapon}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => updatePendingLoadout('characterWeapons', weapon)}
                                                        className={`px-2 py-1 rounded-md text-label-sm font-semibold transition-all ${selected ? 'bg-info-soft text-info ring-1 ring-info/40' : 'mg-surface-high opacity-70 hover:opacity-100'} disabled:opacity-40`}
                                                    >
                                                        {weapon}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-label-xs font-bold uppercase opacity-50">Character Equipment (max 2)</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {CHARACTER_EQUIPMENT.map((equipment) => {
                                                const selected = displayedCharacterEquipment.some((entry) => entry.toLowerCase() === equipment.toLowerCase());
                                                const disabled = !selected && displayedCharacterEquipment.length >= 2;
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
                                            <span className="text-label-xs font-bold opacity-40 mb-1">{item.label}</span>
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
                                        {defeatedTeams.map((team, index) => (
                                            <button
                                                key={`${team.teamName}-${index}`}
                                                type="button"
                                                onClick={() => applyEliminatorTeam(team.teamName, team.shipType, team.players)}
                                                className={`px-2.5 py-1 rounded-xl text-label-sm font-bold uppercase border transition-all ${pendingMatchData?.eliminatedByTeam === team.teamName ? 'border-md-sys-primary bg-md-sys-primary/10 shadow-lg' : 'border-md-sys-outline/10 mg-surface-high opacity-75 hover:opacity-100'}`}
                                            >
                                                {team.color ? `${team.color}: ` : ''}{team.teamName}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <input type="text" className={`w-full ${inputBaseClass} py-2 text-body placeholder:opacity-40`} placeholder="Killer player/team..." value={pendingKilledBy || ''} onChange={e => setPendingKilledBy(e.target.value)} />
                                    <input type="text" className={`w-full ${inputBaseClass} py-2 text-body placeholder:opacity-40`} placeholder="Killer ship..." value={pendingKilledByShip || ''} onChange={e => setPendingKilledByShip(e.target.value)} />
                                </div>
                            </div>
                        )}

                        <button onClick={handleWizardSmartCapture} className="w-full py-3 rounded-2xl mg-surface-high border border-md-sys-outline/15 text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:border-md-sys-primary/30 hover:bg-md-sys-primary/5 transition-all">
                            <Scan size={14} /> Smart Capture
                        </button>

                        <button onClick={() => processFinalSubmission(selectedWinType)} disabled={submitting} className={`w-full ${isOverlayMode ? 'py-4' : 'py-5'} rounded-3xl font-bold uppercase tracking-wide-30 text-label-sm transition-all shadow-xl active:scale-95 ${submitting ? 'opacity-disabled grayscale' : (selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong' : selectedWinType === 'Objective' ? 'bg-info text-ink-strong' : 'bg-md-sys-primary text-md-sys-onPrimary')}`}>
                            {submitting ? 'Synchronizing...' : `Finalize ${selectedWinType}`}
                        </button>
                    </div>
                ) : (
                    <div className={`flex-1 min-h-0 flex flex-col ${isOverlayMode ? 'px-4 py-4 gap-3' : 'px-8 py-6 gap-4'}`}>
                        <div className="flex items-center justify-between rounded-xl border border-md-sys-outline/10 mg-surface-high px-3 py-2">
                            <span className="text-label-sm font-bold uppercase tracking-widest opacity-60">OCR Review Tools</span>
                            <button
                                type="button"
                                onClick={handleWizardSmartCapture}
                                className="px-2.5 py-1 rounded-lg text-label-sm font-bold md3-btn-tonal inline-flex items-center gap-1.5"
                                title="Capture and process a fresh screenshot for OCR review"
                            >
                                <RefreshCw size={12} />
                                Re-run OCR
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        <OcrCorrectionModal
                            isOpen={true}
                            embedded={true}
                            onClose={() => setActiveTab('result')}
                            onAcceptAll={() => setActiveTab('result')}
                            screenshots={wizardReviewScreenshots}
                        />
                        </div>
                    </div>
                )}

                <div className="p-4 flex justify-center border-t border-md-sys-outline/5">
                    <button onClick={() => setShowWizard(null)} className="text-label-sm font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity flex items-center gap-2">
                        <CheckCircle2 size={14} />
                        {activeTab === 'result' ? 'Abort Submission' : 'Close Review'}
                    </button>
                </div>
            </div>
        </div>
    );
};

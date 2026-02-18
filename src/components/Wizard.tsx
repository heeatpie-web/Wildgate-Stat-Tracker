import React, { useState } from 'react';
import confetti from 'canvas-confetti';
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
    ShieldAlert
} from 'lucide-react';
import { Match, SHIPS } from '../types';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useMatchSubmission } from '../hooks/useMatchSubmission';
import { OcrCorrectionModal } from './OcrCorrectionModal';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';
import { EQUIPMENT_DB } from '../utils/equipmentDb';

export const Wizard: React.FC = () => {
    const {
        pendingMatchData,
        setPendingMatchData,
        pendingPlacement, setPendingPlacement,
        pendingArtifactType, setPendingArtifactType,
        pendingKilledBy, setPendingKilledBy,
        pendingKilledByShip, setPendingKilledByShip,
        selectedOpponents, setSelectedOpponents,
        sessionTeams, sessionShipTypes,
        currentLoadout,
        timeMin, setTimeMin,
        timeSec, setTimeSec,
        damageTaken, setDamageTaken,
        kills, setKills,
        poiEasy, setPoiEasy,
        poiMedium, setPoiMedium,
        poiEpic, setPoiEpic
    } = useGameData();

    const { showWizard, setShowWizard, isOverlayMode, activeMode, activeUser, setToast, requestSmartCapture } = useUIState();
    const { processFinalSubmission, submitting } = useMatchSubmission();

    React.useEffect(() => {
        if (showWizard && isOverlayMode) {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        }
    }, [showWizard, isOverlayMode]);

    const [selectedWinType, setSelectedWinType] = useState<'Combat' | 'Artifact' | 'Objective'>('Combat');
    const [showOcrReview, setShowOcrReview] = useState(false);
    const weaponOptions = React.useMemo(() => (
        Array.from(new Set(
            EQUIPMENT_DB
                .filter((item) => item.type === 'Weapon' || item.type === 'CharacterWeapon')
                .map((item) => item.name)
                .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b))
    ), []);
    const equipmentOptions = React.useMemo(() => (
        Array.from(new Set(
            EQUIPMENT_DB
                .filter((item) => item.type !== 'Weapon' && item.type !== 'CharacterWeapon')
                .map((item) => item.name)
                .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b))
    ), []);

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

    const loadoutDraft = React.useMemo(() => {
        const base = pendingMatchData?.loadout || currentLoadout || null;
        return {
            hero: base?.hero || null,
            ship: base?.ship || null,
            weapons: [base?.weapons?.[0] || '', base?.weapons?.[1] || ''],
            equipment: [base?.equipment?.[0] || '', base?.equipment?.[1] || ''],
        };
    }, [currentLoadout, pendingMatchData?.loadout]);

    if (!showWizard || !pendingMatchData) return null;

    const isDefeat = showWizard === 'Loss';
    const title = isDefeat ? 'Defeat' : showWizard;

    // UI Tokens
    const cardClass = `mg-surface rounded-2xl border border-md-sys-outline/10 shadow-sm ${isOverlayMode ? 'p-3' : 'p-5'}`;
    const labelClass = 'text-label-sm font-bold uppercase tracking-widest opacity-60 mb-1.5 block';
    const inputBaseClass = 'mg-surface-primary bg-md-sys-primary/5 font-bold outline-none text-center rounded-xl border border-md-sys-primary/10 transition-all focus:border-md-sys-primary/40 focus:bg-md-sys-primary/10';

    const showPlacement = isDefeat && activeMode === 'Artifact Brawl' && selectedWinType === 'Combat';
    const updateLoadoutSlot = (kind: 'weapons' | 'equipment', slotIndex: number, value: string) => {
        const nextWeapons = [...loadoutDraft.weapons];
        const nextEquipment = [...loadoutDraft.equipment];
        if (kind === 'weapons') {
            nextWeapons[slotIndex] = value;
        } else {
            nextEquipment[slotIndex] = value;
        }
        const compact = (slots: string[]) => slots
            .map((slot) => String(slot || '').trim())
            .filter(Boolean)
            .slice(0, 2);
        setPendingMatchData({
            ...pendingMatchData,
            loadout: {
                hero: loadoutDraft.hero,
                ship: loadoutDraft.ship,
                weapons: compact(nextWeapons),
                equipment: compact(nextEquipment),
            },
        });
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
                className={`mg-surface overflow-hidden rounded-2_5rem w-full my-2 shadow-2xl flex flex-col animate-scale-in border border-md-sys-outline/20 ${isOverlayMode ? 'max-w-360px max-h-90vh' : 'max-w-3xl max-h-95vh'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Unified Glass Header */}
                <div className={`${isOverlayMode ? 'py-3 px-5 text-label-sm' : 'py-5 px-8 text-xl'} font-bold uppercase tracking-wide-20 mg-surface-high border-b border-md-sys-outline/10 text-md-sys-on-surface flex items-center justify-center gap-3 relative`}>
                    <div className={`w-2 h-2 rounded-full ${isDefeat ? 'bg-md-sys-error' : 'bg-success'} animate-pulse`} />
                    {title}
                    <button onClick={() => setShowWizard(null)} className="absolute right-4 md3-icon-btn opacity-40 hover:opacity-100 hover:bg-md-sys-error/10 hover:text-md-sys-error transition-all" aria-label="Close match wizard">
                        <X size={isOverlayMode ? 18 : 24} />
                    </button>
                </div>

                <div className={`overflow-y-auto flex-1 flex flex-col ${isOverlayMode ? 'gap-3 px-4 py-4' : 'gap-5 px-8 py-6'} custom-scrollbar`}>

                    {/* Win Type Selector */}
                    <div className="flex gap-2 w-full">
                        {activeMode === 'Artifact Brawl' ? (
                            <>
                                <button
                                    onClick={() => setSelectedWinType('Combat')}
                                    className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}
                                >
                                    <Sword size={16} /> Combat
                                </button>
                                <button
                                    onClick={() => setSelectedWinType('Artifact')}
                                    className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}
                                >
                                    <Gem size={16} /> Artifact
                                </button>
                            </>
                        ) : activeMode === 'Fleet Battle' ? (
                            <>
                                <button
                                    onClick={() => setSelectedWinType('Combat')}
                                    className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}
                                >
                                    <Sword size={16} /> Combat
                                </button>
                                <button
                                    onClick={() => setSelectedWinType('Objective')}
                                    className={`flex-1 ${isOverlayMode ? 'py-3 text-label-sm' : 'py-4 text-label-sm'} font-bold uppercase tracking-widest flex items-center justify-center gap-2 rounded-2xl transition-all ${selectedWinType === 'Objective' ? 'bg-info text-ink-strong shadow-lg scale-102' : 'mg-surface-high opacity-60 hover:opacity-100'}`}
                                >
                                    <Target size={16} /> Objective
                                </button>
                            </>
                        ) : null}
                    </div>

                    {/* Stats HUD */}
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

                    {/* Ship Breakdown */}
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
                                            <button
                                                onClick={() => setKills({ ...kills, [shortName]: Math.max(0, currentVal - 1) })}
                                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-md-sys-error/10 text-md-sys-on-surface/60 hover:text-md-sys-error transition-all"
                                            >-</button>
                                            <span className="font-mono font-bold text-body">{currentVal}</span>
                                            <button
                                                onClick={() => setKills({ ...kills, [shortName]: currentVal + 1 })}
                                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-success/10 text-md-sys-on-surface/60 hover:text-success transition-all"
                                            >+</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className={cardClass}>
                        <div className="flex items-center justify-between mb-3">
                            <span className={labelClass + ' mb-0'}>Ship Loadout</span>
                            <ShieldAlert size={14} className="opacity-50" />
                        </div>
                        <p className="text-label-xs opacity-60 mb-3">
                            Choose loadout slots from known tools. These selections are saved into the final match loadout.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="text-label-xs font-bold uppercase tracking-widest opacity-60">Weapon 1</label>
                                <select
                                    value={loadoutDraft.weapons[0]}
                                    onChange={(e) => updateLoadoutSlot('weapons', 0, e.target.value)}
                                    className="w-full text-left px-3 py-2 rounded-xl mg-surface-high border border-md-sys-outline/10 text-label-sm font-semibold outline-none focus:border-md-sys-primary/40"
                                >
                                    <option value="">Select weapon</option>
                                    {weaponOptions.map((name) => (
                                        <option key={`w1-${name}`} value={name}>{name}</option>
                                    ))}
                                </select>
                                <label className="text-label-xs font-bold uppercase tracking-widest opacity-60">Weapon 2</label>
                                <select
                                    value={loadoutDraft.weapons[1]}
                                    onChange={(e) => updateLoadoutSlot('weapons', 1, e.target.value)}
                                    className="w-full text-left px-3 py-2 rounded-xl mg-surface-high border border-md-sys-outline/10 text-label-sm font-semibold outline-none focus:border-md-sys-primary/40"
                                >
                                    <option value="">Select weapon</option>
                                    {weaponOptions.map((name) => (
                                        <option key={`w2-${name}`} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-label-xs font-bold uppercase tracking-widest opacity-60">Equipment 1</label>
                                <select
                                    value={loadoutDraft.equipment[0]}
                                    onChange={(e) => updateLoadoutSlot('equipment', 0, e.target.value)}
                                    className="w-full text-left px-3 py-2 rounded-xl mg-surface-high border border-md-sys-outline/10 text-label-sm font-semibold outline-none focus:border-md-sys-primary/40"
                                >
                                    <option value="">Select equipment</option>
                                    {equipmentOptions.map((name) => (
                                        <option key={`e1-${name}`} value={name}>{name}</option>
                                    ))}
                                </select>
                                <label className="text-label-xs font-bold uppercase tracking-widest opacity-60">Equipment 2</label>
                                <select
                                    value={loadoutDraft.equipment[1]}
                                    onChange={(e) => updateLoadoutSlot('equipment', 1, e.target.value)}
                                    className="w-full text-left px-3 py-2 rounded-xl mg-surface-high border border-md-sys-outline/10 text-label-sm font-semibold outline-none focus:border-md-sys-primary/40"
                                >
                                    <option value="">Select equipment</option>
                                    {equipmentOptions.map((name) => (
                                        <option key={`e2-${name}`} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* POI Objectives */}
                    {activeMode === 'Artifact Brawl' && (
                        <div className={cardClass}>
                            <span className={labelClass}>Mission Objectives</span>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Easy', val: poiEasy, set: setPoiEasy, shadow: 'shadow-emerald-500/20', border: 'border-success-soft' },
                                    { label: 'Med', val: poiMedium, set: setPoiMedium, shadow: 'shadow-amber-500/20', border: 'border-warning-soft' },
                                    { label: 'Epic', val: poiEpic, set: setPoiEpic, shadow: 'shadow-purple-500/20', border: 'border-accent-soft' }
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        className={`relative ${isOverlayMode ? 'py-2' : 'py-3'} rounded-2xl mg-surface-high border ${item.border} flex flex-col items-center group cursor-pointer active:scale-95 transition-all`}
                                        onClick={() => item.set(item.val + 1)}
                                        onContextMenu={(e) => { e.preventDefault(); item.set(Math.max(0, item.val - 1)); }}
                                    >
                                        <span className="text-label-xs font-bold opacity-40 mb-1">{item.label}</span>
                                        <span className="text-xl font-bold">{item.val}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Elimination Intelligence */}
                    {isDefeat && (
                        <div className={cardClass}>
                            <span className={labelClass}>Target Intelligence</span>
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    {sessionTeams && Object.entries(sessionTeams).map(([teamKey, players]) => (
                                        <button
                                            key={teamKey}
                                            onClick={() => {
                                                setPendingKilledBy(`${teamKey} Team`);
                                                const shipType = sessionShipTypes?.[teamKey];
                                                if (shipType) setPendingKilledByShip(shipType);
                                                useAppStore.getState().setPendingMatchData({ ...pendingMatchData, eliminatedByTeam: teamKey });
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-label-sm font-bold uppercase border transition-all ${pendingMatchData?.eliminatedByTeam === teamKey ? 'border-md-sys-primary bg-md-sys-primary/10 shadow-lg' : 'border-md-sys-outline/10 mg-surface-high opacity-60'}`}
                                        >
                                            {teamKey}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    className={`w-full ${inputBaseClass} py-3 text-body placeholder:opacity-40`}
                                    placeholder="Manual Pilot Search..."
                                    value={pendingKilledBy || ''}
                                    onChange={e => setPendingKilledBy(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Review Anchor */}
                    {detectedPlayerCount > 0 && (
                        <button
                            onClick={() => setShowOcrReview(true)}
                            className="w-full py-3 rounded-2xl mg-surface-high border border-md-sys-primary/10 text-md-sys-primary text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-md-sys-primary/5 transition-all"
                        >
                            <Users size={14} /> Intelligence Review ({detectedPlayerCount} Entities)
                        </button>
                    )}

                    <button
                        onClick={handleWizardSmartCapture}
                        className="w-full py-3 rounded-2xl mg-surface-high border border-md-sys-outline/15 text-label-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:border-md-sys-primary/30 hover:bg-md-sys-primary/5 transition-all"
                    >
                        <Scan size={14} /> Smart Capture
                    </button>

                    {/* Primary Action */}
                    <button
                        onClick={() => processFinalSubmission(selectedWinType)}
                        disabled={submitting}
                        className={`w-full ${isOverlayMode ? 'py-4' : 'py-5'} rounded-3xl font-bold uppercase tracking-wide-30 text-label-sm transition-all shadow-xl active:scale-95 ${submitting ? 'opacity-disabled grayscale' : (selectedWinType === 'Artifact' ? 'bg-warning text-ink-strong' : selectedWinType === 'Objective' ? 'bg-info text-ink-strong' : 'bg-md-sys-primary text-md-sys-onPrimary')}`}
                    >
                        {submitting ? 'Synchronizing...' : `Finalize ${selectedWinType}`}
                    </button>

                </div>

                {/* Footer Cancel */}
                <div className="p-4 flex justify-center border-t border-md-sys-outline/5">
                    <button onClick={() => setShowWizard(null)} className="text-label-sm font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">Abort Submission</button>
                </div>
            </div>

            <OcrCorrectionModal
                isOpen={showOcrReview}
                onClose={() => setShowOcrReview(false)}
                onAcceptAll={() => setShowOcrReview(false)}
                screenshots={wizardReviewScreenshots}
            />
        </div>
    );
};

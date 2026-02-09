import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Clock, HeartCrack, Target, Sword, Gem, X, Users } from 'lucide-react';
import { Match, SHIPS } from '../types';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useMatchSubmission } from '../hooks/useMatchSubmission';
import { OcrCorrectionModal } from './OcrCorrectionModal';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';

export const Wizard: React.FC = () => {
    const {
        pendingMatchData,
        pendingPlacement, setPendingPlacement,
        pendingArtifactType, setPendingArtifactType,
        pendingKilledBy, setPendingKilledBy,
        pendingKilledByShip, setPendingKilledByShip,
        selectedOpponents, setSelectedOpponents,
        sessionTeams, sessionShipTypes,
        // Data fields
        // Data fields
        timeMin, setTimeMin,
        timeSec, setTimeSec,
        damageTaken, setDamageTaken,
        kills, setKills, // usage of kills map
        poiEasy, setPoiEasy,
        poiMedium, setPoiMedium,
        poiEpic, setPoiEpic
    } = useGameData();

    const { showWizard, setShowWizard, isOverlayMode, activeMode, activeUser } = useUIState();
    const { processFinalSubmission, submitting } = useMatchSubmission();

    // Ensure Wizard captures mouse events in Overlay Mode (Force Update)
    React.useEffect(() => {
        if (showWizard && isOverlayMode) {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        }
    }, [showWizard, isOverlayMode]);

    // Win type state (Combat, Artifact, or Objective)
    const [selectedWinType, setSelectedWinType] = useState<'Combat' | 'Artifact' | 'Objective'>('Combat');
    const [showOcrReview, setShowOcrReview] = useState(false);

    // Count detected players for the review button
    const detectedPlayerCount = React.useMemo(() => {
        if (!sessionTeams) return 0;
        return Object.values(sessionTeams).reduce((sum, players) => sum + (players as string[]).length, 0);
    }, [sessionTeams]);

    if (!showWizard || !pendingMatchData) return null;

    const isDefeat = showWizard === 'Loss';
    const title = isDefeat ? 'Defeat' : showWizard;
    const bg = showWizard === 'Win' ? 'bg-green-500' : (isDefeat ? 'bg-red-500' : 'bg-slate-500');

    // Check if fields are filled (explicit boolean)
    const hasTime = !!(timeMin || timeSec);
    const hasDamage = !!(damageTaken && damageTaken !== '0');
    const hasPoi = !!(poiEasy > 0 || poiMedium > 0 || poiEpic > 0);

    // Artifact defeats don't have placement (everyone alive loses together)
    const showPlacement = isDefeat && activeMode === 'Artifact Brawl' && selectedWinType === 'Combat';

    // Helper for compact vs full styling
    const cardClass = isOverlayMode ? 'p-2 rounded-xl' : 'p-4 rounded-xl';
    const labelClass = 'text-xs font-bold uppercase opacity-60 mb-1 block';
    const inputBaseClass = 'bg-md-sys-surface3 font-bold outline-none text-center rounded-lg';

    return (
        <div className="fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-2 animate-fade-in" onClick={() => setShowWizard(null)}>
            <div className={`bg-md-sys-surface1 rounded-2xl w-full ${isOverlayMode ? 'max-w-[340px] max-h-[680px] p-3 border border-md-sys-outline/10' : 'max-w-3xl max-h-[95vh] p-6 rounded-2xl'} text-center shadow-2xl overflow-hidden flex flex-col animate-scale-in`} onClick={e => e.stopPropagation()}>
                <div className={`${isOverlayMode ? 'p-2 -m-3 mb-2 text-sm' : 'p-4 -m-6 mb-4 text-xl'} ${bg} text-white font-black uppercase tracking-widest rounded-t-2xl`}>{title}</div>
                <div className={`overflow-y-auto flex-1 flex flex-col ${isOverlayMode ? 'gap-2 px-1 py-2' : 'gap-3 px-2 py-4'} custom-scrollbar`}>

                    {/* Win Type Selector - At Top */}
                    {activeMode === 'Artifact Brawl' && (
                        <div className={`flex ${isOverlayMode ? 'gap-1' : 'gap-2'} w-full`}>
                            <button
                                onClick={() => setSelectedWinType('Combat')}
                                className={`flex-1 ${isOverlayMode ? 'py-2 text-xs rounded-lg' : 'py-3 text-sm rounded-xl'} font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-surface2 ring-2 ring-md-sys-primary' : 'bg-md-sys-surface3/50 opacity-60 hover:opacity-100'}`}
                            >
                                <Sword size={isOverlayMode ? 14 : 16} />
                                Combat
                            </button>
                            <button
                                onClick={() => setSelectedWinType('Artifact')}
                                className={`flex-1 ${isOverlayMode ? 'py-2 text-xs rounded-lg' : 'py-3 text-sm rounded-xl'} font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${selectedWinType === 'Artifact' ? 'bg-yellow-500/20 text-yellow-400 ring-2 ring-yellow-500' : 'bg-md-sys-surface3/50 opacity-60 hover:opacity-100'}`}
                            >
                                <Gem size={isOverlayMode ? 14 : 16} />
                                Artifact
                            </button>
                        </div>
                    )}
                    {activeMode === 'Fleet Battle' && (
                        <div className={`flex ${isOverlayMode ? 'gap-1' : 'gap-2'} w-full`}>
                            <button
                                onClick={() => setSelectedWinType('Combat')}
                                className={`flex-1 ${isOverlayMode ? 'py-2 text-xs rounded-lg' : 'py-3 text-sm rounded-xl'} font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${selectedWinType === 'Combat' ? 'bg-md-sys-surface2 ring-2 ring-md-sys-primary' : 'bg-md-sys-surface3/50 opacity-60 hover:opacity-100'}`}
                            >
                                <Sword size={isOverlayMode ? 14 : 16} />
                                Combat
                            </button>
                            <button
                                onClick={() => setSelectedWinType('Objective')}
                                className={`flex-1 ${isOverlayMode ? 'py-2 text-xs rounded-lg' : 'py-3 text-sm rounded-xl'} font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${selectedWinType === 'Objective' ? 'bg-blue-500/20 text-blue-400 ring-2 ring-blue-500' : 'bg-md-sys-surface3/50 opacity-60 hover:opacity-100'}`}
                            >
                                <Target size={isOverlayMode ? 14 : 16} />
                                Objective
                            </button>
                        </div>
                    )}

                    {/* Artifact Type - Only for Artifact Brawl (placed near Win Type) */}
                    {activeMode === 'Artifact Brawl' && (
                        <div className={`bg-md-sys-surface2 ${cardClass}`}>
                            <label className={labelClass}>Artifact</label>
                            <div className="flex flex-wrap gap-1 justify-center">
                                {['Healing', 'Weapon', 'Ice'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setPendingArtifactType(t)}
                                        className={`${isOverlayMode ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'} rounded-full font-bold transition-colors ${pendingArtifactType === t ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-on-surface/5 hover:bg-md-sys-on-surface/10'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={() => setShowWizard(null)} className="absolute top-4 right-4 opacity-50 hover:opacity-100 transition-colors z-[100000]">
                        <X size={24} />
                    </button>
                    {/* Re-rendering title and content wrapper structure from original file to maintain layout */}

                    {/* Stats Grid */}
                    <div className={`grid grid-cols-3 ${isOverlayMode ? 'gap-1' : 'gap-2'}`}>
                        {/* Time */}
                        <div className={`bg-md-sys-surface2 ${cardClass} flex flex-col items-center`}>
                            <Clock size={14} className="text-md-sys-on-surface/30 mb-0.5" />
                            <span className={labelClass}>Time</span>
                            <div className="flex items-center gap-0.5">
                                <input type="number" placeholder="00" value={timeMin} onChange={(e) => setTimeMin(e.target.value)} className={`w-6 ${inputBaseClass} ${isOverlayMode ? 'text-sm py-0.5' : 'text-lg py-1'} placeholder:opacity-30`} />
                                <span className="text-sm font-bold text-md-sys-on-surface/30">:</span>
                                <input type="number" placeholder="00" value={timeSec} onChange={(e) => setTimeSec(e.target.value)} className={`w-6 ${inputBaseClass} ${isOverlayMode ? 'text-sm py-0.5' : 'text-lg py-1'} placeholder:opacity-30`} />
                            </div>
                        </div>
                        {/* Damage */}
                        <div className={`bg-md-sys-surface2 ${cardClass} flex flex-col items-center`}>
                            <HeartCrack size={14} className="text-rose-400/50 mb-0.5" />
                            <span className={`${labelClass} text-rose-400/70`}>Dmg</span>
                            <input type="text" placeholder="0" maxLength={3} value={damageTaken} onChange={(e) => setDamageTaken(e.target.value.replace(/[^0-9]/g, ''))} className={`w-10 ${inputBaseClass} ${isOverlayMode ? 'text-sm py-0.5' : 'text-lg py-1'} placeholder:opacity-30`} />
                        </div>
                        {/* Total Elims Display (Calculated) */}
                        <div className={`bg-md-sys-surface2 ${cardClass} flex flex-col items-center`}>
                            <Target size={14} className="text-emerald-400/50 mb-0.5" />
                            <span className={`${labelClass} text-emerald-400/70`}>Total</span>
                            <span className={`${isOverlayMode ? 'text-lg' : 'text-2xl'} font-black text-white`}>
                                {Object.values(kills || {}).reduce((a, b) => a + (Number(b) || 0), 0)}
                            </span>
                        </div>
                    </div>

                    {/* Ship Eliminations Breakdown */}
                    <div className={`bg-md-sys-surface2 ${cardClass}`}>
                        <div className="flex items-center justify-center gap-1 mb-2">
                            <Target size={12} className="text-md-sys-on-surface/50" />
                            <span className={labelClass + ' mb-0'}>Ship Eliminations</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                            {[...SHIPS, 'AI Legion'].map(ship => {
                                const shortName = ship.split('(')[0].trim();
                                const currentVal = kills?.[shortName] || '';
                                return (
                                    <div key={ship} className="flex flex-col items-center bg-md-sys-surface3 rounded-lg p-1">
                                        <span className="text-[9px] font-bold opacity-50 uppercase mb-0.5 truncate w-full text-center" title={shortName}>{shortName}</span>
                                        <div className="flex items-center w-full gap-0.5">
                                            <button
                                                onClick={() => setKills({ ...kills, [shortName]: Math.max(0, (kills?.[shortName] || 0) - 1) })}
                                                className="w-5 h-6 flex items-center justify-center bg-black/20 hover:bg-black/40 text-white rounded-l text-xs font-bold"
                                            >-</button>
                                            <div className={`flex-1 flex items-center justify-center h-6 bg-black/20 text-white font-bold ${isOverlayMode ? 'text-sm' : 'text-base'}`}>
                                                {currentVal || 0}
                                            </div>
                                            <button
                                                onClick={() => setKills({ ...kills, [shortName]: (kills?.[shortName] || 0) + 1 })}
                                                className="w-5 h-6 flex items-center justify-center bg-black/20 hover:bg-black/40 text-white rounded-r text-xs font-bold"
                                            >+</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* POI Objectives - only for Artifact Brawl */}
                    {activeMode === 'Artifact Brawl' && (
                        <div className={`bg-md-sys-surface2 ${cardClass}`}>
                            <div className="flex items-center justify-center gap-1 mb-2">
                                <Target size={12} className="text-md-sys-on-surface/50" />
                                <span className={labelClass + ' mb-0'}>POI Objectives</span>
                            </div>
                            <div className={`grid grid-cols-3 ${isOverlayMode ? 'gap-1' : 'gap-2'}`}>
                                {[
                                    { label: 'Easy', val: poiEasy, set: setPoiEasy, color: 'bg-emerald-500' },
                                    { label: 'Med', val: poiMedium, set: setPoiMedium, color: 'bg-amber-500' },
                                    { label: 'Epic', val: poiEpic, set: setPoiEpic, color: 'bg-purple-500' }
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        className={`relative ${isOverlayMode ? 'h-10' : 'h-12'} rounded-xl bg-md-sys-surface3 flex items-center justify-center gap-1 select-none overflow-hidden cursor-pointer`}
                                    >
                                        <div
                                            onClick={() => item.set(Math.max(0, item.val - 1))}
                                            className="absolute inset-y-0 left-0 w-1/2 hover:bg-md-sys-on-surface/5 transition-colors z-10"
                                        />
                                        <div
                                            onClick={() => item.set(item.val + 1)}
                                            className="absolute inset-y-0 right-0 w-1/2 hover:bg-md-sys-on-surface/5 transition-colors z-10"
                                        />
                                        <div className={`w-1 h-4 rounded-full ${item.color}`} />
                                        <span className={`${isOverlayMode ? 'text-lg' : 'text-xl'} font-bold text-md-sys-on-surface`}>{item.val}</span>
                                        <span className="text-[9px] font-semibold text-md-sys-on-surface/50 uppercase">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Placement - Only for Combat defeats in Artifact Brawl */}
                    {showPlacement && (
                        <div className={`bg-md-sys-surface2 ${cardClass}`}>
                            <label className={labelClass}>Placement</label>
                            <div className={`flex justify-center ${isOverlayMode ? 'gap-1' : 'gap-2'}`}>
                                {[2, 3, 4, 5].map(place => (
                                    <button
                                        key={place}
                                        onClick={() => setPendingPlacement(place)}
                                        className={`${isOverlayMode ? 'w-10 h-10 text-lg' : 'w-14 h-14 text-2xl'} rounded-xl font-black transition-all ${pendingPlacement === place ? 'bg-md-sys-primary text-md-sys-onPrimary scale-105' : 'bg-md-sys-surface3 hover:bg-md-sys-surface3/80'}`}
                                    >
                                        {place}<sup className="text-[10px] opacity-60">{place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}</sup>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Eliminated By - Only for defeats */}
                    {isDefeat && (
                        <div className={`bg-md-sys-surface2 ${cardClass}`}>
                            <label className={labelClass}>Eliminated By</label>

                            {/* Team Selection */}
                            {sessionTeams && Object.keys(sessionTeams).length > 0 && (
                                <div className={`flex flex-wrap justify-center gap-1 ${isOverlayMode ? 'mb-2 pb-2' : 'mb-3 pb-3'} border-b border-md-sys-outline/5`}>
                                    {Object.entries(sessionTeams).map(([teamKey, players]) => {
                                        const shipType = sessionShipTypes?.[teamKey] || '';
                                        return (
                                            <button
                                                key={teamKey}
                                                onClick={() => {
                                                    setPendingKilledBy(`${teamKey} Team`);
                                                    if (shipType) setPendingKilledByShip(shipType);
                                                    // Store eliminatedByTeam on pendingMatchData
                                                    const pm = pendingMatchData || {};
                                                    useAppStore.getState().setPendingMatchData({ ...pm, eliminatedByTeam: teamKey });
                                                }}
                                                className={`${isOverlayMode ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-lg font-bold uppercase flex items-center gap-1 border border-md-sys-outline/10 hover:brightness-110 active:scale-95 transition-all ${pendingMatchData?.eliminatedByTeam === teamKey ? 'ring-2 ring-md-sys-primary' : ''}`}
                                                style={{
                                                    backgroundColor: teamKey.split(':')[0].toLowerCase() === 'unknown' ? '#444' : teamKey.split(':')[0].toLowerCase(),
                                                    color: ['yellow', 'cyan', 'white'].includes(teamKey.split(':')[0].toLowerCase()) ? 'black' : 'white'
                                                }}
                                            >
                                                {teamKey}
                                                {shipType && <span className="opacity-70 text-[9px]">({shipType.replace(/ \(\d Player\)/, '')})</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Detected Players from OCR */}
                            {sessionTeams && Object.keys(sessionTeams).length > 0 && (
                                <div className={`flex flex-wrap justify-center gap-1 ${isOverlayMode ? 'mb-2' : 'mb-3'}`}>
                                    {Object.entries(sessionTeams).flatMap(([teamKey, players]) =>
                                        (players as string[]).map(player => {
                                            const ship = sessionShipTypes?.[player] || sessionShipTypes?.[teamKey];
                                            return (
                                                <button
                                                    key={`${teamKey}-${player}`}
                                                    onClick={() => {
                                                        setPendingKilledBy(player);
                                                        if (ship) setPendingKilledByShip(ship);
                                                        const pm = pendingMatchData || {};
                                                        useAppStore.getState().setPendingMatchData({ ...pm, eliminatedByTeam: teamKey });
                                                    }}
                                                    className={`${isOverlayMode ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} rounded-md bg-md-sys-on-surface/5 hover:bg-md-sys-on-surface/15 truncate max-w-[100px] transition-all flex flex-col items-center leading-tight ${pendingKilledBy === player ? 'ring-1 ring-md-sys-primary bg-md-sys-primary/20' : ''}`}
                                                    title={`${player} (${teamKey})${ship ? ` - ${ship}` : ''}`}
                                                >
                                                    <span>{player}</span>
                                                    {ship && <span className="opacity-50 text-[9px] uppercase tracking-tighter">{ship}</span>}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            <input
                                type="text"
                                className={`w-full bg-transparent text-center font-bold outline-none mb-1 ${isOverlayMode ? 'text-sm' : 'text-xl'}`}
                                placeholder="Pilot or Team"
                                value={pendingKilledBy || ''}
                                onChange={e => setPendingKilledBy(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Review Detected Players Button */}
                    {detectedPlayerCount > 0 && (
                        <button
                            onClick={() => setShowOcrReview(true)}
                            className={`w-full ${isOverlayMode ? 'py-2 text-xs rounded-lg' : 'py-3 text-sm rounded-xl'} bg-md-sys-on-surface/5 hover:bg-md-sys-on-surface/10 transition-colors flex items-center justify-center gap-2`}
                        >
                            <Users size={isOverlayMode ? 14 : 16} />
                            Review Detected Players ({detectedPlayerCount})
                        </button>
                    )}

                    {/* Submit Button */}
                    <button
                        onClick={() => processFinalSubmission(selectedWinType)}
                        disabled={submitting}
                        className={`w-full ${isOverlayMode ? 'py-3 text-sm rounded-xl mt-2' : 'py-4 text-lg rounded-2xl mt-4'} font-black uppercase tracking-widest transition-all ${submitting ? 'bg-md-sys-surface3 opacity-50 cursor-not-allowed' : (selectedWinType === 'Artifact' ? 'bg-yellow-500 text-black hover:bg-yellow-400' : selectedWinType === 'Objective' ? 'bg-blue-500 text-white hover:bg-blue-400' : 'bg-md-sys-primary text-md-sys-onPrimary hover:brightness-110')}`}
                    >
                        {submitting ? 'Submitting...' : `Submit ${selectedWinType}`}
                    </button>

                    {/* OCR Correction Modal */}
                    <OcrCorrectionModal
                        isOpen={showOcrReview}
                        onClose={() => setShowOcrReview(false)}
                        onAcceptAll={() => setShowOcrReview(false)}
                    />
                </div>
                <div className={`${isOverlayMode ? 'mt-2' : 'mt-4'}`}>
                    <button onClick={() => setShowWizard(null)} className="text-xs uppercase font-bold opacity-40 hover:opacity-100">Cancel</button>
                </div>
            </div>
        </div>
    );
};

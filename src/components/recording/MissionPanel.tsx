import React, { useState } from 'react';
import { Layout, Clock, HeartCrack, Target, Crosshair, Zap, X, Camera, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { WEAPONS, UI_REACH_MODIFIERS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT } from '../../types';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { captureScreen, processMatchScreenshot, ScanOptions } from '../../utils/scanService';
import { EQUIPMENT_DB } from '../../utils/equipmentDb';
import Logger from '../../utils/logger';

interface MissionPanelProps {
    variant?: 'default' | 'transparent';
    showModifiers?: boolean;
    /** Enable accordion mode where only one section expands at a time */
    accordionMode?: boolean;
}

// Accordion section types
type SectionId = 'stats' | 'poi' | 'weapons' | 'charWeapons' | 'equipment' | 'modifiers';

export const MissionPanel: React.FC<MissionPanelProps> = ({
    variant = 'default',
    showModifiers = true,
    accordionMode = false
}) => {
    const {
        timeMin, setTimeMin, timeSec, setTimeSec,
        damageTaken, setDamageTaken,
        poiEasy, setPoiEasy, poiMedium, setPoiMedium, poiEpic, setPoiEpic,
        selectedReachModifiers, toggleReachModifier, setSelectedReachModifiers,
        currentNote, setCurrentNote,
        activeWeapons: weapons, setActiveWeapons: setWeapons
    } = useGameData();

    const { inputMode, showArtifactSelect, setShowArtifactSelect } = useUIState();

    const isTransparent = variant === 'transparent';
    const [isScanning, setIsScanning] = useState(false);

    // Accordion state - track which section is expanded (null = all collapsed in accordion mode)
    const [expandedSection, setExpandedSection] = useState<SectionId | null>('stats');

    // Toggle section expansion
    const toggleSection = (section: SectionId) => {
        if (accordionMode) {
            // In accordion mode, clicking same section collapses it, otherwise switches
            setExpandedSection(prev => prev === section ? null : section);
        }
        // In non-accordion mode, all sections are always visible
    };

    // Check if section should show content
    const isSectionExpanded = (section: SectionId) => {
        if (!accordionMode) return true; // Always expanded in normal mode
        return expandedSection === section;
    };

    const handleAutoScan = async () => {
        setIsScanning(true);
        Logger.info('MissionPanel', 'Starting match stats scan');
        try {
            const img = await captureScreen();
            if (img) {
                const options: ScanOptions = {
                    onProgress: (status, pct) => Logger.debug('MissionPanel', `Scan: ${status} (${pct}%)`)
                };
                const res = await processMatchScreenshot(img.dataUrl, options);
                if (res.time) {
                    const parts = res.time.split(':');
                    if (parts.length === 2) {
                        setTimeMin(parts[0]);
                        setTimeSec(parts[1]);
                    }
                }
                if (res.damage !== undefined) {
                    setDamageTaken(res.damage.toString());
                }
                if (res.modifiers && res.modifiers.length > 0) {
                    setSelectedReachModifiers(res.modifiers);
                }
                Logger.info('MissionPanel', 'Match stats captured', { time: res.time, damage: res.damage });
            }
        } catch (e) {
            Logger.error('MissionPanel', 'Auto-scan failed', e);
        } finally {
            setIsScanning(false);
        }
    };

    // Collapsible section header component for accordion mode
    const SectionHeader: React.FC<{
        id: SectionId;
        icon: React.ReactNode;
        title: string;
        badge?: string;
    }> = ({ id, icon, title, badge }) => {
        if (!accordionMode) {
            // Normal header without collapse controls
            return (
                <span className="text-xs font-semibold text-md-sys-on-surface/50 uppercase flex items-center gap-1.5">
                    {icon} {title} {badge && <span className="text-[9px] opacity-60">{badge}</span>}
                </span>
            );
        }

        const isExpanded = expandedSection === id;
        return (
            <button
                onClick={() => toggleSection(id)}
                className={`w-full flex items-center justify-between py-1.5 px-2 rounded-lg transition-all ${
                    isExpanded
                        ? 'bg-md-sys-primary/10 text-md-sys-primary'
                        : isTransparent
                            ? 'bg-zinc-800/50 hover:bg-zinc-700/50 text-white/60 hover:text-white'
                            : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-md-sys-on-surface/50 hover:text-md-sys-on-surface'
                }`}
            >
                <span className="text-xs font-bold uppercase flex items-center gap-1.5">
                    {icon} {title} {badge && <span className="text-[9px] opacity-60">{badge}</span>}
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
        );
    };

    return (
        <div className={`${isTransparent ? 'bg-transparent p-0' : 'bg-md-sys-surface1 rounded-xl p-4'} h-full flex flex-col gap-4`}>
            {/* Header */}
            {!isTransparent && (
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2 text-md-sys-on-surface">
                        <Layout size={14} className="text-md-sys-primary" />
                        Mission Intel
                    </span>
                    <div className="flex items-center gap-2">
                        {inputMode === 'Smart' && (
                            <span className="px-2 py-0.5 bg-md-sys-primary/20 text-md-sys-primary rounded text-[10px] font-semibold uppercase">
                                Live
                            </span>
                        )}
                    </div>
                </div>
            )}

            <div className={`flex-1 flex flex-col ${accordionMode ? 'gap-1' : 'gap-4'} ${accordionMode ? '' : 'overflow-y-auto custom-scrollbar pr-1'}`}>
                {/* Time & Damage Section */}
                <div className="flex flex-col gap-2">
                    <SectionHeader id="stats" icon={<Clock size={12} />} title="Stats" />
                    {isSectionExpanded('stats') && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className={`${isTransparent ? 'bg-zinc-900/90 border border-white/20' : 'bg-md-sys-surface2'} ${accordionMode ? 'p-2' : 'p-3'} rounded-xl flex flex-col items-center justify-center shadow-lg`}>
                                <Clock size={accordionMode ? 12 : 16} className="text-md-sys-on-surface/50 mb-0.5" />
                                <span className="text-[9px] font-semibold text-md-sys-on-surface/70 uppercase mb-0.5">Time</span>
                                <div className="flex items-center gap-0.5">
                                    <input
                                        type="number"
                                        placeholder="00"
                                        value={timeMin}
                                        readOnly={inputMode === 'Smart'}
                                        onChange={(e) => setTimeMin(e.target.value)}
                                        className={`${accordionMode ? 'w-8 text-base' : 'w-10 text-xl'} font-bold outline-none text-center rounded-lg py-0.5 placeholder:opacity-30
                                            ${isTransparent ? 'bg-black/60 text-white border border-white/10' : 'bg-md-sys-surface3 text-md-sys-on-surface'}
                                            ${inputMode === 'Smart' ? 'opacity-90' : ''}`}
                                    />
                                    <span className={`${accordionMode ? 'text-base' : 'text-xl'} font-bold text-md-sys-on-surface/50`}>:</span>
                                    <input
                                        type="number"
                                        placeholder="00"
                                        value={timeSec}
                                        readOnly={inputMode === 'Smart'}
                                        onChange={(e) => setTimeSec(e.target.value)}
                                        className={`${accordionMode ? 'w-8 text-base' : 'w-10 text-xl'} font-bold outline-none text-center rounded-lg py-0.5 placeholder:opacity-30
                                            ${isTransparent ? 'bg-black/60 text-white border border-white/10' : 'bg-md-sys-surface3 text-md-sys-on-surface'}
                                            ${inputMode === 'Smart' ? 'opacity-90' : ''}`}
                                    />
                                </div>
                            </div>
                            <div className={`${isTransparent ? 'bg-zinc-900/90 border border-white/20' : 'bg-md-sys-surface2'} ${accordionMode ? 'p-2' : 'p-3'} rounded-xl flex flex-col items-center justify-center shadow-lg`}>
                                <HeartCrack size={accordionMode ? 12 : 16} className="text-rose-400 mb-0.5" />
                                <span className="text-[9px] font-semibold text-rose-400/90 uppercase mb-0.5">Dmg</span>
                                <input
                                    type="text"
                                    placeholder="0"
                                    maxLength={4}
                                    value={damageTaken}
                                    readOnly={inputMode === 'Smart'}
                                    onChange={(e) => setDamageTaken(e.target.value.replace(/[^0-9]/g, ''))}
                                    className={`${accordionMode ? 'w-12 text-base' : 'w-16 text-xl'} font-bold outline-none text-center rounded-lg py-0.5 placeholder:opacity-30
                                        ${isTransparent ? 'bg-black/60 text-white border border-white/10' : 'bg-md-sys-surface3 text-md-sys-on-surface'}
                                        ${inputMode === 'Smart' ? 'opacity-90' : ''}`}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* POI Objectives */}
                <div className="flex flex-col gap-2">
                    <SectionHeader id="poi" icon={<Target size={12} />} title="POI" badge={`${poiEasy + poiMedium + poiEpic}`} />
                    {isSectionExpanded('poi') && (
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { label: 'Easy', val: poiEasy, set: setPoiEasy, color: 'bg-poi-easy' },
                                { label: 'Med', val: poiMedium, set: setPoiMedium, color: 'bg-poi-medium' },
                                { label: 'Epic', val: poiEpic, set: setPoiEpic, color: 'bg-poi-epic' }
                            ].map((item) => (
                                <div
                                    key={item.label}
                                    className={`relative ${accordionMode ? 'h-10' : 'h-14'} rounded-xl ${isTransparent ? 'bg-zinc-900/80 border border-white/10' : 'bg-md-sys-surface2'} flex items-center justify-center gap-1 select-none overflow-hidden ${inputMode === 'Smart' ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                                >
                                    {inputMode !== 'Smart' && (
                                        <>
                                            <div
                                                onClick={() => item.set(Math.max(0, item.val - 1))}
                                                className="absolute inset-y-0 left-0 w-1/2 hover:bg-white/5 transition-colors z-10"
                                            />
                                            <div
                                                onClick={() => item.set(item.val + 1)}
                                                className="absolute inset-y-0 right-0 w-1/2 hover:bg-white/5 transition-colors z-10"
                                            />
                                        </>
                                    )}
                                    <div className={`w-1 h-4 rounded-full ${item.color}`} />
                                    <span className={`${accordionMode ? 'text-lg' : 'text-2xl'} font-bold text-md-sys-on-surface`}>{item.val}</span>
                                    <span className="text-[8px] font-semibold text-md-sys-on-surface/50 uppercase">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Weapons */}
                {(() => {
                    const totalWeaponKills = WEAPONS.reduce((sum, w) => sum + (weapons?.[w] || 0), 0);
                    return (
                        <div className="flex flex-col gap-2">
                            <SectionHeader id="weapons" icon={<Crosshair size={12} />} title="Weapons" badge={totalWeaponKills > 0 ? `${totalWeaponKills}` : undefined} />
                            {isSectionExpanded('weapons') && (
                                <div className="grid grid-cols-2 gap-2">
                                    {WEAPONS.map(w => {
                                        const count = weapons?.[w] || 0;
                                        const isActive = count > 0;
                                        return (
                                            <div
                                                key={w}
                                                className={`relative ${accordionMode ? 'h-8' : 'h-10'} rounded-lg transition-all select-none overflow-hidden ${isActive
                                                    ? 'bg-md-sys-primary/20 ring-1 ring-md-sys-primary/30'
                                                    : (isTransparent ? 'bg-zinc-900/80 border border-white/10 text-white' : 'bg-md-sys-surface2')
                                                    } ${inputMode === 'Smart' ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                                            >
                                                {inputMode !== 'Smart' && (
                                                    <>
                                                        <div
                                                            onClick={() => setWeapons({ ...weapons, [w]: Math.max(0, count - 1) })}
                                                            className="absolute inset-y-0 left-0 w-1/2 hover:bg-white/5 transition-colors z-10"
                                                        />
                                                        <div
                                                            onClick={() => setWeapons({ ...weapons, [w]: count + 1 })}
                                                            className="absolute inset-y-0 right-0 w-1/2 hover:bg-white/5 transition-colors z-10"
                                                        />
                                                    </>
                                                )}
                                                <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                                    <span className={`text-[10px] font-semibold uppercase truncate ${isActive ? 'text-md-sys-primary' : 'text-md-sys-on-surface/50'}`}>
                                                        {w.replace('Cannon', '').replace('Scatter', 'Sct').replace('Spec Ops', 'SO')}
                                                    </span>
                                                    <span className={`${accordionMode ? 'text-xs' : 'text-sm'} font-bold ${isActive ? 'text-md-sys-primary' : 'text-md-sys-on-surface/30'}`}>
                                                        {count}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Character Loadout */}
                {CHARACTER_WEAPONS && CHARACTER_WEAPONS.length > 0 && (() => {
                    // Calculate total weapons selected
                    const totalWeapons = CHARACTER_WEAPONS.reduce((sum, w) => sum + (weapons?.[w] || 0), 0);
                    const MAX_WEAPONS = 2;

                    return (
                        <div className="flex flex-col gap-2">
                            <SectionHeader id="charWeapons" icon={<Crosshair size={12} />} title="Char Weapons" badge={`${totalWeapons}/${MAX_WEAPONS}`} />
                            {isSectionExpanded('charWeapons') && (
                                <div className="grid grid-cols-2 gap-2">
                                    {CHARACTER_WEAPONS.map(w => {
                                        const count = weapons?.[w] || 0;
                                        const isActive = count > 0;
                                        const canAdd = totalWeapons < MAX_WEAPONS && count === 0; // Can only have 1 of each
                                        const item = EQUIPMENT_DB.find(i => i.name === w);
                                        const tooltip = item ? `${item.name}\n${item.description || ''}` : w;
                                        return (
                                            <div
                                                key={w}
                                                title={tooltip}
                                                onClick={() => {
                                                    if (inputMode === 'Smart') return;
                                                    if (isActive) {
                                                        setWeapons({ ...weapons, [w]: 0 });
                                                    } else if (canAdd) {
                                                        setWeapons({ ...weapons, [w]: 1 });
                                                    }
                                                }}
                                                className={`relative ${accordionMode ? 'h-8' : 'h-10'} rounded-lg transition-all select-none overflow-hidden
                                                    ${isActive
                                                        ? 'bg-weapon-soft ring-1 ring-weapon'
                                                        : canAdd
                                                            ? (isTransparent ? 'bg-zinc-900/80 border border-white/10 hover:bg-zinc-800' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3')
                                                            : (isTransparent ? 'bg-black/40 opacity-40' : 'bg-md-sys-surface2 opacity-40')
                                                    }
                                                    ${inputMode === 'Smart' ? 'cursor-default opacity-70' : isActive || canAdd ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                                    <span className={`text-[10px] font-semibold uppercase truncate ${isActive ? 'text-weapon' : 'text-md-sys-on-surface/50'}`}>
                                                        {w}
                                                    </span>
                                                    {isActive && (
                                                        <span className="text-xs font-bold text-weapon">✓</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Character Equipment */}
                {CHARACTER_EQUIPMENT && CHARACTER_EQUIPMENT.length > 0 && (() => {
                    // Calculate total equipment selected
                    const totalEquipment = CHARACTER_EQUIPMENT.reduce((sum, w) => sum + (weapons?.[w] || 0), 0);
                    const MAX_EQUIPMENT = 2;

                    return (
                        <div className="flex flex-col gap-2">
                            <SectionHeader id="equipment" icon={<Zap size={12} />} title="Equipment" badge={`${totalEquipment}/${MAX_EQUIPMENT}`} />
                            {isSectionExpanded('equipment') && (
                                <div className="grid grid-cols-2 gap-2">
                                    {CHARACTER_EQUIPMENT.map(w => {
                                        const count = weapons?.[w] || 0;
                                        const isActive = count > 0;
                                        const canAdd = totalEquipment < MAX_EQUIPMENT && count === 0; // Can only have 1 of each
                                        const item = EQUIPMENT_DB.find(i => i.name === w);
                                        const tooltip = item ? `${item.name}\n${item.description || ''}` : w;
                                        return (
                                            <div
                                                key={w}
                                                title={tooltip}
                                                onClick={() => {
                                                    if (inputMode === 'Smart') return;
                                                    if (isActive) {
                                                        setWeapons({ ...weapons, [w]: 0 });
                                                    } else if (canAdd) {
                                                        setWeapons({ ...weapons, [w]: 1 });
                                                    }
                                                }}
                                                className={`relative ${accordionMode ? 'h-8' : 'h-10'} rounded-lg transition-all select-none overflow-hidden
                                                    ${isActive
                                                        ? 'bg-equipment-soft ring-1 ring-equipment'
                                                        : canAdd
                                                            ? (isTransparent ? 'bg-zinc-900/80 border border-white/10 hover:bg-zinc-800' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3')
                                                            : (isTransparent ? 'bg-black/40 opacity-40' : 'bg-md-sys-surface2 opacity-40')
                                                    }
                                                    ${inputMode === 'Smart' ? 'cursor-default opacity-70' : isActive || canAdd ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                                    <span className={`text-[10px] font-semibold uppercase truncate ${isActive ? 'text-equipment' : 'text-md-sys-on-surface/50'}`}>
                                                        {w}
                                                    </span>
                                                    {isActive && (
                                                        <span className="text-xs font-bold text-equipment">✓</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Reach Modifiers */}
                {showModifiers && (
                    <div className="flex flex-col gap-2">
                        <SectionHeader id="modifiers" icon={<Zap size={12} />} title="Modifiers" badge={selectedReachModifiers.length > 0 ? `${selectedReachModifiers.length}` : undefined} />
                        {isSectionExpanded('modifiers') && (
                            <div className={`flex flex-wrap ${accordionMode ? 'gap-1' : 'gap-2'}`}>
                                {inputMode === 'Smart' ? (
                                    selectedReachModifiers.map((mod: string) => (
                                        <div
                                            key={mod}
                                            className={`${accordionMode ? 'px-2 py-1' : 'px-3 py-2'} rounded-lg text-xs font-semibold bg-md-sys-primary text-md-sys-onPrimary opacity-70`}
                                        >
                                            {mod}
                                        </div>
                                    ))
                                ) : showArtifactSelect ? (
                                    <div className={`flex items-center gap-2 ${isTransparent ? 'bg-black/50' : 'bg-md-sys-surface2'} p-2 rounded-xl w-full`}>
                                        {['Healing', 'Ice', 'Weapon'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => { toggleReachModifier(`Artifact: ${type}`); setShowArtifactSelect(false); }}
                                                className={`flex-1 ${accordionMode ? 'px-2 py-1' : 'px-3 py-2'} rounded-lg text-xs font-bold uppercase bg-amber-500 text-black hover:brightness-110`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setShowArtifactSelect(false)}
                                            className="p-2 rounded-lg hover:bg-md-sys-surface3 text-md-sys-on-surface/50"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setShowArtifactSelect(true)}
                                            className={`${accordionMode ? 'px-2 py-1' : 'px-3 py-2'} rounded-lg text-xs font-semibold transition-all ${selectedReachModifiers.some((m: string) => m.startsWith("Artifact"))
                                                ? 'bg-amber-500 text-black'
                                                : 'bg-md-sys-surface2 text-md-sys-on-surface/60 hover:text-md-sys-on-surface hover:bg-md-sys-surface3'
                                                }`}
                                        >
                                            {selectedReachModifiers.find((m: string) => m.startsWith("Artifact")) || "Artifact"}
                                        </button>
                                        {UI_REACH_MODIFIERS.filter(m => !m.startsWith("Artifact"))
                                            .sort((a, b) => {
                                                const aSelected = selectedReachModifiers.includes(a);
                                                const bSelected = selectedReachModifiers.includes(b);
                                                if (aSelected && !bSelected) return -1;
                                                if (!aSelected && bSelected) return 1;
                                                return a.localeCompare(b);
                                            })
                                            .map(mod => (
                                                <button
                                                    key={mod}
                                                    onClick={() => toggleReachModifier(mod)}
                                                    className={`${accordionMode ? 'px-2 py-1' : 'px-3 py-2'} rounded-lg text-xs font-semibold transition-all ${selectedReachModifiers.includes(mod)
                                                        ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                                        : 'bg-md-sys-surface2 text-md-sys-on-surface/60 hover:text-md-sys-on-surface hover:bg-md-sys-surface3'
                                                        }`}
                                                >
                                                    {mod}
                                                </button>
                                            ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Notes (Hidden in Transparent Mode to save space) */}
                {!isTransparent && (
                    <textarea
                        value={currentNote}
                        onChange={(e) => setCurrentNote(e.target.value)}
                        placeholder="Match Notes..."
                        readOnly={inputMode === 'Smart'}
                        className={`w-full h-20 bg-md-sys-surface2 rounded-xl p-3 text-sm outline-none resize-none placeholder:text-md-sys-on-surface/30 
                        ${inputMode === 'Smart' ? 'opacity-50 cursor-default' : 'focus:ring-2 focus:ring-md-sys-primary/50'}`}
                    />
                )}
            </div>
        </div>
    );
};
import React, { useState } from 'react';
import { Layout, Clock, HeartCrack, Target, Crosshair, Zap, X, Camera, Loader2, ChevronDown, ChevronRight, Check } from 'lucide-react';
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
        damageTaken, setDamageTaken, damageSource,
        poiEasy, setPoiEasy, poiMedium, setPoiMedium, poiEpic, setPoiEpic,
        selectedReachModifiers, modifiersSource, toggleReachModifier, setSelectedReachModifiers,
        currentNote, setCurrentNote,
        activeWeapons: weapons, setActiveWeapons: setWeapons,
        currentLoadout
    } = useGameData();

    const { showArtifactSelect, setShowArtifactSelect } = useUIState();

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

    const telemetryProspectorWeapons = Array.isArray(currentLoadout?.characterWeapons)
        ? currentLoadout.characterWeapons.filter(Boolean)
        : [];
    const telemetryProspectorEquipment = Array.isArray(currentLoadout?.characterEquipment)
        ? currentLoadout.characterEquipment.filter(Boolean)
        : [];

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
                        setTimeMin(parts[0], 'ocr');
                        setTimeSec(parts[1], 'ocr');
                    }
                }
                if (res.damage !== undefined) {
                    setDamageTaken(res.damage.toString(), 'ocr');
                }
                if (res.modifiers && res.modifiers.length > 0) {
                    setSelectedReachModifiers(res.modifiers, 'ocr');
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
        indicator?: React.ReactNode;
    }> = ({ id, icon, title, badge, indicator }) => {
        if (!accordionMode) {
            // Normal header without collapse controls
            return (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-label-sm font-semibold text-md-sys-on-surface/60 flex items-center gap-1.5 min-w-0">
                        {icon} {title} {badge && <span className="text-label-sm opacity-60">{badge}</span>}
                    </span>
                    {indicator ? <div className="min-w-0 flex items-center gap-1">{indicator}</div> : null}
                </div>
            );
        }

        const isExpanded = expandedSection === id;
        return (
            <button
                onClick={() => toggleSection(id)}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-control transition-all ${isExpanded
                    ? 'mg-surface text-md-sys-primary ring-1 ring-md-sys-primary/20'
                    : isTransparent
                        ? 'md3-surface hover:bg-md-sys-on-surface/[0.08] text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
                        : 'md3-surface text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
                    }`}
            >
                <span className="text-label-sm font-semibold flex items-center gap-1.5 min-w-0">
                    {icon} {title} {badge && <span className="text-label-sm opacity-60">{badge}</span>}
                    {indicator ? <span className="min-w-0 flex items-center gap-1">{indicator}</span> : null}
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
        );
    };

    return (
        <div data-recording-panel="mission-intel" className={`${isTransparent ? 'bg-transparent p-0' : 'md3-card recording-inside-panel flex flex-col overflow-visible mg-surface shadow-lg p-4 gap-4'} h-full`}>
            {/* Header */}
            {!isTransparent && (
                <div className="recording-panel-header">
                    <div className="recording-panel-heading">
                        <span className="recording-panel-heading-icon">
                            <Layout size={12} />
                        </span>
                        <h3 className="recording-panel-heading-title">Mission Intel</h3>
                    </div>
                </div>
            )}

            <div className={`flex-1 flex flex-col ${accordionMode ? 'gap-1' : 'gap-4'} ${accordionMode ? '' : 'overflow-y-auto custom-scrollbar pr-1'}`}>
                {/* Time & Damage Section */}
                <div className="flex flex-col gap-2">
                    <SectionHeader id="stats" icon={<Clock size={12} />} title="Stats" />
                    {isSectionExpanded('stats') && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className={`${isTransparent ? 'mg-surface border border-md-sys-outline/10' : 'mg-surface border border-md-sys-outline/10'} ${accordionMode ? 'p-2' : 'p-3'} rounded-card flex flex-col items-center justify-center`}>
                                <Clock size={accordionMode ? 12 : 16} className="text-md-sys-on-surface/60 mb-0.5" />
                                <span className="text-label-sm font-semibold text-md-sys-on-surface/60 mb-0.5">Time</span>
                                <div className="flex items-center gap-0 relative z-10">
                                    <input
                                        type="number"
                                        placeholder="00"
                                        value={timeMin}
                                        onChange={(e) => setTimeMin(e.target.value)}
                                        className={`${accordionMode ? 'w-8 text-base' : 'w-12 text-lg'} font-bold tracking-tight outline-none text-center rounded-control py-0.5 placeholder:opacity-40 pointer-events-auto
                                            ${isTransparent ? 'bg-scrim-60 text-on-scrim border border-frost-10' : 'md3-textfield--compact text-md-sys-on-surface'}
                                            `}
                                    />
                                    <span className={`${accordionMode ? 'text-base' : 'text-xl'} font-bold tracking-tight text-md-sys-on-surface/60`}>:</span>
                                    <input
                                        type="number"
                                        placeholder="00"
                                        value={timeSec}
                                        onChange={(e) => setTimeSec(e.target.value)}
                                        className={`${accordionMode ? 'w-8 text-base' : 'w-12 text-lg'} font-bold tracking-tight outline-none text-center rounded-control py-0.5 placeholder:opacity-40 pointer-events-auto
                                            ${isTransparent ? 'bg-scrim-60 text-on-scrim border border-frost-10' : 'md3-textfield--compact text-md-sys-on-surface'}
                                            `}
                                    />
                                </div>
                            </div>
                            <div className={`relative ${isTransparent ? 'mg-surface border border-md-sys-outline/10' : 'mg-surface border border-md-sys-outline/10'} ${accordionMode ? 'p-2' : 'p-3'} rounded-card flex flex-col items-center justify-center`}>
                                {damageSource && damageSource !== 'manual' && (
                                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-info" title={`Auto-detected from ${damageSource}`} />
                                )}
                                <HeartCrack size={accordionMode ? 12 : 16} className="text-danger mb-0.5" />
                                <span className="text-label-sm font-semibold text-danger mb-0.5 text-center leading-tight">Damage in the last 2 minutes</span>
                                <div className="relative z-10">
                                    <input
                                        type="text"
                                        placeholder="0"
                                        maxLength={4}
                                        value={damageTaken}
                                        onChange={(e) => setDamageTaken(e.target.value.replace(/[^0-9]/g, ''))}
                                        className={`${accordionMode ? 'w-14 text-base' : 'w-20 text-lg'} font-bold outline-none text-center rounded-control py-0.5 placeholder:opacity-40 pointer-events-auto
                                            ${isTransparent ? 'bg-scrim-60 text-on-scrim border border-frost-10' : 'md3-textfield--compact text-md-sys-on-surface'}
                                            `}
                                    />
                                </div>
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
                                    className={`relative ${accordionMode ? 'h-10' : 'h-14'} rounded-card ${isTransparent ? 'mg-surface border border-md-sys-outline/10' : 'mg-surface border border-md-sys-outline/10'} flex items-center justify-center gap-1 select-none overflow-hidden cursor-pointer`}
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
                                    <span className={`${accordionMode ? 'text-lg' : 'text-2xl'} font-bold text-md-sys-on-surface`}>{item.val}</span>
                                    <span className="text-label-xs font-semibold text-md-sys-on-surface/60 uppercase">{item.label}</span>
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
                                                className={`relative ${accordionMode ? 'h-9' : 'h-11'} rounded-control transition-all select-none overflow-hidden ${isActive
                                                    ? 'mg-surface ring-1 ring-md-sys-primary/30'
                                                    : (isTransparent ? 'mg-surface border border-md-sys-outline/10 text-on-scrim' : 'mg-surface')
                                                    } cursor-pointer`}
                                            >
                                                <div
                                                    onClick={() => setWeapons({ ...weapons, [w]: Math.max(0, count - 1) })}
                                                    className="absolute inset-y-0 left-0 w-1/2 hover:bg-md-sys-on-surface/5 transition-colors z-10"
                                                />
                                                <div
                                                    onClick={() => setWeapons({ ...weapons, [w]: count + 1 })}
                                                    className="absolute inset-y-0 right-0 w-1/2 hover:bg-md-sys-on-surface/5 transition-colors z-10"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-between px-2.5 pointer-events-none">
                                                    <span className={`text-label-xs font-semibold uppercase truncate leading-tight ${isActive ? 'text-md-sys-primary' : 'text-md-sys-on-surface/60'}`}>
                                                        {w.replace('Cannon', '').replace('Scatter', 'Sct').replace('Spec Ops', 'SO')}
                                                    </span>
                                                    <span className={`${accordionMode ? 'text-label-sm' : 'text-body'} font-bold tabular-nums ${isActive ? 'text-md-sys-primary' : 'text-md-sys-on-surface/40'}`}>
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
                    const selectedCharacterWeapons = CHARACTER_WEAPONS.filter((w) => (weapons?.[w] || 0) > 0);
                    const selectedCharacterWeaponsLabel = selectedCharacterWeapons.length > 0
                        ? selectedCharacterWeapons.join(', ')
                        : 'None';

                    return (
                        <div className="flex flex-col gap-2">
                            <SectionHeader
                                id="charWeapons"
                                icon={<Crosshair size={12} />}
                                title="Char Weapons"
                                badge={`${totalWeapons}/${MAX_WEAPONS}`}
                                indicator={(
                                    <>
                                        <span className="text-label-xs font-semibold text-md-sys-on-surface/60 truncate max-w-180px">
                                            {selectedCharacterWeaponsLabel}
                                        </span>
                                        {telemetryProspectorWeapons.length > 0 && (
                                            <span className="px-1.5 py-0.5 rounded-pill text-label-xs font-bold uppercase tracking-wide bg-info/15 text-info">
                                                Auto
                                            </span>
                                        )}
                                    </>
                                )}
                            />
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
                                                    if (isActive) {
                                                        setWeapons({ ...weapons, [w]: 0 });
                                                    } else if (canAdd) {
                                                        setWeapons({ ...weapons, [w]: 1 });
                                                    }
                                                }}
                                                className={`relative ${accordionMode ? 'h-8' : 'h-10'} rounded-control transition-all select-none overflow-hidden
                                                    ${isActive
                                                        ? 'bg-weapon-soft ring-1 ring-weapon'
                                                        : canAdd
                                                            ? (isTransparent ? 'mg-surface border border-md-sys-outline/10 hover:bg-md-sys-on-surface/[0.08]' : 'mg-surface')
                                                            : (isTransparent ? 'bg-scrim-40 opacity-40' : 'mg-surface opacity-40')
                                                    }
                                                    ${isActive || canAdd ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                                    <span className={`text-label-sm font-semibold uppercase truncate ${isActive ? 'text-weapon' : 'text-md-sys-on-surface/60'}`}>
                                                        {w}
                                                    </span>
                                                    {isActive && (
                                                        <Check size={14} className="text-weapon" />
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
                    const selectedCharacterEquipment = CHARACTER_EQUIPMENT.filter((w) => (weapons?.[w] || 0) > 0);
                    const selectedCharacterEquipmentLabel = selectedCharacterEquipment.length > 0
                        ? selectedCharacterEquipment.join(', ')
                        : 'None';

                    return (
                        <div className="flex flex-col gap-2">
                            <SectionHeader
                                id="equipment"
                                icon={<Zap size={12} />}
                                title="Equipment"
                                badge={`${totalEquipment}/${MAX_EQUIPMENT}`}
                                indicator={(
                                    <>
                                        <span className="text-label-xs font-semibold text-md-sys-on-surface/60 truncate max-w-180px">
                                            {selectedCharacterEquipmentLabel}
                                        </span>
                                        {telemetryProspectorEquipment.length > 0 && (
                                            <span className="px-1.5 py-0.5 rounded-pill text-label-xs font-bold uppercase tracking-wide bg-info/15 text-info">
                                                Auto
                                            </span>
                                        )}
                                    </>
                                )}
                            />
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
                                                    // Equipment is always editable
                                                    if (isActive) {
                                                        setWeapons({ ...weapons, [w]: 0 });
                                                    } else if (canAdd) {
                                                        setWeapons({ ...weapons, [w]: 1 });
                                                    }
                                                }}
                                                className={`relative ${accordionMode ? 'h-8' : 'h-10'} rounded-control transition-all select-none overflow-hidden
                                                    ${isActive
                                                        ? 'bg-equipment-soft ring-1 ring-equipment'
                                                        : canAdd
                                                            ? (isTransparent ? 'mg-surface border border-md-sys-outline/10 hover:bg-md-sys-on-surface/[0.08]' : 'mg-surface')
                                                            : (isTransparent ? 'bg-scrim-40 opacity-40' : 'mg-surface opacity-40')
                                                    }
                                                    ${isActive || canAdd ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                                    <span className={`text-label-sm font-semibold uppercase truncate ${isActive ? 'text-equipment' : 'text-md-sys-on-surface/60'}`}>
                                                        {w}
                                                    </span>
                                                    {isActive && (
                                                        <Check size={14} className="text-equipment" />
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
                        <div className="flex items-center gap-1">
                            <SectionHeader id="modifiers" icon={<Zap size={12} />} title="Modifiers" badge={selectedReachModifiers.length > 0 ? `${selectedReachModifiers.length}` : undefined} />
                            {modifiersSource && modifiersSource !== 'manual' && (
                                <span className="w-2 h-2 rounded-full bg-info flex-shrink-0" title={`Auto-detected from ${modifiersSource}`} />
                            )}
                        </div>
                        {isSectionExpanded('modifiers') && (
                            <div className={`flex flex-wrap ${accordionMode ? 'gap-1' : 'gap-2'}`}>
                                {showArtifactSelect ? (
                                    <div className={`flex items-center gap-2 ${isTransparent ? 'bg-scrim-50' : 'mg-surface'} p-2 rounded-control w-full`}>
                                        {['Healing', 'Ice', 'Weapon'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => { toggleReachModifier(`Artifact: ${type}`); setShowArtifactSelect(false); }}
                                                className={`flex-1 md3-btn-tonal ${accordionMode ? 'px-2 py-1' : 'px-3 py-2'} text-label-sm font-bold uppercase bg-warning text-ink-strong hover:brightness-110`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setShowArtifactSelect(false)}
                                            className="md3-icon-btn"
                                            aria-label="Cancel artifact modifier selection"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setShowArtifactSelect(true)}
                                            className={`md3-chip ${accordionMode ? 'px-2 py-1' : 'px-3 py-2'} text-label-sm font-semibold transition-all ${selectedReachModifiers.some((m: string) => m.startsWith("Artifact"))
                                                ? 'artifact-btn-active ring-1 ring-amber-300/60 shadow-sm'
                                                : 'text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
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
                                                    className={`md3-chip ${accordionMode ? 'px-2 py-1' : 'px-3 py-2'} text-label-sm font-semibold transition-all ${selectedReachModifiers.includes(mod)
                                                        ? 'md3-chip--selected'
                                                        : 'text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
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
                        readOnly={false}
                        className={`w-full h-20 md3-textfield--outlined rounded-control p-3 text-body outline-none resize-none placeholder:text-md-sys-on-surface/40 
                        focus:ring-2 focus:ring-md-sys-primary/50`}
                    />
                )}
            </div>
        </div>
    );
};



import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, Filter, ChevronRight, Trophy, Skull, Minus,
    Clock, HeartCrack, Target, Image, Eye, X, Edit3, Check,
    ShieldCheck, Crosshair, Ship, Users, AlertTriangle, FileText, ScanEye
} from 'lucide-react';
import { Match, SHIPS, getShipColor } from '../types';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { getMatchArtifactsStructured } from '../utils/artifactService';
import { LocalImage } from './LocalImage';

type ModeFilter = 'all' | 'Artifact Brawl' | 'Fleet Battle';

const RESULT_COLORS: Record<string, string> = {
    Win: 'bg-green-500',
    Loss: 'bg-red-500',
    Draw: 'bg-slate-500',
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
    ocr: { label: 'OCR', color: 'bg-blue-500/20 text-blue-400' },
    telemetry: { label: 'Telemetry', color: 'bg-purple-500/20 text-purple-400' },
    manual: { label: 'Manual', color: 'bg-amber-500/20 text-amber-400' },
};

export const MatchRecordingPage: React.FC = () => {
    const { matches, updateMatch } = useGameData();
    const { activeMode, setActiveView } = useUIState();

    const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [modeFilter, setModeFilter] = useState<ModeFilter>('all');

    // Select first match by default
    useEffect(() => {
        if (!selectedMatchId && matches.length > 0) {
            setSelectedMatchId(matches[0].id);
        }
    }, [matches, selectedMatchId]);

    const filteredMatches = useMemo(() => {
        let result = [...matches].sort((a, b) => b.timestamp - a.timestamp);

        if (modeFilter !== 'all') {
            result = result.filter(m => m.mode === modeFilter);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(m =>
                m.player?.toLowerCase().includes(q) ||
                m.hero?.toLowerCase().includes(q) ||
                m.ship?.toLowerCase().includes(q) ||
                m.teammates?.some(t => t.toLowerCase().includes(q)) ||
                m.opponents?.some(o => o.toLowerCase().includes(q)) ||
                m.killedBy?.toLowerCase().includes(q)
            );
        }

        return result;
    }, [matches, modeFilter, searchQuery]);

    const selectedMatch = useMemo(
        () => matches.find(m => m.id === selectedMatchId) || null,
        [matches, selectedMatchId]
    );

    return (
        <div className="h-full flex">
            {/* Left Panel — Match List */}
            <div className="w-80 flex-shrink-0 border-r border-md-sys-outline/5 flex flex-col bg-md-sys-surface1/50">
                {/* Search & Filter Bar */}
                <div className="p-3 border-b border-md-sys-outline/5 space-y-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40" />
                        <input
                            type="text"
                            placeholder="Search players, heroes, ships..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-md-sys-surface3 rounded-lg text-xs outline-none placeholder:opacity-40"
                        />
                    </div>
                    <div className="flex gap-1">
                        {(['all', 'Artifact Brawl', 'Fleet Battle'] as ModeFilter[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setModeFilter(mode)}
                                className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase transition-colors ${modeFilter === mode ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-on-surface/5 hover:bg-md-sys-on-surface/10 opacity-60'}`}
                            >
                                {mode === 'all' ? 'All' : mode}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Match List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredMatches.length === 0 ? (
                        <div className="p-4 text-center text-xs opacity-40">No matches found</div>
                    ) : (
                        filteredMatches.map(match => (
                            <MatchListItem
                                key={match.id}
                                match={match}
                                isSelected={match.id === selectedMatchId}
                                onClick={() => setSelectedMatchId(match.id)}
                            />
                        ))
                    )}
                </div>

                <div className="p-2 border-t border-md-sys-outline/5 text-center text-[10px] opacity-30 font-bold uppercase">
                    {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
                </div>
            </div>

            {/* Right Panel — Match Detail */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {selectedMatch ? (
                    <MatchDetail match={selectedMatch} onUpdate={updateMatch} onViewCaptures={() => setActiveView('smart-captures')} />
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center opacity-30">
                            <FileText size={48} className="mx-auto mb-3" />
                            <p className="text-sm font-bold">Select a match to view details</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─── Match List Item ─── */
const MatchListItem: React.FC<{
    match: Match;
    isSelected: boolean;
    onClick: () => void;
}> = ({ match, isSelected, onClick }) => {
    const totalKills = Object.values(match.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const hasArtifact = match.reachModifiers?.some(m => m.startsWith('Artifact:'));

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 border-b border-md-sys-outline/5 transition-colors flex items-center gap-2.5 ${isSelected ? 'bg-md-sys-primary/10 border-l-2 border-l-md-sys-primary' : 'hover:bg-md-sys-on-surface/5 border-l-2 border-l-transparent'}`}
        >
            {/* Result Badge */}
            <div className={`w-2 h-8 rounded-full flex-shrink-0 ${RESULT_COLORS[match.result] || 'bg-slate-500'}`} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black uppercase">{match.result}</span>
                    {match.subType && match.subType !== 'Combat' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-md-sys-on-surface/10 font-bold uppercase">{match.subType}</span>
                    )}
                    {hasArtifact && <span className="text-[9px]">Artifact</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                    {match.hero && <span className="text-[10px] opacity-60">{match.hero}</span>}
                    {match.hero && match.ship && <span className="text-[8px] opacity-30">-</span>}
                    {match.ship && <span className="text-[10px] opacity-60">{match.ship.split('(')[0].trim()}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] opacity-30">{new Date(match.timestamp).toLocaleDateString()}</span>
                    <span className="text-[9px] opacity-30">{new Date(match.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {totalKills > 0 && <span className="text-[9px] text-emerald-400/60">{totalKills}K</span>}
                </div>
            </div>

            <ChevronRight size={12} className="opacity-20 flex-shrink-0" />
        </button>
    );
};

/* ─── Match Detail Panel ─── */
const MatchDetail: React.FC<{
    match: Match;
    onUpdate: (m: Match) => void;
    onViewCaptures?: () => void;
}> = ({ match, onUpdate, onViewCaptures }) => {
    const [artifacts, setArtifacts] = useState<string[]>([]);
    const toDisplaySrc = (src: string) => {
        if (src.startsWith('data:') || src.startsWith('file://')) return src;
        return `file:///${src.replace(/\\/g, '/')}`;
    };
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [showRawOcr, setShowRawOcr] = useState(false);

    // Load artifacts when match changes
    useEffect(() => {
        setArtifacts([]);
        if (match.artifacts && match.artifacts.length > 0) {
            setArtifacts(match.artifacts);
        } else {
            getMatchArtifactsStructured(match.id).then(r => setArtifacts(r.images)).catch(() => {});
        }
    }, [match.id, match.artifacts]);

    const totalKills = Object.values(match.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);

    const startEdit = (field: string, currentValue: string) => {
        setEditingField(field);
        setEditValue(currentValue);
    };

    const saveEdit = useCallback((field: string) => {
        const updated = { ...match, [field]: editValue };
        onUpdate(updated);
        setEditingField(null);
    }, [match, editValue, onUpdate]);

    const renderEditableField = (field: string, value: string, label: string) => (
        <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold opacity-40 w-20">{label}</span>
            {editingField === field ? (
                <div className="flex items-center gap-1 flex-1">
                    <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(field); if (e.key === 'Escape') setEditingField(null); }}
                        className="flex-1 bg-md-sys-surface3 px-2 py-0.5 rounded text-xs outline-none"
                        autoFocus
                    />
                    <button onClick={() => saveEdit(field)} className="p-0.5 hover:text-green-400"><Check size={12} /></button>
                    <button onClick={() => setEditingField(null)} className="p-0.5 hover:text-red-400"><X size={12} /></button>
                </div>
            ) : (
                <div className="flex items-center gap-1 flex-1 group cursor-pointer" onClick={() => startEdit(field, value || '')}>
                    <span className="text-xs">{value || <span className="opacity-30 italic">--</span>}</span>
                    <Edit3 size={10} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
            )}
        </div>
    );

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-4">
                <div className={`px-3 py-1.5 rounded-xl text-sm font-black uppercase ${RESULT_COLORS[match.result]} text-white`}>
                    {match.result}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {match.hero && <span className="text-sm font-bold">{match.hero}</span>}
                        {match.ship && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: getShipColor(match.ship) + '30', color: getShipColor(match.ship) }}>
                                {match.ship}
                            </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-md-sys-on-surface/5 font-bold uppercase">{match.mode}</span>
                        {match.subType && match.subType !== 'Combat' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-bold">{match.subType}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] opacity-40">
                        <span>{new Date(match.timestamp).toLocaleString()}</span>
                        <span>ID: {match.id}</span>
                    </div>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-4 gap-2">
                <StatCard icon={<Clock size={14} />} label="Time" value={match.time || '--'} />
                <StatCard icon={<HeartCrack size={14} className="text-rose-400" />} label="Damage" value={match.damageTaken?.toString() || '0'} />
                <StatCard icon={<Target size={14} className="text-emerald-400" />} label="Kills" value={totalKills.toString()} />
                {match.placement && <StatCard icon={<Trophy size={14} className="text-yellow-400" />} label="Place" value={`#${match.placement}`} />}
            </div>

            {/* Kill Breakdown */}
            {totalKills > 0 && (
                <Section title="Kill Breakdown" icon={<Crosshair size={14} />}>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(match.kills || {}).filter(([, v]) => v > 0).map(([ship, count]) => (
                            <div key={ship} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-md-sys-surface3 text-xs">
                                <span className="font-bold">{count}</span>
                                <span className="opacity-60">{ship}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Screenshots */}
            {artifacts.length > 0 && (
                <Section title="Screenshots" icon={<Image size={14} />}>
                    <div className="grid grid-cols-3 gap-2">
                        {artifacts.map((src, i) => (
                            <button
                                key={i}
                                onClick={() => setLightboxSrc(src)}
                                className="relative aspect-video bg-md-sys-surface3 rounded-lg overflow-hidden group"
                            >
                                <LocalImage
                                    src={src}
                                    alt={`Screenshot ${i + 1}`}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Eye size={20} />
                                </div>
                            </button>
                        ))}
                    </div>
                    {onViewCaptures && (
                        <button
                            onClick={onViewCaptures}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-md-sys-primary hover:underline"
                        >
                            <ScanEye size={12} /> View in Smart Captures
                        </button>
                    )}
                </Section>
            )}

            {/* Editable Fields */}
            <Section title="Match Details" icon={<Edit3 size={14} />}>
                <div className="space-y-2">
                    {renderEditableField('hero', match.hero, 'Hero')}
                    {renderEditableField('ship', match.ship, 'Ship')}
                    {renderEditableField('killedBy', match.killedBy || '', 'Killed By')}
                    {renderEditableField('killedByShip', match.killedByShip || '', 'Killer Ship')}
                    {renderEditableField('artifactSource', match.artifactSource || '', 'Artifact')}
                    {renderEditableField('notes', match.notes || '', 'Notes')}
                </div>
            </Section>

            {/* Teammates & Opponents */}
            {(match.teammates?.length > 0 || match.opponents?.length > 0) && (
                <Section title="Players" icon={<Users size={14} />}>
                    {match.teammates?.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[10px] uppercase font-bold opacity-40 block mb-1">Teammates</span>
                            <div className="flex flex-wrap gap-1">
                                {match.teammates.map(t => (
                                    <span key={t} className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded-md text-xs font-bold">{t}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {match.opponents?.length > 0 && (
                        <div>
                            <span className="text-[10px] uppercase font-bold opacity-40 block mb-1">Opponents</span>
                            <div className="flex flex-wrap gap-1">
                                {match.opponents.map(o => (
                                    <span key={o} className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-md text-xs font-bold">{o}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {/* Killed By Section */}
            {match.killedBy && (
                <Section title="Killed By" icon={<Skull size={14} />}>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{match.killedBy}</span>
                        {match.killedByShip && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">{match.killedByShip}</span>
                        )}
                    </div>
                </Section>
            )}

            {/* Reach Modifiers */}
            {match.reachModifiers?.length > 0 && (
                <Section title="Modifiers" icon={<AlertTriangle size={14} />}>
                    <div className="flex flex-wrap gap-1">
                        {match.reachModifiers.map((mod, i) => (
                            <span key={i} className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md text-xs font-bold">{mod}</span>
                        ))}
                    </div>
                </Section>
            )}

            {/* POI Objectives */}
            {(match.poiEasy || match.poiMedium || match.poiEpic) ? (
                <Section title="POI Objectives" icon={<Target size={14} />}>
                    <div className="flex gap-3">
                        {match.poiEasy ? <POIBadge label="Easy" count={match.poiEasy} color="bg-emerald-500" /> : null}
                        {match.poiMedium ? <POIBadge label="Med" count={match.poiMedium} color="bg-amber-500" /> : null}
                        {match.poiEpic ? <POIBadge label="Epic" count={match.poiEpic} color="bg-purple-500" /> : null}
                    </div>
                </Section>
            ) : null}

            {/* Timeline Events */}
            {match.timelineEvents && match.timelineEvents.length > 0 && (
                <Section title="Timeline" icon={<Clock size={14} />}>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {match.timelineEvents.map((evt: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="text-[9px] opacity-30 w-16 flex-shrink-0">
                                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-md-sys-on-surface/5 text-[9px] font-bold uppercase">{evt.type}</span>
                                <span className="opacity-60">{evt.label}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* OCR Debug Info */}
            {(match.ocrDebug || (match.artifacts && match.artifacts.length > 0)) && (
                <Section title="OCR Metadata" icon={<ShieldCheck size={14} />}>
                    <div className="space-y-2 text-xs">
                        {match.artifacts && match.artifacts.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="opacity-40">Artifacts:</span>
                                <span className="font-bold">{match.artifacts.length} screenshot{match.artifacts.length !== 1 ? 's' : ''}</span>
                            </div>
                        )}
                        {match.ocrDebug && (
                            <>
                                <div className="flex flex-wrap gap-3">
                                    {match.ocrDebug.confidence != null && (
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-40">Confidence:</span>
                                            <span className={`font-bold ${match.ocrDebug.confidence >= 80 ? 'text-green-400' : match.ocrDebug.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {Math.round(match.ocrDebug.confidence)}%
                                            </span>
                                        </div>
                                    )}
                                    {match.ocrDebug.source && (
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-40">Source:</span>
                                            <span className="font-bold uppercase text-[10px]">{match.ocrDebug.source}</span>
                                        </div>
                                    )}
                                </div>
                                {match.ocrDebug.mergeStats && (
                                    <div className="grid grid-cols-3 gap-1 text-[9px] font-mono opacity-60">
                                        <span>agreed: {match.ocrDebug.mergeStats.agreed}</span>
                                        <span>cloud: {match.ocrDebug.mergeStats.cloudPreferred}</span>
                                        <span>local: {match.ocrDebug.mergeStats.localOnly}</span>
                                        <span>cloudOnly: {match.ocrDebug.mergeStats.cloudOnly}</span>
                                        <span>conflicts: {match.ocrDebug.mergeStats.conflicts}</span>
                                        <span>total: {match.ocrDebug.mergeStats.total}</span>
                                    </div>
                                )}
                                {match.ocrDebug.rawText && (
                                    <details className="mt-1">
                                        <summary className="text-[10px] opacity-40 cursor-pointer hover:opacity-60">Raw OCR Text</summary>
                                        <pre className="mt-1 p-2 bg-black/30 rounded-lg text-[9px] font-mono opacity-60 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                                            {match.ocrDebug.rawText}
                                        </pre>
                                    </details>
                                )}
                            </>
                        )}
                    </div>
                </Section>
            )}

            {/* Lightbox */}
            {lightboxSrc && (
                <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
                    <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 text-white/50 hover:text-white">
                        <X size={24} />
                    </button>
                    <LocalImage src={lightboxSrc} alt="Screenshot" className="max-w-full max-h-full object-contain rounded-lg" />
                </div>
            )}
        </div>
    );
};

/* ─── Reusable sub-components ─── */
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-md-sys-surface2 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
            <span className="opacity-40">{icon}</span>
            <span className="text-[10px] uppercase font-bold opacity-50 tracking-wider">{title}</span>
        </div>
        {children}
    </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="bg-md-sys-surface2 rounded-xl p-2.5 flex flex-col items-center gap-0.5">
        <span className="opacity-40">{icon}</span>
        <span className="text-[9px] uppercase font-bold opacity-40">{label}</span>
        <span className="text-sm font-black">{value}</span>
    </div>
);

const POIBadge: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
    <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-bold">{count}</span>
        <span className="text-[9px] opacity-40 uppercase">{label}</span>
    </div>
);

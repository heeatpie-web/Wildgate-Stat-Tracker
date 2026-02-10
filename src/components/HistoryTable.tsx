import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Match, Language, DrillDownTarget } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { Trash2, Edit2, Pin, ChevronDown, ChevronUp, Clock, Image as ImageIcon, Download, ArrowUpDown, Users, Swords, X, FileText, Share2, Save, Ghost } from 'lucide-react';
import html2canvas from 'html2canvas';

import { EditMatchModal } from './EditMatchModal';

import { useGameData } from '../providers/GameDataProvider';
import { LocalImage } from './LocalImage';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';

interface HistoryTableProps {
    // No props needed
}

const timeAgo = (timestamp: number, nowMs: number): string => {
    if (!timestamp) return '';
    const seconds = Math.floor((nowMs - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
};

const HistoryTable: React.FC<HistoryTableProps> = () => {
    const { matches, deleteMatch: onDelete, updateMatch: onEdit, toggleMatchPin: onPin, setDrillDownTarget } = useGameData();
    const { language, visualMode } = useUserPreferences();
    const isLegacy = visualMode === 'dense';

    const onDrillDown = (name: string, type: DrillDownTarget['type']) => {
        setDrillDownTarget({ name, type });
    };

    const t = TRANSLATIONS[language];
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<keyof Match | 'timeAgo'>('timestamp');
    const [sortDesc, setSortDesc] = useState(true);
    const [selectedMatches, setSelectedMatches] = useState<number[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState<number | 'Infinity'>(10);
    const [renderAll, setRenderAll] = useState(false);
    const [nowTick, setNowTick] = useState(Date.now());

    const [selectedMatchForDetails, setSelectedMatchForDetails] = useState<Match | null>(null);
    const [editingNoteMatch, setEditingNoteMatch] = useState<Match | null>(null);
    const [editingMatch, setEditingMatch] = useState<Match | null>(null);
    const [noteText, setNoteText] = useState("");

    useEffect(() => {
        const t = setTimeout(() => setSearchTerm(searchInput.trim()), 200);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => setCurrentPage(1), [searchTerm, itemsPerPage]);

    useEffect(() => {
        setRenderAll(false);
    }, [searchTerm, itemsPerPage, sortField, sortDesc]);

    useEffect(() => {
        const interval = setInterval(() => setNowTick(Date.now()), 60000);
        return () => clearInterval(interval);
    }, []);

    const filteredMatches = useMemo(() => matches.filter(m => {
        const term = searchTerm.toLowerCase();
        const player = m.player?.toLowerCase() || '';
        const ship = m.ship?.toLowerCase() || '';
        const hero = m.hero?.toLowerCase() || '';
        const result = m.result?.toLowerCase() || '';
        const subType = m.subType?.toLowerCase() || '';
        const note = m.notes?.toLowerCase() || '';

        return (
            player.includes(term) ||
            ship.includes(term) ||
            hero.includes(term) ||
            result.includes(term) ||
            subType.includes(term) ||
            note.includes(term) ||
            (m.teammates || []).some(t => t.toLowerCase().includes(term)) ||
            (m.opponents || []).some(o => o.toLowerCase().includes(term)) ||
            (m.reachModifiers || []).some(r => r.toLowerCase().includes(term))
        );
    }), [matches, searchTerm]);

    const sortedMatches = useMemo(() => {
        const sortFn = (a: Match, b: Match) => {
            let valA: any, valB: any;
            if (sortField === 'timeAgo') {
                valA = a['timestamp'] || 0;
                valB = b['timestamp'] || 0;
            } else if (sortField === 'time') {
                const timeToSec = (t?: string) => {
                    if (!t) return 0;
                    const parts = t.split(':').map(Number);
                    return (parts[0] || 0) * 60 + (parts[1] || 0);
                };
                valA = timeToSec(a.time);
                valB = timeToSec(b.time);
            } else {
                valA = a[sortField] || 0;
                valB = b[sortField] || 0;
            }
            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        };

        const pinned = filteredMatches.filter(m => m.isPinned).sort(sortFn);
        const unpinned = filteredMatches.filter(m => !m.isPinned).sort(sortFn);

        return [...pinned, ...unpinned];
    }, [filteredMatches, sortField, sortDesc]);

    const shouldLimitAll = itemsPerPage === 'Infinity' && sortedMatches.length > 500 && !renderAll;
    const effectiveAllList = shouldLimitAll ? sortedMatches.slice(0, 500) : sortedMatches;

    const paginatedMatches = useMemo(() => {
        if (itemsPerPage === 'Infinity') return effectiveAllList;
        const start = (currentPage - 1) * (itemsPerPage as number);
        return sortedMatches.slice(start, start + (itemsPerPage as number));
    }, [sortedMatches, effectiveAllList, currentPage, itemsPerPage]);

    const timeAgoMap = useMemo(() => {
        const map = new Map<number, string>();
        filteredMatches.forEach(m => map.set(m.id, timeAgo(m.timestamp, nowTick)));
        return map;
    }, [filteredMatches, nowTick]);

    const handleSort = (field: keyof Match | 'timeAgo') => {
        if (sortField === field) setSortDesc(!sortDesc);
        else { setSortField(field); setSortDesc(true); }
    };

    const toggleSelection = (id: number) => {
        setSelectedMatches(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleDelete = (id: number) => {
        if (window.confirm("Are you sure you want to delete this match record? This cannot be undone.")) {
            onDelete(id);
        }
    };

    const handleOpenNote = (match: Match) => {
        setEditingNoteMatch(match);
        setNoteText(match.notes || "");
    };

    const handleSaveNote = () => {
        if (editingNoteMatch) {
            onEdit({ ...editingNoteMatch, notes: noteText });
            setEditingNoteMatch(null);
        }
    };

    const handleExportJPG = async () => {
        if (selectedMatches.length === 0) return;
        const targetMatches = sortedMatches.filter(m => selectedMatches.includes(m.id));

        const styles = getComputedStyle(document.body);
        const mdBackground = styles.getPropertyValue('--md-sys-color-background').trim() || 'var(--md-sys-color-background)';
        const mdSurface = styles.getPropertyValue('--md-sys-color-surface').trim() || 'var(--md-sys-color-surface)';
        const mdOutline = styles.getPropertyValue('--md-sys-color-outline-variant').trim() || 'var(--md-sys-color-outline-variant)';
        const mdOnSurface = styles.getPropertyValue('--md-sys-color-on-surface').trim() || 'var(--md-sys-color-on-surface)';
        const mdSuccess = styles.getPropertyValue('--color-success').trim() || 'var(--color-success)';
        const mdDanger = styles.getPropertyValue('--color-danger').trim() || 'var(--color-danger)';
        const mdNeutral = styles.getPropertyValue('--md-sys-color-on-surface-variant').trim() || 'var(--md-sys-color-on-surface-variant)';

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = '600px';
        container.style.backgroundColor = mdBackground;
        container.style.padding = '40px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '20px';
        container.style.fontFamily = 'sans-serif';
        document.body.appendChild(container);

        targetMatches.forEach(m => {
            const isWin = m.result === 'Win';
            const color = isWin ? mdSuccess : (m.result === 'Loss' ? mdDanger : mdNeutral);

            const teammatesStr = (m.teammates && m.teammates.length > 0) ? `with ${m.teammates.join(', ')}` : '';

            const card = document.createElement('div');
            const root = document.createElement('div');
            root.style.background = mdSurface;
            root.style.padding = '24px';
            root.style.borderRadius = '24px';
            root.style.border = `1px solid ${mdOutline}`;
            root.style.color = mdOnSurface;
            root.style.display = 'flex';
            root.style.justifyContent = 'space-between';
            root.style.alignItems = 'center';
            root.style.position = 'relative';
            root.style.overflow = 'hidden';

            const leftBar = document.createElement('div');
            leftBar.style.position = 'absolute';
            leftBar.style.left = '0';
            leftBar.style.top = '0';
            leftBar.style.bottom = '0';
            leftBar.style.width = '6px';
            leftBar.style.background = color;
            root.appendChild(leftBar);

            const glow = document.createElement('div');
            glow.style.position = 'absolute';
            glow.style.right = '-20px';
            glow.style.bottom = '-20px';
            glow.style.width = '100px';
            glow.style.height = '100px';
            glow.style.borderRadius = '50%';
            glow.style.background = color;
            glow.style.opacity = '0.1';
            glow.style.filter = 'blur(20px)';
            root.appendChild(glow);

            const leftBlock = document.createElement('div');
            const missionLabel = document.createElement('div');
            missionLabel.style.fontSize = '10px';
            missionLabel.style.fontWeight = '900';
            missionLabel.style.textTransform = 'uppercase';
            missionLabel.style.letterSpacing = '2px';
            missionLabel.style.opacity = '0.5';
            missionLabel.style.marginBottom = '4px';
            missionLabel.textContent = 'Mission Report';
            leftBlock.appendChild(missionLabel);

            const result = document.createElement('div');
            result.style.fontSize = '32px';
            result.style.fontWeight = '900';
            result.style.textTransform = 'uppercase';
            result.style.letterSpacing = '-1px';
            result.style.color = color;
            result.textContent = m.result || '';
            leftBlock.appendChild(result);

            const shipHero = document.createElement('div');
            shipHero.style.fontSize = '12px';
            shipHero.style.fontWeight = '700';
            shipHero.style.opacity = '0.8';
            shipHero.style.marginTop = '4px';
            shipHero.textContent = `${(m.ship || '').split('(')[0]} - ${m.hero || ''}`;
            leftBlock.appendChild(shipHero);

            if (teammatesStr) {
                const teammates = document.createElement('div');
                teammates.style.fontSize = '10px';
                teammates.style.fontWeight = '500';
                teammates.style.opacity = '0.5';
                teammates.style.marginTop = '2px';
                teammates.textContent = teammatesStr;
                leftBlock.appendChild(teammates);
            }
            root.appendChild(leftBlock);

            const rightBlock = document.createElement('div');
            rightBlock.style.textAlign = 'right';
            const damage = document.createElement('div');
            damage.style.fontSize = '24px';
            damage.style.fontWeight = '900';
            damage.textContent = String(m.damageTaken || 0);
            rightBlock.appendChild(damage);

            const damageLabel = document.createElement('div');
            damageLabel.style.fontSize = '10px';
            damageLabel.style.fontWeight = '700';
            damageLabel.style.opacity = '0.5';
            damageLabel.style.textTransform = 'uppercase';
            damageLabel.textContent = 'Damage Taken';
            rightBlock.appendChild(damageLabel);

            const time = document.createElement('div');
            time.style.marginTop = '8px';
            time.style.fontSize = '14px';
            time.style.fontWeight = '700';
            time.style.fontFamily = 'monospace';
            time.textContent = m.time || '--:--';
            rightBlock.appendChild(time);

            root.appendChild(rightBlock);
            card.appendChild(root);
            container.appendChild(card);
        });

        try {
            const canvas = await html2canvas(container, { backgroundColor: mdBackground });
            const link = document.createElement('a');
            link.download = `wildgate-export-${Date.now()}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (e) {
            alert("Export failed.");
        }
        document.body.removeChild(container);
    };

    return (
        <div data-tour="view-history" className="w-full flex flex-col gap-3 animate-slide-up">
            <div className="md3-card !p-0 overflow-hidden border border-md-sys-outline/10">
                <div className="history-toolbar p-4 flex flex-col gap-3 border-b border-md-sys-outline/10">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-md-sys-primary/30 to-md-sys-tertiary/30 border border-md-sys-outline/20 flex items-center justify-center">
                                <Clock size={16} className="text-md-sys-primary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-extrabold tracking-tight text-md-sys-on-surface">Match History</h2>
                                <p className="text-xs text-md-sys-on-surface/60 font-semibold uppercase tracking-[0.10em]">
                                    {sortedMatches.length} Missions Logged
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search player, ship, hero, note..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    className="md3-textfield--outlined pl-3 pr-3 py-2 text-xs font-semibold outline-none text-md-sys-on-surface w-full sm:w-72 transition-all rounded-xl"
                                />
                            </div>
                            {selectedMatches.length > 0 && (
                                <button onClick={handleExportJPG} title="Export selection as JPG" className="md3-btn-tonal px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] inline-flex items-center gap-2 rounded-xl">
                                    <ImageIcon size={14} />
                                    Export {selectedMatches.length}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="uppercase tracking-wider text-[10px] font-bold opacity-60">Rows</span>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => setItemsPerPage(e.target.value === 'Infinity' ? 'Infinity' : Number(e.target.value))}
                                className="md3-textfield--outlined px-2.5 py-1.5 outline-none transition-all cursor-pointer rounded-lg text-xs font-semibold"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={40}>40</option>
                                <option value="Infinity">All</option>
                            </select>
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                                {itemsPerPage === 'Infinity' ? `Showing ${shouldLimitAll ? 'First 500 of' : 'All'} ${sortedMatches.length}` : `Page ${currentPage} / ${Math.ceil(sortedMatches.length / (itemsPerPage as number)) || 1}`}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                disabled={currentPage === 1 || itemsPerPage === 'Infinity'}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                className="md3-btn-outlined px-4 py-1.5 disabled:opacity-30 transition-all font-bold uppercase text-[10px] tracking-wider rounded-lg"
                            >
                                Prev
                            </button>
                            <button
                                disabled={itemsPerPage === 'Infinity' || currentPage >= Math.ceil(sortedMatches.length / (itemsPerPage as number))}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="md3-btn-tonal px-4 py-1.5 disabled:opacity-30 transition-all font-bold uppercase text-[10px] tracking-wider rounded-lg"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {shouldLimitAll && (
                    <div className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest ${isLegacy ? 'bg-amber-500/10 text-amber-400' : 'md3-surface-high text-md-sys-on-surface/70'} border-b border-md-sys-outline/10 flex items-center justify-between`}>
                        Rendering is capped at 500 rows for performance.
                        <button
                            onClick={() => setRenderAll(true)}
                            className="md3-btn-tonal px-3 py-1 rounded-lg"
                        >
                            Render All
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse history-table">
                        <thead className="sticky top-0 z-10">
                            <tr className={`${isLegacy ? 'md3-surface-high text-md-sys-on-surface/70' : 'md3-surface-variant text-md-sys-on-surface/75'} text-[10px] font-extrabold uppercase tracking-[0.10em] border-b border-md-sys-outline/10`}>
                                <th className="w-2 p-0"></th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('result')}>
                                    <span className="inline-flex items-center gap-1">Outcome <ArrowUpDown size={11} /></span>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('timeAgo')}>
                                    <span className="inline-flex items-center gap-1">Time <ArrowUpDown size={11} /></span>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('ship')}>
                                    <span className="inline-flex items-center gap-1">Ship / Hero <ArrowUpDown size={11} /></span>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('time')}>
                                    <span className="inline-flex items-center gap-1">Duration <ArrowUpDown size={11} /></span>
                                </th>
                                <th className="p-4">Teammates</th>
                                <th className="p-4">Opponents</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-semibold text-md-sys-on-surface">
                            {sortedMatches.length === 0 ? (
                                <tr>
                                    <td colSpan={8}>
                                        <div className="flex flex-col items-center justify-center py-24 opacity-45">
                                            <Ghost size={60} className="mb-4 text-md-sys-primary animate-pulse" />
                                            <h3 className="text-xl font-extrabold tracking-tight">No Flight Logs Found</h3>
                                            <p className="text-xs font-semibold mt-2 text-md-sys-on-surface/60">Record a mission to populate your command log.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedMatches.map(m => {
                                    const isWin = m.result === 'Win';
                                    const isLoss = m.result === 'Loss';
                                    const rowBg = isLegacy
                                        ? (isWin ? 'bg-success-soft/55 hover:bg-success-soft-strong/65' : (isLoss ? 'bg-danger-soft/50 hover:bg-danger-soft-strong/60' : 'bg-info-soft/50 hover:bg-info-soft-strong/60'))
                                        : 'hover:bg-md-sys-on-surface/[0.04]';

                                    return (
                                        <tr key={m.id} onClick={() => setSelectedMatchForDetails(m)} className={`border-b border-md-sys-outline/10 transition-all duration-150 group ${rowBg} cursor-pointer relative`}>
                                            <td className="w-1.5 p-0 relative">
                                                <div className={`absolute inset-y-0 left-0 w-1.5 ${isWin ? 'bg-success' : (isLoss ? 'bg-danger' : 'bg-info')}`} />
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-tight w-fit ${isWin ? 'bg-success-soft text-success' : (isLoss ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info')}`}>
                                                        {m.result}
                                                    </span>
                                                    <span className="text-[10px] opacity-55 font-semibold ml-0.5">{m.subType || 'Combat'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-xs font-semibold opacity-70">{timeAgoMap.get(m.id) || ''}</div>
                                                <div className="text-[10px] opacity-45 font-medium">{new Date(m.timestamp).toLocaleDateString()}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{(m.ship || 'Unknown').split('(')[0]}</span>
                                                    <span className="text-[11px] opacity-60">{m.hero || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 font-mono text-xs tracking-wide opacity-85">{m.time || '--:--'}</td>
                                            <td className="p-4 text-xs max-w-[190px] truncate">
                                                {(m.teammates && m.teammates.length > 0) ? m.teammates.map((t, i) => (
                                                    <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(t, 'Teammate'); }} className="hover:underline hover:text-md-sys-primary cursor-pointer">
                                                        {t}{i < m.teammates.length - 1 ? ', ' : ''}
                                                    </span>
                                                )) : <span className="opacity-40 italic">None</span>}
                                            </td>
                                            <td className="p-4 text-xs max-w-[190px] truncate">
                                                {(m.opponents && m.opponents.length > 0) ? m.opponents.map((o, i) => (
                                                    <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(o, 'Opponent'); }} className="hover:underline hover:text-md-sys-error cursor-pointer">
                                                        {o}{i < m.opponents.length - 1 ? ', ' : ''}
                                                    </span>
                                                )) : <span className="opacity-40 italic">None</span>}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end items-center gap-1.5 opacity-45 group-hover:opacity-100 transition-opacity duration-150" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => setEditingMatch(m)} className="md3-icon-btn md3-icon-btn--small text-md-sys-on-surface/65 hover:text-md-sys-on-surface" title="Edit"><Edit2 size={13} /></button>
                                                    <button onClick={() => handleOpenNote(m)} className={`md3-icon-btn md3-icon-btn--small ${m.notes ? 'text-md-sys-primary' : 'text-md-sys-on-surface/65 hover:text-md-sys-on-surface'}`} title="Notes"><FileText size={13} className={m.notes ? 'fill-current' : ''} /></button>
                                                    <button onClick={() => onPin(m.id)} className={`md3-icon-btn md3-icon-btn--small ${m.isPinned ? 'bg-warning-soft text-warning' : 'text-md-sys-on-surface/65 hover:text-md-sys-on-surface'}`} title="Pin"><Pin size={13} className={m.isPinned ? 'fill-current' : ''} /></button>
                                                    <button onClick={() => handleDelete(m.id)} className="md3-icon-btn md3-icon-btn--small text-md-sys-on-surface/65 hover:text-md-sys-error" title="Delete"><Trash2 size={13} /></button>
                                                    <input type="checkbox" checked={selectedMatches.includes(m.id)} onChange={() => toggleSelection(m.id)} className="ml-2 w-4 h-4 rounded cursor-pointer accent-md-sys-primary" />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {editingMatch && <EditMatchModal match={editingMatch} onClose={() => setEditingMatch(null)} onSave={(m) => { onEdit(m); setEditingMatch(null); }} />}

            {editingNoteMatch && createPortal(
                <div className="fixed inset-0 md3-dialog-scrim z-[10000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingNoteMatch(null)}>
                    <div className="md3-dialog w-full max-w-md border border-md-sys-outline/20 history-dialog" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-extrabold tracking-tight">Mission Notes</h3>
                            <button onClick={() => setEditingNoteMatch(null)} className="md3-icon-btn"><X size={20} /></button>
                        </div>
                        <div className="md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.10em] opacity-60 mb-2">Match Details</div>
                            <div className="text-sm font-bold">{editingNoteMatch.result} | {(editingNoteMatch.ship || '').split('(')[0]} | {editingNoteMatch.hero}</div>
                            <div className="text-xs opacity-60 mt-1">{new Date(editingNoteMatch.timestamp).toLocaleString()}</div>
                        </div>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add notes about strategy, mistakes, or key moments..."
                            className="w-full h-32 md3-textfield--outlined rounded-2xl p-4 text-sm font-bold outline-none resize-none transition-all"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setEditingNoteMatch(null)} className="flex-1 md3-btn-outlined py-3 rounded-xl font-bold">Cancel</button>
                            <button onClick={handleSaveNote} className="flex-1 md3-btn-filled py-3 rounded-xl font-bold flex items-center justify-center gap-2"><Save size={16} /> Save Note</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {selectedMatchForDetails && createPortal(
                <div className="fixed inset-0 md3-dialog-scrim z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedMatchForDetails(null)}>
                    <div className="md3-dialog history-dialog w-full max-w-4xl border border-md-sys-outline/20 flex flex-col gap-5 animate-scale-in max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start border-b border-md-sys-outline/10 pb-4">
                            <div>
                                <div className="text-[10px] font-extrabold uppercase opacity-45 tracking-[0.14em] mb-1">Mission Report</div>
                                <h2 className="text-4xl font-black uppercase tracking-tight">{selectedMatchForDetails.result}</h2>
                                <div className={`text-sm font-extrabold uppercase tracking-[0.08em] ${selectedMatchForDetails.result === 'Win' ? 'text-success' : 'text-danger'}`}>{selectedMatchForDetails.subType || 'Combat'}</div>
                            </div>
                            <button onClick={() => setSelectedMatchForDetails(null)} className="md3-icon-btn"><X size={20} /></button>
                        </div>

                        {selectedMatchForDetails.notes && (
                            <div className="md3-surface p-6 rounded-xl border-l-4 border-md-sys-primary">
                                <div className="text-[10px] font-extrabold uppercase opacity-60 tracking-[0.08em] mb-2 flex items-center gap-2"><FileText size={12} /> Captain's Log</div>
                                <div className="text-sm font-medium italic opacity-80 leading-relaxed">"{selectedMatchForDetails.notes}"</div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md3-surface p-4 rounded-xl">
                                <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-60 mb-2">Pilot Loadout</div>
                                <div className="text-xl font-bold mb-1">{(selectedMatchForDetails.ship || 'Unknown').split('(')[0]}</div>
                                <div className="text-sm opacity-70 mb-2">{selectedMatchForDetails.hero}</div>

                                {/* New Loadout Display */}
                                {selectedMatchForDetails.loadout && (
                                    <div className="flex flex-col gap-2 mt-2">
                                        {selectedMatchForDetails.loadout.weapons.length > 0 && (
                                            <div>
                                                <div className="text-[9px] uppercase opacity-40 font-bold">Weapons</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {selectedMatchForDetails.loadout.weapons.map((w, i) => (
                                                        <span key={i} className="px-2 py-1 md3-surface-high rounded-lg text-[10px] font-bold uppercase border border-md-sys-outline/10 text-md-sys-primary">
                                                            {w}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {selectedMatchForDetails.loadout.equipment.length > 0 && (
                                            <div>
                                                <div className="text-[9px] uppercase opacity-40 font-bold">Equipment</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {selectedMatchForDetails.loadout.equipment.map((e, i) => (
                                                        <span key={i} className="px-2 py-1 md3-surface-high rounded-lg text-[10px] font-bold uppercase border border-md-sys-outline/5 opacity-80">
                                                            {e}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Legacy Fallback or Usage stats */}
                                {(!selectedMatchForDetails.loadout && selectedMatchForDetails.weapons && Object.keys(selectedMatchForDetails.weapons).length > 0) && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {Object.entries(selectedMatchForDetails.weapons).filter(([_, count]) => count > 0).map(([w, count]) => (
                                            <span key={w} className="px-2 py-1 md3-surface-high rounded-lg text-[10px] font-bold uppercase border border-md-sys-outline/10">
                                                {w} {count > 1 && <span className="text-md-sys-primary">x{count}</span>}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="md3-surface p-4 rounded-xl">
                                <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-60 mb-2">Performance</div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-xl font-bold">{selectedMatchForDetails.damageTaken || 0}</div>
                                        <div className="text-[10px] font-bold opacity-60">Damage Taken</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold">{selectedMatchForDetails.time || '--:--'}</div>
                                        <div className="text-[10px] font-bold opacity-60">Duration</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedMatchForDetails.kills && Object.values(selectedMatchForDetails.kills).some(v => v > 0) && (
                            <div className="md3-surface p-6 rounded-xl border border-md-sys-outline/5">
                                <div className="text-[10px] font-bold uppercase opacity-60 mb-4 flex items-center gap-2"><Swords size={12} /> Combat Record (Eliminations)</div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {Object.entries(selectedMatchForDetails.kills).filter(([_, count]) => count > 0).map(([ship, count]) => (
                                        <div key={ship} className={`p-3 rounded-2xl flex justify-between items-center ${ship === 'AI Legion' ? 'bg-accent-soft border border-accent-soft-strong' : 'md3-surface-low border border-md-sys-outline/5'}`}>
                                            <span className={`text-[10px] font-bold uppercase ${ship === 'AI Legion' ? 'text-accent' : 'opacity-60'}`}>{ship.split('(')[0]}</span>
                                            <span className={`text-lg font-bold ${ship === 'AI Legion' ? 'text-accent' : ''}`}>{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="md3-surface p-6 rounded-xl border border-md-sys-outline/10">
                            <div className="flex justify-between mb-4">
                                <div>
                                    <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-60 mb-2">Squadron</div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedMatchForDetails.teammates || []).length > 0 ? (selectedMatchForDetails.teammates || []).map(t => (
                                            <span key={t} onClick={() => onDrillDown?.(t, 'Teammate')} className="px-3 py-1 bg-info-soft text-info rounded-lg text-xs font-bold cursor-pointer hover:bg-info-soft-strong transition-colors">
                                                {t}
                                            </span>
                                        )) : <span className="opacity-40 text-xs italic">None</span>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-60 mb-2">Hostiles</div>
                                    <div className="flex flex-wrap gap-2 justify-end">
                                        {(selectedMatchForDetails.opponents || []).length > 0 ? (selectedMatchForDetails.opponents || []).map(t => (
                                            <span key={t} onClick={() => onDrillDown?.(t, 'Opponent')} className="px-3 py-1 bg-danger-soft text-danger rounded-lg text-xs font-bold cursor-pointer hover:bg-danger-soft-strong transition-colors">
                                                {t}
                                            </span>
                                        )) : <span className="opacity-40 text-xs italic">None</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedMatchForDetails.artifacts && selectedMatchForDetails.artifacts.length > 0 && (
                            <div className="md3-surface p-6 rounded-xl border border-md-sys-outline/5">
                                <div className="text-[10px] font-bold uppercase opacity-60 mb-4 flex items-center gap-2"><ImageIcon size={12} /> Visual Intel (Bundled Artifacts)</div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {selectedMatchForDetails.artifacts.map((src, i) => (
                                        <div key={i} className="aspect-video bg-black rounded-xl overflow-hidden border border-md-sys-outline/20 group relative cursor-pointer">
                                            <LocalImage src={src} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt={`Artifact ${i}`} />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white">
                                                    <Download size={16} />
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedMatchForDetails.reachModifiers && selectedMatchForDetails.reachModifiers.length > 0 && (
                            <div className="md3-surface p-4 rounded-xl">
                                <div className="text-[10px] font-bold uppercase opacity-60 mb-2">Modifiers & Artifacts</div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedMatchForDetails.reachModifiers.map(m => <span key={m} className="px-3 py-1 md3-surface-high rounded-lg text-xs font-bold border border-md-sys-outline/10">{m}</span>)}
                                </div>
                            </div>
                        )}

                        {/* Match Chronology (Timeline) */}
                        {selectedMatchForDetails.timelineEvents && selectedMatchForDetails.timelineEvents.length > 0 && (
                            <div className="md3-surface p-6 rounded-xl border border-md-sys-outline/5">
                                <div className="text-[10px] font-bold uppercase opacity-60 mb-4 flex items-center gap-2"><Clock size={12} /> Tactical Chronology</div>
                                <div className="space-y-3">
                                    {/* Mini Graph */}
                                    <div className="h-2 w-full md3-surface-high rounded-full relative overflow-visible mb-6 mx-2">
                                        {selectedMatchForDetails.timelineEvents.map((evt: any, idx: number) => {
                                            const matchStart = selectedMatchForDetails.timestamp;
                                            // Approximate duration from match time string (e.g. "12:34")
                                            const timeParts = (selectedMatchForDetails.time || "10:00").split(':').map(Number);
                                            const totalSec = (timeParts[0] || 0) * 60 + (timeParts[1] || 0);
                                            const durationMs = (totalSec || 600) * 1000;
                                            const relative = evt.timestamp - matchStart;
                                            const pct = Math.min(100, Math.max(0, (relative / durationMs) * 100));

                                            return (
                                                <div
                                                    key={idx}
                                                    className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm z-20 ${evt.type === 'kill' ? 'bg-success' : evt.type === 'death' ? 'bg-danger' : 'bg-info'}`}
                                                    style={{ left: `${pct}%` }}
                                                    title={`${evt.timeRelative}: ${evt.description}`}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
                                        {[...selectedMatchForDetails.timelineEvents].sort((a, b) => a.timestamp - b.timestamp).map((evt: any, idx: number) => (
                                            <div key={idx} className="flex gap-2 text-xs items-center p-2 md3-surface-high rounded-xl">
                                                <span className="font-mono text-md-sys-primary/60 font-medium shrink-0 w-8">{evt.timeRelative}</span>
                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${evt.type === 'kill' ? 'bg-success' : evt.type === 'death' ? 'bg-danger' : 'bg-info'}`} />
                                                <span className="text-md-sys-on-surface/90 flex-1 truncate">{evt.description}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="text-center text-[10px] font-mono opacity-30 uppercase tracking-widest mt-2">
                            ID: {selectedMatchForDetails.id} - {new Date(selectedMatchForDetails.timestamp).toLocaleString()}
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default HistoryTable;



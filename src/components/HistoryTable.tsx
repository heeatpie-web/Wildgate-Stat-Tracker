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
    const { language } = useUserPreferences();

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

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = '600px';
        container.style.backgroundColor = '#121212';
        container.style.padding = '40px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '20px';
        container.style.fontFamily = 'sans-serif';
        document.body.appendChild(container);

        targetMatches.forEach(m => {
            const isWin = m.result === 'Win';
            const color = isWin ? '#22c55e' : (m.result === 'Loss' ? '#ef4444' : '#94a3b8');

            const teammatesStr = (m.teammates && m.teammates.length > 0) ? `with ${m.teammates.join(', ')}` : '';

            const card = document.createElement('div');
            card.innerHTML = `
            <div style="background: #1e1e1e; padding: 24px; border-radius: 24px; border: 1px solid #333; color: white; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden;">
                <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: ${color};"></div>
                <div style="position: absolute; right: -20px; bottom: -20px; width: 100px; height: 100px; border-radius: 50%; background: ${color}; opacity: 0.1; filter: blur(20px);"></div>
                <div>
                    <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; opacity: 0.5; margin-bottom: 4px;">Mission Report</div>
                    <div style="font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; color: ${color};">${m.result}</div>
                    <div style="font-size: 12px; font-weight: 700; opacity: 0.8; margin-top: 4px;">${(m.ship || '').split('(')[0]} - ${m.hero}</div>
                    ${teammatesStr ? `<div style="font-size: 10px; font-weight: 500; opacity: 0.5; margin-top: 2px;">${teammatesStr}</div>` : ''}
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 24px; font-weight: 900;">${m.damageTaken || 0}</div>
                    <div style="font-size: 10px; font-weight: 700; opacity: 0.5; text-transform: uppercase;">Damage Taken</div>
                    <div style="margin-top: 8px; font-size: 14px; font-weight: 700; font-family: monospace;">${m.time || '--:--'}</div>
                </div>
            </div>
          `;
            container.appendChild(card);
        });

        try {
            const canvas = await html2canvas(container, { backgroundColor: '#121212' });
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
        <div data-tour="view-history" className="w-full flex flex-col gap-2 animate-slide-up">
            <div className="flex flex-col md:flex-row justify-between items-center gap-2">
                <h2 className="text-lg font-bold uppercase tracking-tight text-md-sys-on-surface">Match History</h2>
                <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="bg-md-sys-surface2 px-3 py-1.5 rounded-lg text-xs font-bold outline-none text-md-sys-on-surface border border-md-sys-outline/10 focus:border-md-sys-primary w-full md:w-56 transition-all"
                />
            </div>

            <div className="md-card !p-0 overflow-hidden shadow-lg border border-md-sys-outline/5 rounded-xl">
                <div className="p-2.5 bg-md-sys-surface2 flex flex-col md:flex-row justify-between items-center gap-2 text-xs font-bold text-md-sys-on-surface/60 border-b border-md-sys-outline/10">
                    <div className="flex items-center gap-2">
                        <span className="uppercase tracking-wider text-[10px]">Rows per page:</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(e.target.value === 'Infinity' ? 'Infinity' : Number(e.target.value))}
                            className="bg-md-sys-surface1 rounded-lg px-2 py-1 outline-none border-transparent focus:border-md-sys-primary border-2 transition-all cursor-pointer"
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={40}>40</option>
                            <option value="Infinity">All</option>
                        </select>
                    </div>
                    <div className="uppercase tracking-widest text-[10px] opacity-60">
                        {itemsPerPage === 'Infinity' ? `Showing ${shouldLimitAll ? 'First 500 of' : 'All'} ${sortedMatches.length} Missions` : `Page ${currentPage} of ${Math.ceil(sortedMatches.length / (itemsPerPage as number)) || 1} - ${sortedMatches.length} Missions`}
                    </div>
                    <div className="flex gap-2">
                        <button
                            disabled={currentPage === 1 || itemsPerPage === 'Infinity'}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="px-4 py-1.5 bg-md-sys-surface1 rounded-lg disabled:opacity-30 hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-all font-black uppercase text-[10px] tracking-wider"
                        >
                            Prev
                        </button>
                        <button
                            disabled={itemsPerPage === 'Infinity' || currentPage >= Math.ceil(sortedMatches.length / (itemsPerPage as number))}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="px-4 py-1.5 bg-md-sys-surface1 rounded-lg disabled:opacity-30 hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-all font-black uppercase text-[10px] tracking-wider"
                        >
                            Next
                        </button>
                    </div>
                </div>

                {shouldLimitAll && (
                    <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border-b border-md-sys-outline/10 flex items-center justify-between">
                        Rendering is capped at 500 rows for performance.
                        <button
                            onClick={() => setRenderAll(true)}
                            className="px-3 py-1 bg-amber-500/20 rounded-lg hover:bg-amber-500/30"
                        >
                            Render All
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-md-sys-surface2 text-[10px] font-black uppercase text-md-sys-on-surface/60 tracking-widest border-b border-md-sys-outline/10">
                                <th className="w-2 p-0"></th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('result')}>Outcome</th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('timeAgo')}>Time</th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('ship')}>Ship & Hero</th>
                                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('time')}>Duration</th>
                                <th className="p-4">Teammates</th>
                                <th className="p-4">Opponents</th>
                                <th className="p-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <span>Actions</span>
                                        {selectedMatches.length > 0 && <button onClick={handleExportJPG} title="Export Selection as JPG" className="p-1 bg-md-sys-primary rounded text-white opacity-50 hover:opacity-100"><ImageIcon size={12} /></button>}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-bold text-md-sys-on-surface">
                            {sortedMatches.length === 0 ? (
                                <tr>
                                    <td colSpan={8}>
                                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                                            <Ghost size={64} className="mb-4 text-md-sys-primary animate-pulse" />
                                            <h3 className="text-xl font-black uppercase tracking-widest">No Flight Logs Found</h3>
                                            <p className="text-xs font-bold mt-2">Start your engines, Commander.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedMatches.map(m => {
                                    const isWin = m.result === 'Win';
                                    const isLoss = m.result === 'Loss';
                                    const rowBg = isWin ? 'bg-green-500/10 hover:bg-green-500/15' : (isLoss ? 'bg-red-500/10 hover:bg-red-500/15' : 'bg-slate-500/10 hover:bg-slate-500/15');

                                    return (
                                        <tr key={m.id} onClick={() => setSelectedMatchForDetails(m)} className={`border-b border-md-sys-outline/5 transition-all duration-200 group ${rowBg} cursor-pointer relative`}>
                                            <td className="w-1 p-0 relative">
                                                <div className={`absolute inset-y-0 left-0 w-1 ${isWin ? 'bg-green-500/60' : (isLoss ? 'bg-red-500/60' : 'bg-slate-500/40')}`} />
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-tight w-fit ${isWin ? 'bg-green-500/20 text-green-400' : (isLoss ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400')}`}>
                                                        {m.result}
                                                    </span>
                                                    <span className="text-[10px] opacity-50 font-medium ml-0.5">{m.subType}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-xs opacity-60">{timeAgoMap.get(m.id) || ''}</td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span>{(m.ship || 'Unknown').split('(')[0]}</span>
                                                    <span className="text-[10px] opacity-50">{m.hero || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 font-mono opacity-80">{m.time || '--:--'}</td>
                                            <td className="p-4 text-xs max-w-[150px] truncate">
                                                {(m.teammates && m.teammates.length > 0) ? m.teammates.map((t, i) => (
                                                    <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(t, 'Teammate'); }} className="hover:underline hover:text-blue-400 cursor-pointer">
                                                        {t}{i < m.teammates.length - 1 ? ', ' : ''}
                                                    </span>
                                                )) : <span className="opacity-40 italic">None</span>}
                                            </td>
                                            <td className="p-4 text-xs max-w-[150px] truncate">
                                                {(m.opponents && m.opponents.length > 0) ? m.opponents.map((o, i) => (
                                                    <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(o, 'Opponent'); }} className="hover:underline hover:text-red-400 cursor-pointer">
                                                        {o}{i < m.opponents.length - 1 ? ', ' : ''}
                                                    </span>
                                                )) : <span className="opacity-40 italic">None</span>}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => setEditingMatch(m)} className="p-2 rounded-lg transition-all hover:bg-md-sys-surface3 text-md-sys-on-surface/60 hover:text-md-sys-on-surface" title="Edit"><Edit2 size={14} /></button>
                                                    <button onClick={() => handleOpenNote(m)} className={`p-2 rounded-lg transition-all ${m.notes ? 'text-md-sys-primary' : 'hover:bg-md-sys-surface3 text-md-sys-on-surface/60 hover:text-md-sys-on-surface'}`} title="Notes"><FileText size={14} className={m.notes ? 'fill-current' : ''} /></button>
                                                    <button onClick={() => handleDelete(m.id)} className="p-2 rounded-lg transition-all hover:bg-red-500/20 text-md-sys-on-surface/60 hover:text-red-400" title="Delete"><Trash2 size={14} /></button>
                                                    <button onClick={() => onPin(m.id)} className={`p-2 rounded-lg transition-all ${m.isPinned ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-md-sys-surface3 text-md-sys-on-surface/60 hover:text-md-sys-on-surface'}`} title="Pin"><Pin size={14} className={m.isPinned ? 'fill-current' : ''} /></button>
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
                <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingNoteMatch(null)}>
                    <div className="bg-md-sys-surface1 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-md-sys-outline/20 flex flex-col gap-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-black uppercase tracking-tight">Mission Notes</h3>
                            <button onClick={() => setEditingNoteMatch(null)}><X size={20} /></button>
                        </div>
                        <div className="bg-md-sys-surface2 p-4 rounded-2xl border border-md-sys-outline/10">
                            <div className="text-[10px] font-black uppercase opacity-60 mb-2">Match Details</div>
                            <div className="text-sm font-bold">{editingNoteMatch.result} - {(editingNoteMatch.ship || '').split('(')[0]} - {editingNoteMatch.hero}</div>
                            <div className="text-xs opacity-60 mt-1">{new Date(editingNoteMatch.timestamp).toLocaleString()}</div>
                        </div>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add notes about strategy, mistakes, or key moments..."
                            className="w-full h-32 bg-md-sys-surface2 rounded-2xl p-4 text-sm font-bold outline-none resize-none border border-transparent focus:border-md-sys-primary transition-all"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setEditingNoteMatch(null)} className="flex-1 py-3 rounded-xl font-black bg-md-sys-surface2 hover:bg-md-sys-surface3">Cancel</button>
                            <button onClick={handleSaveNote} className="flex-1 py-3 rounded-xl font-black bg-md-sys-primary text-md-sys-onPrimary hover:brightness-110 flex items-center justify-center gap-2"><Save size={16} /> Save Note</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {selectedMatchForDetails && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedMatchForDetails(null)}>
                    <div className="bg-md-sys-surface1 w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-md-sys-outline/20 flex flex-col gap-6 animate-scale-in max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="text-xs font-black uppercase opacity-40 tracking-widest mb-1">Mission Report</div>
                                <h2 className="text-4xl font-black uppercase tracking-tighter">{selectedMatchForDetails.result}</h2>
                                <div className={`text-sm font-bold ${selectedMatchForDetails.result === 'Win' ? 'text-green-500' : 'text-red-500'}`}>{selectedMatchForDetails.subType}</div>
                            </div>
                            <button onClick={() => setSelectedMatchForDetails(null)} className="p-3 bg-md-sys-surface2 rounded-full hover:bg-md-sys-surface3"><X size={20} /></button>
                        </div>

                        {selectedMatchForDetails.notes && (
                            <div className="bg-md-sys-surface2 p-6 rounded-xl border-l-4 border-md-sys-primary">
                                <div className="text-[10px] font-black uppercase opacity-60 mb-2 flex items-center gap-2"><FileText size={12} /> Captain's Log</div>
                                <div className="text-sm font-medium italic opacity-80 leading-relaxed">"{selectedMatchForDetails.notes}"</div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-md-sys-surface2 p-4 rounded-xl">
                                <div className="text-[10px] font-black uppercase opacity-60 mb-2">Pilot Loadout</div>
                                <div className="text-xl font-black mb-1">{(selectedMatchForDetails.ship || 'Unknown').split('(')[0]}</div>
                                <div className="text-sm opacity-70 mb-2">{selectedMatchForDetails.hero}</div>

                                {/* New Loadout Display */}
                                {selectedMatchForDetails.loadout && (
                                    <div className="flex flex-col gap-2 mt-2">
                                        {selectedMatchForDetails.loadout.weapons.length > 0 && (
                                            <div>
                                                <div className="text-[9px] uppercase opacity-40 font-bold">Weapons</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {selectedMatchForDetails.loadout.weapons.map((w, i) => (
                                                        <span key={i} className="px-2 py-1 bg-md-sys-surface3 rounded-lg text-[10px] font-black uppercase border border-md-sys-outline/10 text-md-sys-primary">
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
                                                        <span key={i} className="px-2 py-1 bg-md-sys-surface3 rounded-lg text-[10px] font-bold uppercase border border-md-sys-outline/5 opacity-80">
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
                                            <span key={w} className="px-2 py-1 bg-md-sys-surface3 rounded-lg text-[10px] font-black uppercase border border-md-sys-outline/10">
                                                {w} {count > 1 && <span className="text-md-sys-primary">x{count}</span>}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="bg-md-sys-surface2 p-4 rounded-xl">
                                <div className="text-[10px] font-black uppercase opacity-60 mb-2">Performance</div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-xl font-black">{selectedMatchForDetails.damageTaken || 0}</div>
                                        <div className="text-[10px] font-bold opacity-60">Damage Taken</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black">{selectedMatchForDetails.time || '--:--'}</div>
                                        <div className="text-[10px] font-bold opacity-60">Duration</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedMatchForDetails.kills && Object.values(selectedMatchForDetails.kills).some(v => v > 0) && (
                            <div className="bg-md-sys-surface2 p-6 rounded-xl border border-md-sys-outline/5">
                                <div className="text-[10px] font-black uppercase opacity-60 mb-4 flex items-center gap-2"><Swords size={12} /> Combat Record (Eliminations)</div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {Object.entries(selectedMatchForDetails.kills).filter(([_, count]) => count > 0).map(([ship, count]) => (
                                        <div key={ship} className={`p-3 rounded-2xl flex justify-between items-center ${ship === 'AI Legion' ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-md-sys-surface1 border border-md-sys-outline/5'}`}>
                                            <span className={`text-[10px] font-bold uppercase ${ship === 'AI Legion' ? 'text-purple-300' : 'opacity-60'}`}>{ship.split('(')[0]}</span>
                                            <span className={`text-lg font-black ${ship === 'AI Legion' ? 'text-purple-200' : ''}`}>{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="bg-md-sys-surface2 p-6 rounded-xl">
                            <div className="flex justify-between mb-4">
                                <div>
                                    <div className="text-[10px] font-black uppercase opacity-60 mb-2">Squadron</div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedMatchForDetails.teammates || []).length > 0 ? (selectedMatchForDetails.teammates || []).map(t => (
                                            <span key={t} onClick={() => onDrillDown?.(t, 'Teammate')} className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-bold cursor-pointer hover:bg-blue-500/40 transition-colors">
                                                {t}
                                            </span>
                                        )) : <span className="opacity-40 text-xs italic">None</span>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-black uppercase opacity-60 mb-2">Hostiles</div>
                                    <div className="flex flex-wrap gap-2 justify-end">
                                        {(selectedMatchForDetails.opponents || []).length > 0 ? (selectedMatchForDetails.opponents || []).map(t => (
                                            <span key={t} onClick={() => onDrillDown?.(t, 'Opponent')} className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-xs font-bold cursor-pointer hover:bg-red-500/40 transition-colors">
                                                {t}
                                            </span>
                                        )) : <span className="opacity-40 text-xs italic">None</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedMatchForDetails.artifacts && selectedMatchForDetails.artifacts.length > 0 && (
                            <div className="bg-md-sys-surface2 p-6 rounded-xl border border-md-sys-outline/5">
                                <div className="text-[10px] font-black uppercase opacity-60 mb-4 flex items-center gap-2"><ImageIcon size={12} /> Visual Intel (Bundled Artifacts)</div>
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
                            <div className="bg-md-sys-surface2 p-4 rounded-xl">
                                <div className="text-[10px] font-black uppercase opacity-60 mb-2">Modifiers & Artifacts</div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedMatchForDetails.reachModifiers.map(m => <span key={m} className="px-3 py-1 bg-md-sys-surface3 rounded-lg text-xs font-bold border border-md-sys-outline/10">{m}</span>)}
                                </div>
                            </div>
                        )}

                        {/* Match Chronology (Timeline) */}
                        {selectedMatchForDetails.timelineEvents && selectedMatchForDetails.timelineEvents.length > 0 && (
                            <div className="bg-md-sys-surface2 p-6 rounded-xl border border-md-sys-outline/5">
                                <div className="text-[10px] font-black uppercase opacity-60 mb-4 flex items-center gap-2"><Clock size={12} /> Tactical Chronology</div>
                                <div className="space-y-3">
                                    {/* Mini Graph */}
                                    <div className="h-2 w-full bg-md-sys-surface3 rounded-full relative overflow-visible mb-6 mx-2">
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
                                                    className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm z-20 ${evt.type === 'kill' ? 'bg-green-500' : evt.type === 'death' ? 'bg-red-500' : 'bg-blue-500'}`}
                                                    style={{ left: `${pct}%` }}
                                                    title={`${evt.timeRelative}: ${evt.description}`}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
                                        {[...selectedMatchForDetails.timelineEvents].sort((a, b) => a.timestamp - b.timestamp).map((evt: any, idx: number) => (
                                            <div key={idx} className="flex gap-2 text-xs items-center p-2 bg-md-sys-surface3/50 rounded-xl">
                                                <span className="font-mono text-md-sys-primary/60 font-medium shrink-0 w-8">{evt.timeRelative}</span>
                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${evt.type === 'kill' ? 'bg-green-500' : evt.type === 'death' ? 'bg-red-500' : 'bg-blue-500'}`} />
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

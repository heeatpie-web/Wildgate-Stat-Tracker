import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Match, Language, DrillDownTarget } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { Trash2, Edit2, Pin, ChevronDown, ChevronUp, Clock, Image as ImageIcon, Download, ArrowUpDown, Users, Swords, X, FileText, Share2, Save, Ghost, Trophy, TrendingUp, Flame, Search, ChevronLeft, ChevronRight, Zap, ScanEye, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import html2canvas from 'html2canvas';

import { EditMatchModal } from './EditMatchModal';

import { useGameData } from '../providers/GameDataProvider';
import { LocalImage } from './LocalImage';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { getMatchArtifactsStructured, rerunOCROnArtifact } from '../utils/artifactService';

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

const formatDayHeader = (timestamp: number): string => {
    const d = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
};

const HistoryTable: React.FC<HistoryTableProps> = () => {
    const { matches, deleteMatch: onDelete, updateMatch: onEdit, toggleMatchPin: onPin, setDrillDownTarget } = useGameData();
    const { language, uiStyle } = useUserPreferences();
    const { setActiveView, setSmartCapturesFocusMatchId, activeUser, setToast } = useUIState();
    const isLegacy = uiStyle === 'legacy';

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

    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkOcrBusy, setBulkOcrBusy] = useState(false);

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

    /* ── group paginated matches by day ── */
    const matchesByDay = useMemo(() => {
        const groups: { label: string; matches: Match[] }[] = [];
        let currentLabel = '';
        for (const m of paginatedMatches) {
            const label = formatDayHeader(m.timestamp);
            if (label !== currentLabel) {
                currentLabel = label;
                groups.push({ label, matches: [m] });
            } else {
                groups[groups.length - 1].matches.push(m);
            }
        }
        return groups;
    }, [paginatedMatches]);

    const handleSort = (field: keyof Match | 'timeAgo') => {
        if (sortField === field) setSortDesc(!sortDesc);
        else { setSortField(field); setSortDesc(true); }
    };

    const toggleSelection = (id: number) => {
        setSelectedMatches(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const selectAll = () => {
        const pageIds = paginatedMatches.map(m => m.id);
        const allSelected = pageIds.every(id => selectedMatches.includes(id));
        if (allSelected) {
            setSelectedMatches(prev => prev.filter(id => !pageIds.includes(id)));
        } else {
            setSelectedMatches(prev => [...new Set([...prev, ...pageIds])]);
        }
    };

    const handleDelete = (id: number) => {
        if (window.confirm("Are you sure you want to delete this match record? This cannot be undone.")) {
            onDelete(id);
        }
    };

    const handleBulkDelete = () => {
        selectedMatches.forEach(id => onDelete(id));
        setSelectedMatches([]);
        setBulkDeleteConfirm(false);
        setToast?.({ message: `Deleted ${selectedMatches.length} matches`, type: 'success' });
    };

    const handleBulkRerunOcr = useCallback(async () => {
        if (selectedMatches.length === 0 || bulkOcrBusy) return;
        setBulkOcrBusy(true);
        setToast?.({ message: `Rerunning OCR on ${selectedMatches.length} match(es)...`, type: 'info' });

        let successCount = 0;
        for (const matchId of selectedMatches) {
            try {
                const { imageFiles } = await getMatchArtifactsStructured(matchId);
                const imagePaths = imageFiles.map(f => f.path);
                if (imagePaths.length === 0) continue;

                const results = await Promise.allSettled(
                    imagePaths.map(p => rerunOCROnArtifact(p, activeUser || '', 'cloud'))
                );
                if (results.some(r => r.status === 'fulfilled')) successCount++;
            } catch {
                // skip failed
            }
        }

        setBulkOcrBusy(false);
        setToast?.({ message: `OCR rerun complete: ${successCount}/${selectedMatches.length} succeeded`, type: successCount > 0 ? 'success' : 'error' });
    }, [selectedMatches, bulkOcrBusy, activeUser, setToast]);

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

    const navigateToSmartCaptures = (matchId: number) => {
        setSmartCapturesFocusMatchId(matchId);
        setActiveView('smart-captures');
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

    /* ── derived stats for summary strip ── */
    const wins = useMemo(() => filteredMatches.filter(m => m.result === 'Win').length, [filteredMatches]);
    const losses = useMemo(() => filteredMatches.filter(m => m.result === 'Loss').length, [filteredMatches]);
    const draws = useMemo(() => filteredMatches.length - wins - losses, [filteredMatches, wins, losses]);
    const winRate = filteredMatches.length > 0 ? Math.round((wins / filteredMatches.length) * 100) : 0;

    const currentStreak = useMemo(() => {
        if (sortedMatches.length === 0) return { type: 'none' as const, count: 0 };
        const sorted = [...filteredMatches].sort((a, b) => b.timestamp - a.timestamp);
        const firstResult = sorted[0]?.result;
        if (firstResult !== 'Win' && firstResult !== 'Loss') return { type: 'none' as const, count: 0 };
        let count = 0;
        for (const m of sorted) {
            if (m.result === firstResult) count++;
            else break;
        }
        return { type: firstResult as 'Win' | 'Loss', count };
    }, [filteredMatches, sortedMatches.length]);

    const totalPages = itemsPerPage === 'Infinity' ? 1 : Math.ceil(sortedMatches.length / (itemsPerPage as number)) || 1;

    /* ── row background shading by outcome ── */
    const getRowBg = (m: Match) => {
        const isWin = m.result === 'Win';
        const isLoss = m.result === 'Loss';
        if (isWin) return 'bg-success/[0.06] hover:bg-success/[0.12]';
        if (isLoss) return 'bg-danger/[0.06] hover:bg-danger/[0.12]';
        return 'bg-info/[0.04] hover:bg-info/[0.10]';
    };

    return (
        <div data-tour="view-history" className="w-full flex flex-col gap-4 animate-slide-up">
            {/* ── Stats Summary Strip ── */}
            {filteredMatches.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-4 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 25%)' }}>
                        <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-10 bg-md-sys-primary blur-xl" />
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-md-sys-on-surface/50 mb-1">Total Matches</div>
                        <div className="text-2xl font-black tracking-tight text-md-sys-on-surface">{filteredMatches.length}</div>
                    </div>
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-4 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 25%)' }}>
                        <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-15 bg-success blur-xl" />
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-md-sys-on-surface/50 mb-1">Win Rate</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black tracking-tight text-success">{winRate}%</span>
                            <span className="text-[10px] font-semibold text-md-sys-on-surface/40">{wins}W / {losses}L{draws > 0 ? ` / ${draws}D` : ''}</span>
                        </div>
                    </div>
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-4 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 25%)' }}>
                        <div className={`absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-15 blur-xl ${currentStreak.type === 'Win' ? 'bg-success' : currentStreak.type === 'Loss' ? 'bg-danger' : 'bg-info'}`} />
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-md-sys-on-surface/50 mb-1">Current Streak</div>
                        <div className="flex items-center gap-2">
                            <Flame size={18} className={currentStreak.type === 'Win' ? 'text-success' : currentStreak.type === 'Loss' ? 'text-danger' : 'text-md-sys-on-surface/30'} />
                            <span className={`text-2xl font-black tracking-tight ${currentStreak.type === 'Win' ? 'text-success' : currentStreak.type === 'Loss' ? 'text-danger' : 'text-md-sys-on-surface/40'}`}>
                                {currentStreak.count > 0 ? `${currentStreak.count}${currentStreak.type === 'Win' ? 'W' : 'L'}` : '--'}
                            </span>
                        </div>
                    </div>
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-4 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 25%)' }}>
                        <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-10 bg-md-sys-tertiary blur-xl" />
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-md-sys-on-surface/50 mb-1">Win Rate Bar</div>
                        <div className="flex items-center gap-3 mt-1">
                            <div className="flex-1 h-2.5 rounded-full bg-md-sys-on-surface/[0.06] overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-success to-success/70 transition-all duration-700" style={{ width: `${winRate}%` }} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Table Card ── */}
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 15%)' }}>
                {/* ── Toolbar ── */}
                <div className="p-5 flex flex-col gap-4 border-b border-white/[0.06]">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-md-sys-primary/20 to-md-sys-tertiary/20 border border-white/[0.1] backdrop-blur-sm flex items-center justify-center shadow-lg shadow-md-sys-primary/5">
                                <Clock size={18} className="text-md-sys-primary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-extrabold tracking-tight text-md-sys-on-surface">Match History</h2>
                                <p className="text-[11px] text-md-sys-on-surface/45 font-medium">
                                    {sortedMatches.length} missions logged
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div className="relative group">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/30 group-focus-within:text-md-sys-primary transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search matches..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    className="pl-9 pr-4 py-2.5 text-[13px] font-medium outline-none text-md-sys-on-surface w-full sm:w-64 transition-all rounded-xl border border-white/[0.08] focus:border-md-sys-primary/40 focus:ring-2 focus:ring-md-sys-primary/10 backdrop-blur-sm"
                                    style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 40%)' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Bulk actions bar ── */}
                    {selectedMatches.length > 0 && (
                        <div className="flex items-center gap-2 py-2 px-3 rounded-xl border border-md-sys-primary/20" style={{ background: 'color-mix(in srgb, var(--md-sys-color-primary), transparent 92%)' }}>
                            <span className="text-[11px] font-bold text-md-sys-primary mr-1">{selectedMatches.length} selected</span>
                            <div className="w-px h-4 bg-md-sys-primary/20" />
                            <button onClick={handleExportJPG} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-md-sys-on-surface/70 hover:bg-md-sys-on-surface/[0.06] transition-colors inline-flex items-center gap-1.5" title="Export as image">
                                <Download size={13} /> Export PNG
                            </button>
                            <button onClick={handleBulkRerunOcr} disabled={bulkOcrBusy} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-md-sys-on-surface/70 hover:bg-md-sys-on-surface/[0.06] transition-colors inline-flex items-center gap-1.5 disabled:opacity-40" title="Rerun OCR on selected matches">
                                <RefreshCw size={13} className={bulkOcrBusy ? 'animate-spin' : ''} /> {bulkOcrBusy ? 'Running...' : 'Rerun OCR'}
                            </button>
                            <button onClick={() => setBulkDeleteConfirm(true)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-danger/80 hover:bg-danger/10 transition-colors inline-flex items-center gap-1.5" title="Delete selected matches">
                                <Trash2 size={13} /> Delete
                            </button>
                            <div className="flex-1" />
                            <button onClick={() => setSelectedMatches([])} className="text-[10px] font-semibold text-md-sys-on-surface/40 hover:text-md-sys-on-surface/70 transition-colors">
                                Clear selection
                            </button>
                        </div>
                    )}

                    {/* ── Pagination bar ── */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-semibold text-md-sys-on-surface/40 uppercase tracking-wider">Show</span>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => setItemsPerPage(e.target.value === 'Infinity' ? 'Infinity' : Number(e.target.value))}
                                className="px-2.5 py-1.5 outline-none transition-all cursor-pointer rounded-lg text-[12px] font-semibold border border-white/[0.08] focus:border-md-sys-primary/40 text-md-sys-on-surface"
                                style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 40%)' }}
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={40}>40</option>
                                <option value="Infinity">All</option>
                            </select>
                            <span className="text-[11px] font-medium text-md-sys-on-surface/35">
                                {itemsPerPage === 'Infinity'
                                    ? `${shouldLimitAll ? `First 500 of ${sortedMatches.length}` : `All ${sortedMatches.length}`}`
                                    : `${sortedMatches.length} results`}
                            </span>
                        </div>
                        {itemsPerPage !== 'Infinity' && totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-20 hover:bg-md-sys-on-surface/[0.06] transition-colors text-md-sys-on-surface/60"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    let page: number;
                                    if (totalPages <= 5) {
                                        page = i + 1;
                                    } else if (currentPage <= 3) {
                                        page = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        page = totalPages - 4 + i;
                                    } else {
                                        page = currentPage - 2 + i;
                                    }
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 rounded-lg text-[12px] font-bold transition-all ${
                                                page === currentPage
                                                    ? 'bg-md-sys-primary text-md-sys-on-primary shadow-md shadow-md-sys-primary/20'
                                                    : 'text-md-sys-on-surface/50 hover:bg-md-sys-on-surface/[0.06]'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                                <button
                                    disabled={currentPage >= totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-20 hover:bg-md-sys-on-surface/[0.06] transition-colors text-md-sys-on-surface/60"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {shouldLimitAll && (
                    <div className="px-5 py-2.5 text-[11px] font-semibold text-md-sys-on-surface/60 border-b border-white/[0.06] flex items-center justify-between" style={{ background: 'color-mix(in srgb, var(--md-sys-color-tertiary), transparent 92%)' }}>
                        <span>Rendering capped at 500 rows for performance</span>
                        <button onClick={() => setRenderAll(true)} className="md3-btn-tonal px-3 py-1 rounded-lg text-[11px] font-bold">
                            Show All
                        </button>
                    </div>
                )}

                {/* ── Table ── */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse history-table">
                        <thead className="sticky top-0 z-10">
                            <tr className="text-[10px] font-bold uppercase tracking-[0.10em] text-md-sys-on-surface/45 border-b border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface-variant), transparent 30%)' }}>
                                <th className="w-1 p-0"></th>
                                <th className="px-3 py-3.5 cursor-pointer hover:text-md-sys-primary transition-colors select-none" onClick={() => handleSort('result')}>
                                    <span className="inline-flex items-center gap-1.5">Outcome <ArrowUpDown size={10} className="opacity-40" /></span>
                                </th>
                                <th className="px-3 py-3.5 cursor-pointer hover:text-md-sys-primary transition-colors select-none" onClick={() => handleSort('timeAgo')}>
                                    <span className="inline-flex items-center gap-1.5">When <ArrowUpDown size={10} className="opacity-40" /></span>
                                </th>
                                <th className="px-3 py-3.5 cursor-pointer hover:text-md-sys-primary transition-colors select-none" onClick={() => handleSort('ship')}>
                                    <span className="inline-flex items-center gap-1.5">Ship / Hero <ArrowUpDown size={10} className="opacity-40" /></span>
                                </th>
                                <th className="px-3 py-3.5 cursor-pointer hover:text-md-sys-primary transition-colors select-none" onClick={() => handleSort('time')}>
                                    <span className="inline-flex items-center gap-1.5">Duration <ArrowUpDown size={10} className="opacity-40" /></span>
                                </th>
                                <th className="px-3 py-3.5">Hazards</th>
                                <th className="px-3 py-3.5">Teammates</th>
                                <th className="px-3 py-3.5">Opponents</th>
                                <th className="px-3 py-3.5 text-right">Actions</th>
                                <th className="pr-5 py-3.5 pl-2 text-right">
                                    <input
                                        type="checkbox"
                                        checked={paginatedMatches.length > 0 && paginatedMatches.every(m => selectedMatches.includes(m.id))}
                                        onChange={selectAll}
                                        className="w-3.5 h-3.5 rounded cursor-pointer accent-md-sys-primary"
                                    />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-medium text-md-sys-on-surface">
                            {sortedMatches.length === 0 ? (
                                <tr>
                                    <td colSpan={11}>
                                        <div className="flex flex-col items-center justify-center py-28 gap-4">
                                            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-md-sys-primary/15 to-md-sys-tertiary/15 border border-white/[0.08] flex items-center justify-center backdrop-blur-sm">
                                                <Ghost size={36} className="text-md-sys-primary/60" />
                                            </div>
                                            <div className="text-center">
                                                <h3 className="text-lg font-bold tracking-tight text-md-sys-on-surface/70">No matches yet</h3>
                                                <p className="text-[13px] font-medium mt-1 text-md-sys-on-surface/35">Record a mission to see it here</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                matchesByDay.map((group) => (
                                    <React.Fragment key={group.label}>
                                        {/* ── Day separator ── */}
                                        <tr>
                                            <td colSpan={11} className="px-5 py-2.5 border-b border-white/[0.04]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface-variant), transparent 60%)' }}>
                                                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-md-sys-on-surface/40">{group.label}</span>
                                            </td>
                                        </tr>
                                        {group.matches.map(m => {
                                            const isWin = m.result === 'Win';
                                            const isLoss = m.result === 'Loss';
                                            const hazards = m.reachModifiers || [];

                                            return (
                                                <tr
                                                    key={m.id}
                                                    onClick={() => setSelectedMatchForDetails(m)}
                                                    className={`border-b border-white/[0.04] transition-all duration-200 group cursor-pointer ${getRowBg(m)} active:bg-md-sys-on-surface/[0.07]`}
                                                >
                                                    {/* left accent bar */}
                                                    <td className="w-1 p-0 relative">
                                                        <div className={`absolute inset-y-0 left-0 w-[3px] rounded-r-full transition-all ${isWin ? 'bg-success' : isLoss ? 'bg-danger' : 'bg-info'} opacity-70 group-hover:opacity-100`} />
                                                    </td>

                                                    {/* outcome */}
                                                    <td className="px-3 py-4">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isWin ? 'bg-success/15' : isLoss ? 'bg-danger/15' : 'bg-info/15'}`}>
                                                                {isWin
                                                                    ? <Trophy size={14} className="text-success" />
                                                                    : isLoss
                                                                        ? <X size={14} className="text-danger" />
                                                                        : <TrendingUp size={14} className="text-info" />
                                                                }
                                                            </div>
                                                            <div>
                                                                <span className={`text-[12px] font-bold ${isWin ? 'text-success' : isLoss ? 'text-danger' : 'text-info'}`}>
                                                                    {m.result}
                                                                </span>
                                                                <div className="text-[10px] text-md-sys-on-surface/35 font-medium">{m.subType || 'Combat'}</div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* time */}
                                                    <td className="px-3 py-4">
                                                        <div className="text-[12px] font-semibold text-md-sys-on-surface/70">{timeAgoMap.get(m.id) || ''}</div>
                                                        <div className="text-[10px] text-md-sys-on-surface/30 font-medium mt-0.5">{new Date(m.timestamp).toLocaleDateString()}</div>
                                                    </td>

                                                    {/* ship / hero */}
                                                    <td className="px-3 py-4">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-md-sys-primary/10 to-md-sys-tertiary/10 border border-white/[0.06] flex items-center justify-center text-[10px] font-black text-md-sys-primary/60">
                                                                {(m.ship || 'U')[0]}
                                                            </div>
                                                            <div>
                                                                <div className="text-[13px] font-bold">{(m.ship || 'Unknown').split('(')[0]}</div>
                                                                <div className="text-[10px] text-md-sys-on-surface/40 font-medium">{m.hero || 'Unknown'}</div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* duration */}
                                                    <td className="px-3 py-4">
                                                        <span className="font-mono text-[12px] tracking-wide text-md-sys-on-surface/60 bg-md-sys-on-surface/[0.04] px-2.5 py-1 rounded-lg">{m.time || '--:--'}</span>
                                                    </td>

                                                    {/* hazards */}
                                                    <td className="px-3 py-4 max-w-[140px]">
                                                        {hazards.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {hazards.slice(0, 2).map((h, i) => (
                                                                    <span key={i} className="px-2 py-0.5 rounded-md bg-warning/10 text-warning/80 text-[10px] font-medium inline-flex items-center gap-1">
                                                                        <Zap size={9} />{h}
                                                                    </span>
                                                                ))}
                                                                {hazards.length > 2 && (
                                                                    <span className="text-[10px] text-md-sys-on-surface/30 font-medium">+{hazards.length - 2}</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-md-sys-on-surface/20 italic text-[10px]">--</span>
                                                        )}
                                                    </td>

                                                    {/* teammates */}
                                                    <td className="px-3 py-4 text-[12px] max-w-[160px]">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(m.teammates && m.teammates.length > 0) ? m.teammates.map((t, i) => (
                                                                <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(t, 'Teammate'); }} className="px-2 py-0.5 rounded-md bg-info/8 text-info/80 hover:bg-info/15 cursor-pointer transition-colors text-[11px] font-medium">
                                                                    {t}
                                                                </span>
                                                            )) : <span className="text-md-sys-on-surface/25 italic text-[11px]">None</span>}
                                                        </div>
                                                    </td>

                                                    {/* opponents */}
                                                    <td className="px-3 py-4 text-[12px] max-w-[160px]">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(m.opponents && m.opponents.length > 0) ? m.opponents.map((o, i) => (
                                                                <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(o, 'Opponent'); }} className="px-2 py-0.5 rounded-md bg-danger/8 text-danger/80 hover:bg-danger/15 cursor-pointer transition-colors text-[11px] font-medium">
                                                                    {o}
                                                                </span>
                                                            )) : <span className="text-md-sys-on-surface/25 italic text-[11px]">None</span>}
                                                        </div>
                                                    </td>

                                                    {/* actions */}
                                                    <td className="px-3 py-4 text-right">
                                                        <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => setEditingMatch(m)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-md-sys-on-surface/[0.08] transition-colors text-md-sys-on-surface/50 hover:text-md-sys-on-surface" title="Edit"><Edit2 size={13} /></button>
                                                            <button onClick={() => handleOpenNote(m)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${m.notes ? 'text-md-sys-primary bg-md-sys-primary/10' : 'text-md-sys-on-surface/50 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/[0.08]'}`} title="Notes"><FileText size={13} /></button>
                                                            <button onClick={() => onPin(m.id)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${m.isPinned ? 'text-warning bg-warning/10' : 'text-md-sys-on-surface/50 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/[0.08]'}`} title="Pin"><Pin size={13} className={m.isPinned ? 'fill-current' : ''} /></button>
                                                            <button onClick={() => navigateToSmartCaptures(m.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-md-sys-on-surface/50 hover:text-md-sys-primary hover:bg-md-sys-primary/10 transition-colors" title="View in Smart Captures"><ScanEye size={13} /></button>
                                                            <button onClick={() => handleDelete(m.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-md-sys-on-surface/50 hover:text-danger hover:bg-danger/10 transition-colors" title="Delete"><Trash2 size={13} /></button>
                                                        </div>
                                                    </td>

                                                    {/* checkbox */}
                                                    <td className="pr-5 py-4 pl-2 text-right" onClick={e => e.stopPropagation()}>
                                                        <input type="checkbox" checked={selectedMatches.includes(m.id)} onChange={() => toggleSelection(m.id)} className="w-3.5 h-3.5 rounded cursor-pointer accent-md-sys-primary" />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Bottom pagination (when there are many pages) ── */}
                {itemsPerPage !== 'Infinity' && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1 py-3 border-t border-white/[0.06]">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-20 hover:bg-md-sys-on-surface/[0.06] transition-colors text-md-sys-on-surface/60"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-[11px] font-semibold text-md-sys-on-surface/40 px-3">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-20 hover:bg-md-sys-on-surface/[0.06] transition-colors text-md-sys-on-surface/60"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            {editingMatch && <EditMatchModal match={editingMatch} onClose={() => setEditingMatch(null)} onSave={(m) => { onEdit(m); setEditingMatch(null); }} />}

            {/* ── Bulk Delete Confirmation Dialog ── */}
            {bulkDeleteConfirm && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setBulkDeleteConfirm(false)}>
                    <div className="w-full max-w-sm rounded-2xl border border-white/[0.1] p-6 flex flex-col gap-4 animate-scale-in shadow-2xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 10%)', backdropFilter: 'blur(40px)' }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-danger/15 flex items-center justify-center">
                                <AlertTriangle size={20} className="text-danger" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold tracking-tight text-md-sys-on-surface">Delete {selectedMatches.length} match{selectedMatches.length === 1 ? '' : 'es'}?</h3>
                                <p className="text-[12px] text-md-sys-on-surface/45 mt-0.5">This action cannot be undone.</p>
                            </div>
                        </div>
                        <div className="flex gap-2.5">
                            <button onClick={() => setBulkDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-white/[0.1] text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/[0.06] transition-colors">Cancel</button>
                            <button onClick={handleBulkDelete} className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-danger text-white hover:bg-danger/90 transition-colors flex items-center justify-center gap-2">
                                <Trash2 size={15} /> Delete All
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* ── Notes Modal ── */}
            {editingNoteMatch && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setEditingNoteMatch(null)}>
                    <div className="w-full max-w-md rounded-2xl border border-white/[0.1] p-6 flex flex-col gap-4 animate-scale-in shadow-2xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 10%)', backdropFilter: 'blur(40px)' }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold tracking-tight text-md-sys-on-surface">Mission Notes</h3>
                            <button onClick={() => setEditingNoteMatch(null)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-md-sys-on-surface/[0.08] transition-colors text-md-sys-on-surface/50"><X size={18} /></button>
                        </div>
                        <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 40%)' }}>
                            <div className="text-[10px] font-bold uppercase tracking-[0.10em] text-md-sys-on-surface/40 mb-1.5">Match Details</div>
                            <div className="text-sm font-bold text-md-sys-on-surface">{editingNoteMatch.result} | {(editingNoteMatch.ship || '').split('(')[0]} | {editingNoteMatch.hero}</div>
                            <div className="text-[11px] text-md-sys-on-surface/40 mt-1">{new Date(editingNoteMatch.timestamp).toLocaleString()}</div>
                        </div>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add notes about strategy, mistakes, or key moments..."
                            className="w-full h-32 rounded-xl p-4 text-sm font-medium outline-none resize-none transition-all border border-white/[0.08] focus:border-md-sys-primary/40 focus:ring-2 focus:ring-md-sys-primary/10 text-md-sys-on-surface placeholder:text-md-sys-on-surface/25"
                            style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 40%)' }}
                        />
                        <div className="flex gap-2.5">
                            <button onClick={() => setEditingNoteMatch(null)} className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-white/[0.1] text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/[0.06] transition-colors">Cancel</button>
                            <button onClick={handleSaveNote} className="flex-1 md3-btn-filled py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Save size={15} /> Save Note</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* ── Match Details Modal ── */}
            {selectedMatchForDetails && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedMatchForDetails(null)}>
                    <div className="w-full max-w-4xl rounded-2xl border border-white/[0.1] p-6 flex flex-col gap-5 animate-scale-in max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 8%)', backdropFilter: 'blur(40px)' }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start border-b border-white/[0.06] pb-5">
                            <div>
                                <div className="text-[10px] font-semibold uppercase text-md-sys-on-surface/35 tracking-[0.14em] mb-1.5">Mission Report</div>
                                <h2 className={`text-4xl font-black uppercase tracking-tight ${selectedMatchForDetails.result === 'Win' ? 'text-success' : selectedMatchForDetails.result === 'Loss' ? 'text-danger' : 'text-md-sys-on-surface'}`}>{selectedMatchForDetails.result}</h2>
                                <div className="text-sm font-semibold text-md-sys-on-surface/50 mt-0.5">{selectedMatchForDetails.subType || 'Combat'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setSelectedMatchForDetails(null); navigateToSmartCaptures(selectedMatchForDetails.id); }}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-md-sys-primary/80 hover:bg-md-sys-primary/10 transition-colors inline-flex items-center gap-1.5 border border-md-sys-primary/20"
                                    title="View in Smart Captures"
                                >
                                    <ScanEye size={13} /> Deep Dive
                                </button>
                                <button onClick={() => setSelectedMatchForDetails(null)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-md-sys-on-surface/[0.08] transition-colors text-md-sys-on-surface/50"><X size={18} /></button>
                            </div>
                        </div>

                        {selectedMatchForDetails.notes && (
                            <div className="p-5 rounded-xl border-l-[3px] border-md-sys-primary" style={{ background: 'color-mix(in srgb, var(--md-sys-color-primary), transparent 92%)' }}>
                                <div className="text-[10px] font-semibold uppercase text-md-sys-on-surface/40 tracking-[0.08em] mb-2 flex items-center gap-2"><FileText size={12} /> Captain's Log</div>
                                <div className="text-sm font-medium italic text-md-sys-on-surface/70 leading-relaxed">"{selectedMatchForDetails.notes}"</div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-5 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 35%)' }}>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-md-sys-on-surface/40 mb-3">Pilot Loadout</div>
                                <div className="text-xl font-bold mb-1">{(selectedMatchForDetails.ship || 'Unknown').split('(')[0]}</div>
                                <div className="text-sm opacity-70 mb-2">{selectedMatchForDetails.hero}</div>

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
                            <div className="p-5 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 35%)' }}>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-md-sys-on-surface/40 mb-3">Performance</div>
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

                        {/* ── Hazards in detail modal ── */}
                        {selectedMatchForDetails.reachModifiers && selectedMatchForDetails.reachModifiers.length > 0 && (
                            <div className="p-5 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 35%)' }}>
                                <div className="text-[10px] font-semibold uppercase text-md-sys-on-surface/40 mb-3 flex items-center gap-2"><Zap size={12} /> Hazards & Modifiers</div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedMatchForDetails.reachModifiers.map(m => (
                                        <span key={m} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-warning/20 inline-flex items-center gap-1.5 bg-warning/8 text-warning/80">
                                            <Zap size={11} />{m}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedMatchForDetails.kills && Object.values(selectedMatchForDetails.kills).some(v => v > 0) && (
                            <div className="p-5 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 35%)' }}>
                                <div className="text-[10px] font-semibold uppercase text-md-sys-on-surface/40 mb-4 flex items-center gap-2"><Swords size={12} /> Combat Record</div>
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

                        <div className="p-5 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 35%)' }}>
                            <div className="flex justify-between mb-4">
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-md-sys-on-surface/40 mb-2">Squadron</div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedMatchForDetails.teammates || []).length > 0 ? (selectedMatchForDetails.teammates || []).map(t => (
                                            <span key={t} onClick={() => onDrillDown?.(t, 'Teammate')} className="px-3 py-1 bg-info-soft text-info rounded-lg text-xs font-bold cursor-pointer hover:bg-info-soft-strong transition-colors">
                                                {t}
                                            </span>
                                        )) : <span className="opacity-40 text-xs italic">None</span>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-md-sys-on-surface/40 mb-2">Hostiles</div>
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
                            <div className="p-5 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 35%)' }}>
                                <div className="text-[10px] font-semibold uppercase text-md-sys-on-surface/40 mb-4 flex items-center gap-2"><ImageIcon size={12} /> Visual Intel</div>
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

                        {/* Match Chronology (Timeline) */}
                        {selectedMatchForDetails.timelineEvents && selectedMatchForDetails.timelineEvents.length > 0 && (
                            <div className="p-5 rounded-xl border border-white/[0.06]" style={{ background: 'color-mix(in srgb, var(--md-sys-color-surface), transparent 35%)' }}>
                                <div className="text-[10px] font-semibold uppercase text-md-sys-on-surface/40 mb-4 flex items-center gap-2"><Clock size={12} /> Tactical Chronology</div>
                                <div className="space-y-3">
                                    {/* Mini Graph */}
                                    <div className="h-2 w-full md3-surface-high rounded-full relative overflow-visible mb-6 mx-2">
                                        {selectedMatchForDetails.timelineEvents.map((evt: any, idx: number) => {
                                            const matchStart = selectedMatchForDetails.timestamp;
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

                        <div className="text-center text-[10px] font-mono text-md-sys-on-surface/20 uppercase tracking-widest mt-2 pt-3 border-t border-white/[0.04]">
                            ID: {selectedMatchForDetails.id} - {new Date(selectedMatchForDetails.timestamp).toLocaleString()}
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default HistoryTable;

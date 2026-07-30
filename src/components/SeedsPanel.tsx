import React, { useState, useMemo, useCallback, useEffect, useId, useRef } from 'react';
import {
    Hash,
    Copy,
    Check,
    AlertTriangle,
    ChevronRight,
    Search,
    ArrowUpDown,
    MapPin,
    Ship,
    Crosshair,
    Calendar,
    Layers,
    Shield,
    Sparkles,
    Eye,
    X,
    Filter,
    RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { Match } from '../types';
import { getMatchArtifactsStructured } from '../utils/artifactService';
import { classifyArtifactScreenshotBucket } from '../utils/artifactScreenshotBuckets';
import { LocalImage } from './LocalImage';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

/**
 * Regex pattern for extracting map seeds from OCR rawText (ported from backend canonicalizeSeedFromText).
 */
const MAP_SEED_PATTERN = /MAP\s*SEED\s*:?\s*([0-9A-FOIL]{4,12})/i;
const SEED_TRANSLATION: Record<string, string> = { O: '0', I: '1', L: '1' };

function extractSeedFromRawText(rawText?: string): { seed: string; flags: string[] } | null {
    if (!rawText) return null;
    const joined = String(rawText).toUpperCase().replace(/\s+/g, ' ').trim();
    const match = joined.match(MAP_SEED_PATTERN);
    if (!match) return null;
    const raw = String(match[1] || '').toUpperCase();
    const cleaned = raw.replace(/[OIL]/g, (ch) => SEED_TRANSLATION[ch] || ch);
    const flags: string[] = [];
    if (cleaned.length !== 8) flags.push(`LENGTH_${cleaned.length}_NOT_8`);
    if (!/^[0-9A-F]+$/.test(cleaned)) flags.push('NON_HEX_CHARS');
    if (cleaned !== raw) flags.push(`SUBST(${raw}->${cleaned})`);
    return { seed: cleaned, flags };
}

export interface SeedGroup {
    seed: string;
    flags: string[];
    matches: Match[];
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    hazards: Record<string, number>;
    shipsUsed: Record<string, number>;
    modes: Record<string, number>;
    lastPlayed: number;
}

export type SeedSortMode = 'recent' | 'count';

/**
 * Find the tactical map capture for a match. Prefers the on-disk artifact
 * records (they carry an explicit screenshotType) and falls back to filename
 * classification of the match's bundled paths when the lookup is unavailable.
 */
const resolveTacticalMapPath = async (match: Match): Promise<string | null> => {
    const fallback = (match.artifacts || []).find(
        (path) => classifyArtifactScreenshotBucket(String(path || '')) === 'tactical_map'
    );

    try {
        const structured = await getMatchArtifactsStructured(match.id, match.artifacts || []);
        const images = structured.images || [];
        for (let i = 0; i < images.length; i++) {
            const bucket = classifyArtifactScreenshotBucket(images[i], structured.imageFiles?.[i] || null);
            if (bucket === 'tactical_map') {
                const cleaned = String(images[i] || '').trim();
                if (cleaned) return cleaned;
            }
        }
    } catch {
        // Fall through to the filename-based guess below.
    }

    return fallback ? String(fallback).trim() || null : null;
};

export const SeedsPanel: React.FC = () => {
    const matches = useAppStore((s) => s.matches) || [];
    const performanceMode = useAppStore((s) => s.performanceMode) || false;
    const disableAnimations = useAppStore((s) => s.disableAnimations) || false;

    const [searchTerm, setSearchTerm] = useState('');
    const [sortMode, setSortMode] = useState<SeedSortMode>('recent');
    const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [tacticalMaps, setTacticalMaps] = useState<Record<number, string | null>>({});
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const requestedTacticalMaps = useRef<Set<number>>(new Set());
    const [showFilters, setShowFilters] = useState(false);
    const [modeFilter, setModeFilter] = useState('');
    const [shipFilter, setShipFilter] = useState('');
    const [hazardFilter, setHazardFilter] = useState('');
    const filterPopoverRef = useRef<HTMLDivElement>(null);

    const lightboxTitleId = useId();
    const seedSearchInputId = useId();
    const lightboxFocusTrapRef = useFocusTrap<HTMLDivElement>(Boolean(lightboxSrc));
    useKeyboardShortcuts([
        { key: 'Escape', handler: () => setLightboxSrc(null) },
    ], Boolean(lightboxSrc));

    // Group matches by map seed (combining forward match.mapSeed and backward rawText parsing)
    const seedGroups = useMemo(() => {
        const groups = new Map<string, SeedGroup>();

        for (const match of matches) {
            let seedVal = match.mapSeed ? match.mapSeed.trim() : '';
            let seedFlags = match.mapSeedFlags || [];

            if (!seedVal && match.ocrDebug?.rawText) {
                const parsed = extractSeedFromRawText(match.ocrDebug.rawText);
                if (parsed && parsed.seed) {
                    seedVal = parsed.seed;
                    seedFlags = parsed.flags;
                }
            }

            if (!seedVal) continue;

            const existing = groups.get(seedVal);
            if (existing) {
                existing.matches.push(match);
                existing.totalMatches += 1;
                if (match.result === 'Win') existing.wins += 1;
                else if (match.result === 'Loss') existing.losses += 1;
                else if (match.result === 'Draw') existing.draws += 1;

                if (match.timestamp > existing.lastPlayed) {
                    existing.lastPlayed = match.timestamp;
                }

                // Add hazards
                if (Array.isArray(match.reachModifiers)) {
                    match.reachModifiers.forEach((h) => {
                        existing.hazards[h] = (existing.hazards[h] || 0) + 1;
                    });
                }
                // Add ship
                if (match.ship) {
                    existing.shipsUsed[match.ship] = (existing.shipsUsed[match.ship] || 0) + 1;
                }
                // Add mode
                if (match.mode) {
                    existing.modes[match.mode] = (existing.modes[match.mode] || 0) + 1;
                }
                // Accumulate flags uniquely
                seedFlags.forEach((f) => {
                    if (!existing.flags.includes(f)) existing.flags.push(f);
                });
            } else {
                const hazards: Record<string, number> = {};
                if (Array.isArray(match.reachModifiers)) {
                    match.reachModifiers.forEach((h) => {
                        hazards[h] = (hazards[h] || 0) + 1;
                    });
                }

                const shipsUsed: Record<string, number> = {};
                if (match.ship) {
                    shipsUsed[match.ship] = 1;
                }

                const modes: Record<string, number> = {};
                if (match.mode) {
                    modes[match.mode] = 1;
                }

                groups.set(seedVal, {
                    seed: seedVal,
                    flags: [...seedFlags],
                    matches: [match],
                    totalMatches: 1,
                    wins: match.result === 'Win' ? 1 : 0,
                    losses: match.result === 'Loss' ? 1 : 0,
                    draws: match.result === 'Draw' ? 1 : 0,
                    winRate: 0,
                    hazards,
                    shipsUsed,
                    modes,
                    lastPlayed: match.timestamp,
                });
            }
        }

        // Compute win rates and return array
        const list = Array.from(groups.values());
        list.forEach((g) => {
            const decided = g.wins + g.losses;
            g.winRate = decided > 0 ? Math.round((g.wins / decided) * 100) : (g.wins > 0 ? 100 : 0);
        });

        return list;
    }, [matches]);

    // Distinct filter option lists, built from every seed group's accumulated data.
    const modeFilterOptions = useMemo(() => {
        const set = new Set<string>();
        seedGroups.forEach((g) => Object.keys(g.modes).forEach((m) => set.add(m)));
        return Array.from(set).sort();
    }, [seedGroups]);
    const shipFilterOptions = useMemo(() => {
        const set = new Set<string>();
        seedGroups.forEach((g) => Object.keys(g.shipsUsed).forEach((s) => set.add(s)));
        return Array.from(set).sort();
    }, [seedGroups]);
    const hazardFilterOptions = useMemo(() => {
        const set = new Set<string>();
        seedGroups.forEach((g) => Object.keys(g.hazards).forEach((h) => set.add(h)));
        return Array.from(set).sort();
    }, [seedGroups]);
    const activeFilterCount = [modeFilter, shipFilter, hazardFilter].filter(Boolean).length;

    // Close the filter popover on outside click.
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
                setShowFilters(false);
            }
        };
        if (showFilters) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showFilters]);

    // Filter and sort seed groups
    const filteredSeeds = useMemo(() => {
        let result = seedGroups;

        if (searchTerm.trim()) {
            const term = searchTerm.trim().toUpperCase();
            result = result.filter((g) => g.seed.includes(term));
        }
        if (modeFilter) {
            result = result.filter((g) => modeFilter in g.modes);
        }
        if (shipFilter) {
            result = result.filter((g) => shipFilter in g.shipsUsed);
        }
        if (hazardFilter) {
            result = result.filter((g) => hazardFilter in g.hazards);
        }

        return [...result].sort((a, b) => {
            if (sortMode === 'count') return b.totalMatches - a.totalMatches;
            return b.lastPlayed - a.lastPlayed;
        });
    }, [seedGroups, searchTerm, sortMode, modeFilter, shipFilter, hazardFilter]);

    // Currently selected group
    const activeGroup = useMemo(() => {
        if (!selectedSeed) {
            return filteredSeeds.length > 0 ? filteredSeeds[0] : null;
        }
        return seedGroups.find((g) => g.seed === selectedSeed) || (filteredSeeds.length > 0 ? filteredSeeds[0] : null);
    }, [selectedSeed, seedGroups, filteredSeeds]);

    // Resolve tactical map captures for the seed on screen only. Each match is
    // looked up once and kept, so re-selecting a seed never refetches.
    useEffect(() => {
        if (!activeGroup) return;

        const pending = activeGroup.matches.filter((m) => !requestedTacticalMaps.current.has(m.id));
        if (pending.length === 0) return;
        pending.forEach((m) => requestedTacticalMaps.current.add(m.id));

        let cancelled = false;
        (async () => {
            const resolved = await Promise.all(
                pending.map(async (m) => [m.id, await resolveTacticalMapPath(m)] as const)
            );
            if (cancelled) {
                // Allow a later render to retry what this run never committed.
                pending.forEach((m) => requestedTacticalMaps.current.delete(m.id));
                return;
            }
            setTacticalMaps((prev) => {
                const next = { ...prev };
                resolved.forEach(([id, path]) => { next[id] = path; });
                return next;
            });
        })();

        return () => { cancelled = true; };
    }, [activeGroup]);

    const handleCopySeed = useCallback((seedText: string) => {
        navigator.clipboard.writeText(seedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, []);

    const timeAgo = (ts: number) => {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / (60 * 1000));
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const isAnimDisabled = performanceMode || disableAnimations;

    return (
        <div className="w-full flex-1 h-full min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] gap-4 overflow-visible rounded-2xl p-1">
            {/* Column 1: Seeds List */}
            <div className="flex flex-col h-full min-h-0 rounded-card mg-surface-high p-3.5 gap-3">
                {/* Search & Header */}
                <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-md-sys-primary/10 flex items-center justify-center text-md-sys-primary">
                                <Hash size={18} />
                            </div>
                            <div>
                                <h2 className="text-body font-bold text-md-sys-on-surface">Map Seeds</h2>
                                <p className="text-label-xs text-md-sys-on-surface/50">
                                    {seedGroups.length} unique {seedGroups.length === 1 ? 'seed' : 'seeds'} captured
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Sort Toggle */}
                            <div className="flex items-center gap-1 bg-md-sys-on-surface/[0.04] p-1 rounded-lg border border-md-sys-outline/10">
                                <button
                                    onClick={() => setSortMode('recent')}
                                    aria-pressed={sortMode === 'recent'}
                                    className={`px-2 py-1 rounded text-label-xs font-semibold ${
                                        sortMode === 'recent'
                                            ? 'bg-md-sys-primary/15 text-md-sys-primary'
                                            : 'text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
                                    }`}
                                    title="Sort by Most Recent"
                                >
                                    Recent
                                </button>
                                <button
                                    onClick={() => setSortMode('count')}
                                    aria-pressed={sortMode === 'count'}
                                    className={`px-2 py-1 rounded text-label-xs font-semibold ${
                                        sortMode === 'count'
                                            ? 'bg-md-sys-primary/15 text-md-sys-primary'
                                            : 'text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
                                    }`}
                                    title="Sort by Match Count"
                                >
                                    Count
                                </button>
                            </div>

                            {/* Filter Toggle */}
                            <div className="relative" ref={filterPopoverRef}>
                                <button
                                    onClick={() => setShowFilters((v) => !v)}
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-label-xs font-semibold border transition-colors ${
                                        activeFilterCount > 0 || showFilters
                                            ? 'bg-md-sys-primary/15 text-md-sys-primary border-md-sys-primary/30'
                                            : 'bg-md-sys-on-surface/[0.04] text-md-sys-on-surface/60 border-md-sys-outline/10 hover:text-md-sys-on-surface'
                                    }`}
                                    aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
                                >
                                    <Filter size={12} />
                                    {activeFilterCount > 0 && (
                                        <span className="min-w-[14px] h-3.5 rounded-full bg-md-sys-primary text-md-sys-onPrimary text-[9px] font-black flex items-center justify-center px-1">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </button>
                                {showFilters && (
                                    <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-card mg-surface-high border border-md-sys-outline/20 shadow-xl p-3.5 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                                        <div className="flex items-center justify-between pb-2 border-b border-md-sys-outline/10">
                                            <span className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Filter Seeds</span>
                                            {activeFilterCount > 0 && (
                                                <button
                                                    onClick={() => { setModeFilter(''); setShipFilter(''); setHazardFilter(''); }}
                                                    className="text-label-xs font-bold text-md-sys-primary hover:underline"
                                                >
                                                    Clear all
                                                </button>
                                            )}
                                        </div>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Mode</span>
                                            <select
                                                value={modeFilter}
                                                onChange={(e) => setModeFilter(e.target.value)}
                                                className="w-full px-2.5 py-1.5 rounded-control border border-md-sys-outline/20 bg-md-sys-surface text-md-sys-on-surface text-label-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary transition-colors hover:border-md-sys-outline/40"
                                            >
                                                <option value="">All Modes</option>
                                                {modeFilterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Ship</span>
                                            <select
                                                value={shipFilter}
                                                onChange={(e) => setShipFilter(e.target.value)}
                                                className="w-full px-2.5 py-1.5 rounded-control border border-md-sys-outline/20 bg-md-sys-surface text-md-sys-on-surface text-label-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary transition-colors hover:border-md-sys-outline/40"
                                            >
                                                <option value="">All Ships</option>
                                                {shipFilterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-label-xs text-md-sys-on-surface/50 font-semibold">Hazard</span>
                                            <select
                                                value={hazardFilter}
                                                onChange={(e) => setHazardFilter(e.target.value)}
                                                className="w-full px-2.5 py-1.5 rounded-control border border-md-sys-outline/20 bg-md-sys-surface text-md-sys-on-surface text-label-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary transition-colors hover:border-md-sys-outline/40"
                                            >
                                                <option value="">All Hazards</option>
                                                {hazardFilterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full">
                        <label htmlFor={seedSearchInputId} className="a11y-sr-only">Filter seeds</label>
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40" />
                        <input
                            id={seedSearchInputId}
                            type="text"
                            placeholder="Filter seeds (e.g. A1B2)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-md-sys-on-surface/[0.04] text-label-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface/40 border border-md-sys-outline/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary transition-colors hover:border-md-sys-outline/40"
                        />
                    </div>
                </div>

                {/* Seed List */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                    {filteredSeeds.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-md-sys-on-surface/50 gap-2">
                            <Hash size={32} className="opacity-30" />
                            <p className="text-label-sm font-medium">No map seeds found</p>
                            <p className="text-label-xs opacity-75">
                                Seeds are automatically captured from the Tactical Map screen during matches.
                            </p>
                        </div>
                    ) : (
                        filteredSeeds.map((group) => {
                            const isSelected = activeGroup?.seed === group.seed;
                            return (
                                <button
                                    key={group.seed}
                                    onClick={() => setSelectedSeed(group.seed)}
                                    aria-pressed={isSelected}
                                    className={`group relative w-full shrink-0 text-left pl-4 pr-3 py-2 rounded-xl border transition-all flex items-center gap-3 overflow-hidden ${
                                        isAnimDisabled ? '' : 'duration-150'
                                    } ${
                                        isSelected
                                            ? 'bg-md-sys-primary/10 border-md-sys-primary/30 text-md-sys-on-surface shadow-sm'
                                            : 'bg-md-sys-on-surface/[0.02] hover:bg-md-sys-on-surface/[0.06] border-md-sys-outline/5 text-md-sys-on-surface/80'
                                    }`}
                                >
                                    <span
                                        className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full transition-colors ${
                                            isSelected ? 'bg-md-sys-primary' : 'bg-transparent group-hover:bg-md-sys-outline/20'
                                        }`}
                                    />

                                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-mono text-body font-bold tracking-wide text-md-sys-primary truncate leading-none">
                                                {group.seed}
                                            </span>
                                            {group.flags.length > 0 && (
                                                <span
                                                    className="text-warning shrink-0"
                                                    title={`OCR flags: ${group.flags.join(', ')}`}
                                                >
                                                    <AlertTriangle size={11} />
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-label-xs text-md-sys-on-surface/45 leading-none">
                                            {timeAgo(group.lastPlayed)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {group.totalMatches > 1 && (
                                            <span
                                                className="min-w-[1.25rem] px-1.5 h-[18px] rounded-pill bg-md-sys-primary/20 border border-md-sys-primary/30 text-md-sys-primary text-label-xs font-bold tabular-nums flex items-center justify-center"
                                                title={`${group.totalMatches} matches played on this seed`}
                                            >
                                                {group.totalMatches}
                                            </span>
                                        )}
                                        <ChevronRight
                                            size={14}
                                            className={`shrink-0 transition-transform ${
                                                isSelected ? 'text-md-sys-primary' : 'text-md-sys-on-surface/30 group-hover:translate-x-0.5'
                                            }`}
                                        />
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Column 2: Seed Detail */}
            <div className="flex flex-col h-full min-h-0 rounded-card mg-surface-high p-5 overflow-y-auto custom-scrollbar">
                {!activeGroup ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-md-sys-on-surface/40 gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-md-sys-on-surface/[0.04] flex items-center justify-center text-md-sys-on-surface/30">
                            <Hash size={32} />
                        </div>
                        <h3 className="text-body font-bold text-md-sys-on-surface/70">Select a Seed</h3>
                        <p className="text-label-sm max-w-sm">
                            Select a map seed from the left panel to inspect detailed encounter statistics, hazards, and history.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {/* Seed Header Banner */}
                        <div className="relative flex items-center justify-between p-4 rounded-2xl bg-gradient-to-br from-md-sys-primary/15 via-md-sys-primary/10 to-transparent border border-md-sys-primary/20 backdrop-blur-sm overflow-hidden">
                            <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-md-sys-primary/10 blur-2xl pointer-events-none" />
                            <div className="relative flex items-center gap-4 min-w-0">
                                <div className="w-12 h-12 rounded-xl bg-md-sys-primary/20 flex items-center justify-center text-md-sys-primary shrink-0">
                                    <Hash size={24} />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h1 className="font-mono text-2xl font-black tracking-[0.15em] text-md-sys-on-surface">
                                            {activeGroup.seed}
                                        </h1>
                                        <button
                                            onClick={() => handleCopySeed(activeGroup.seed)}
                                            className="p-1.5 rounded-lg bg-md-sys-on-surface/[0.06] hover:bg-md-sys-on-surface/10 text-md-sys-on-surface/70 hover:text-md-sys-on-surface transition-colors"
                                            title="Copy seed hex"
                                        >
                                            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                    <p className="text-label-xs text-md-sys-on-surface/60 mt-0.5">
                                        First seen {new Date(Math.min(...activeGroup.matches.map((m) => m.timestamp))).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>

                            {activeGroup.flags.length > 0 && (
                                <div className="relative shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning/15 border border-warning/30 text-warning text-label-xs font-semibold">
                                    <AlertTriangle size={14} />
                                    <span>{activeGroup.flags.join(', ')}</span>
                                </div>
                            )}
                        </div>

                        {/* Top Stats Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-3.5 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-1 transition-colors hover:bg-md-sys-on-surface/[0.05]">
                                <span className="text-label-xs text-md-sys-on-surface/50 font-medium flex items-center gap-1.5">
                                    <Layers size={12} /> Total Matches
                                </span>
                                <span className="text-title font-bold text-md-sys-on-surface">
                                    {activeGroup.totalMatches}
                                </span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-1 transition-colors hover:bg-md-sys-on-surface/[0.05]">
                                <span className="text-label-xs text-md-sys-on-surface/50 font-medium flex items-center gap-1.5">
                                    <Shield size={12} /> Record (W/L/D)
                                </span>
                                <span className="text-title font-bold text-md-sys-on-surface">
                                    {activeGroup.wins}<span className="text-md-sys-on-surface/30 font-semibold">/</span>{activeGroup.losses}<span className="text-md-sys-on-surface/30 font-semibold">/</span>{activeGroup.draws}
                                </span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-1 transition-colors hover:bg-md-sys-on-surface/[0.05]">
                                <span className="text-label-xs text-md-sys-on-surface/50 font-medium flex items-center gap-1.5">
                                    <MapPin size={12} /> Hazards Found
                                </span>
                                <span className="text-title font-bold text-md-sys-on-surface">
                                    {Object.keys(activeGroup.hazards).length}
                                </span>
                            </div>
                        </div>

                        {/* Hazards & Ships Breakdown */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Hazards Panel */}
                            <div className="p-4 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-3">
                                <h3 className="text-label-sm font-bold uppercase tracking-wider text-md-sys-on-surface/70 flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-md-sys-primary" /> Hazards & Features
                                </h3>
                                {Object.keys(activeGroup.hazards).length === 0 ? (
                                    <p className="text-label-xs text-md-sys-on-surface/40">No hazards recorded for this seed.</p>
                                ) : (
                                    <div className="flex flex-col gap-2.5">
                                        {Object.entries(activeGroup.hazards)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([hazard, count]) => {
                                                const pct = Math.round((count / activeGroup.totalMatches) * 100);
                                                return (
                                                    <div key={hazard} className="flex flex-col gap-1">
                                                        <div className="flex items-center justify-between text-label-xs">
                                                            <span className="font-semibold text-md-sys-on-surface">{hazard}</span>
                                                            <span className="text-md-sys-on-surface/50 tabular-nums">{count}x · {pct}%</span>
                                                        </div>
                                                        <div className="w-full h-1.5 rounded-full bg-md-sys-on-surface/10 overflow-hidden">
                                                            <div
                                                                className="h-full bg-md-sys-primary rounded-full transition-[width] duration-300"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>

                            {/* Ships Used Panel */}
                            <div className="p-4 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-3">
                                <h3 className="text-label-sm font-bold uppercase tracking-wider text-md-sys-on-surface/70 flex items-center gap-1.5">
                                    <Ship size={14} className="text-md-sys-primary" /> Player Ships Flown
                                </h3>
                                {Object.keys(activeGroup.shipsUsed).length === 0 ? (
                                    <p className="text-label-xs text-md-sys-on-surface/40">No ship info recorded.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(activeGroup.shipsUsed)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([ship, count]) => (
                                                <div
                                                    key={ship}
                                                    className="px-3 py-1.5 rounded-xl bg-md-sys-primary/10 border border-md-sys-primary/20 flex items-center gap-2 text-label-xs transition-colors hover:bg-md-sys-primary/15"
                                                >
                                                    <span className="font-bold text-md-sys-on-surface">{ship}</span>
                                                    <span className="px-1.5 py-0.5 rounded-pill bg-md-sys-primary/20 text-md-sys-primary font-bold tabular-nums">
                                                        {count}x
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Matches Played History */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-label-sm font-bold uppercase tracking-wider text-md-sys-on-surface/70 flex items-center gap-1.5">
                                <Calendar size={14} className="text-md-sys-primary" /> Matches Played on Seed
                            </h3>
                            <div className="flex flex-col gap-2">
                                {activeGroup.matches.map((m) => {
                                    const mapSrc = tacticalMaps[m.id];
                                    const mapResolved = Object.prototype.hasOwnProperty.call(tacticalMaps, m.id);
                                    return (
                                        <div
                                            key={m.id}
                                            className={`p-3 rounded-xl bg-md-sys-on-surface/[0.02] border border-md-sys-outline/5 flex items-center gap-3 text-label-xs transition-colors hover:bg-md-sys-on-surface/[0.04] ${
                                                isAnimDisabled ? '' : 'duration-150'
                                            }`}
                                        >
                                            {mapSrc ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setLightboxSrc(mapSrc)}
                                                    aria-label={`Open tactical map for the ${m.date || new Date(m.timestamp).toLocaleDateString()} match`}
                                                    title="View tactical map"
                                                    className="relative shrink-0 w-28 aspect-video rounded-lg overflow-hidden bg-md-sys-on-surface/[0.06] border border-md-sys-outline/10 group"
                                                >
                                                    <LocalImage
                                                        src={mapSrc}
                                                        alt="Tactical map capture"
                                                        className="w-full h-full object-cover"
                                                        fallback={<div className="w-full h-full bg-md-sys-on-surface/[0.06]" />}
                                                    />
                                                    <div
                                                        className={`absolute inset-0 bg-scrim-40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-md-sys-on-surface ${
                                                            isAnimDisabled ? '' : 'transition-opacity'
                                                        }`}
                                                    >
                                                        <Eye size={16} />
                                                    </div>
                                                </button>
                                            ) : !mapResolved ? (
                                                <div
                                                    role="status"
                                                    aria-label="Loading tactical map preview"
                                                    className="relative shrink-0 w-28 aspect-video rounded-lg overflow-hidden bg-md-sys-on-surface/[0.06] border border-md-sys-outline/10 flex items-center justify-center text-md-sys-on-surface/40"
                                                >
                                                    <RefreshCw size={16} className={isAnimDisabled ? '' : 'animate-spin'} aria-hidden="true" />
                                                </div>
                                            ) : null}

                                            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span
                                                        className={`px-2 py-0.5 rounded-pill font-bold uppercase text-[10px] tracking-wide shrink-0 ${
                                                            m.result === 'Win'
                                                                ? 'bg-success/15 text-success'
                                                                : m.result === 'Loss'
                                                                ? 'bg-danger/15 text-danger'
                                                                : 'bg-info/15 text-info'
                                                        }`}
                                                    >
                                                        {m.result || 'Saved'}
                                                    </span>
                                                    <span className="font-semibold text-md-sys-on-surface truncate">{m.ship || 'Unknown Ship'}</span>
                                                    <span className="text-md-sys-on-surface/30 shrink-0">•</span>
                                                    <span className="text-md-sys-on-surface/60 truncate">{m.mode}</span>
                                                </div>

                                                <div className="flex items-center gap-3 text-md-sys-on-surface/50 shrink-0">
                                                    <span>{m.date || new Date(m.timestamp).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Tactical map lightbox */}
            {lightboxSrc && (
                <div className="fixed inset-0 z-modal bg-scrim-90 p-8" onClick={() => setLightboxSrc(null)}>
                    <div
                        ref={lightboxFocusTrapRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={lightboxTitleId}
                        className="w-full h-full"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 id={lightboxTitleId} className="a11y-sr-only">Tactical map preview</h2>
                        <button
                            type="button"
                            onClick={() => setLightboxSrc(null)}
                            aria-label="Close tactical map preview"
                            className="absolute top-4 right-4 text-md-sys-on-surface/60 hover:text-md-sys-on-surface z-10"
                        >
                            <X size={24} />
                        </button>
                        <LocalImage
                            src={lightboxSrc}
                            alt="Tactical map preview"
                            className="w-full h-full object-contain rounded-lg"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default SeedsPanel;

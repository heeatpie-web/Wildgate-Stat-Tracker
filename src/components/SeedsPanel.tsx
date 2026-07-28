import React, { useState, useMemo, useCallback, useEffect, useId, useRef } from 'react';
import {
    Hash,
    Copy,
    Check,
    AlertTriangle,
    ChevronRight,
    Search,
    ArrowUpDown,
    TrendingUp,
    MapPin,
    Ship,
    Crosshair,
    Calendar,
    Layers,
    Shield,
    Sparkles,
    Eye,
    X,
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
    lastPlayed: number;
}

export type SeedSortMode = 'recent' | 'count' | 'winrate';

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

    const lightboxTitleId = useId();
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

    // Filter and sort seed groups
    const filteredSeeds = useMemo(() => {
        let result = seedGroups;

        if (searchTerm.trim()) {
            const term = searchTerm.trim().toUpperCase();
            result = result.filter((g) => g.seed.includes(term));
        }

        return result.sort((a, b) => {
            if (sortMode === 'count') return b.totalMatches - a.totalMatches;
            if (sortMode === 'winrate') return b.winRate - a.winRate;
            return b.lastPlayed - a.lastPlayed;
        });
    }, [seedGroups, searchTerm, sortMode]);

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
            <div className="flex flex-col h-full min-h-0 rounded-card bg-md-sys-surface border border-md-sys-outline/10 p-3.5 gap-3 shadow-sm">
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

                        {/* Sort Toggle */}
                        <div className="flex items-center gap-1 bg-md-sys-on-surface/[0.04] p-1 rounded-lg border border-md-sys-outline/10">
                            <button
                                onClick={() => setSortMode('recent')}
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
                                className={`px-2 py-1 rounded text-label-xs font-semibold ${
                                    sortMode === 'count'
                                        ? 'bg-md-sys-primary/15 text-md-sys-primary'
                                        : 'text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
                                }`}
                                title="Sort by Match Count"
                            >
                                Count
                            </button>
                            <button
                                onClick={() => setSortMode('winrate')}
                                className={`px-2 py-1 rounded text-label-xs font-semibold ${
                                    sortMode === 'winrate'
                                        ? 'bg-md-sys-primary/15 text-md-sys-primary'
                                        : 'text-md-sys-on-surface/60 hover:text-md-sys-on-surface'
                                }`}
                                title="Sort by Win Rate"
                            >
                                Win %
                            </button>
                        </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40" />
                        <input
                            type="text"
                            placeholder="Filter seeds (e.g. A1B2)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-md-sys-on-surface/[0.04] text-label-sm text-md-sys-on-surface placeholder:text-md-sys-on-surface/40 border border-md-sys-outline/10 focus:outline-none focus:border-md-sys-primary/50 transition-colors"
                        />
                    </div>
                </div>

                {/* Seed List */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-1">
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
                                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                        isAnimDisabled ? '' : 'duration-150'
                                    } ${
                                        isSelected
                                            ? 'bg-md-sys-primary/10 border-md-sys-primary/30 text-md-sys-on-surface shadow-sm'
                                            : 'bg-md-sys-on-surface/[0.02] hover:bg-md-sys-on-surface/[0.06] border-md-sys-outline/5 text-md-sys-on-surface/80'
                                    }`}
                                >
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-label-md font-bold tracking-wider text-md-sys-primary">
                                                {group.seed}
                                            </span>
                                            {group.flags.length > 0 && (
                                                <span
                                                    className="text-amber-400"
                                                    title={`OCR flags: ${group.flags.join(', ')}`}
                                                >
                                                    <AlertTriangle size={12} />
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-label-xs text-md-sys-on-surface/50">
                                            <span>{group.totalMatches} {group.totalMatches === 1 ? 'match' : 'matches'}</span>
                                            <span>•</span>
                                            <span>{timeAgo(group.lastPlayed)}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span
                                            className={`px-2 py-0.5 rounded-pill text-label-xs font-bold ${
                                                group.winRate >= 60
                                                    ? 'bg-green-500/15 text-green-400 border border-green-500/25'
                                                    : group.winRate >= 40
                                                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                                                    : 'bg-red-500/15 text-red-400 border border-red-500/25'
                                            }`}
                                        >
                                            {group.winRate}% W
                                        </span>
                                        <ChevronRight size={14} className="text-md-sys-on-surface/30" />
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Column 2: Seed Detail */}
            <div className="flex flex-col h-full min-h-0 rounded-card bg-md-sys-surface border border-md-sys-outline/10 p-5 overflow-y-auto custom-scrollbar shadow-sm">
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
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-md-sys-primary/10 border border-md-sys-primary/20 backdrop-blur-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-md-sys-primary/20 flex items-center justify-center text-md-sys-primary">
                                    <Hash size={24} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="font-mono text-2xl font-black tracking-widest text-md-sys-on-surface">
                                            {activeGroup.seed}
                                        </h1>
                                        <button
                                            onClick={() => handleCopySeed(activeGroup.seed)}
                                            className="p-1.5 rounded-lg bg-md-sys-on-surface/[0.06] hover:bg-md-sys-on-surface/10 text-md-sys-on-surface/70 hover:text-md-sys-on-surface transition-colors"
                                            title="Copy seed hex"
                                        >
                                            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                    <p className="text-label-xs text-md-sys-on-surface/60 mt-0.5">
                                        First seen {new Date(Math.min(...activeGroup.matches.map((m) => m.timestamp))).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>

                            {activeGroup.flags.length > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-label-xs font-semibold">
                                    <AlertTriangle size={14} />
                                    <span>{activeGroup.flags.join(', ')}</span>
                                </div>
                            )}
                        </div>

                        {/* Top Stats Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3.5 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-1">
                                <span className="text-label-xs text-md-sys-on-surface/50 font-medium flex items-center gap-1">
                                    <Layers size={12} /> Total Matches
                                </span>
                                <span className="text-title-lg font-bold text-md-sys-on-surface">
                                    {activeGroup.totalMatches}
                                </span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-1">
                                <span className="text-label-xs text-md-sys-on-surface/50 font-medium flex items-center gap-1">
                                    <TrendingUp size={12} /> Win Rate
                                </span>
                                <span
                                    className={`text-title-lg font-bold ${
                                        activeGroup.winRate >= 50 ? 'text-green-400' : 'text-red-400'
                                    }`}
                                >
                                    {activeGroup.winRate}%
                                </span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-1">
                                <span className="text-label-xs text-md-sys-on-surface/50 font-medium flex items-center gap-1">
                                    <Shield size={12} /> Record (W/L/D)
                                </span>
                                <span className="text-title-lg font-bold text-md-sys-on-surface">
                                    {activeGroup.wins}/{activeGroup.losses}/{activeGroup.draws}
                                </span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-md-sys-on-surface/[0.03] border border-md-sys-outline/10 flex flex-col gap-1">
                                <span className="text-label-xs text-md-sys-on-surface/50 font-medium flex items-center gap-1">
                                    <MapPin size={12} /> Hazards Found
                                </span>
                                <span className="text-title-lg font-bold text-md-sys-on-surface">
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
                                    <div className="flex flex-col gap-2">
                                        {Object.entries(activeGroup.hazards).map(([hazard, count]) => {
                                            const pct = Math.round((count / activeGroup.totalMatches) * 100);
                                            return (
                                                <div key={hazard} className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between text-label-xs">
                                                        <span className="font-semibold text-md-sys-on-surface">{hazard}</span>
                                                        <span className="text-md-sys-on-surface/50">{count}x ({pct}%)</span>
                                                    </div>
                                                    <div className="w-full h-1.5 rounded-full bg-md-sys-on-surface/10 overflow-hidden">
                                                        <div
                                                            className="h-full bg-md-sys-primary rounded-full"
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
                                        {Object.entries(activeGroup.shipsUsed).map(([ship, count]) => (
                                            <div
                                                key={ship}
                                                className="px-3 py-1.5 rounded-xl bg-md-sys-primary/10 border border-md-sys-primary/20 flex items-center gap-2 text-label-xs"
                                            >
                                                <span className="font-bold text-md-sys-on-surface">{ship}</span>
                                                <span className="px-1.5 py-0.5 rounded-pill bg-md-sys-primary/20 text-md-sys-primary font-bold">
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
                                    return (
                                        <div
                                            key={m.id}
                                            className="p-3 rounded-xl bg-md-sys-on-surface/[0.02] border border-md-sys-outline/5 flex items-center gap-3 text-label-xs"
                                        >
                                            {mapSrc && (
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
                                            )}

                                            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span
                                                        className={`px-2 py-0.5 rounded-pill font-bold uppercase text-[10px] ${
                                                            m.result === 'Win'
                                                                ? 'bg-green-500/15 text-green-400'
                                                                : m.result === 'Loss'
                                                                ? 'bg-red-500/15 text-red-400'
                                                                : 'bg-amber-500/15 text-amber-400'
                                                        }`}
                                                    >
                                                        {m.result || 'Saved'}
                                                    </span>
                                                    <span className="font-semibold text-md-sys-on-surface truncate">{m.ship || 'Unknown Ship'}</span>
                                                    <span className="text-md-sys-on-surface/40">•</span>
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

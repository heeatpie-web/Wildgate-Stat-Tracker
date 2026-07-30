import React, { useState, useMemo, useCallback, useEffect, useId, useRef } from 'react';
import {
    Hash,
    AlertTriangle,
    ChevronDown,
    Search,
    Eye,
    RefreshCw,
    X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { Match } from '../types';
import { getMatchArtifactsStructured } from '../utils/artifactService';
import { classifyArtifactScreenshotBucket } from '../utils/artifactScreenshotBuckets';
import { normalizeMatchCategory, getMatchCategoryKey } from '../utils/matchCategory';
import { getUpdateForTimestamp } from '../data/gamePatches';
import { getElectronAPI } from '../utils/electronAPI';
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
    categories: string[];
    lastPlayed: number;
    latestMatch: Match;
}

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

/** Reads a local image off disk and writes it to the OS clipboard as an image. */
const copyImageToClipboard = async (path: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api) return false;
    try {
        const base64 = await api.invoke('read-file-base64', path) as string | null;
        if (!base64) return false;
        const ext = path.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : ext === 'webp' ? 'image/webp'
                : ext === 'bmp' ? 'image/bmp'
                    : 'image/png';
        const response = await fetch(`data:${mime};base64,${base64}`);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return true;
    } catch {
        return false;
    }
};

const eraLabelForMatch = (match: Match): string => getUpdateForTimestamp(match.timestamp)?.label || '';

const resultPillClass = (result?: string): string => (
    result === 'Win' ? 'bg-success/15 text-success'
        : result === 'Loss' ? 'bg-danger/15 text-danger'
            : 'bg-info/15 text-info'
);

const TABLE_GRID_COLS = 'grid-cols-[1.15fr_0.9fr_0.7fr_1.15fr_1.1fr_1fr_32px]';

interface MatchHistoryRowProps {
    match: Match;
    mapSrc: string | null | undefined;
    mapResolved: boolean;
    isAnimDisabled: boolean;
    onOpenMap: (match: Match, src: string) => void;
    onCopyMap: (src: string) => void;
}

const MatchHistoryRow: React.FC<MatchHistoryRowProps> = ({ match: m, mapSrc, mapResolved, isAnimDisabled, onOpenMap, onCopyMap }) => (
    <div className="flex items-center gap-3 p-2.5 rounded-control bg-md-sys-surface border border-md-sys-outline/[0.06]">
        {mapSrc ? (
            <button
                type="button"
                onClick={() => onOpenMap(m, mapSrc)}
                onDoubleClick={(e) => { e.stopPropagation(); onCopyMap(mapSrc); }}
                aria-label={`Open tactical map for the ${m.date || new Date(m.timestamp).toLocaleDateString()} match`}
                title="Click to view · double-click to copy"
                className="relative shrink-0 w-[70px] aspect-video rounded-control overflow-hidden bg-md-sys-on-surface/[0.06] border border-md-sys-outline/10 group"
            >
                <LocalImage
                    src={mapSrc}
                    alt="Tactical map capture"
                    className="w-full h-full object-cover"
                    fallback={<div className="w-full h-full bg-md-sys-on-surface/[0.06]" />}
                />
                <div className={`absolute inset-0 bg-scrim-40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-on-scrim ${isAnimDisabled ? '' : 'transition-opacity'}`}>
                    <Eye size={14} />
                </div>
            </button>
        ) : !mapResolved ? (
            <div
                role="status"
                aria-label="Loading tactical map preview"
                className="relative shrink-0 w-[70px] aspect-video rounded-control overflow-hidden bg-md-sys-on-surface/[0.06] border border-md-sys-outline/10 flex items-center justify-center text-md-sys-on-surface/40"
            >
                <RefreshCw size={14} className={isAnimDisabled ? '' : 'animate-spin'} aria-hidden="true" />
            </div>
        ) : null}
        <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-pill shrink-0 ${resultPillClass(m.result)}`}>
            {m.result || 'Saved'}
        </span>
        <span className="text-body font-bold flex-1 min-w-0 truncate">{m.ship || 'Unknown Ship'}</span>
        <span className="text-label-sm text-md-sys-on-surface/55 shrink-0">{m.date || new Date(m.timestamp).toLocaleDateString()}</span>
    </div>
);

export const SeedsPanel: React.FC = () => {
    const matches = useAppStore((s) => s.matches) || [];
    const performanceMode = useAppStore((s) => s.performanceMode) || false;
    const disableAnimations = useAppStore((s) => s.disableAnimations) || false;
    const isAnimDisabled = performanceMode || disableAnimations;

    const [searchTerm, setSearchTerm] = useState('');
    const [hazardFilter, setHazardFilter] = useState('');
    const [expandedSeeds, setExpandedSeeds] = useState<Set<string>>(new Set());
    const [copyToast, setCopyToast] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<{ src: string; ship: string; date: string } | null>(null);
    const [tacticalMaps, setTacticalMaps] = useState<Record<number, string | null>>({});
    const requestedTacticalMaps = useRef<Set<number>>(new Set());
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const lightboxTitleId = useId();
    const seedSearchInputId = useId();
    const lightboxFocusTrapRef = useFocusTrap<HTMLDivElement>(Boolean(lightbox));
    useKeyboardShortcuts([
        { key: 'Escape', handler: () => setLightbox(null) },
    ], Boolean(lightbox));

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

                if (match.timestamp >= existing.lastPlayed) {
                    existing.lastPlayed = match.timestamp;
                    existing.latestMatch = match;
                }

                if (Array.isArray(match.reachModifiers)) {
                    match.reachModifiers.forEach((h) => {
                        existing.hazards[h] = (existing.hazards[h] || 0) + 1;
                    });
                }
                if (match.ship) {
                    existing.shipsUsed[match.ship] = (existing.shipsUsed[match.ship] || 0) + 1;
                }
                if (match.mode) {
                    existing.modes[match.mode] = (existing.modes[match.mode] || 0) + 1;
                }
                const normalizedCategory = normalizeMatchCategory(match.matchCategory);
                if (normalizedCategory && !existing.categories.some((c) => getMatchCategoryKey(c) === getMatchCategoryKey(normalizedCategory))) {
                    existing.categories.push(normalizedCategory);
                }
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
                if (match.ship) shipsUsed[match.ship] = 1;

                const modes: Record<string, number> = {};
                if (match.mode) modes[match.mode] = 1;

                const normalizedCategory = normalizeMatchCategory(match.matchCategory);

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
                    categories: normalizedCategory ? [normalizedCategory] : [],
                    lastPlayed: match.timestamp,
                    latestMatch: match,
                });
            }
        }

        const list = Array.from(groups.values());
        list.forEach((g) => {
            const decided = g.wins + g.losses;
            g.winRate = decided > 0 ? Math.round((g.wins / decided) * 100) : (g.wins > 0 ? 100 : 0);
            g.matches.sort((a, b) => b.timestamp - a.timestamp);
        });

        return list.sort((a, b) => b.lastPlayed - a.lastPlayed);
    }, [matches]);

    // Fixed-order chip row derived from every hazard actually present across seeds, each with a live match count.
    const hazardChips = useMemo(() => {
        const counts = new Map<string, number>();
        seedGroups.forEach((g) => {
            Object.keys(g.hazards).forEach((h) => counts.set(h, (counts.get(h) || 0) + 1));
        });
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        return [{ name: '', label: 'All hazards', count: seedGroups.length }, ...sorted.map(([name, count]) => ({ name, label: `${name} · ${count}`, count }))];
    }, [seedGroups]);

    const filteredSeeds = useMemo(() => {
        let result = seedGroups;
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toUpperCase();
            result = result.filter((g) => g.seed.includes(term));
        }
        if (hazardFilter) {
            result = result.filter((g) => hazardFilter in g.hazards);
        }
        return result;
    }, [seedGroups, searchTerm, hazardFilter]);

    // Resolve tactical map captures only for matches belonging to an expanded seed.
    useEffect(() => {
        const expandedGroups = seedGroups.filter((g) => expandedSeeds.has(g.seed));
        const pending = expandedGroups
            .flatMap((g) => g.matches)
            .filter((m) => !requestedTacticalMaps.current.has(m.id));
        if (pending.length === 0) return;
        pending.forEach((m) => requestedTacticalMaps.current.add(m.id));

        let cancelled = false;
        (async () => {
            const resolved = await Promise.all(
                pending.map(async (m) => [m.id, await resolveTacticalMapPath(m)] as const)
            );
            if (cancelled) {
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
    }, [expandedSeeds, seedGroups]);

    const showCopyToast = useCallback((message: string) => {
        setCopyToast(message);
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setCopyToast(null), 1400);
    }, []);

    useEffect(() => () => clearTimeout(toastTimerRef.current), []);

    const handleCopySeed = useCallback((e: React.MouseEvent, seed: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(seed);
        showCopyToast(`Copied ${seed}`);
    }, [showCopyToast]);

    const handleHazardTagClick = useCallback((e: React.MouseEvent, hazard: string) => {
        e.stopPropagation();
        setHazardFilter((current) => (current === hazard ? '' : hazard));
    }, []);

    const toggleRow = useCallback((seed: string) => {
        setExpandedSeeds((prev) => {
            const next = new Set(prev);
            if (next.has(seed)) next.delete(seed);
            else next.add(seed);
            return next;
        });
    }, []);

    const handleOpenMap = useCallback((match: Match, src: string) => {
        setLightbox({ src, ship: match.ship || 'Unknown Ship', date: match.date || new Date(match.timestamp).toLocaleDateString() });
    }, []);

    const handleCopyMapImage = useCallback((src: string) => {
        void copyImageToClipboard(src).then((ok) => {
            if (ok) showCopyToast('Copied map image');
        });
    }, [showCopyToast]);

    return (
        <div className="w-full flex-1 h-full min-h-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar rounded-2xl p-1">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center justify-between shrink-0">
                <div className="relative flex-1 min-w-[240px] max-w-[340px]">
                    <label htmlFor={seedSearchInputId} className="a11y-sr-only">Filter seeds</label>
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40" />
                    <input
                        id={seedSearchInputId}
                        type="text"
                        placeholder="Filter seeds…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-control bg-md-sys-surface-container-high text-body text-md-sys-on-surface placeholder:text-md-sys-on-surface/40 border border-md-sys-outline/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary transition-colors hover:border-md-sys-outline/40"
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {hazardChips.map((chip) => {
                        const isActive = hazardFilter === chip.name;
                        return (
                            <button
                                key={chip.name || 'all'}
                                onClick={() => setHazardFilter(chip.name)}
                                aria-pressed={isActive}
                                className={`px-3 py-1.5 rounded-pill text-label-sm font-bold border transition-colors ${
                                    isActive
                                        ? 'bg-md-sys-primary text-md-sys-onPrimary border-transparent'
                                        : 'bg-md-sys-surface-container-high text-md-sys-on-surface/60 border-md-sys-outline/10 hover:text-md-sys-on-surface'
                                }`}
                            >
                                {chip.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-card border border-md-sys-outline/10 mg-surface-high overflow-hidden">
                <div className={`grid ${TABLE_GRID_COLS} gap-0 px-5 py-3 bg-md-sys-surface-container text-label-xs font-extrabold uppercase tracking-wide-04 text-md-sys-on-surface/50`}>
                    <span>Seed</span>
                    <span>Ship</span>
                    <span>Result</span>
                    <span>Hazards</span>
                    <span>Categories</span>
                    <span className="text-center">Captured</span>
                    <span />
                </div>

                {filteredSeeds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center p-10 text-md-sys-on-surface/50 gap-2 border-t border-md-sys-outline/[0.06]">
                        <Hash size={32} className="opacity-30" />
                        <p className="text-label-sm font-medium">No map seeds found</p>
                        <p className="text-label-xs opacity-75">
                            Seeds are automatically captured from the Tactical Map screen during matches.
                        </p>
                    </div>
                ) : (
                    filteredSeeds.map((group) => {
                        const isExpanded = expandedSeeds.has(group.seed);
                        const multiShip = Object.keys(group.shipsUsed).length > 1;
                        const shipCount = Object.keys(group.shipsUsed).length;
                        const hazardEntries = Object.keys(group.hazards);
                        const era = eraLabelForMatch(group.latestMatch);

                        return (
                            <div key={group.seed} className="border-t border-md-sys-outline/[0.06]">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isExpanded}
                                    onClick={() => toggleRow(group.seed)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleRow(group.seed);
                                        }
                                    }}
                                    className={`grid ${TABLE_GRID_COLS} gap-0 items-center px-5 py-3.5 cursor-pointer hover:bg-md-sys-surface-container transition-colors ${isAnimDisabled ? '' : 'duration-150'}`}
                                >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                            onClick={(e) => handleCopySeed(e, group.seed)}
                                            title="Click to copy"
                                            className="cursor-pointer font-mono font-bold text-[14.5px] text-md-sys-primary truncate"
                                        >
                                            {group.seed}
                                        </span>
                                        {group.flags.length > 0 && (
                                            <span title={`OCR flags: ${group.flags.join(', ')}`} className="text-warning shrink-0">
                                                <AlertTriangle size={12} />
                                            </span>
                                        )}
                                        {group.totalMatches > 1 && (
                                            <span className="text-[10.5px] font-extrabold text-md-sys-on-surface/60 shrink-0">
                                                ×{group.totalMatches}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-body text-md-sys-on-surface/75 truncate">{group.latestMatch.ship || 'Unknown'}</span>
                                        {multiShip && (
                                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-pill bg-md-sys-on-surface/[0.08] text-md-sys-on-surface/65 whitespace-nowrap shrink-0">
                                                {shipCount} ships
                                            </span>
                                        )}
                                    </div>

                                    <span className={`text-[10.5px] font-extrabold uppercase px-2.5 py-0.5 rounded-pill w-fit ${resultPillClass(group.latestMatch.result)}`}>
                                        {group.latestMatch.result || 'Saved'}
                                    </span>

                                    <div className="flex flex-wrap gap-1">
                                        {hazardEntries.slice(0, 2).map((h) => (
                                            <span
                                                key={h}
                                                onClick={(e) => handleHazardTagClick(e, h)}
                                                title="Show matches with this hazard"
                                                className="cursor-pointer text-[10.5px] font-bold px-2 py-0.5 rounded-pill bg-warning/10 text-warning"
                                            >
                                                {h}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        {group.categories.map((c) => (
                                            <span key={c} className="text-[10.5px] font-bold px-2 py-0.5 rounded-pill bg-info/10 text-info">
                                                {c}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-label-sm text-md-sys-on-surface/60 font-bold">
                                            {group.latestMatch.date || new Date(group.latestMatch.timestamp).toLocaleDateString()}
                                        </span>
                                        {era && <span className="text-[10.5px] text-md-sys-on-surface/40">{era}</span>}
                                    </div>

                                    <ChevronDown
                                        size={14}
                                        className={`text-md-sys-on-surface/60 justify-self-center transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                </div>

                                {isExpanded && (
                                    <div className="px-6 pt-1 pb-5 bg-md-sys-surface-container border-t border-md-sys-outline/[0.06] flex flex-col gap-3.5">
                                        <div className="flex flex-wrap gap-2 pt-3">
                                            {Object.entries(group.shipsUsed).sort(([, a], [, b]) => b - a).map(([ship, count]) => (
                                                <span key={ship} className="text-label-sm font-bold px-3 py-1 rounded-pill bg-md-sys-primary/10 text-md-sys-primary">
                                                    {count > 1 ? `${ship} · ${count}×` : ship}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {group.matches.map((m) => (
                                                <MatchHistoryRow
                                                    key={m.id}
                                                    match={m}
                                                    mapSrc={tacticalMaps[m.id]}
                                                    mapResolved={Object.prototype.hasOwnProperty.call(tacticalMaps, m.id)}
                                                    isAnimDisabled={isAnimDisabled}
                                                    onOpenMap={handleOpenMap}
                                                    onCopyMap={handleCopyMapImage}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Copy toast */}
            {copyToast && (
                <div className="fixed bottom-6 right-6 z-top-second bg-md-sys-primary text-md-sys-onPrimary px-4 py-2.5 rounded-control text-label-sm font-bold shadow-2xl animate-fade-in">
                    {copyToast}
                </div>
            )}

            {/* Map lightbox */}
            {lightbox && (
                <div className="fixed inset-0 z-modal bg-scrim-60 p-8 flex items-center justify-center" onClick={() => setLightbox(null)}>
                    <div
                        ref={lightboxFocusTrapRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={lightboxTitleId}
                        className="w-full max-w-[640px] rounded-modal mg-surface-high p-5 flex flex-col gap-3.5"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h2 id={lightboxTitleId} className="text-title font-extrabold text-md-sys-on-surface">
                                {lightbox.ship} · {lightbox.date}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setLightbox(null)}
                                aria-label="Close tactical map preview"
                                className="w-8 h-8 rounded-control bg-md-sys-on-surface/[0.06] hover:bg-md-sys-on-surface/10 flex items-center justify-center text-md-sys-on-surface/70"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="aspect-video rounded-card overflow-hidden bg-md-sys-on-surface/[0.06]" onDoubleClick={() => handleCopyMapImage(lightbox.src)}>
                            <LocalImage
                                src={lightbox.src}
                                alt="Tactical map preview"
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <p className="text-label-sm text-md-sys-on-surface/50">
                            Double-click a thumbnail to copy its image to the clipboard.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SeedsPanel;

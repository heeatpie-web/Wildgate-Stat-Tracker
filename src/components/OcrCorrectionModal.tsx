import React, { useState, useMemo } from 'react';
import { X, Check, AlertTriangle, User, Ship, Search } from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
import { useAppStore } from '../store/useAppStore';
import Logger from '../utils/logger';

interface OcrCorrectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAcceptAll: () => void;
}

interface DetectedPlayer {
    name: string;
    teamColor: string;
    teamName?: string;
    shipType?: string;
    confidence?: number;
}

export const OcrCorrectionModal: React.FC<OcrCorrectionModalProps> = ({ isOpen, onClose, onAcceptAll }) => {
    const { sessionTeams, sessionShipTypes, pilotRegistry, addToRegistry } = useGameData();
    const { setPlayerName, recordOcrCorrection, ocrCorrections } = useAppStore();

    const [corrections, setCorrections] = useState<Record<string, string>>({});
    const [ignored, setIgnored] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});

    // Collect all detected players from session
    const detectedPlayers = useMemo(() => {
        const players: DetectedPlayer[] = [];
        if (!sessionTeams) return players;

        Object.entries(sessionTeams).forEach(([teamKey, teamPlayers]) => {
            const [color, teamName] = teamKey.includes(':') ? teamKey.split(':').map(s => s.trim()) : [teamKey, undefined];
            (teamPlayers as string[]).forEach(name => {
                // Check if this name has a prior correction
                const priorCorrection = ocrCorrections?.[name];
                players.push({
                    name,
                    teamColor: color,
                    teamName,
                    shipType: sessionShipTypes?.[name],
                    confidence: priorCorrection ? 95 : 70 // Simulated - in real impl, store confidence from OCR
                });
            });
        });
        return players;
    }, [sessionTeams, sessionShipTypes, ocrCorrections]);

    // Filter pilot registry for autocomplete
    const getFilteredRegistry = (playerName: string) => {
        const query = searchQuery[playerName]?.toLowerCase() || '';
        if (!query) return pilotRegistry.slice(0, 10);
        return pilotRegistry.filter(p => p.toLowerCase().includes(query)).slice(0, 10);
    };

    const handleCorrection = (ocrName: string, correctedName: string) => {
        setCorrections(prev => ({ ...prev, [ocrName]: correctedName }));
        setSearchQuery(prev => ({ ...prev, [ocrName]: '' }));
    };

    const handleIgnore = (name: string) => {
        setIgnored(prev => new Set([...prev, name]));
        setCorrections(prev => {
            const { [name]: _, ...rest } = prev;
            return rest;
        });
    };

    const handleUnignore = (name: string) => {
        setIgnored(prev => {
            const next = new Set(prev);
            next.delete(name);
            return next;
        });
    };

    const handleAcceptNewPlayer = (name: string) => {
        if (!pilotRegistry.includes(name)) {
            addToRegistry(name);
            Logger.info('OcrCorrection', `Added new player to registry: ${name}`);
        }
        handleCorrection(name, name);
    };

    const handleSubmitCorrections = () => {
        let corrected = 0;
        let added = 0;

        Object.entries(corrections).forEach(([ocrName, correctedName]) => {
            if (ignored.has(ocrName)) return;

            if (ocrName !== correctedName) {
                // Record correction for future matching
                recordOcrCorrection?.(ocrName, correctedName);
                setPlayerName(ocrName, correctedName);
                corrected++;
                Logger.info('OcrCorrection', `Linked "${ocrName}" -> "${correctedName}"`);
            } else {
                // Accept as-is (already in registry from handleAcceptNewPlayer)
                added++;
            }
        });

        Logger.info('OcrCorrection', `Corrections applied: ${corrected} linked, ${added} accepted as-is, ${ignored.size} ignored`);
        onAcceptAll();
    };

    const handleAcceptAllHigh = () => {
        // Auto-accept all players with prior corrections or high simulated confidence
        const autoCorrections: Record<string, string> = {};
        detectedPlayers.forEach(p => {
            if (ignored.has(p.name)) return;
            const priorCorrection = ocrCorrections?.[p.name];
            if (priorCorrection) {
                autoCorrections[p.name] = priorCorrection.correctedTo;
            } else if ((p.confidence || 0) >= 80) {
                autoCorrections[p.name] = p.name;
            }
        });
        setCorrections(prev => ({ ...prev, ...autoCorrections }));
    };

    if (!isOpen) return null;

    const getConfidenceColor = (conf: number) => {
        if (conf >= 80) return 'text-green-400';
        if (conf >= 40) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getConfidenceBg = (conf: number) => {
        if (conf >= 80) return 'bg-green-500/20 border-green-500/30';
        if (conf >= 40) return 'bg-yellow-500/20 border-yellow-500/30';
        return 'bg-red-500/20 border-red-500/30';
    };

    return (
        <div
            className="fixed inset-0 md3-dialog-scrim z-[99998] flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="md3-dialog w-full max-w-2xl max-h-[85vh] flex flex-col animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <User size={20} className="text-md-sys-primary" />
                        <h2 className="md3-dialog-title text-base">Review Detected Players</h2>
                        <span className="md3-chip text-[11px] font-mono">
                            {detectedPlayers.length} found
                        </span>
                    </div>
                    <button onClick={onClose} className="md3-icon-btn" title="Close">
                        <X size={20} />
                    </button>
                </div>

                {/* Player List */}
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar md3-dialog-content">
                    {detectedPlayers.length === 0 ? (
                        <div className="text-center opacity-50 py-8">
                            No players detected in this session
                        </div>
                    ) : (
                        detectedPlayers.map((player, idx) => {
                            const isIgnored = ignored.has(player.name);
                            const hasCorrected = corrections[player.name];
                            const priorCorrection = ocrCorrections?.[player.name];
                            const conf = player.confidence || 70;

                            return (
                                <div
                                    key={`${player.name}-${idx}`}
                                    className={`md3-card p-3 rounded-xl border transition-all ${
                                        isIgnored
                                            ? 'bg-md-sys-on-surface/5 border-md-sys-outline-variant/30 opacity-50'
                                            : hasCorrected
                                                ? 'bg-green-500/10 border-green-500/30'
                                                : getConfidenceBg(conf)
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        {/* Player Info */}
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            {/* Team Color Badge */}
                                            <div
                                                className="w-3 h-8 rounded-full flex-shrink-0"
                                                style={{
                                                    backgroundColor: player.teamColor.toLowerCase() === 'unknown'
                                                        ? 'var(--md-sys-color-outline-variant)'
                                                        : player.teamColor.toLowerCase()
                                                }}
                                            />

                                            {/* Name & Details */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold truncate">{player.name}</span>
                                                    <span className={`text-xs ${getConfidenceColor(conf)}`}>
                                                        ({conf}%)
                                                    </span>
                                                    {priorCorrection && (
                                                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                                                            Previously linked
                                                        </span>
                                                    )}
                                                </div>
                                                {player.shipType && (
                                                    <div className="flex items-center gap-1 text-xs opacity-50 mt-0.5">
                                                        <Ship size={10} />
                                                        {player.shipType}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                                {isIgnored ? (
                                            <button
                                                onClick={() => handleUnignore(player.name)}
                                                className="md3-btn-text text-xs"
                                            >
                                                Undo Ignore
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                {/* Correction Dropdown */}
                                                <div className="relative">
                                                    <div className="md3-textfield md3-textfield--outlined flex items-center gap-1 px-2 py-1">
                                                        <Search size={12} className="opacity-50" />
                                                        <input
                                                            type="text"
                                                            placeholder="Link to..."
                                                            value={searchQuery[player.name] || corrections[player.name] || ''}
                                                            onChange={e => setSearchQuery(prev => ({ ...prev, [player.name]: e.target.value }))}
                                                            className="bg-transparent text-sm w-28 outline-none"
                                                        />
                                                    </div>

                                                    {/* Autocomplete Dropdown */}
                                                    {searchQuery[player.name] && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 md3-card rounded-lg shadow-xl z-10 max-h-32 overflow-y-auto">
                                                            {getFilteredRegistry(player.name).map(p => (
                                                                <button
                                                                    key={p}
                                                                    onClick={() => handleCorrection(player.name, p)}
                                                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-md-sys-on-surface/10 truncate"
                                                                >
                                                                    {p}
                                                                </button>
                                                            ))}
                                                            {getFilteredRegistry(player.name).length === 0 && (
                                                                <div className="px-3 py-2 text-xs opacity-50">No matches</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Accept as New */}
                                                {!pilotRegistry.includes(player.name) && !hasCorrected && (
                                                    <button
                                                        onClick={() => handleAcceptNewPlayer(player.name)}
                                                        className="md3-btn-text text-xs text-emerald-400 whitespace-nowrap"
                                                    >
                                                        + New
                                                    </button>
                                                )}

                                                {/* Ignore */}
                                                <button
                                                    onClick={() => handleIgnore(player.name)}
                                                    className="md3-btn-text text-xs text-red-400"
                                                >
                                                    Ignore
                                                </button>

                                                {/* Checkmark if corrected */}
                                                {hasCorrected && (
                                                    <Check size={16} className="text-green-400" />
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Show correction target */}
                                    {hasCorrected && hasCorrected !== player.name && (
                                        <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
                                            <span className="opacity-50">Linked to:</span>
                                            <span className="font-semibold">{hasCorrected}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="md3-dialog-actions w-full justify-between">
                    <button
                        onClick={onClose}
                        className="md3-btn-text"
                    >
                        Skip Review
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleAcceptAllHigh}
                            className="md3-btn-tonal"
                        >
                            Auto-Accept High
                        </button>
                        <button
                            onClick={handleSubmitCorrections}
                            className="md3-btn-filled flex items-center gap-2"
                        >
                            <Check size={16} />
                            Apply Corrections
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


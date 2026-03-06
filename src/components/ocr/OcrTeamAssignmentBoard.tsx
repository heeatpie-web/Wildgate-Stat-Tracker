import React, { useMemo, useRef, useState } from 'react';
import { GripVertical, Plus, Shield, Trash2, UserPlus, Wand2, X } from 'lucide-react';

export interface OcrTeamAssignmentTeam {
    key: string;
    color: string;
    teamName: string;
    shipType: string;
    players: string[];
}

interface FriendlyFixedPlayer {
    canonicalName: string;
    label: string;
    tone?: 'success' | 'info';
}

interface DraggedPlayerPayload {
    teamIndex: number;
    playerIndex: number;
}

interface OcrTeamAssignmentBoardProps {
    teams: OcrTeamAssignmentTeam[];
    shipOptions: string[];
    rosterSuggestionsId?: string;
    compact?: boolean;
    className?: string;
    dataTestId?: string;
    friendlyTeamIndex?: number;
    allowColorEdit?: boolean;
    allowTeamAddRemove?: boolean;
    fuzzyMatches?: Record<string, string>;
    pilotRegistry?: string[];
    ocrDetectedTeamIndices?: Set<number>;
    friendlyFixedPlayer?: FriendlyFixedPlayer | null;
    onTeamNameChange?: (teamIndex: number, value: string) => void;
    onTeamColorChange?: (teamIndex: number, value: string) => void;
    onTeamShipChange: (teamIndex: number, value: string) => void;
    onTeamRemove?: (teamIndex: number) => void;
    onTeamAdd?: () => void;
    onPlayerChange: (teamIndex: number, playerIndex: number, value: string) => void;
    onPlayerRemove: (teamIndex: number, playerIndex: number) => void;
    onPlayerAdd: (teamIndex: number, value: string) => void;
    onPlayerMove: (
        fromTeamIndex: number,
        fromPlayerIndex: number,
        toTeamIndex: number,
        toPlayerIndex?: number | null
    ) => void;
    onAddToRoster?: (name: string) => void;
}

const TEAM_COLOR_OPTIONS = ['red', 'orange', 'yellow', 'yellowgreen', 'green', 'blue', 'cyan', 'purple', 'friendly', 'unknown'] as const;
const TEAM_COLOR_CYCLE = ['red', 'orange', 'yellow', 'yellowgreen', 'green', 'blue', 'cyan', 'purple', 'unknown'] as const;
const DRAG_DATA_KEY = 'application/x-wildgate-player-drag';
const TEAM_COLOR_OPTION_LIST = [...TEAM_COLOR_CYCLE];

const normalizeColorToken = (value: string): string => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'unknown';
    const compact = normalized.replace(/[\s_-]+/g, '');
    if (compact.includes('yellowgreen') || compact.includes('chartreuse') || compact.includes('lime')) return 'yellowgreen';
    if (TEAM_COLOR_OPTIONS.includes(normalized as typeof TEAM_COLOR_OPTIONS[number])) return normalized;
    return 'unknown';
};

const parseDragPayload = (raw: string): DraggedPlayerPayload | null => {
    try {
        const parsed = JSON.parse(raw) as DraggedPlayerPayload;
        if (!Number.isInteger(parsed?.teamIndex) || !Number.isInteger(parsed?.playerIndex)) return null;
        if (parsed.teamIndex < 0 || parsed.playerIndex < 0) return null;
        return parsed;
    } catch {
        return null;
    }
};

const buildDragPayload = (payload: DraggedPlayerPayload): string => JSON.stringify(payload);
const normalizePlayerKey = (value: string): string => String(value || '').trim().toLowerCase();
const nextTeamColor = (current: string): string => {
    const normalized = normalizeColorToken(current);
    const currentIndex = TEAM_COLOR_OPTION_LIST.indexOf(normalized as typeof TEAM_COLOR_OPTION_LIST[number]);
    if (currentIndex < 0) return 'unknown';
    const nextIndex = (currentIndex + 1) % TEAM_COLOR_OPTION_LIST.length;
    return TEAM_COLOR_OPTION_LIST[nextIndex];
};

export const OcrTeamAssignmentBoard: React.FC<OcrTeamAssignmentBoardProps> = ({
    teams,
    shipOptions,
    rosterSuggestionsId,
    compact = false,
    className = '',
    dataTestId = 'ocr-team-assignment-board',
    friendlyTeamIndex = -1,
    allowColorEdit = false,
    allowTeamAddRemove = false,
    fuzzyMatches = {},
    pilotRegistry = [],
    ocrDetectedTeamIndices,
    friendlyFixedPlayer = null,
    onTeamNameChange,
    onTeamColorChange,
    onTeamShipChange,
    onTeamRemove,
    onTeamAdd,
    onPlayerChange,
    onPlayerRemove,
    onPlayerAdd,
    onPlayerMove,
    onAddToRoster,
}) => {
    const [draggedPlayer, setDraggedPlayer] = useState<DraggedPlayerPayload | null>(null);
    const [dragHoverTeamIndex, setDragHoverTeamIndex] = useState<number | null>(null);
    const [draftPlayers, setDraftPlayers] = useState<Record<number, string>>({});
    const draggedPlayerRef = useRef<DraggedPlayerPayload | null>(null);

    const densityClass = compact ? 'ocr-assignment-board--compact' : 'ocr-assignment-board--full';
    const shipOptionsWithUnknown = useMemo(() => {
        const deduped = new Set<string>();
        const list: string[] = [];
        shipOptions.forEach((ship) => {
            const cleaned = String(ship || '').trim();
            if (!cleaned || deduped.has(cleaned.toLowerCase())) return;
            deduped.add(cleaned.toLowerCase());
            list.push(cleaned);
        });
        return list;
    }, [shipOptions]);

    const resolveDraggedPlayer = (event: React.DragEvent<HTMLElement>): DraggedPlayerPayload | null => {
        if (draggedPlayer) return draggedPlayer;
        if (draggedPlayerRef.current) return draggedPlayerRef.current;
        const nativePayload = event.dataTransfer.getData(DRAG_DATA_KEY)
            || event.dataTransfer.getData('text/plain')
            || event.dataTransfer.getData('text')
            || event.dataTransfer.getData('application/json');
        return parseDragPayload(nativePayload);
    };

    const allowDrop = (event: React.DragEvent<HTMLElement>, teamIndex: number) => {
        const dragTypes = Array.from(event.dataTransfer.types || []);
        const hasKnownDragType = dragTypes.includes(DRAG_DATA_KEY) || dragTypes.includes('text/plain');
        const payload = resolveDraggedPlayer(event);
        if (!payload && !draggedPlayer && !hasKnownDragType) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragHoverTeamIndex(teamIndex);
    };

    const dropPlayer = (
        event: React.DragEvent<HTMLElement>,
        teamIndex: number,
        playerIndex?: number | null
    ) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = resolveDraggedPlayer(event);
        if (!payload) return;
        onPlayerMove(
            payload.teamIndex,
            payload.playerIndex,
            teamIndex,
            playerIndex
        );
        setDraggedPlayer(null);
        draggedPlayerRef.current = null;
        setDragHoverTeamIndex(null);
    };

    const startDrag = (
        event: React.DragEvent<HTMLButtonElement>,
        teamIndex: number,
        playerIndex: number
    ) => {
        const payload: DraggedPlayerPayload = { teamIndex, playerIndex };
        const serialized = buildDragPayload(payload);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(DRAG_DATA_KEY, serialized);
        event.dataTransfer.setData('text/plain', serialized);
        event.dataTransfer.setData('text', serialized);
        event.dataTransfer.setData('application/json', serialized);
        setDraggedPlayer(payload);
        draggedPlayerRef.current = payload;
    };

    const addPlayer = (teamIndex: number) => {
        const candidate = String(draftPlayers[teamIndex] || '').trim();
        if (!candidate) return;
        const existing = new Set(
            (teams[teamIndex]?.players || [])
                .map((playerName) => String(playerName || '').trim().toLowerCase())
                .filter(Boolean)
        );
        if (existing.has(candidate.toLowerCase())) {
            setDraftPlayers((prev) => ({ ...prev, [teamIndex]: '' }));
            return;
        }
        onPlayerAdd(teamIndex, candidate);
        setDraftPlayers((prev) => ({ ...prev, [teamIndex]: '' }));
    };

    return (
        <div
            data-testid={dataTestId}
            className={`ocr-assignment-board ${densityClass} ${className}`.trim()}
        >
            <div className="ocr-assignment-board-grid">
                {teams.map((team, teamIndex) => {
                    const normalizedColor = normalizeColorToken(team.color);
                    const friendlyTeam = teamIndex === friendlyTeamIndex;
                    const displayColor = friendlyTeam ? 'friendly' : normalizedColor;
                    const isYellowGreenTeam = !friendlyTeam && displayColor === 'yellowgreen';
                    const isOcrDetected = !friendlyTeam && ocrDetectedTeamIndices?.has(teamIndex);
                    const visiblePlayerCount = team.players.length + (friendlyTeam && friendlyFixedPlayer ? 1 : 0);
                    return (
                        <div
                            key={`${team.key}-${teamIndex}`}
                            data-testid={`ocr-team-card-${teamIndex}`}
                            className={`ocr-assignment-team-card md3-surface-high ocr-assignment-team-card--color-${displayColor} ${isYellowGreenTeam ? 'ocr-assignment-team-card--full-row' : ''} ${dragHoverTeamIndex === teamIndex ? 'ocr-assignment-team-card--hover' : ''
                                }`}
                            onDragOver={(event) => allowDrop(event, teamIndex)}
                            onDragLeave={() => setDragHoverTeamIndex(null)}
                            onDrop={(event) => dropPlayer(event, teamIndex, null)}
                        >
                            <div className="ocr-assignment-team-head">
                                <div className="ocr-assignment-team-name-field">
                                    {allowColorEdit && onTeamColorChange && !friendlyTeam ? (
                                        <button
                                            type="button"
                                            onClick={() => onTeamColorChange(teamIndex, nextTeamColor(displayColor))}
                                            className={`ocr-assignment-team-color-btn ocr-assignment-team-dot ocr-assignment-team-dot--${displayColor}`}
                                            title={`Team color: ${displayColor}. Click to cycle.`}
                                            aria-label={`Team ${teamIndex + 1} color ${displayColor}`}
                                        />
                                    ) : (
                                        <span
                                            className={`ocr-assignment-team-dot ocr-assignment-team-dot--${displayColor}`}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {onTeamNameChange ? (
                                        <input
                                            type="text"
                                            value={team.teamName}
                                            onChange={(event) => onTeamNameChange(teamIndex, event.target.value)}
                                            className="md3-textfield ocr-assignment-team-name"
                                            placeholder={friendlyTeam ? 'Friendly Team' : `Team ${teamIndex + 1}`}
                                            aria-label={`Team ${teamIndex + 1} name`}
                                        />
                                    ) : (
                                        <span className="ocr-assignment-team-title">
                                            {team.teamName || `Team ${teamIndex + 1}`}
                                        </span>
                                    )}
                                    {friendlyTeam && (
                                        <span className="ocr-teammate-chip ocr-teammate-chip--compact">
                                            <Shield size={10} />
                                            Friendly
                                        </span>
                                    )}
                                    {isOcrDetected && (
                                        <span className="ocr-assignment-scan-badge" title="Name auto-detected by OCR scan">
                                            <Wand2 size={9} />
                                        </span>
                                    )}
                                </div>
                                <div className="ocr-assignment-team-head-side">
                                    <select
                                        value={team.shipType}
                                        onChange={(event) => onTeamShipChange(teamIndex, event.target.value)}
                                        className="md3-textfield ocr-assignment-team-ship-inline"
                                        aria-label={`Team ${teamIndex + 1} ship`}
                                    >
                                        <option value="">Unknown ship</option>
                                        {shipOptionsWithUnknown.map((ship) => (
                                            <option key={ship} value={ship}>{ship}</option>
                                        ))}
                                    </select>
                                    <span className="ocr-assignment-team-meta">
                                        {visiblePlayerCount} player{visiblePlayerCount === 1 ? '' : 's'}
                                    </span>
                                </div>
                                {allowTeamAddRemove && onTeamRemove && !friendlyTeam && (
                                    <button
                                        type="button"
                                        onClick={() => onTeamRemove(teamIndex)}
                                        className="md3-icon-btn text-danger"
                                        title="Remove team"
                                        aria-label={`Remove team ${team.teamName || teamIndex + 1}`}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>

                            <div className="ocr-assignment-players">
                                {friendlyTeam && friendlyFixedPlayer && (
                                    <div
                                        data-testid={`ocr-board-fixed-player-row-${teamIndex}`}
                                        className="ocr-team-player-row ocr-team-player-row--quick bg-md-sys-primary/6 border border-md-sys-primary/15"
                                    >
                                        <div className="md3-icon-btn h-6 w-6 text-md-sys-primary/60 shrink-0">
                                            <Shield size={12} />
                                        </div>
                                        <div className="md3-textfield ocr-assignment-player-input flex items-center font-semibold text-md-sys-primary/92">
                                            {friendlyFixedPlayer.canonicalName}
                                        </div>
                                        <span
                                            className={`ocr-active-user-pill ${friendlyFixedPlayer.tone === 'info' ? 'ocr-active-user-pill--info' : 'ocr-active-user-pill--success'}`}
                                            title={friendlyFixedPlayer.canonicalName}
                                        >
                                            <span className="ocr-active-user-pill__dot" />
                                            {friendlyFixedPlayer.label}
                                        </span>
                                    </div>
                                )}
                                {team.players.length === 0 ? (
                                    <div className="ocr-assignment-empty">
                                        Drop players here
                                    </div>
                                ) : (
                                    team.players.map((playerName, playerIndex) => {
                                        const isDragged = draggedPlayer?.teamIndex === teamIndex
                                            && draggedPlayer?.playerIndex === playerIndex;
                                        const displayName = String(playerName || '');
                                        const fuzzyMatch = fuzzyMatches[normalizePlayerKey(displayName)] || '';
                                        const showFuzzyBadge = fuzzyMatch
                                            && normalizePlayerKey(fuzzyMatch) !== normalizePlayerKey(displayName);
                                        const isRosterMatch = pilotRegistry.length > 0 && pilotRegistry.some(p => normalizePlayerKey(p) === normalizePlayerKey(displayName));
                                        return (
                                            <div
                                                key={`${teamIndex}-${playerIndex}`}
                                                data-testid={`ocr-board-player-row-${teamIndex}-${playerIndex}`}
                                                className={`ocr-team-player-row ocr-team-player-row--quick ${isDragged ? 'opacity-60' : ''
                                                    }`}
                                                onDragOver={(event) => allowDrop(event, teamIndex)}
                                                onDrop={(event) => dropPlayer(event, teamIndex, playerIndex)}
                                            >
                                                <button
                                                    type="button"
                                                    draggable
                                                    data-testid={`ocr-board-drag-handle-${teamIndex}-${playerIndex}`}
                                                    onDragStart={(event) => startDrag(event, teamIndex, playerIndex)}
                                                    onDragEnd={() => {
                                                        setDraggedPlayer(null);
                                                        draggedPlayerRef.current = null;
                                                        setDragHoverTeamIndex(null);
                                                    }}
                                                    className="md3-icon-btn h-6 w-6 text-md-sys-on-surface/40 cursor-grab active:cursor-grabbing shrink-0"
                                                    aria-label={`Drag ${displayName || `player ${playerIndex + 1}`} in ${team.teamName || `team ${teamIndex + 1}`}`}
                                                >
                                                    <GripVertical size={12} />
                                                </button>
                                                <input
                                                    type="text"
                                                    value={displayName}
                                                    onChange={(event) => onPlayerChange(teamIndex, playerIndex, event.target.value)}
                                                    onDragOver={(event) => allowDrop(event, teamIndex)}
                                                    onDrop={(event) => dropPlayer(event, teamIndex, playerIndex)}
                                                    list={rosterSuggestionsId}
                                                    className="md3-textfield ocr-assignment-player-input"
                                                    aria-label={`${team.teamName || `team ${teamIndex + 1}`} player ${playerIndex + 1} name`}
                                                />
                                                {isRosterMatch && !showFuzzyBadge && (
                                                    <span
                                                        className="ocr-assignment-fuzzy-badge !border-success !text-success !bg-success-soft"
                                                        title="Matched to roster"
                                                    >
                                                        Roster
                                                    </span>
                                                )}
                                                {showFuzzyBadge && (
                                                    <button
                                                        type="button"
                                                        className="ocr-assignment-fuzzy-badge ocr-assignment-fuzzy-badge--apply"
                                                        title={`Click to apply fuzzy match: ${fuzzyMatch}`}
                                                        onClick={() => onPlayerChange(teamIndex, playerIndex, fuzzyMatch)}
                                                    >
                                                        ~ {fuzzyMatch}
                                                    </button>
                                                )}
                                                {!isRosterMatch && !showFuzzyBadge && onAddToRoster && displayName.trim().length >= 2 && (
                                                    <button
                                                        type="button"
                                                        className="md3-icon-btn text-success shrink-0"
                                                        title={`Add "${displayName}" to roster`}
                                                        aria-label={`Add ${displayName} to roster`}
                                                        onClick={() => onAddToRoster(displayName.trim())}
                                                    >
                                                        <UserPlus size={12} />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => onPlayerRemove(teamIndex, playerIndex)}
                                                    className="md3-icon-btn text-danger"
                                                    aria-label={`Remove ${displayName || `player ${playerIndex + 1}`} from ${team.teamName || `team ${teamIndex + 1}`}`}
                                                    title="Remove player"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="ocr-assignment-add-row">
                                <input
                                    type="text"
                                    value={draftPlayers[teamIndex] || ''}
                                    onChange={(event) => setDraftPlayers((prev) => ({ ...prev, [teamIndex]: event.target.value }))}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            addPlayer(teamIndex);
                                        }
                                    }}
                                    list={rosterSuggestionsId}
                                    className="md3-textfield ocr-assignment-add-input"
                                    placeholder="Add player..."
                                    aria-label={`Add player to ${team.teamName || `team ${teamIndex + 1}`}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => addPlayer(teamIndex)}
                                    className="md3-btn-tonal ocr-assignment-add-btn"
                                    aria-label="Add player"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            {allowTeamAddRemove && onTeamAdd && (
                <button
                    type="button"
                    onClick={onTeamAdd}
                    className="md3-btn-text ocr-assignment-add-team"
                >
                    <Plus size={14} />
                    Add Opponent Team
                </button>
            )}
        </div>
    );
};

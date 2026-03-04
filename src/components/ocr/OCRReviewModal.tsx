import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  Users,
  Ship,
  MapPin,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  Image,
  Eye,
  Info,
  GripVertical,
} from 'lucide-react';
import { LocalImage } from '../LocalImage';
import type { OCRExtractedData, ExtractedOpponentTeam, TeamColor } from '../../utils/ocr/ocrTypes';
import { SHIPS, UI_REACH_MODIFIERS } from '../../utils/constants';
import { useAppStore } from '../../store/useAppStore';
import {
  combinedNameSimilarityScore,
  findClosestMatch,
  getAdaptiveNameDistanceThreshold,
  getAdaptiveNameSimilarityThreshold,
  normalizeOcrName,
} from '../../utils/stringUtils';
import { moveOpponentPlayerBetweenTeams } from '../../utils/opponentTeamTransfer';
import Logger from '../../utils/logger';
import { getElectronAPI } from '../../utils/electronAPI';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useAriaLiveRegion } from '../../hooks/useAriaLiveRegion';

interface OCRReviewModalProps {
  data: OCRExtractedData;
  onApply: (data: OCRExtractedData) => void;
  onCancel: () => void;
  onSkip?: () => void;
  stepLabel?: string;
  pilotRegistry: string[];
  screenshots?: string[];
  onQueueRosterCandidate?: (name: string) => void;
}

interface NameChangeRecord {
  id: string;
  scope: 'teammate' | 'opponent';
  teamIndex?: number;
  playerIndex: number;
  original: string;
  current: string;
}

const OCR_REVIEW_COACHMARK_KEY = 'wst_ocr_review_helper_seen_v3';

type RosterMatchMeta = {
  type: 'exact' | 'fuzzy' | 'new';
  label: string;
};

export const OCRReviewModal: React.FC<OCRReviewModalProps> = ({
  data,
  onApply,
  onCancel,
  onSkip,
  stepLabel,
  pilotRegistry,
  screenshots,
  onQueueRosterCandidate,
}) => {
  const recordOcrCorrection = useAppStore(s => s.recordOcrCorrection);
  const ocrBestGuessThresholds = useAppStore(s => s.ocrBestGuessThresholds);
  const normalizeModifierName = (name: string) => {
    const match = UI_REACH_MODIFIERS.find(m => m.toLowerCase() === name.toLowerCase());
    return match || name;
  };
  const [editedData, setEditedData] = useState<OCRExtractedData>(data);
  const originalDataRef = useRef<OCRExtractedData>(data);
  const [expandedSections, setExpandedSections] = useState({
    screenshots: true,
    ship: true,
    modifiers: true,
    teammates: true,
    opponents: true,
  });
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const lightboxTitleId = useId();
  const modalFocusTrapRef = useFocusTrap<HTMLDivElement>(lightboxIdx === null);
  const lightboxFocusTrapRef = useFocusTrap<HTMLDivElement>(lightboxIdx !== null);
  const { announce } = useAriaLiveRegion(true);
  const [newTeammateName, setNewTeammateName] = useState('');
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [showCoachmark, setShowCoachmark] = useState(false);
  const [draggedOpponentPlayer, setDraggedOpponentPlayer] = useState<{
    teamIndex: number;
    playerIndex: number;
  } | null>(null);
  const [dragHoverTeamIndex, setDragHoverTeamIndex] = useState<number | null>(null);
  const confidenceSummary = useMemo(() => {
    const avg = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const teammateConf = avg((editedData.teammates || []).map(t => t.confidence || 0));
    const opponentPlayerConf = avg((editedData.opponentTeams || []).flatMap(t => (t.players || []).map(p => p.confidence || 0)));
    const modConf = avg((editedData.reachModifiers || []).map(m => m.confidence || 0));
    const shipConf = editedData.playerShip?.confidence || 0;
    return {
      shipConf,
      teammateConf,
      opponentPlayerConf,
      modConf,
    };
  }, [editedData]);
  const extraModifiers = editedData.reachModifiers.filter(
    m => !UI_REACH_MODIFIERS.some(u => u.toLowerCase() === m.name.toLowerCase())
  );
  const nameChanges = useMemo<NameChangeRecord[]>(() => {
    const original = originalDataRef.current;
    const changes: NameChangeRecord[] = [];

    (original.teammates || []).forEach((teammate, index) => {
      const edited = editedData.teammates[index];
      if (!edited) return;
      const originalName = normalizeOcrName(teammate.name || '');
      const currentName = normalizeOcrName(edited.name || '');
      if (!originalName || !currentName || originalName === currentName) return;
      changes.push({
        id: `teammate_${index}`,
        scope: 'teammate',
        playerIndex: index,
        original: originalName,
        current: currentName,
      });
    });

    (original.opponentTeams || []).forEach((team, teamIndex) => {
      const editedTeam = editedData.opponentTeams[teamIndex];
      if (!editedTeam) return;
      (team.players || []).forEach((player, playerIndex) => {
        const editedPlayer = editedTeam.players[playerIndex];
        if (!editedPlayer) return;
        const originalName = normalizeOcrName(player.name || '');
        const currentName = normalizeOcrName(editedPlayer.name || '');
        if (!originalName || !currentName || originalName === currentName) return;
        changes.push({
          id: `opponent_${teamIndex}_${playerIndex}`,
          scope: 'opponent',
          teamIndex,
          playerIndex,
          original: originalName,
          current: currentName,
        });
      });
    });

    return changes;
  }, [editedData]);
  useEffect(() => {
    const hazardMods = (data.hazards || []).map((h: string) => ({
      name: normalizeModifierName(h),
      confidence: 80,
      rawText: h,
    }));
    const normalizedMods = (data.reachModifiers || []).map(m => ({
      ...m,
      name: normalizeModifierName(m.name),
    }));
    const mergedMods = [
      ...normalizedMods,
      ...hazardMods.filter(h => !normalizedMods.some(m => m.name === h.name)),
    ];
    const normalized = { ...data, reachModifiers: mergedMods };
    setEditedData(normalized);
    originalDataRef.current = normalized;
    setMergeTargets({});
  }, [data]);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(OCR_REVIEW_COACHMARK_KEY) === '1';
      setShowCoachmark(!seen);
    } catch {
      setShowCoachmark(true);
    }
  }, []);

  useEffect(() => {
    if (lightboxIdx === null || !Array.isArray(screenshots) || screenshots.length === 0) return;
    announce(`Opened screenshot ${lightboxIdx + 1} of ${screenshots.length}.`, 'polite');
  }, [lightboxIdx, screenshots, announce]);

  const dismissCoachmark = () => {
    setShowCoachmark(false);
    try {
      window.localStorage.setItem(OCR_REVIEW_COACHMARK_KEY, '1');
    } catch {
      // No-op: local storage may be unavailable.
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-success';
    if (confidence >= 60) return 'text-warning';
    return 'text-danger';
  };
  const updateShip = (shipType: string) => {
    setEditedData(prev => ({
      ...prev,
      playerShip: {
        shipType,
        confidence: 100, // Manual selection = 100% confidence
      },
    }));
  };
  const toggleModifier = (modifierName: string) => {
    const normalizedName = normalizeModifierName(modifierName);
    setEditedData(prev => {
      const exists = prev.reachModifiers.some(m => m.name === normalizedName);
      if (exists) {
        return {
          ...prev,
          reachModifiers: prev.reachModifiers.filter(m => m.name !== normalizedName),
        };
      } else {
        return {
          ...prev,
          reachModifiers: [
            ...prev.reachModifiers,
            { name: normalizedName, confidence: 100, rawText: normalizedName },
          ],
        };
      }
    });
  };
  const removeTeammate = (index: number) => {
    setEditedData(prev => ({
      ...prev,
      teammates: prev.teammates.filter((_, i) => i !== index),
    }));
  };
  const addTeammate = () => {
    const next = normalizeOcrName(newTeammateName);
    if (!next) return;
    setEditedData(prev => ({
      ...prev,
      teammates: [
        ...prev.teammates,
        { name: next, confidence: 100 },
      ],
    }));
    setNewTeammateName('');
  };
  const updateTeammate = (index: number, name: string) => {
    setEditedData(prev => ({
      ...prev,
      teammates: prev.teammates.map((t, i) =>
        i === index ? { ...t, name, confidence: 100 } : t
      ),
    }));
  };
  const updateOpponentPlayer = (teamIndex: number, playerIndex: number, name: string) => {
    setEditedData(prev => ({
      ...prev,
      opponentTeams: prev.opponentTeams.map((team, ti) => (
        ti === teamIndex
          ? {
            ...team,
            players: team.players.map((player, pi) => (
              pi === playerIndex
                ? { ...player, name, confidence: 100 }
                : player
            )),
          }
          : team
      )),
    }));
  };
  const updateOpponentTeam = (
    teamIndex: number,
    updates: Partial<ExtractedOpponentTeam>
  ) => {
    setEditedData(prev => ({
      ...prev,
      opponentTeams: prev.opponentTeams.map((team, ti) => (
        ti === teamIndex ? { ...team, ...updates } : team
      )),
    }));
  };
  const addOpponentPlayer = (teamIndex: number) => {
    setEditedData(prev => ({
      ...prev,
      opponentTeams: prev.opponentTeams.map((team, ti) => (
        ti === teamIndex
          ? {
            ...team,
            players: [
              ...team.players,
              { name: '', confidence: 100, rawText: '' },
            ],
          }
          : team
      )),
    }));
  };
  const addOpponentTeam = () => {
    setEditedData(prev => ({
      ...prev,
      opponentTeams: [
        ...prev.opponentTeams,
        {
          teamName: `Enemy Team ${prev.opponentTeams.length + 1}`,
          shipType: '',
          color: 'red',
          players: [],
          confidence: 100,
        },
      ],
    }));
  };
  const removeOpponentTeam = (teamIndex: number) => {
    setEditedData(prev => ({
      ...prev,
      opponentTeams: prev.opponentTeams.filter((_, ti) => ti !== teamIndex),
    }));
  };
  const removeOpponent = (teamIndex: number, playerIndex: number) => {
    setEditedData(prev => ({
      ...prev,
      opponentTeams: prev.opponentTeams.map((team, ti) =>
        ti === teamIndex
          ? { ...team, players: team.players.filter((_, pi) => pi !== playerIndex) }
          : team
      ),
    }));
  };
  const moveOpponentPlayer = (
    fromTeamIndex: number,
    fromPlayerIndex: number,
    toTeamIndex: number,
    toPlayerIndex?: number | null
  ) => {
    const preview = moveOpponentPlayerBetweenTeams(editedData.opponentTeams, {
      fromTeamIndex,
      fromPlayerIndex,
      toTeamIndex,
      toPlayerIndex,
    });
    if (preview === editedData.opponentTeams) return;
    const movedName = editedData.opponentTeams[fromTeamIndex]?.players[fromPlayerIndex]?.name || '';
    const targetTeamName = editedData.opponentTeams[toTeamIndex]?.teamName || `Enemy Team ${toTeamIndex + 1}`;
    setEditedData(prev => ({
      ...prev,
      opponentTeams: moveOpponentPlayerBetweenTeams(prev.opponentTeams, {
        fromTeamIndex,
        fromPlayerIndex,
        toTeamIndex,
        toPlayerIndex,
      }),
    }));
    if (movedName) {
      announce(`Moved ${movedName} to ${targetTeamName}.`, 'polite');
    }
  };
  const allowOpponentDrop = (event: React.DragEvent<HTMLElement>, teamIndex: number) => {
    if (!draggedOpponentPlayer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragHoverTeamIndex(teamIndex);
  };
  const dropOpponentPlayer = (
    event: React.DragEvent<HTMLElement>,
    teamIndex: number,
    playerIndex?: number | null
  ) => {
    if (!draggedOpponentPlayer) return;
    event.preventDefault();
    event.stopPropagation();
    moveOpponentPlayer(
      draggedOpponentPlayer.teamIndex,
      draggedOpponentPlayer.playerIndex,
      teamIndex,
      playerIndex
    );
    setDraggedOpponentPlayer(null);
    setDragHoverTeamIndex(null);
  };
  const getTeammateMergeKey = (index: number) => `teammate_${index}`;
  const getOpponentMergeKey = (teamIndex: number, playerIndex: number) => `opponent_${teamIndex}_${playerIndex}`;

  const updateMergeTarget = (key: string, value: string) => {
    setMergeTargets((prev) => ({ ...prev, [key]: value }));
  };

  const resolveRosterMergeTarget = (value: string): string | null => {
    const normalized = normalizeOcrName(value || '').toLowerCase();
    if (!normalized) return null;
    const exact = pilotRegistry.find((pilot) => (
      normalizeOcrName(pilot).toLowerCase() === normalized
    ));
    return exact || null;
  };

  const applyTeammateMergeTarget = (index: number) => {
    const key = getTeammateMergeKey(index);
    const rosterTarget = resolveRosterMergeTarget(mergeTargets[key] || '');
    if (!rosterTarget) return;
    updateTeammate(index, rosterTarget);
    setMergeTargets((prev) => ({ ...prev, [key]: rosterTarget }));
  };

  const applyOpponentMergeTarget = (teamIndex: number, playerIndex: number) => {
    const key = getOpponentMergeKey(teamIndex, playerIndex);
    const rosterTarget = resolveRosterMergeTarget(mergeTargets[key] || '');
    if (!rosterTarget) return;
    updateOpponentPlayer(teamIndex, playerIndex, rosterTarget);
    setMergeTargets((prev) => ({ ...prev, [key]: rosterTarget }));
  };

  const approveTeammateFuzzy = (index: number, label: string) => {
    if (!label) return;
    updateTeammate(index, label);
  };

  const approveOpponentFuzzy = (teamIndex: number, playerIndex: number, label: string) => {
    if (!label) return;
    updateOpponentPlayer(teamIndex, playerIndex, label);
  };

  const getRosterMatchMeta = (name: string): RosterMatchMeta => {
    const normalized = normalizeOcrName(name || '');
    if (!normalized) return { type: 'new', label: '' };

    const normalizedLower = normalized.toLowerCase();
    const exact = pilotRegistry.find((pilot) => (
      normalizeOcrName(pilot).toLowerCase() === normalizedLower
    ));
    if (exact) return { type: 'exact', label: exact };

    const similarityThreshold = getAdaptiveNameSimilarityThreshold(normalizedLower.length);
    let bestCandidate: { label: string; score: number } | null = null;

    for (const pilot of pilotRegistry) {
      const combinedScore = combinedNameSimilarityScore(normalizedLower, pilot);

      if (!bestCandidate || combinedScore > bestCandidate.score) {
        bestCandidate = { label: pilot, score: combinedScore };
      }
    }

    if (bestCandidate && bestCandidate.score >= similarityThreshold) {
      return { type: 'fuzzy', label: bestCandidate.label };
    }

    const distanceThreshold = getAdaptiveNameDistanceThreshold(normalizedLower.length);
    const distanceCandidate = findClosestMatch(normalizedLower, pilotRegistry, distanceThreshold);
    if (distanceCandidate) {
      const distanceSimilarity = combinedNameSimilarityScore(normalizedLower, distanceCandidate);
      const fallbackThreshold = Math.max(56, similarityThreshold - 8);
      if (distanceSimilarity >= fallbackThreshold) {
        return { type: 'fuzzy', label: distanceCandidate };
      }
    }

    return { type: 'new', label: normalized };
  };
  const getRosterMatchHint = (meta: ReturnType<typeof getRosterMatchMeta>) => {
    if (meta.type === 'exact') {
      return { text: 'Exact roster match', tone: 'text-success' };
    }
    if (meta.type === 'fuzzy') {
      return { text: `Looks like ${meta.label}`, tone: 'text-warning' };
    }
    return { text: 'Not in roster yet', tone: 'text-info' };
  };
  const queueRosterCandidate = (name: string) => {
    const normalized = normalizeOcrName(name || '');
    if (!normalized || !onQueueRosterCandidate) return;
    onQueueRosterCandidate(normalized);
  };
  const undoNameChange = (change: NameChangeRecord) => {
    setEditedData((prev) => {
      if (change.scope === 'teammate') {
        return {
          ...prev,
          teammates: prev.teammates.map((teammate, index) => (
            index === change.playerIndex
              ? { ...teammate, name: change.original, confidence: 100 }
              : teammate
          )),
        };
      }
      return {
        ...prev,
        opponentTeams: prev.opponentTeams.map((team, teamIndex) => {
          if (teamIndex !== change.teamIndex) return team;
          return {
            ...team,
            players: team.players.map((player, playerIndex) => (
              playerIndex === change.playerIndex
                ? { ...player, name: change.original, confidence: 100 }
                : player
            )),
          };
        }),
      };
    });
  };
  const undoAllNameChanges = () => {
    setEditedData((prev) => {
      const original = originalDataRef.current;
      const originalTeammates = original.teammates || [];
      const originalOpponentTeams = original.opponentTeams || [];
      return {
        ...prev,
        teammates: prev.teammates.map((teammate, index) => {
          const originalTeammate = originalTeammates[index];
          if (!originalTeammate?.name) return teammate;
          return {
            ...teammate,
            name: normalizeOcrName(originalTeammate.name),
            confidence: 100,
          };
        }),
        opponentTeams: prev.opponentTeams.map((team, teamIndex) => {
          const originalTeam = originalOpponentTeams[teamIndex];
          if (!originalTeam) return team;
          return {
            ...team,
            players: team.players.map((player, playerIndex) => {
              const originalPlayer = originalTeam.players[playerIndex];
              if (!originalPlayer?.name) return player;
              return {
                ...player,
                name: normalizeOcrName(originalPlayer.name),
                confidence: 100,
              };
            }),
          };
        }),
      };
    });
  };
  const handleApply = () => {
    const original = originalDataRef.current;
    const corrections: Array<{ raw: string; corrected: string }> = [];

    original.teammates.forEach((t, idx) => {
      const edited = editedData.teammates[idx];
      if (edited && t.name && edited.name && t.name !== edited.name) {
        corrections.push({ raw: t.name, corrected: edited.name });
      }
    });

    original.opponentTeams.forEach((team, teamIdx) => {
      const editedTeam = editedData.opponentTeams[teamIdx];
      if (!editedTeam) return;
      team.players.forEach((p, pIdx) => {
        const editedPlayer = editedTeam.players[pIdx];
        if (editedPlayer && p.name && editedPlayer.name && p.name !== editedPlayer.name) {
          corrections.push({ raw: p.name, corrected: editedPlayer.name });
        }
      });
    });

    corrections.forEach(({ raw, corrected }) => {
      const normalizedRaw = normalizeOcrName(raw);
      const normalizedCorrected = normalizeOcrName(corrected);
      recordOcrCorrection(raw, normalizedCorrected);
      if (normalizedRaw !== raw) {
        recordOcrCorrection(normalizedRaw, normalizedCorrected);
      }
    });

    if (corrections.length > 0 && Array.isArray(screenshots) && screenshots.length > 0) {
      try {
        const api = getElectronAPI();
        if (api?.invoke) {
          const firstScreenshot = String(screenshots[0] || '');
          const screenshotBase64 = firstScreenshot.replace(/^data:image\/\w+;base64,/, '');
          const payload = {
            screenshotBase64,
            teammates: (editedData.teammates || []).map(t => t.name).filter(Boolean),
            opponentTeams: (editedData.opponentTeams || []).map((team) => ({
              teamName: team.teamName || '',
              teamColor: team.color || '',
              players: (team.players || []).map(p => p.name).filter(Boolean),
            })),
            modifiers: (editedData.reachModifiers || []).map(m => m.name).filter(Boolean),
            meta: {
              source: 'ocr-review',
              timestamp: new Date().toISOString(),
            },
          };
          void api.invoke('ocr-corpus-add-corrected-sample', payload).catch((error: unknown) => {
            Logger.warn('OCRReviewModal', 'Failed to add corrected OCR sample to corpus', error);
            return undefined;
          });
        }
      } catch {
        // Non-blocking: corpus auto-growth must never block apply flow.
      }
    }

    onApply(editedData);
  };

  const applyBestGuess = () => {
    const source = editedData.ocrSource || 'local';
    const base = source === 'merged'
      ? ocrBestGuessThresholds.merged
      : ocrBestGuessThresholds.local;
    const lowConfidenceBump = (editedData.overallConfidence || 0) < 70
      ? ocrBestGuessThresholds.lowConfidenceBump
      : 0;
    const MIN_PLAYER_CONF = Math.min(95, base.player + lowConfidenceBump);
    const MIN_MOD_CONF = Math.min(95, base.mod + lowConfidenceBump);
    const MIN_SHIP_CONF = Math.min(95, base.ship + lowConfidenceBump);
    const filtered: OCRExtractedData = {
      ...editedData,
      teammates: (editedData.teammates || [])
        .filter(t => (t.confidence || 0) >= MIN_PLAYER_CONF)
        .filter(t => (t.name || '').trim().length > 2),
      opponentTeams: (editedData.opponentTeams || []).map(team => ({
        ...team,
        players: (team.players || [])
          .filter(p => (p.confidence || 0) >= MIN_PLAYER_CONF)
          .filter(p => (p.name || '').trim().length > 2),
      })).filter(team => team.players.length > 0 || !!team.teamName),
      reachModifiers: (editedData.reachModifiers || []).filter(m => (m.confidence || 0) >= MIN_MOD_CONF),
      playerShip: editedData.playerShip && (editedData.playerShip.confidence || 0) >= MIN_SHIP_CONF ? editedData.playerShip : undefined,
    };
    onApply(filtered);
  };

  const closeLightbox = () => {
    setLightboxIdx(null);
    announce('Closed screenshot preview.', 'polite');
  };

  useKeyboardShortcuts([
    {
      key: 'Escape',
      handler: () => {
        if (lightboxIdx !== null) {
          closeLightbox();
          return;
        }
        onCancel();
      },
    },
    {
      key: 'Enter',
      ctrl: true,
      handler: () => {
        if (lightboxIdx !== null) return;
        handleApply();
      },
    },
  ], true);

  return (
    <div className="fixed inset-0 md3-dialog-scrim backdrop-blur-sm z-modal-top flex items-start justify-center p-4 overflow-y-auto" onClick={onCancel}>
        <div
          ref={modalFocusTrapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          aria-describedby={dialogDescriptionId}
          className="ocr-review-dialog md3-dialog rounded-modal shadow-2xl max-w-2xl w-full h-[90vh] max-h-90vh my-2 overflow-hidden flex flex-col gap-3 p-4 relative z-0"
          onClick={e => e.stopPropagation()}
        >
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="md3-surface-high p-2 rounded-card">
              <Ship className="text-accent" size={20} />
            </div>
            <div>
              <h2 id={dialogTitleId} className="text-title font-bold">Review and Correct OCR Data</h2>
              {stepLabel && (
                <p className="text-label-sm font-bold uppercase tracking-widest text-md-sys-primary mt-0.5">{stepLabel}</p>
              )}
              <p className="text-label-sm opacity-60">
                {editedData.screenshotType === 'crew_hub' ? 'Crew Hub' :
                 editedData.screenshotType === 'tactical_map' ? 'Tactical Map' : 'Unknown Screen'}
                {' - '}
                <span className={getConfidenceColor(editedData.overallConfidence)}>
                  {editedData.overallConfidence.toFixed(0)}% Confidence
                </span>
              </p>
              <p className="text-label-sm opacity-40">
                Fix names here, then apply to teach OCR for future captures.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="md3-icon-btn"
            aria-label="Close OCR review modal"
          >
            <X size={18} />
          </button>
        </div>
        <p id={dialogDescriptionId} className="a11y-sr-only">
          Review OCR teammates, opponents, ship, and modifiers. Use Tab to navigate controls, Escape to close, and Control Enter to apply.
        </p>
        <div className="ocr-review-body flex-1 min-h-0 overflow-y-auto space-y-5 custom-scrollbar md3-dialog-content">
          <div className="grid grid-cols-4 gap-3 ocr-review-metrics-grid">
            <div className="ocr-review-metric-card md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Ship</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.shipConf)}`}>{Math.round(confidenceSummary.shipConf)}%</div>
            </div>
            <div className="ocr-review-metric-card md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Team</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.teammateConf)}`}>{Math.round(confidenceSummary.teammateConf)}%</div>
            </div>
            <div className="ocr-review-metric-card md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Opponents</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.opponentPlayerConf)}`}>{Math.round(confidenceSummary.opponentPlayerConf)}%</div>
            </div>
            <div className="ocr-review-metric-card md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Modifiers</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.modConf)}`}>{Math.round(confidenceSummary.modConf)}%</div>
            </div>
          </div>
          {showCoachmark && (
            <div className="md3-banner md3-banner--info">
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-body font-medium">How This Helps</p>
                <p className="text-label-sm opacity-60 mt-0.5">
                  Fix wrong names, check team/ship/modifiers, then press <span className="font-semibold">Apply and Learn</span>. Your corrections improve future OCR accuracy.
                </p>
                <p className="text-label-sm opacity-60 mt-1">
                  <span className="font-semibold text-success">Roster</span> = exact match &middot; <span className="font-semibold text-warning">~ Name</span> = fuzzy match &middot; <span className="font-semibold text-info">+ Roster</span> = new candidate
                </p>
                <button
                  type="button"
                  onClick={dismissCoachmark}
                  className="mt-2 md3-btn-tonal px-2.5 py-1 text-label-sm font-bold"
                >
                  Got It
                </button>
              </div>
            </div>
          )}
          {nameChanges.length > 0 && (
            <div className="md3-surface-high rounded-card border border-md-sys-outline/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-label-sm font-semibold">
                  Name changes in this review ({nameChanges.length})
                </div>
                <button
                  type="button"
                  onClick={undoAllNameChanges}
                  className="md3-btn-text text-label-sm font-bold"
                >
                  Undo All
                </button>
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                {nameChanges.map((change) => (
                  <div key={change.id} className="flex items-center justify-between gap-2 rounded-control md3-surface p-2">
                    <div className="text-label-sm truncate">
                      {change.original} -&gt; {change.current}
                    </div>
                    <button
                      type="button"
                      onClick={() => undoNameChange(change)}
                      className="md3-btn-text text-label-sm font-semibold"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {screenshots && screenshots.length > 0 && (
            <div className="md3-card rounded-card overflow-hidden sticky top-0 z-10 bg-md-sys-surface-container-highest border border-md-sys-outline/15">
              <button
                onClick={() => toggleSection('screenshots')}
                className="w-full p-3 flex items-center justify-between hover:bg-md-sys-on-surface/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Image size={16} className="text-info" />
                  <span className="font-semibold">
                    Reference Screenshots ({screenshots.length})
                  </span>
                  <span className="text-label-sm opacity-40">Click to compare</span>
                </div>
                {expandedSections.screenshots ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expandedSections.screenshots && (
                <div className="p-3 pt-0">
                  <div className="overflow-x-auto pb-1">
                    <div className="flex flex-col gap-3 min-w-[800px]">
                    {screenshots.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIdx(i)}
                        className="relative w-full bg-scrim-solid rounded-lg overflow-hidden group border border-md-sys-outline/20 hover:border-md-sys-primary/40 transition-colors"
                      >
                        <div className="w-full min-h-[220px] md:min-h-[300px] lg:min-h-[380px] bg-scrim-solid">
                        <LocalImage
                          src={src}
                          alt={`Screenshot ${i + 1}`}
                          className="w-full h-full object-contain"
                        />
                        </div>
                        <div className="absolute inset-0 bg-scrim-40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye size={16} className="text-on-scrim" />
                        </div>
                        <span className="absolute bottom-1 left-1 text-label-xs bg-scrim-60 px-1 rounded font-bold text-on-scrim-muted">
                          {i + 1}
                        </span>
                      </button>
                    ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {editedData.playerShip && (
            <div className="md3-card rounded-card overflow-hidden">
              <button
                onClick={() => toggleSection('ship')}
                className="w-full p-3 flex items-center justify-between hover:bg-md-sys-on-surface/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Ship size={16} className="text-info" />
                  <span className="font-semibold">Your Ship</span>
                </div>
                {expandedSections.ship ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expandedSections.ship && (
                <div className="p-3 pt-0 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {SHIPS.map(ship => (
                      <button
                        key={ship}
                        onClick={() => updateShip(ship)}
                        className={`md3-chip text-label-sm font-medium transition-all ${
                          editedData.playerShip?.shipType === ship
                            ? 'bg-md-sys-primary text-md-sys-onPrimary'
                            : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/10'
                        }`}
                      >
                        {ship.replace(/ \(\d Player\)/, '')}
                      </button>
                    ))}
                  </div>
                  {editedData.playerShip && (
                    <p className="text-label-sm opacity-60">
                      Selected: {editedData.playerShip.shipType}
                      <span className={`ml-2 ${getConfidenceColor(editedData.playerShip.confidence)}`}>
                        ({editedData.playerShip.confidence.toFixed(0)}%)
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="md3-card rounded-card overflow-hidden">
            <button
              onClick={() => toggleSection('modifiers')}
              className="w-full p-3 flex items-center justify-between hover:bg-md-sys-on-surface/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-warning" />
                <span className="font-semibold">
                  Reach Modifiers ({editedData.reachModifiers.length})
                </span>
              </div>
              {expandedSections.modifiers ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {expandedSections.modifiers && (
              <div className="p-3 pt-0">
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {UI_REACH_MODIFIERS.map(modifier => {
                    const isSelected = editedData.reachModifiers.some(m => m.name === modifier);
                    const extracted = editedData.reachModifiers.find(m => m.name === modifier);
                    return (
                      <button
                        key={modifier}
                        onClick={() => toggleModifier(modifier)}
                        className={`md3-chip text-label-sm font-medium transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-warning-soft text-warning border border-warning-soft'
                            : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/10'
                        }`}
                      >
                        {modifier}
                        {extracted && (
                          <span className={`text-label-sm ${getConfidenceColor(extracted.confidence)}`}>
                            {extracted.confidence.toFixed(0)}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {extraModifiers.length > 0 && (
                  <div className="mt-3">
                    <div className="text-label-sm uppercase font-bold opacity-40 mb-1">Other Detected</div>
                    <div className="flex flex-wrap gap-2">
                      {extraModifiers.map(mod => (
                        <button
                          key={mod.name}
                          onClick={() => toggleModifier(mod.name)}
                          className="md3-chip text-label-sm font-medium hover:bg-md-sys-on-surface/10 transition-all flex items-center gap-1"
                        >
                          {mod.name}
                          <span className={`text-label-sm ${getConfidenceColor(mod.confidence)}`}>
                            {mod.confidence.toFixed(0)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="md3-card rounded-card overflow-visible">
            <button
              onClick={() => toggleSection('teammates')}
              className="w-full p-3 flex items-center justify-between hover:bg-md-sys-on-surface/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users size={16} className="text-success" />
                <span className="font-semibold">
                  Teammates ({editedData.teammates.length})
                </span>
              </div>
              {expandedSections.teammates ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {expandedSections.teammates && (
              <div className="p-3 pt-0 space-y-2">
                {editedData.teammates.length === 0 ? (
                  <p className="text-label-sm opacity-40 italic">No teammates detected</p>
                ) : (
                  editedData.teammates.map((teammate, index) => {
                    const matchMeta = getRosterMatchMeta(teammate.name);
                    const matchHint = getRosterMatchHint(matchMeta);
                    const mergeKey = getTeammateMergeKey(index);
                    const mergeValue = mergeTargets[mergeKey] || '';
                    const mergeTarget = resolveRosterMergeTarget(mergeValue);
                    return (
                      <div
                        key={index}
                        className="ocr-review-entity-row flex items-center gap-2 md3-surface-high rounded-card p-2"
                      >
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={teammate.name}
                            onChange={(e) => updateTeammate(index, e.target.value)}
                            list="pilot-suggestions"
                            className="md3-textfield md3-textfield--outlined w-full text-body ocr-review-input"
                          />
                          <div className={`mt-1 text-label-xs ${matchHint.tone}`}>
                            {matchHint.text}
                          </div>
                          <div className="ocr-merge-row mt-1.5 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={mergeValue}
                              onChange={(event) => updateMergeTarget(mergeKey, event.target.value)}
                              list="pilot-suggestions"
                              placeholder="Merge to roster name"
                              className="md3-textfield md3-textfield--outlined flex-1 text-label-sm ocr-review-input"
                              aria-label={`Merge teammate ${index + 1} to roster`}
                            />
                            <button
                              type="button"
                              onClick={() => applyTeammateMergeTarget(index)}
                              className="ocr-merge-apply-btn md3-btn-text text-label-xs px-2 py-1 whitespace-nowrap"
                              disabled={!mergeTarget}
                              aria-label={`Apply merge for teammate ${index + 1}`}
                            >
                              Merge To
                            </button>
                          </div>
                        </div>
                        {matchMeta.type === 'exact' && (
                          <span className="text-label-sm text-success font-semibold">Roster</span>
                        )}
                        {matchMeta.type === 'fuzzy' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-label-sm text-warning font-semibold" title={`Fuzzy match: ${matchMeta.label}`}>
                              ~ {matchMeta.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => approveTeammateFuzzy(index, matchMeta.label)}
                              className="md3-btn-text text-label-xs px-2 py-1"
                              aria-label={`Approve fuzzy match for teammate ${index + 1}`}
                            >
                              Approve
                            </button>
                          </div>
                        )}
                        {matchMeta.type === 'new' && (
                          <button
                            type="button"
                            onClick={() => queueRosterCandidate(teammate.name)}
                            className="md3-btn-text text-label-sm text-info px-2 py-1"
                            title="Queue as roster candidate"
                            disabled={!onQueueRosterCandidate}
                          >
                            + Roster
                          </button>
                        )}
                        <span className={`text-label-sm ${getConfidenceColor(teammate.confidence)}`}>
                          {teammate.confidence.toFixed(0)}%
                        </span>
                        <button
                          onClick={() => removeTeammate(index)}
                          className="md3-icon-btn text-danger"
                          aria-label={`Remove teammate ${teammate.name}`}
                        >
                          <Trash2 size={14} className="text-danger" />
                        </button>
                      </div>
                    );
                  })
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTeammateName}
                    onChange={(e) => setNewTeammateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTeammate();
                      }
                    }}
                    list="pilot-suggestions"
                    placeholder="Add teammate"
                    className="md3-textfield md3-textfield--outlined flex-1 text-body"
                  />
                  <button
                    type="button"
                    onClick={addTeammate}
                    className="md3-btn-text text-label-sm"
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <datalist id="pilot-suggestions">
                  {pilotRegistry.map(pilot => (
                    <option key={pilot} value={pilot} />
                  ))}
                </datalist>
              </div>
            )}
          </div>
          <div className="md3-card rounded-card overflow-visible">
            <button
              onClick={() => toggleSection('opponents')}
              className="w-full p-3 flex items-center justify-between hover:bg-md-sys-on-surface/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users size={16} className="text-danger" />
                <span className="font-semibold">
                  Opponents ({editedData.opponentTeams.reduce((sum, t) => sum + t.players.length, 0)})
                </span>
              </div>
              {expandedSections.opponents ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {expandedSections.opponents && (
              <div className="p-3 pt-0 space-y-3">
                {editedData.opponentTeams.length === 0 ? (
                  <p className="text-label-sm opacity-40 italic">No opponents detected</p>
                ) : (
                  editedData.opponentTeams.map((team, teamIndex) => (
                    <div
                      key={teamIndex}
                      className={`ocr-review-team-card md3-surface-high rounded-card p-2 ${
                        dragHoverTeamIndex === teamIndex ? 'ring-1 ring-md-sys-primary/30' : ''
                      }`}
                      onDragOver={(event) => allowOpponentDrop(event, teamIndex)}
                      onDragLeave={() => setDragHoverTeamIndex(null)}
                      onDrop={(event) => dropOpponentPlayer(event, teamIndex, null)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            team.color === 'red' ? 'bg-danger' :
                            team.color === 'orange' ? 'bg-warning' :
                            team.color === 'yellow' ? 'bg-warning' :
                            team.color === 'green' ? 'bg-success' :
                            'bg-gray-500'
                          }`}
                        />
                        <input
                          type="text"
                          value={team.teamName || ''}
                          onChange={(e) => updateOpponentTeam(teamIndex, { teamName: e.target.value })}
                          placeholder="Team name"
                          className="md3-textfield md3-textfield--outlined flex-1 text-body"
                        />
                        <input
                          type="text"
                          value={team.shipType || ''}
                          onChange={(e) => updateOpponentTeam(teamIndex, { shipType: e.target.value })}
                          list="ship-suggestions"
                          placeholder="Ship"
                          className="md3-textfield md3-textfield--outlined w-36 text-body"
                        />
                        <select
                          value={team.color || 'unknown'}
                          onChange={(e) => updateOpponentTeam(teamIndex, { color: e.target.value as TeamColor })}
                          className="md3-textfield md3-textfield--outlined w-24 text-body font-semibold bg-md-sys-surface-container-highest text-md-sys-on-surface"
                          style={{
                            color: 'var(--md-sys-color-on-surface)',
                            backgroundColor: 'var(--md-sys-color-surface-container-highest)',
                          }}
                        >
                          <option value="red" className="text-md-sys-on-surface bg-md-sys-surface-container-highest">Red</option>
                          <option value="orange" className="text-md-sys-on-surface bg-md-sys-surface-container-highest">Orange</option>
                          <option value="yellow" className="text-md-sys-on-surface bg-md-sys-surface-container-highest">Yellow</option>
                          <option value="green" className="text-md-sys-on-surface bg-md-sys-surface-container-highest">Green</option>
                          <option value="blue" className="text-md-sys-on-surface bg-md-sys-surface-container-highest">Blue</option>
                          <option value="purple" className="text-md-sys-on-surface bg-md-sys-surface-container-highest">Purple</option>
                          <option value="unknown" className="text-md-sys-on-surface bg-md-sys-surface-container-highest">Unknown</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeOpponentTeam(teamIndex)}
                          className="md3-icon-btn text-danger"
                          title="Remove team"
                          aria-label={`Remove opponent team ${teamIndex + 1}`}
                        >
                          <Trash2 size={12} className="text-danger" />
                        </button>
                      </div>
                      <p className="text-label-xs opacity-50 pl-5 mb-1">
                        Drag player rows between team cards to reassign ships.
                      </p>
                      <div className="space-y-1">
                        {team.players.map((player, playerIndex) => (
                          (() => {
                            const matchMeta = getRosterMatchMeta(player.name);
                            const matchHint = getRosterMatchHint(matchMeta);
                            const mergeKey = getOpponentMergeKey(teamIndex, playerIndex);
                            const mergeValue = mergeTargets[mergeKey] || '';
                            const mergeTarget = resolveRosterMergeTarget(mergeValue);
                            return (
                              <div
                                key={playerIndex}
                                className={`ocr-review-entity-row rounded-control border border-md-sys-outline/20 p-1.5 bg-md-sys-surface flex items-center gap-2 ${
                                  draggedOpponentPlayer?.teamIndex === teamIndex
                                  && draggedOpponentPlayer?.playerIndex === playerIndex
                                    ? 'opacity-60'
                                    : ''
                                }`}
                                onDragOver={(event) => allowOpponentDrop(event, teamIndex)}
                                onDrop={(event) => dropOpponentPlayer(event, teamIndex, playerIndex)}
                              >
                                <button
                                  type="button"
                                  draggable
                                  onMouseDown={(event) => event.preventDefault()}
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = 'move';
                                    setDraggedOpponentPlayer({ teamIndex, playerIndex });
                                  }}
                                  onDragEnd={() => {
                                    setDraggedOpponentPlayer(null);
                                    setDragHoverTeamIndex(null);
                                  }}
                                  className="md3-icon-btn h-6 w-6 text-md-sys-on-surface/60 cursor-grab active:cursor-grabbing shrink-0"
                                  title="Drag to move player"
                                  aria-label={`Drag opponent ${playerIndex + 1} in team ${teamIndex + 1}`}
                                >
                                  <GripVertical size={12} />
                                </button>
                                <div className="flex-1 min-w-0 pl-1">
                                  <input
                                    type="text"
                                    value={player.name}
                                    onChange={(e) => updateOpponentPlayer(teamIndex, playerIndex, e.target.value)}
                                    onKeyDown={(event) => event.stopPropagation()}
                                    list="pilot-suggestions"
                                    className="md3-textfield md3-textfield--outlined w-full text-body ocr-review-input"
                                  />
                                  <div className={`mt-1 text-label-xs ${matchHint.tone}`}>
                                    {matchHint.text}
                                  </div>
                                  <div className="ocr-merge-row mt-1.5 flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={mergeValue}
                                      onChange={(event) => updateMergeTarget(mergeKey, event.target.value)}
                                      onKeyDown={(event) => event.stopPropagation()}
                                      list="pilot-suggestions"
                                      placeholder="Merge to roster name"
                                      className="md3-textfield md3-textfield--outlined flex-1 text-label-sm ocr-review-input"
                                      aria-label={`Merge opponent ${playerIndex + 1} on team ${teamIndex + 1} to roster`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => applyOpponentMergeTarget(teamIndex, playerIndex)}
                                      className="ocr-merge-apply-btn md3-btn-text text-label-xs px-2 py-1 whitespace-nowrap"
                                      disabled={!mergeTarget}
                                      aria-label={`Apply merge for opponent ${playerIndex + 1} on team ${teamIndex + 1}`}
                                    >
                                      Merge To
                                    </button>
                                  </div>
                                </div>
                                {matchMeta.type === 'exact' && (
                                  <span className="text-label-sm text-success font-semibold">Roster</span>
                                )}
                                {matchMeta.type === 'fuzzy' && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-label-sm text-warning font-semibold" title={`Fuzzy match: ${matchMeta.label}`}>
                                      ~ {matchMeta.label}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => approveOpponentFuzzy(teamIndex, playerIndex, matchMeta.label)}
                                      className="md3-btn-text text-label-xs px-2 py-1"
                                      aria-label={`Approve fuzzy match for opponent ${playerIndex + 1} on team ${teamIndex + 1}`}
                                    >
                                      Approve
                                    </button>
                                  </div>
                                )}
                                {matchMeta.type === 'new' && (
                                  <button
                                    type="button"
                                    onClick={() => queueRosterCandidate(player.name)}
                                    className="md3-btn-text text-label-sm text-info px-2 py-1"
                                    title="Queue as roster candidate"
                                    disabled={!onQueueRosterCandidate}
                                  >
                                    + Roster
                                  </button>
                                )}
                                <span className={`text-label-sm ${getConfidenceColor(player.confidence)}`}>
                                  {player.confidence.toFixed(0)}%
                                </span>
                                <button
                                  onClick={() => removeOpponent(teamIndex, playerIndex)}
                                  className="md3-icon-btn text-danger"
                                  aria-label={`Remove opponent ${player.name}`}
                                >
                                  <Trash2 size={12} className="text-danger" />
                                </button>
                              </div>
                            );
                          })()
                        ))}
                        <button
                          type="button"
                          onClick={() => addOpponentPlayer(teamIndex)}
                          className="md3-btn-text text-label-sm text-info mt-1"
                        >
                          <Plus size={12} />
                          Add Player
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={addOpponentTeam}
                  className="md3-btn-text text-label-sm"
                >
                  <Plus size={14} />
                  Add Opponent Team
                </button>
                <datalist id="ship-suggestions">
                  {SHIPS.map((ship) => (
                    <option key={ship} value={ship} />
                  ))}
                </datalist>
              </div>
            )}
          </div>
          {editedData.overallConfidence < 60 && (
            <div className="md3-banner md3-banner--warn">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-body font-medium">Low Confidence Results</p>
                <p className="text-label-sm opacity-60 mt-0.5">
                  OCR struggled with this screenshot. Review each field before applying &mdash;
                  consider retaking the capture with better lighting or zoom.
                </p>
              </div>
            </div>
          )}
          {editedData.teammates.length === 0 &&
           editedData.opponentTeams.length === 0 &&
           editedData.reachModifiers.length === 0 &&
           !editedData.playerShip && (
            <div className="md3-banner md3-banner--warn">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-body font-medium">No Data Extracted</p>
                <p className="text-label-sm opacity-60 mt-0.5">
                  Nothing could be read from this screenshot. Make sure you are capturing a
                  Crew Hub or Tactical Map screen, and that the image is not cropped or obscured.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="md3-dialog-actions ocr-review-actions shrink-0">
          <button
            onClick={onCancel}
            className="md3-btn-text"
          >
            Cancel
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="md3-btn-text"
              title="Skip OCR review and continue to submission"
            >
              Skip OCR
            </button>
          )}
          <button
            onClick={applyBestGuess}
            className="md3-btn-tonal flex items-center gap-2"
            title="Apply only high-confidence fields without requiring full manual review"
          >
            <Check size={16} />
            Quick Apply (High Confidence)
          </button>
          <button
            onClick={handleApply}
            className="md3-btn-filled flex items-center gap-2"
            title="Apply all reviewed edits and save name corrections for future OCR"
          >
            <Check size={16} />
            Apply and Learn
          </button>
        </div>
      </div>
      {lightboxIdx !== null && screenshots && screenshots[lightboxIdx] && (
        <div
          className="fixed inset-0 z-top bg-scrim-90 flex items-center justify-center p-8"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-on-scrim-muted hover:text-on-scrim z-10"
            aria-label="Close screenshot preview"
          >
            <X size={24} />
          </button>
          {screenshots.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + screenshots.length) % screenshots.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-frost-10 rounded-full hover:bg-frost-20 text-on-scrim z-10"
                aria-label="Previous screenshot"
              >
                <ChevronDown size={20} className="rotate-90" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % screenshots.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-frost-10 rounded-full hover:bg-frost-20 text-on-scrim z-10"
                aria-label="Next screenshot"
              >
                <ChevronUp size={20} className="rotate-90" />
              </button>
            </>
          )}
          <div
            ref={lightboxFocusTrapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={lightboxTitleId}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full"
          >
            <LocalImage
              src={screenshots[lightboxIdx]}
              alt={`Screenshot ${lightboxIdx + 1}`}
              className="max-w-full max-h-85vh object-contain rounded-lg"
            />
              <div id={lightboxTitleId} className="text-center mt-2 text-label-sm text-on-scrim-muted font-bold">
              Screenshot {lightboxIdx + 1} of {screenshots.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OCRReviewModal;




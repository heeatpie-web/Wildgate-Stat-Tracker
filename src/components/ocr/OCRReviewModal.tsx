import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  Users,
  Ship,
  MapPin,
  Trash2,
  Edit2,
  Plus,
  ChevronDown,
  ChevronUp,
  Image,
  Eye,
} from 'lucide-react';
import { LocalImage } from '../LocalImage';
import type { OCRExtractedData, ExtractedPlayer, ExtractedModifier, ExtractedOpponentTeam } from '../../utils/ocr/ocrTypes';
import { SHIPS, UI_REACH_MODIFIERS } from '../../utils/constants';
import { useAppStore } from '../../store/useAppStore';
import { normalizeOcrName } from '../../utils/stringUtils';

interface OCRReviewModalProps {
  data: OCRExtractedData;
  onApply: (data: OCRExtractedData) => void;
  onCancel: () => void;
  pilotRegistry: string[];
  screenshots?: string[];
}

export const OCRReviewModal: React.FC<OCRReviewModalProps> = ({
  data,
  onApply,
  onCancel,
  pilotRegistry,
  screenshots,
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
  }, [data]);

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
  const updateTeammate = (index: number, name: string) => {
    setEditedData(prev => ({
      ...prev,
      teammates: prev.teammates.map((t, i) =>
        i === index ? { ...t, name, confidence: 100 } : t
      ),
    }));
  };
  const removeOpponent = (teamIndex: number, playerIndex: number) => {
    setEditedData(prev => ({
      ...prev,
      opponentTeams: prev.opponentTeams.map((team, ti) =>
        ti === teamIndex
          ? { ...team, players: team.players.filter((_, pi) => pi !== playerIndex) }
          : team
      ).filter(team => team.players.length > 0),
    }));
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

    onApply(editedData);
  };

  const applyBestGuess = () => {
    const source = editedData.ocrSource || 'local';
    const base = source === 'cloud'
      ? ocrBestGuessThresholds.cloud
      : source === 'merged'
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

  return (
    <div className="fixed inset-0 md3-dialog-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="md3-dialog rounded-modal shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="md3-surface-high p-2 rounded-card">
              <Ship className="text-accent" size={20} />
            </div>
            <div>
              <h2 className="text-title font-bold">Review Captured Data</h2>
              <p className="text-label-sm opacity-60">
                {editedData.screenshotType === 'crew_hub' ? 'Crew Hub' :
                 editedData.screenshotType === 'tactical_map' ? 'Tactical Map' : 'Unknown Screen'}
                {' - '}
                <span className={getConfidenceColor(editedData.overallConfidence)}>
                  {editedData.overallConfidence.toFixed(0)}% Confidence
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="md3-icon-btn"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar md3-dialog-content">
          <div className="grid grid-cols-4 gap-2">
            <div className="md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Ship</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.shipConf)}`}>{Math.round(confidenceSummary.shipConf)}%</div>
            </div>
            <div className="md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Team</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.teammateConf)}`}>{Math.round(confidenceSummary.teammateConf)}%</div>
            </div>
            <div className="md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Opponents</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.opponentPlayerConf)}`}>{Math.round(confidenceSummary.opponentPlayerConf)}%</div>
            </div>
            <div className="md3-surface-high rounded-card p-2 text-center">
              <div className="text-label-xs uppercase opacity-60">Modifiers</div>
              <div className={`text-label-sm font-bold ${getConfidenceColor(confidenceSummary.modConf)}`}>{Math.round(confidenceSummary.modConf)}%</div>
            </div>
          </div>
          {screenshots && screenshots.length > 0 && (
            <div className="md3-card rounded-card overflow-hidden">
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
                  <div className="grid grid-cols-3 gap-2">
                    {screenshots.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIdx(i)}
                        className="relative aspect-video bg-black rounded-lg overflow-hidden group"
                      >
                        <LocalImage
                          src={src}
                          alt={`Screenshot ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye size={16} className="text-white" />
                        </div>
                        <span className="absolute bottom-1 left-1 text-label-xs bg-black/60 px-1 rounded font-bold text-white/60">
                          {i + 1}
                        </span>
                      </button>
                    ))}
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
          <div className="md3-card rounded-card overflow-hidden">
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
                  editedData.teammates.map((teammate, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 md3-surface-high rounded-card p-2"
                    >
                      <input
                        type="text"
                        value={teammate.name}
                        onChange={(e) => updateTeammate(index, e.target.value)}
                        list="pilot-suggestions"
                        className="md3-textfield md3-textfield--outlined flex-1 text-body"
                      />
                      <span className={`text-label-sm ${getConfidenceColor(teammate.confidence)}`}>
                        {teammate.confidence.toFixed(0)}%
                      </span>
                      <button
                        onClick={() => removeTeammate(index)}
                        className="md3-icon-btn text-danger"
                      >
                        <Trash2 size={14} className="text-danger" />
                      </button>
                    </div>
                  ))
                )}
                <datalist id="pilot-suggestions">
                  {pilotRegistry.map(pilot => (
                    <option key={pilot} value={pilot} />
                  ))}
                </datalist>
              </div>
            )}
          </div>
          <div className="md3-card rounded-card overflow-hidden">
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
                    <div key={teamIndex} className="md3-surface-high rounded-card p-2">
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            team.color === 'red' ? 'bg-red-500' :
                            team.color === 'orange' ? 'bg-orange-500' :
                            team.color === 'yellow' ? 'bg-yellow-500' :
                            team.color === 'green' ? 'bg-green-500' :
                            'bg-gray-500'
                          }`}
                        />
                        <span className="text-body font-medium opacity-60">
                          {team.teamName || 'Unknown Team'}
                        </span>
                        <span className="text-label-sm opacity-40">
                          {team.shipType}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {team.players.map((player, playerIndex) => (
                          <div
                            key={playerIndex}
                            className="flex items-center gap-2 pl-5"
                          >
                            <span className="flex-1 text-body opacity-60">
                              {player.name}
                            </span>
                            <span className={`text-label-sm ${getConfidenceColor(player.confidence)}`}>
                              {player.confidence.toFixed(0)}%
                            </span>
                            <button
                              onClick={() => removeOpponent(teamIndex, playerIndex)}
                              className="md3-icon-btn text-danger"
                            >
                              <Trash2 size={12} className="text-danger" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
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
        <div className="md3-dialog-actions">
          <button
            onClick={onCancel}
            className="md3-btn-text"
          >
            Cancel
          </button>
          <button
            onClick={applyBestGuess}
            className="md3-btn-tonal flex items-center gap-2"
            title="Apply only high-confidence OCR fields"
          >
            <Check size={16} />
            Apply Best Guess
          </button>
          <button
            onClick={handleApply}
            className="md3-btn-filled flex items-center gap-2"
          >
            <Check size={16} />
            Apply Data
          </button>
        </div>
      </div>
      {lightboxIdx !== null && screenshots && screenshots[lightboxIdx] && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-8"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 text-white/50 hover:text-white z-10"
          >
            <X size={24} />
          </button>
          {screenshots.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + screenshots.length) % screenshots.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full hover:bg-white/20 text-white z-10"
              >
                <ChevronDown size={20} className="rotate-90" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % screenshots.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full hover:bg-white/20 text-white z-10"
              >
                <ChevronUp size={20} className="rotate-90" />
              </button>
            </>
          )}
          <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full">
            <LocalImage
              src={screenshots[lightboxIdx]}
              alt={`Screenshot ${lightboxIdx + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
              <div className="text-center mt-2 text-label-sm text-white/60 font-bold">
              Screenshot {lightboxIdx + 1} of {screenshots.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OCRReviewModal;




/**
 * OCR Review Modal
 * Allows users to review and edit OCR-extracted data before applying
 */

import React, { useState, useEffect, useRef } from 'react';
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
  // Editable state
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

  // Reset when data changes
  useEffect(() => {
    setEditedData(data);
    originalDataRef.current = data;
  }, [data]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Update ship
  const updateShip = (shipType: string) => {
    setEditedData(prev => ({
      ...prev,
      playerShip: {
        shipType,
        confidence: 100, // Manual selection = 100% confidence
      },
    }));
  };

  // Toggle modifier
  const toggleModifier = (modifierName: string) => {
    setEditedData(prev => {
      const exists = prev.reachModifiers.some(m => m.name === modifierName);
      if (exists) {
        return {
          ...prev,
          reachModifiers: prev.reachModifiers.filter(m => m.name !== modifierName),
        };
      } else {
        return {
          ...prev,
          reachModifiers: [
            ...prev.reachModifiers,
            { name: modifierName, confidence: 100, rawText: modifierName },
          ],
        };
      }
    });
  };

  // Remove teammate
  const removeTeammate = (index: number) => {
    setEditedData(prev => ({
      ...prev,
      teammates: prev.teammates.filter((_, i) => i !== index),
    }));
  };

  // Update teammate name
  const updateTeammate = (index: number, name: string) => {
    setEditedData(prev => ({
      ...prev,
      teammates: prev.teammates.map((t, i) =>
        i === index ? { ...t, name, confidence: 100 } : t
      ),
    }));
  };

  // Remove opponent
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

  // Handle apply
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

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-md-sys-surface1 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-md-sys-outline/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-500/20 p-2 rounded-xl">
              <Ship className="text-purple-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Review Captured Data</h2>
              <p className="text-xs opacity-50">
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
            className="p-2 hover:bg-md-sys-surface3 rounded-lg transition-colors"
          >
            <X size={20} className="opacity-70" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Reference Screenshots */}
          {screenshots && screenshots.length > 0 && (
            <div className="bg-md-sys-surface2 rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleSection('screenshots')}
                className="w-full p-3 flex items-center justify-between hover:bg-md-sys-surface3/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Image size={16} className="text-sky-400" />
                  <span className="font-semibold">
                    Reference Screenshots ({screenshots.length})
                  </span>
                  <span className="text-[10px] opacity-40">Click to compare</span>
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
                        <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 px-1 rounded font-bold text-white/70">
                          {i + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ship Section */}
          {editedData.playerShip && (
            <div className="bg-md-sys-surface2 rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleSection('ship')}
                className="w-full p-3 flex items-center justify-between hover:bg-md-sys-surface3/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Ship size={16} className="text-blue-400" />
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          editedData.playerShip?.shipType === ship
                            ? 'bg-blue-500 text-white'
                            : 'bg-md-sys-on-surface/5 opacity-70 hover:bg-md-sys-on-surface/10'
                        }`}
                      >
                        {ship.replace(/ \(\d Player\)/, '')}
                      </button>
                    ))}
                  </div>
                  {editedData.playerShip && (
                    <p className="text-xs opacity-50">
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

          {/* Modifiers Section */}
          <div className="bg-md-sys-surface2 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('modifiers')}
              className="w-full p-3 flex items-center justify-between hover:bg-md-sys-surface3/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-amber-400" />
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                            : 'bg-md-sys-on-surface/5 opacity-50 hover:bg-md-sys-on-surface/10'
                        }`}
                      >
                        {modifier}
                        {extracted && (
                          <span className={`text-[10px] ${getConfidenceColor(extracted.confidence)}`}>
                            {extracted.confidence.toFixed(0)}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Teammates Section */}
          <div className="bg-md-sys-surface2 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('teammates')}
              className="w-full p-3 flex items-center justify-between hover:bg-md-sys-surface3/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users size={16} className="text-green-400" />
                <span className="font-semibold">
                  Teammates ({editedData.teammates.length})
                </span>
              </div>
              {expandedSections.teammates ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {expandedSections.teammates && (
              <div className="p-3 pt-0 space-y-2">
                {editedData.teammates.length === 0 ? (
                  <p className="text-xs opacity-40 italic">No teammates detected</p>
                ) : (
                  editedData.teammates.map((teammate, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 bg-md-sys-on-surface/5 rounded-xl p-2"
                    >
                      <input
                        type="text"
                        value={teammate.name}
                        onChange={(e) => updateTeammate(index, e.target.value)}
                        list="pilot-suggestions"
                        className="flex-1 bg-transparent text-sm px-2 py-1 rounded-lg border border-md-sys-outline/10 focus:border-green-500/50 focus:outline-none"
                      />
                      <span className={`text-xs ${getConfidenceColor(teammate.confidence)}`}>
                        {teammate.confidence.toFixed(0)}%
                      </span>
                      <button
                        onClick={() => removeTeammate(index)}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} className="text-red-400" />
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

          {/* Opponents Section */}
          <div className="bg-md-sys-surface2 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('opponents')}
              className="w-full p-3 flex items-center justify-between hover:bg-md-sys-surface3/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users size={16} className="text-red-400" />
                <span className="font-semibold">
                  Opponents ({editedData.opponentTeams.reduce((sum, t) => sum + t.players.length, 0)})
                </span>
              </div>
              {expandedSections.opponents ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {expandedSections.opponents && (
              <div className="p-3 pt-0 space-y-3">
                {editedData.opponentTeams.length === 0 ? (
                  <p className="text-xs opacity-40 italic">No opponents detected</p>
                ) : (
                  editedData.opponentTeams.map((team, teamIndex) => (
                    <div key={teamIndex} className="bg-md-sys-on-surface/5 rounded-xl p-2">
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
                        <span className="text-sm font-medium opacity-80">
                          {team.teamName || 'Unknown Team'}
                        </span>
                        <span className="text-xs opacity-40">
                          {team.shipType}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {team.players.map((player, playerIndex) => (
                          <div
                            key={playerIndex}
                            className="flex items-center gap-2 pl-5"
                          >
                            <span className="flex-1 text-sm opacity-70">
                              {player.name}
                            </span>
                            <span className={`text-xs ${getConfidenceColor(player.confidence)}`}>
                              {player.confidence.toFixed(0)}%
                            </span>
                            <button
                              onClick={() => removeOpponent(teamIndex, playerIndex)}
                              className="p-1 hover:bg-red-500/20 rounded-lg transition-colors"
                            >
                              <Trash2 size={12} className="text-red-400" />
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

          {/* Low confidence warning */}
          {editedData.overallConfidence < 60 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">Low Confidence Results</p>
                <p className="text-xs text-amber-200/70 mt-0.5">
                  Some extracted data may be inaccurate. Please review carefully before applying.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-md-sys-outline/10 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium opacity-70 hover:bg-md-sys-surface3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-6 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:brightness-110 transition-all flex items-center gap-2"
          >
            <Check size={16} />
            Apply Data
          </button>
        </div>
      </div>

      {/* Screenshot Lightbox (inside modal, higher z-index) */}
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
          {/* Prev / Next */}
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
            <div className="text-center mt-2 text-xs text-white/50 font-bold">
              Screenshot {lightboxIdx + 1} of {screenshots.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OCRReviewModal;

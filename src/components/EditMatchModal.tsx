import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Match, SHIPS, WEAPONS, SYSTEMS } from '../types';
import { X, Save, Trash2, AlertCircle, Skull, Crosshair, Plus, Zap } from 'lucide-react';

interface EditMatchModalProps {
  match: Match;
  onSave: (updatedMatch: Match) => void;
  onClose: () => void;
}

export const EditMatchModal: React.FC<EditMatchModalProps> = ({ match, onSave, onClose }) => {
  const [editedMatch, setEditedMatch] = useState<Match>({ ...match });
  const [newTeammate, setNewTeammate] = useState("");
  const [newOpponent, setNewOpponent] = useState("");

  const handleSave = () => {
    onSave(editedMatch);
  };

  const removeTeammate = (index: number) => {
    setEditedMatch(prev => ({
      ...prev,
      teammates: prev.teammates.filter((_, i) => i !== index)
    }));
  };

  const removeOpponent = (index: number) => {
    setEditedMatch(prev => ({
      ...prev,
      opponents: prev.opponents.filter((_, i) => i !== index)
    }));
  };

  const removeModifier = (index: number) => {
    setEditedMatch(prev => ({
      ...prev,
      reachModifiers: prev.reachModifiers.filter((_, i) => i !== index)
    }));
  };

  const addTeammate = () => {
    if (newTeammate.trim()) {
      setEditedMatch(prev => ({ ...prev, teammates: [...prev.teammates, newTeammate.trim()] }));
      setNewTeammate("");
    }
  };

  const addOpponent = () => {
    if (newOpponent.trim()) {
      setEditedMatch(prev => ({ ...prev, opponents: [...prev.opponents, newOpponent.trim()] }));
      setNewOpponent("");
    }
  };

  return createPortal(
    <div className="fixed inset-0 md3-dialog-scrim z-[10000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="md3-dialog w-full max-w-2xl border border-md-sys-outline/20 flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-center border-b border-md-sys-outline/10 pb-4">
          <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Edit2Icon className="text-md-sys-primary" size={24} /> Edit Mission Log
          </h3>
          <button onClick={onClose} className="md3-icon-btn"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Result & SubType */}
          <div className="space-y-4">
            <div className="md3-card p-4 rounded-2xl">
              <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Outcome</label>
              <select
                value={editedMatch.result}
                onChange={e => setEditedMatch({ ...editedMatch, result: e.target.value as any })}
                className="w-full md3-textfield--outlined p-3 rounded-xl font-bold outline-none"
              >
                <option value="Win">Victory</option>
                <option value="Loss">Defeat</option>
                <option value="Draw">Draw</option>
              </select>
            </div>

            <div className="md3-card p-4 rounded-2xl">
              <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Classification</label>
              <select
                value={editedMatch.subType}
                onChange={e => setEditedMatch({ ...editedMatch, subType: e.target.value })}
                className="w-full md3-textfield--outlined p-3 rounded-xl font-bold outline-none"
              >
                <option value="Combat">Combat</option>
                <option value="Artifact">Artifact</option>
                <option value="Eliminated">Eliminated</option>
                <option value="Surrender">Surrender</option>
                <option value="Time Expired">Time Expired</option>
                <option value="Mutual Elimination">Mutual Elimination</option>
              </select>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-4">
            <div className="md3-card p-4 rounded-2xl">
              <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Damage Taken</label>
              <input
                type="number"
                value={editedMatch.damageTaken || 0}
                onChange={e => setEditedMatch({ ...editedMatch, damageTaken: parseInt(e.target.value) || 0 })}
                className="w-full md3-textfield--outlined p-3 rounded-xl font-black outline-none text-lg"
              />
            </div>
            <div className="md3-card p-4 rounded-2xl">
              <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Duration (MM:SS)</label>
              <input
                type="text"
                value={editedMatch.time || ''}
                onChange={e => setEditedMatch({ ...editedMatch, time: e.target.value })}
                className="w-full md3-textfield--outlined p-3 rounded-xl font-black outline-none text-lg"
                placeholder="00:00"
              />
            </div>
          </div>
        </div>

        {/* Arrays: Teammates, Opponents, Modifiers */}
        <div className="space-y-4">
          <div className="md3-card p-4 rounded-2xl">
            <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Teammates</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(editedMatch.teammates || []).length === 0 && <span className="text-xs opacity-40 italic">None recorded</span>}
              {(editedMatch.teammates || []).map((t, i) => (
                <div key={i} className="flex items-center gap-2 bg-blue-500/20 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold">
                  {t}
                  <button onClick={() => removeTeammate(i)} className="hover:text-white"><X size={12} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newTeammate} onChange={e => setNewTeammate(e.target.value)} placeholder="Add Teammate" className="flex-1 md3-textfield--outlined px-3 py-1.5 text-xs font-bold outline-none" onKeyDown={e => e.key === 'Enter' && addTeammate()} />
              <button onClick={addTeammate} className="md3-btn-filled p-1.5 rounded-lg"><Plus size={16} /></button>
            </div>
          </div>

          <div className="md3-card p-4 rounded-2xl">
            <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Opponents</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(editedMatch.opponents || []).length === 0 && <span className="text-xs opacity-40 italic">None recorded</span>}
              {(editedMatch.opponents || []).map((o, i) => (
                <div key={i} className="flex items-center gap-2 bg-red-500/20 text-red-300 px-3 py-1.5 rounded-lg text-xs font-bold">
                  {o}
                  <button onClick={() => removeOpponent(i)} className="hover:text-white"><X size={12} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newOpponent} onChange={e => setNewOpponent(e.target.value)} placeholder="Add Opponent" className="flex-1 md3-textfield--outlined px-3 py-1.5 text-xs font-bold outline-none" onKeyDown={e => e.key === 'Enter' && addOpponent()} />
              <button onClick={addOpponent} className="md3-btn-filled p-1.5 rounded-lg bg-md-sys-error text-md-sys-on-error"><Plus size={16} /></button>
            </div>
          </div>

          <div className="md3-card p-4 rounded-2xl">
            <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Active Modifiers</label>
            <div className="flex flex-wrap gap-2">
              {(editedMatch.reachModifiers || []).length === 0 && <span className="text-xs opacity-40 italic">None recorded</span>}
              {(editedMatch.reachModifiers || []).map((m, i) => (
                <div key={i} className="flex items-center gap-2 md3-surface-high px-3 py-1.5 rounded-lg text-xs font-bold border border-md-sys-outline/10">
                  {m}
                  <button onClick={() => removeModifier(i)} className="hover:text-md-sys-primary"><X size={12} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="md3-card p-4 rounded-2xl">
            <label className="text-[10px] font-black uppercase opacity-60 mb-4 block flex items-center gap-2"><Crosshair size={14} /> Weapon Loadout</label>
            <div className="grid grid-cols-2 gap-2">
              {WEAPONS.map(w => (
                <div key={w} className={`flex justify-between items-center p-2 rounded-xl border border-md-sys-outline/5 ${(editedMatch.weapons?.[w] || 0) > 0 ? 'md3-surface-high ring-1 ring-md-sys-primary/30' : 'md3-surface-low'}`}>
                  <div className="flex flex-col ml-1">
                    <span className={`text-[8px] font-black uppercase ${(editedMatch.weapons?.[w] || 0) > 0 ? 'text-md-sys-primary' : 'opacity-60'}`}>{w}</span>
                    <span className="text-lg font-black">{editedMatch.weapons?.[w] || 0}</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [w]: Math.max(0, (prev.weapons?.[w] || 0) - 1) } }))} className="md3-icon-btn w-6 h-6 text-md-sys-on-surface">-</button>
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [w]: (prev.weapons?.[w] || 0) + 1 } }))} className="md3-icon-btn w-6 h-6 bg-md-sys-primary text-md-sys-onPrimary">+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md3-card p-4 rounded-2xl">
            <label className="text-[10px] font-black uppercase opacity-60 mb-4 block flex items-center gap-2"><Zap size={14} /> Systems & Utilities</label>
            <div className="grid grid-cols-2 gap-2">
              {SYSTEMS.map(s => (
                <div key={s} className={`flex justify-between items-center p-2 rounded-xl border border-md-sys-outline/5 ${(editedMatch.weapons?.[s] || 0) > 0 ? 'md3-surface-high ring-1 ring-blue-400/30' : 'md3-surface-low'}`}>
                  <div className="flex flex-col ml-1">
                    <span className={`text-[8px] font-black uppercase ${(editedMatch.weapons?.[s] || 0) > 0 ? 'text-blue-400' : 'opacity-60'}`}>{s}</span>
                    <span className="text-lg font-black">{editedMatch.weapons?.[s] || 0}</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [s]: Math.max(0, (prev.weapons?.[s] || 0) - 1) } }))} className="md3-icon-btn w-6 h-6 text-md-sys-on-surface">-</button>
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [s]: (prev.weapons?.[s] || 0) + 1 } }))} className="md3-icon-btn w-6 h-6 bg-blue-500 text-white">+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md3-card p-4 rounded-2xl">
            <label className="text-[10px] font-black uppercase opacity-60 mb-4 block flex items-center gap-2"><Skull size={14} /> Eliminations</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...SHIPS, "AI Legion"].map(ship => (
                <div key={ship} className={`flex justify-between items-center p-2 rounded-xl ${ship === 'AI Legion' ? 'md3-surface-high ring-1 ring-purple-500/30' : 'md3-surface-low border border-md-sys-outline/5'}`}>
                  <span className={`text-[10px] font-bold uppercase ${ship === 'AI Legion' ? 'text-purple-300' : 'opacity-60'}`}>{ship.split('(')[0]}</span>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, kills: { ...prev.kills, [ship]: Math.max(0, (prev.kills?.[ship] || 0) - 1) } }))} className={`md3-icon-btn w-6 h-6 ${ship === 'AI Legion' ? 'bg-purple-500/30 text-purple-200' : 'text-md-sys-on-surface'}`}>-</button>
                    <span className={`font-black w-5 text-center ${ship === 'AI Legion' ? 'text-purple-200' : ''}`}>{editedMatch.kills?.[ship] || 0}</span>
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, kills: { ...prev.kills, [ship]: (prev.kills?.[ship] || 0) + 1 } }))} className={`md3-icon-btn w-6 h-6 ${ship === 'AI Legion' ? 'bg-purple-500 text-white' : 'bg-md-sys-primary text-md-sys-onPrimary'}`}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Placement for Artifact Brawl */}
        {editedMatch.mode === 'Artifact Brawl' && (
          <div className="md3-card p-4 rounded-2xl">
            <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Placement (Optional)</label>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map(p => (
                <button
                  key={p}
                  onClick={() => setEditedMatch({ ...editedMatch, placement: editedMatch.placement === p ? undefined : p })}
                  className={`md3-chip px-4 py-2 font-bold text-xs ${editedMatch.placement === p ? 'md3-chip--selected' : 'hover:bg-md-sys-on-surface/5'}`}
                >
                  {p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4 mt-2">
          <button onClick={onClose} className="flex-1 md3-btn-outlined py-4 rounded-2xl font-black">Discard Changes</button>
          <button onClick={handleSave} className="flex-1 md3-btn-filled py-4 rounded-2xl font-black shadow-lg flex items-center justify-center gap-2 transition-colors">
            <Save size={18} /> Save Updates
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};

// Icon helper
const Edit2Icon = ({ className, size }: { className?: string, size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
  </svg>
);



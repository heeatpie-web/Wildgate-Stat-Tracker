import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Match, SHIPS, WEAPONS, SYSTEMS } from '../types';
import { X, Save, Trash2, AlertCircle, Skull, Crosshair, Plus, Zap } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface EditMatchModalProps {
  match: Match;
  onSave: (updatedMatch: Match) => void;
  onClose: () => void;
}

export const EditMatchModal: React.FC<EditMatchModalProps> = ({ match, onSave, onClose }) => {
  const [editedMatch, setEditedMatch] = useState<Match>({ ...match });
  const [newTeammate, setNewTeammate] = useState("");
  const [newOpponent, setNewOpponent] = useState("");
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);

  useKeyboardShortcuts([
    { key: 'Escape', handler: () => onClose() },
  ], true);

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
    <div className="fixed inset-0 md3-dialog-scrim z-modal flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        className="md3-dialog rounded-modal w-full max-w-2xl border border-md-sys-outline/20 flex flex-col gap-6 max-h-90vh overflow-y-auto custom-scrollbar"
        onClick={e => e.stopPropagation()}
      >

        <div className="flex justify-between items-center border-b border-md-sys-outline/10 pb-4">
          <h3 id={dialogTitleId} className="text-title font-bold uppercase tracking-tight flex items-center gap-2">
            <Edit2Icon className="text-md-sys-primary" size={24} /> Edit Mission Log
          </h3>
          <button onClick={onClose} className="md3-icon-btn" aria-label="Close edit match dialog"><X size={18} /></button>
        </div>
        <p id={dialogDescriptionId} className="a11y-sr-only">
          Edit recorded match details. Use Tab to move through controls and Escape to close.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Result & SubType */}
          <div className="space-y-4">
            <div className="md3-card p-4 rounded-card">
              <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Outcome</label>
              <select
                value={editedMatch.result}
                onChange={e => setEditedMatch({ ...editedMatch, result: e.target.value as any })}
                className="w-full md3-textfield--outlined p-3 rounded-control font-bold outline-none"
              >
                <option value="Win">Victory</option>
                <option value="Loss">Defeat</option>
                <option value="Draw">Draw</option>
              </select>
            </div>

            <div className="md3-card p-4 rounded-card">
              <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Classification</label>
              <select
                value={editedMatch.subType}
                onChange={e => setEditedMatch({ ...editedMatch, subType: e.target.value })}
                className="w-full md3-textfield--outlined p-3 rounded-control font-bold outline-none"
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
            <div className="md3-card p-4 rounded-card">
              <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Damage Taken</label>
              <input
                type="number"
                value={editedMatch.damageTaken || 0}
                onChange={e => setEditedMatch({ ...editedMatch, damageTaken: parseInt(e.target.value) || 0 })}
                className="w-full md3-textfield--outlined p-3 rounded-control font-bold outline-none text-lg"
              />
            </div>
            <div className="md3-card p-4 rounded-card">
              <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Duration (MM:SS)</label>
              <input
                type="text"
                value={editedMatch.time || ''}
                onChange={e => setEditedMatch({ ...editedMatch, time: e.target.value })}
                className="w-full md3-textfield--outlined p-3 rounded-control font-bold outline-none text-lg"
                placeholder="00:00"
              />
            </div>
          </div>
        </div>

        {/* Arrays: Teammates, Opponents, Modifiers */}
        <div className="space-y-4">
          <div className="md3-card p-4 rounded-card">
            <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Teammates</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(editedMatch.teammates || []).length === 0 && <span className="text-label-sm opacity-40 italic">None recorded</span>}
              {(editedMatch.teammates || []).map((t, i) => (
                <div key={i} className="flex items-center gap-2 bg-info-soft text-info px-3 py-1.5 rounded-lg text-label-sm font-bold">
                  {t}
                  <button onClick={() => removeTeammate(i)} className="hover:text-md-sys-on-surface" aria-label={`Remove teammate ${t}`}><X size={12} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newTeammate} onChange={e => setNewTeammate(e.target.value)} placeholder="Add Teammate" className="flex-1 md3-textfield--outlined px-3 py-1.5 text-label-sm font-bold outline-none" onKeyDown={e => e.key === 'Enter' && addTeammate()} />
              <button onClick={addTeammate} className="md3-btn-filled p-1.5 rounded-control" aria-label="Add teammate"><Plus size={16} /></button>
            </div>
          </div>

          <div className="md3-card p-4 rounded-card">
            <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Opponents</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(editedMatch.opponents || []).length === 0 && <span className="text-label-sm opacity-40 italic">None recorded</span>}
              {(editedMatch.opponents || []).map((o, i) => (
                <div key={i} className="flex items-center gap-2 bg-danger-soft text-danger px-3 py-1.5 rounded-lg text-label-sm font-bold">
                  {o}
                  <button onClick={() => removeOpponent(i)} className="hover:text-md-sys-on-surface" aria-label={`Remove opponent ${o}`}><X size={12} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newOpponent} onChange={e => setNewOpponent(e.target.value)} placeholder="Add Opponent" className="flex-1 md3-textfield--outlined px-3 py-1.5 text-label-sm font-bold outline-none" onKeyDown={e => e.key === 'Enter' && addOpponent()} />
              <button onClick={addOpponent} className="md3-btn-filled p-1.5 rounded-control bg-md-sys-error text-md-sys-on-error" aria-label="Add opponent"><Plus size={16} /></button>
            </div>
          </div>

          <div className="md3-card p-4 rounded-card">
            <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Active Modifiers</label>
            <div className="flex flex-wrap gap-2">
              {(editedMatch.reachModifiers || []).length === 0 && <span className="text-label-sm opacity-40 italic">None recorded</span>}
              {(editedMatch.reachModifiers || []).map((m, i) => (
                <div key={i} className="flex items-center gap-2 md3-surface-high px-3 py-1.5 rounded-lg text-label-sm font-bold border border-md-sys-outline/10">
                  {m}
                  <button onClick={() => removeModifier(i)} className="hover:text-md-sys-primary" aria-label={`Remove modifier ${m}`}><X size={12} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="md3-card p-4 rounded-card">
            <label className="text-label-sm font-bold uppercase opacity-60 mb-4 block flex items-center gap-2"><Crosshair size={14} /> Weapon Loadout</label>
            <div className="grid grid-cols-2 gap-2">
              {WEAPONS.map(w => (
                <div key={w} className={`flex justify-between items-center p-2 rounded-card border border-md-sys-outline/5 ${(editedMatch.weapons?.[w] || 0) > 0 ? 'md3-surface-high ring-1 ring-md-sys-primary/30' : 'md3-surface-low'}`}>
                  <div className="flex flex-col ml-1">
                    <span className={`text-label-xs font-bold uppercase ${(editedMatch.weapons?.[w] || 0) > 0 ? 'text-md-sys-primary' : 'opacity-60'}`}>{w}</span>
                    <span className="text-lg font-bold">{editedMatch.weapons?.[w] || 0}</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [w]: Math.max(0, (prev.weapons?.[w] || 0) - 1) } }))} className="md3-icon-btn w-6 h-6 text-md-sys-on-surface" aria-label={`Decrease ${w}`}>-</button>
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [w]: (prev.weapons?.[w] || 0) + 1 } }))} className="md3-icon-btn w-6 h-6 bg-md-sys-primary text-md-sys-onPrimary" aria-label={`Increase ${w}`}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md3-card p-4 rounded-card">
            <label className="text-label-sm font-bold uppercase opacity-60 mb-4 block flex items-center gap-2"><Zap size={14} /> Systems & Utilities</label>
            <div className="grid grid-cols-2 gap-2">
              {SYSTEMS.map(s => (
                <div key={s} className={`flex justify-between items-center p-2 rounded-card border border-md-sys-outline/5 ${(editedMatch.weapons?.[s] || 0) > 0 ? 'md3-surface-high ring-1 ring-info/30' : 'md3-surface-low'}`}>
                  <div className="flex flex-col ml-1">
                    <span className={`text-label-xs font-bold uppercase ${(editedMatch.weapons?.[s] || 0) > 0 ? 'text-info' : 'opacity-60'}`}>{s}</span>
                    <span className="text-lg font-bold">{editedMatch.weapons?.[s] || 0}</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [s]: Math.max(0, (prev.weapons?.[s] || 0) - 1) } }))} className="md3-icon-btn w-6 h-6 text-md-sys-on-surface" aria-label={`Decrease ${s}`}>-</button>
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, weapons: { ...(prev.weapons || {}), [s]: (prev.weapons?.[s] || 0) + 1 } }))} className="md3-icon-btn w-6 h-6 bg-info text-on-scrim" aria-label={`Increase ${s}`}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md3-card p-4 rounded-card">
            <label className="text-label-sm font-bold uppercase opacity-60 mb-4 block flex items-center gap-2"><Skull size={14} /> Eliminations</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...SHIPS, "AI Legion"].map(ship => (
                <div key={ship} className={`flex justify-between items-center p-2 rounded-card ${ship === 'AI Legion' ? 'md3-surface-high ring-1 ring-accent/30' : 'md3-surface-low border border-md-sys-outline/5'}`}>
                  <span className={`text-label-sm font-bold uppercase ${ship === 'AI Legion' ? 'text-accent' : 'opacity-60'}`}>{ship.split('(')[0]}</span>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, kills: { ...prev.kills, [ship]: Math.max(0, (prev.kills?.[ship] || 0) - 1) } }))} className={`md3-icon-btn w-6 h-6 ${ship === 'AI Legion' ? 'bg-accent-soft text-accent' : 'text-md-sys-on-surface'}`} aria-label={`Decrease ${ship} eliminations`}>-</button>
                    <span className={`font-bold w-5 text-center ${ship === 'AI Legion' ? 'text-accent' : ''}`}>{editedMatch.kills?.[ship] || 0}</span>
                    <button onClick={() => setEditedMatch(prev => ({ ...prev, kills: { ...prev.kills, [ship]: (prev.kills?.[ship] || 0) + 1 } }))} className={`md3-icon-btn w-6 h-6 ${ship === 'AI Legion' ? 'bg-accent text-on-scrim' : 'bg-md-sys-primary text-md-sys-onPrimary'}`} aria-label={`Increase ${ship} eliminations`}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Placement for Artifact Brawl */}
        {editedMatch.mode === 'Artifact Brawl' && (
          <div className="md3-card p-4 rounded-card">
            <label className="text-label-sm font-bold uppercase opacity-60 mb-2 block">Placement (Optional)</label>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map(p => (
                <button
                  key={p}
                  onClick={() => setEditedMatch({ ...editedMatch, placement: editedMatch.placement === p ? undefined : p })}
                  className={`md3-chip px-4 py-2 font-bold text-label-sm ${editedMatch.placement === p ? 'md3-chip--selected' : 'hover:bg-md-sys-on-surface/5'}`}
                >
                  {p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4 mt-2">
          <button onClick={onClose} className="flex-1 md3-btn-outlined py-4 rounded-card font-bold">Discard Changes</button>
          <button onClick={handleSave} className="flex-1 md3-btn-filled py-4 rounded-card font-bold shadow-lg flex items-center justify-center gap-2 transition-colors">
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



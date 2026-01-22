import React, { useState } from 'react';
import { CHARACTERS, SHIPS, UI_REACH_MODIFIERS, KillMap, getShipCapacity } from '../types';
import { Plus, Minus, X, Users, Rocket, Skull, Star, Layout, Search, Trash2, Edit2, Filter, Pin, Clock, HeartCrack, Trophy, Scale } from 'lucide-react';

export const SquadronPanel = ({ activeShip, setActiveShip, activeHero, setActiveHero }: any) => (
  <div className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg h-full overflow-y-auto custom-scrollbar flex flex-col gap-6">
      <div className="flex items-center gap-2 text-md-sys-on-surface font-black text-xs uppercase tracking-widest mb-4">
          <Rocket size={14}/> Ship & Loadout
      </div>
      <div className="grid grid-cols-2 gap-2">
          {SHIPS.map(s => 
            <button key={s} onClick={() => setActiveShip(s)} className={`p-4 rounded-2xl text-xs font-black border-2 transition-all relative ${activeShip === s ? 'bg-md-sys-primary-container border-md-sys-primary text-md-sys-onPrimaryContainer' : 'bg-md-sys-surface2 border-transparent text-md-sys-on-surface'}`}>
              {s.split('(')[0]}
              {activeShip === s && <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-md-sys-primary animate-pulse"></div>}
            </button>
          )}
      </div>
      <div className="grid grid-cols-4 gap-2 pt-4 border-t border-md-sys-outline/5 flex-1 content-start">
          <label className="col-span-4 text-[10px] font-black uppercase opacity-60 mb-1 block text-md-sys-on-surface">Prospector Selection</label>
          {[...CHARACTERS].sort().map(c => <button key={c} onClick={() => setActiveHero(c)} className={`px-2 py-4 rounded-xl text-xs font-black uppercase transition-all ${activeHero === c ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface2 text-md-sys-on-surface'}`}>{c}</button>)}
      </div>
  </div>
);

export const RosterPanel = ({ pilotRegistry, favorites, pilotNotes, selectedTeammates, toggleTeammate, selectedOpponents, toggleOpponent, onAddPilot, onToggleFavorite, onUpdateNote, onDeletePilot, onRenamePilot }: any) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [sortMode, setSortMode] = useState<'pinned' | 'alpha'>('pinned');
    const [editingPilot, setEditingPilot] = useState<string | null>(null);
    const [editNote, setEditNote] = useState("");
    const [editRename, setEditRename] = useState("");
    const [newPilotName, setNewPilotName] = useState("");

    const hasTeammates = selectedTeammates.length > 0;
    const hasOpponents = selectedOpponents.length > 0;

    const filtered = pilotRegistry
    .filter((p: string) => !selectedTeammates.includes(p) && !selectedOpponents.includes(p))
    .filter((p: string) => p.toLowerCase().includes(searchTerm.toLowerCase()));
  
    const sorted = filtered.sort((a: string, b: string) => {
        if (sortMode === 'pinned') {
            const aFav = favorites.includes(a);
            const bFav = favorites.includes(b);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
        }
        return a.localeCompare(b);
    });

    const openEditModal = (pilot: string) => {
        setEditingPilot(pilot);
        setEditNote(pilotNotes[pilot] || "");
        setEditRename(pilot);
    };
  
    const saveEdit = () => {
        if (!editingPilot) return;
        if (editRename.trim() && editRename !== editingPilot) {
            onRenamePilot(editingPilot, editRename);
            onUpdateNote(editRename, editNote);
        } else {
            onUpdateNote(editingPilot, editNote);
        }
        setEditingPilot(null);
    };

    const handleAddNewPilot = () => { if(newPilotName.trim()) { onAddPilot(newPilotName.trim()); setNewPilotName(""); } };

    return (
        <div className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg h-full overflow-y-auto custom-scrollbar flex flex-col gap-4">
            <div className="flex items-center gap-2 text-md-sys-on-surface font-black text-xs uppercase tracking-widest mb-2">
                <Users size={14}/> Roster Manager
            </div>
            
            <div className="flex gap-2">
                <div className={`flex-1 bg-md-sys-surface2 p-3 rounded-2xl border-none shadow-inner flex flex-col transition-all ${hasTeammates ? 'min-h-[80px]' : 'h-10 justify-center'}`}>
                    <label className={`text-[10px] font-black uppercase block transition-all text-center ${hasTeammates ? 'text-md-sys-primary opacity-100 mb-2' : 'text-md-sys-on-surface opacity-40'}`}>Teammates</label>
                    {hasTeammates && <div className="flex flex-wrap gap-2 animate-fade-in">{selectedTeammates.map((p: string) => <button key={p} onClick={() => toggleTeammate(p)} className="px-3 py-1 bg-md-sys-primary-container text-md-sys-onPrimaryContainer rounded-lg text-[10px] font-black animate-scale-in">{p}</button>)}</div>}
                </div>
                <div className={`flex-1 bg-md-sys-surface2 p-3 rounded-2xl border-none shadow-inner flex flex-col transition-all ${hasOpponents ? 'min-h-[80px]' : 'h-10 justify-center'}`}>
                    <label className={`text-[10px] font-black uppercase block transition-all text-center ${hasOpponents ? 'text-md-sys-error opacity-100 mb-2' : 'text-md-sys-on-surface opacity-40'}`}>Hostiles</label>
                    {hasOpponents && <div className="flex flex-wrap gap-2 animate-fade-in">{selectedOpponents.map((p: string) => <button key={p} onClick={() => toggleOpponent(p)} className="px-3 py-1 bg-md-sys-error-container text-md-sys-on-error-container rounded-lg text-[10px] font-black animate-scale-in">{p}</button>)}</div>}
                </div>
            </div>

            <div className="flex-1 bg-md-sys-surface2 p-4 rounded-3xl border-none shadow-inner flex flex-col gap-3 min-h-[200px]">
                <div className="flex justify-between items-center">
                    <label className="text-xs font-black uppercase opacity-60 block text-md-sys-on-surface">Player List</label>
                    <div className="flex gap-2">
                        <button onClick={() => setSortMode('pinned')} className={`p-1.5 rounded-lg ${sortMode==='pinned' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface3 text-md-sys-on-surface'}`} title="Sort by Pinned"><Star size={14}/></button>
                        <button onClick={() => setSortMode('alpha')} className={`p-1.5 rounded-lg ${sortMode==='alpha' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface3 text-md-sys-on-surface'}`} title="Sort Alphabetical"><Filter size={14}/></button>
                    </div>
                </div>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"/>
                    <input type="text" placeholder="Search players..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-md-sys-surface1 rounded-xl py-2 pl-9 pr-3 text-xs font-bold outline-none text-md-sys-on-surface border border-transparent focus:border-md-sys-primary"/>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[150px] flex flex-col gap-1 pr-1 custom-scrollbar">
                    {sorted.map((p: string) => (
                        <div key={p} className="group flex justify-between items-center p-2 hover:bg-md-sys-surface3 rounded-xl">
                            <div className="flex items-center gap-2 overflow-hidden">
                                {favorites.includes(p) && <Star size={10} className="fill-yellow-500 text-yellow-500 flex-shrink-0"/>}
                                <span className="text-xs font-bold text-md-sys-on-surface truncate" title={pilotNotes[p]}>{p}</span>
                            </div>
                            <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100">
                                <button onClick={() => openEditModal(p)} className="w-9 h-7 bg-md-sys-surface1 text-md-sys-on-surface rounded-lg flex items-center justify-center hover:bg-md-sys-primary hover:text-white"><Edit2 size={12}/></button>
                                <button onClick={() => toggleTeammate(p)} className="w-14 h-7 bg-blue-500/10 text-blue-500 rounded-lg flex items-center justify-center hover:bg-blue-500 hover:text-white text-[10px] font-black">JOIN</button>
                                <button onClick={() => toggleOpponent(p)} className="w-14 h-7 bg-red-500/10 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white text-[10px] font-black">VS</button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 pt-2 border-t border-md-sys-outline/5">
                    <input type="text" placeholder="Add New Player..." value={newPilotName} onChange={(e) => setNewPilotName(e.target.value)} className="flex-1 bg-md-sys-surface3 rounded-lg px-3 text-xs font-bold outline-none h-8" onKeyDown={e => e.key === 'Enter' && handleAddNewPilot()}/>
                    <button onClick={handleAddNewPilot} className="p-2 bg-md-sys-primary text-md-sys-onPrimary rounded-lg h-8 w-8 flex items-center justify-center"><Plus size={14}/></button>
                </div>
            </div>

            {editingPilot && (
                <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={() => setEditingPilot(null)}>
                    <div className="bg-md-sys-surface1 p-8 rounded-[32px] max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black uppercase">Edit Pilot</h3><button onClick={() => setEditingPilot(null)}><X size={20}/></button></div>
                        <div className="space-y-4">
                            <div><label className="text-xs font-bold uppercase opacity-60 mb-2 block">Pilot Name</label><input value={editRename} onChange={(e) => setEditRename(e.target.value)} className="w-full bg-md-sys-surface2 p-3 rounded-xl font-bold outline-none"/></div>
                            <div><label className="text-xs font-bold uppercase opacity-60 mb-2 block">Notes</label><textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} className="w-full bg-md-sys-surface2 p-3 rounded-xl font-medium outline-none min-h-[100px] resize-none" placeholder="Add pilot notes..."></textarea></div>
                            <div className="flex gap-2">
                                <button onClick={() => onToggleFavorite(editingPilot)} className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${favorites.includes(editingPilot) ? 'bg-yellow-500 text-black' : 'bg-md-sys-surface2'}`}><Star size={16} className={favorites.includes(editingPilot) ? 'fill-black' : ''}/> {favorites.includes(editingPilot) ? 'Pinned' : 'Pin'}</button>
                                <button onClick={() => { if(window.confirm('Delete this pilot?')) { onDeletePilot(editingPilot); setEditingPilot(null); }}} className="flex-1 py-3 bg-md-sys-error-container text-md-sys-on-error-container rounded-xl font-bold flex items-center justify-center gap-2"><Trash2 size={16}/> Delete</button>
                            </div>
                            <button onClick={saveEdit} className="w-full py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest mt-4">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const MissionPanel = ({ inputMode, setInputMode, timeMin, setTimeMin, timeSec, setTimeSec, damageTaken, setDamageTaken, poiEasy, setPoiEasy, poiMedium, setPoiMedium, poiEpic, setPoiEpic, selectedReachModifiers, toggleReachModifier, showArtifactSelect, setShowArtifactSelect }: any) => (
  <div className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg h-full overflow-y-auto custom-scrollbar flex flex-col">
      <div className="flex items-center gap-2 text-md-sys-on-surface font-black text-xs uppercase tracking-widest mb-4">
          Mission Intelligence
      </div>
      {inputMode === 'Manual' ? (
          <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="text-sm font-black uppercase opacity-60 mb-2 block text-center">Time in Reach</label>
                      <div className="flex items-center gap-2 bg-md-sys-surface2 p-3 rounded-2xl border-md-sys-outline/5">
                          <Clock size={16} className="opacity-70 ml-2"/>
                          <input type="number" placeholder="00" value={timeMin} onChange={(e) => setTimeMin(e.target.value)} className="w-full bg-md-sys-surface3 rounded-lg text-center font-black p-1"/>
                          <span className="font-black">:</span>
                          <input type="number" placeholder="00" value={timeSec} onChange={(e) => setTimeSec(e.target.value)} className="w-full bg-md-sys-surface3 rounded-lg text-center font-black p-1"/>
                      </div>
                  </div>
                  <div>
                      <label className="text-sm font-black uppercase opacity-60 mb-2 block text-center">Dmg in last 2m</label>
                      <div className="flex items-center gap-2 bg-md-sys-surface2 p-3 rounded-2xl border-md-sys-outline/5">
                          <HeartCrack size={16} className="text-red-400 opacity-70 ml-2"/>
                          <input type="text" placeholder="000" maxLength={3} value={damageTaken} onChange={(e) => setDamageTaken(e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-md-sys-surface3 rounded-lg text-center font-black p-1"/>
                      </div>
                  </div>
              </div>
              <div>
                  <label className="text-xs font-black uppercase opacity-60 mb-2 block">POI Objectives</label>
                  <div className="grid grid-cols-3 gap-2">
                      {['Easy', 'Medium', 'Epic'].map(tier => {
                          const val = tier === 'Easy' ? poiEasy : (tier === 'Medium' ? poiMedium : poiEpic);
                          const set = tier === 'Easy' ? setPoiEasy : (tier === 'Medium' ? setPoiMedium : setPoiEpic);
                          return (
                              <div key={tier} className="bg-md-sys-surface2 p-3 rounded-xl text-center border-md-sys-outline/5 shadow-inner">
                                  <div className="text-[10px] font-black opacity-70 uppercase mb-2">{tier}</div>
                                  <div className="text-2xl font-black mb-2">{val}</div>
                                  <div className="flex justify-center gap-1">
                                      <button onClick={() => set(Math.max(0, val-1))} className="w-8 h-8 bg-md-sys-surface3 rounded-lg">-</button>
                                      <button onClick={() => set(val+1)} className="w-8 h-8 bg-md-sys-primary text-md-sys-onPrimary rounded-lg">+</button>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
              <div>
                  <label className="text-xs font-black uppercase opacity-60 mb-2 block">Reach Modifiers</label>
                  <div className="flex flex-wrap gap-2">
                      {showArtifactSelect ? (
                          <div className="flex items-center gap-1 bg-amber-500/10 p-1 rounded-xl animate-scale-in border border-amber-500/20">
                              {['Healing', 'Ice', 'Weapon'].map(type => (
                                  <button key={type} onClick={() => { toggleReachModifier(`Artifact: ${type}`); setShowArtifactSelect(false); }} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-amber-500 text-black hover:brightness-110">{type}</button>
                              ))}
                              <button onClick={() => setShowArtifactSelect(false)} className="p-1.5 hover:bg-amber-500/20 rounded-lg"><X size={12} className="text-amber-500"/></button>
                          </div>
                      ) : (
                          <button onClick={() => setShowArtifactSelect(true)} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 ${selectedReachModifiers.some((m:string) => m.startsWith("Artifact")) ? 'bg-amber-500 border-amber-500 text-black' : 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10'}`}>
                              {selectedReachModifiers.find((m:string) => m.startsWith("Artifact")) || "Artifact"}
                          </button>
                      )}
                      {UI_REACH_MODIFIERS.filter(m => !m.startsWith("Artifact")).map(mod => (
                          <button key={mod} onClick={() => toggleReachModifier(mod)} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 ${selectedReachModifiers.includes(mod) ? 'bg-md-sys-error-container border-md-sys-error text-md-sys-on-error-container' : 'bg-md-sys-surface2 border-transparent'}`}>{mod}</button>
                      ))}
                  </div>
              </div>
          </div>
      ) : (
          <div className="flex items-center justify-center h-full opacity-60">
              <div className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 animate-pulse">
                  <Layout size={14} className="text-md-sys-primary"/> Smart Intelligence Active
              </div>
          </div>
      )}
  </div>
);

export const ActionPanel = ({ inputMode, setInputMode, initiateSubmission }: any) => (
  <div className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg h-full overflow-y-auto custom-scrollbar flex flex-col">
      <div className="flex items-center gap-2 text-md-sys-on-surface font-black text-xs uppercase tracking-widest mb-4">
          <Trophy size={14}/> Record Mission Results
      </div>
      <div className="flex justify-between items-center mb-6">
          <div className="flex bg-md-sys-surface2 p-1 rounded-xl shadow-inner">
              <button onClick={() => setInputMode('Smart')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${inputMode === 'Smart' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60'}`}>Smart</button>
              <button onClick={() => setInputMode('Manual')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${inputMode === 'Manual' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60'}`}>Manual</button>
          </div>
      </div>
      <div className="flex gap-4">
          <button onClick={() => initiateSubmission('Win')} className="flex-1 bg-green-600 text-white py-6 rounded-[32px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-2"><Trophy size={32}/> Victory</button>
          <button onClick={() => initiateSubmission('Draw')} className="w-1/4 bg-slate-500 text-white py-6 rounded-[32px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-2"><Scale size={24}/> Draw</button>
          <button onClick={() => initiateSubmission('Loss')} className="flex-1 bg-red-600 text-white py-6 rounded-[32px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-2"><Skull size={32}/> Defeat</button>
      </div>
  </div>
);

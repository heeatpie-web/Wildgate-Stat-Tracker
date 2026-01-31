import React from 'react';
import { Layout, Clock, HeartCrack, Target, Crosshair, Plus, Minus, Zap, X } from 'lucide-react';
import { WEAPONS, UI_REACH_MODIFIERS, KillMap } from '../../types';

interface MissionPanelProps {
  inputMode: 'Smart' | 'Manual';
  setInputMode: (mode: 'Smart' | 'Manual') => void;
  timeMin: string;
  setTimeMin: (val: string) => void;
  timeSec: string;
  setTimeSec: (val: string) => void;
  damageTaken: string;
  setDamageTaken: (val: string) => void;
  poiEasy: number;
  setPoiEasy: (val: number) => void;
  poiMedium: number;
  setPoiMedium: (val: number) => void;
  poiEpic: number;
  setPoiEpic: (val: number) => void;
  selectedReachModifiers: string[];
  toggleReachModifier: (modifier: string) => void;
  showArtifactSelect: boolean;
  setShowArtifactSelect: (show: boolean) => void;
  currentNote: string;
  setCurrentNote: (note: string) => void;
  kills: KillMap;
  setKills: (kills: KillMap) => void;
  weapons: Record<string, number>;
  setWeapons: (weapons: any) => void; // Keeping weapons setter as any for now due to complexity of functional updates
}

export const MissionPanel: React.FC<MissionPanelProps> = ({ 
    inputMode, setInputMode, timeMin, setTimeMin, timeSec, setTimeSec, 
    damageTaken, setDamageTaken, poiEasy, setPoiEasy, poiMedium, setPoiMedium, 
    poiEpic, setPoiEpic, selectedReachModifiers, toggleReachModifier, 
    showArtifactSelect, setShowArtifactSelect, currentNote, setCurrentNote, 
    kills, setKills, weapons, setWeapons 
}) => (
  <div className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg h-full overflow-hidden flex flex-col gap-2">
      <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-md-sys-primary font-black text-xs uppercase tracking-widest">
              <Layout size={16}/> Mission Intel
          </div>
          {inputMode === 'Smart' && <div className="px-2 py-0.5 bg-md-sys-primary-container text-md-sys-onPrimaryContainer rounded-full text-[9px] font-bold uppercase animate-pulse">Live</div>}
      </div>

      {inputMode === 'Manual' ? (
          <div className="flex flex-col gap-2 pr-1">
            {/* Vitals Card - Compact Row */}
            <div className="flex gap-2">
                <div className="flex-1 bg-md-sys-surface2 p-2 rounded-2xl border-none relative overflow-hidden group transition-colors flex flex-col justify-center">
                    <div className="absolute top-1 right-1 opacity-10"><Clock size={32}/></div>
                    <label className="text-[10px] font-bold uppercase opacity-60 mb-0.5 block">Time</label>
                    <div className="flex items-center justify-center">
                        <input type="number" placeholder="00" value={timeMin} onChange={(e) => setTimeMin(e.target.value)} className="w-full bg-transparent text-xl font-black outline-none text-right placeholder:opacity-20 z-10"/>
                        <span className="text-lg font-black opacity-40 mx-0.5">:</span>
                        <input type="number" placeholder="00" value={timeSec} onChange={(e) => setTimeSec(e.target.value)} className="w-full bg-transparent text-xl font-black outline-none text-left placeholder:opacity-20 z-10"/>
                    </div>
                </div>
                <div className="flex-1 bg-md-sys-surface2 p-2 rounded-2xl border-none relative overflow-hidden group transition-colors flex flex-col justify-center">
                    <div className="absolute top-1 right-1 opacity-10 text-red-500"><HeartCrack size={32}/></div>
                    <label className="text-[10px] font-bold uppercase opacity-60 mb-0.5 block text-red-300">Damage in last 2m</label>
                    <input type="text" placeholder="0" maxLength={4} value={damageTaken} onChange={(e) => setDamageTaken(e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-transparent text-xl font-black outline-none text-center placeholder:opacity-20 z-10 relative"/>
                </div>
            </div>

            {/* Objectives - TALL TILES WITH SPLIT CLICK */}
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-2"><Target size={12}/> POI Objectives</label>
                <div className="grid grid-cols-3 gap-1.5">
                    {[
                        { label: 'Easy', val: poiEasy, set: setPoiEasy, color: 'bg-green-500' }, 
                        { label: 'Med', val: poiMedium, set: setPoiMedium, color: 'bg-yellow-500' }, 
                        { label: 'Epic', val: poiEpic, set: setPoiEpic, color: 'bg-purple-500' }
                    ].map((item) => (
                        <div key={item.label} className="relative overflow-hidden rounded-2xl bg-md-sys-surface2 border-none h-20 group shadow-sm hover:shadow-md transition-all">
                            {/* Interaction Zones */}
                            <div onClick={() => item.set(Math.max(0, item.val-1))} className="absolute inset-y-0 left-0 w-1/2 cursor-pointer hover:bg-black/5 z-20 transition-colors flex items-center justify-start pl-2 opacity-0 group-hover:opacity-40"><Minus size={16}/></div>
                            <div onClick={() => item.set(item.val+1)} className="absolute inset-y-0 right-0 w-1/2 cursor-pointer hover:bg-black/5 z-20 transition-colors flex items-center justify-end pr-2 opacity-0 group-hover:opacity-40"><Plus size={16}/></div>
                            
                            {/* Content */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                                <div className={`w-8 h-1 rounded-full ${item.color} mb-3 opacity-40`}></div>
                                <span className="text-[9px] font-black uppercase opacity-40 mb-1">{item.label}</span>
                                <span className="text-3xl font-black">{item.val}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Weapons - 3-Column Square Tiles */}
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-2"><Crosshair size={12}/> Weapon Loadout</label>
                <div className="grid grid-cols-3 gap-1.5 pr-1">
                    {WEAPONS.map(w => {
                        const count = weapons?.[w] || 0;
                        const isActive = count > 0;
                        return (
                            <div key={w} className={`relative overflow-hidden rounded-xl transition-all border-none h-full min-h-[40px] group shadow-sm ${isActive ? 'bg-md-sys-primary-container' : 'bg-md-sys-surface2'}`}>
                                <div onClick={() => setWeapons((prev:any) => ({...prev, [w]: Math.max(0, (prev?.[w]||0)-1)}))} className="absolute inset-y-0 left-0 w-1/2 cursor-pointer hover:bg-black/5 z-20"></div>
                                <div onClick={() => setWeapons((prev:any) => ({...prev, [w]: (prev?.[w]||0)+1}))} className="absolute inset-y-0 right-0 w-1/2 cursor-pointer hover:bg-black/5 z-20"></div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 p-1 text-center">
                                    <span className={`text-[7px] font-black leading-tight mb-0.5 uppercase ${isActive ? 'text-md-sys-onPrimaryContainer' : 'opacity-40'}`}>
                                        {w.replace('Cannon','').replace('Scatter','Sct').replace('Spec Ops','SO')}
                                    </span>
                                    <span className={`text-sm font-black ${isActive ? 'text-md-sys-onPrimaryContainer' : 'opacity-20'}`}>{count}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modifiers Section - BIG BUTTONS */}
            <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-2"><Zap size={12}/> Reach Modifiers</label>
                <div className="flex flex-wrap gap-2">
                    {showArtifactSelect ? (
                        <div className="flex items-center gap-2 bg-amber-500/10 p-2 rounded-2xl border border-amber-500/20 animate-scale-in w-full">
                            {['Healing', 'Ice', 'Weapon'].map(type => (
                                <button key={type} onClick={() => { toggleReachModifier(`Artifact: ${type}`); setShowArtifactSelect(false); }} className="px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-amber-500 text-black hover:brightness-110 shadow-lg flex-1">{type}</button>
                            ))}
                            <button onClick={() => setShowArtifactSelect(false)} className="p-2 hover:bg-amber-500/20 rounded-xl"><X size={20} className="text-amber-500"/></button>
                        </div>
                    ) : (
                        <button onClick={() => setShowArtifactSelect(true)} className={`px-3 py-2 rounded-xl text-[10px] font-black border-none transition-all shadow-sm ${selectedReachModifiers.some((m:string) => m.startsWith("Artifact")) ? 'bg-amber-500 text-black shadow-lg scale-105' : 'bg-md-sys-surface2 text-amber-500 hover:bg-md-sys-surface3'}`}>
                            {selectedReachModifiers.find((m:string) => m.startsWith("Artifact")) || "Artifact"}
                        </button>
                    )}
                    {UI_REACH_MODIFIERS.filter(m => !m.startsWith("Artifact")).map(mod => (
                        <button key={mod} onClick={() => toggleReachModifier(mod)} className={`px-3 py-2 rounded-xl text-[10px] font-black border-none transition-all shadow-sm ${selectedReachModifiers.includes(mod) ? 'bg-md-sys-error-container border-md-sys-error text-md-sys-on-error-container shadow-lg scale-105' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>{mod}</button>
                    ))}
                </div>
            </div>
            
            <div className="flex-shrink-0">
                <textarea 
                    value={currentNote} 
                    onChange={(e) => setCurrentNote(e.target.value)} 
                    placeholder="Strategic observations..." 
                    className="w-full h-8 bg-md-sys-surface2 rounded-xl p-2 text-xs font-medium outline-none resize-none border-none transition-all placeholder:opacity-30"
                />
            </div>
          </div>
      ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-60">
              <div className="w-10 h-10 rounded-full bg-md-sys-surface2 flex items-center justify-center animate-pulse"><Layout size={20} className="text-md-sys-primary"/></div>
              <div className="text-[8px] font-black uppercase mt-1 opacity-40 tracking-widest">Compiling Data</div>
          </div>
      )}
  </div>
);
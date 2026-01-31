import React from 'react';
import { CHARACTERS, SHIPS } from '../../types';
import { Rocket } from 'lucide-react';

interface SquadronPanelProps {
  activeShip: string;
  setActiveShip: (ship: string) => void;
  activeHero: string;
  setActiveHero: (hero: string) => void;
}

export const SquadronPanel: React.FC<SquadronPanelProps> = ({ activeShip, setActiveShip, activeHero, setActiveHero }) => (
  <div className="bg-md-sys-surface1 rounded-[32px] p-3 shadow-lg h-full overflow-y-auto custom-scrollbar flex flex-col gap-4">
      <div className="flex items-center gap-2 text-md-sys-on-surface font-black text-xs uppercase tracking-widest mb-2">
          <Rocket size={14}/> Ship & Loadout
      </div>
      <div className="grid grid-cols-2 gap-2">
          {SHIPS.map(s => 
            <button key={s} onClick={() => setActiveShip(s)} className={`p-3 rounded-2xl text-[10px] font-black border-2 transition-all relative ${activeShip === s ? 'bg-md-sys-primary-container border-md-sys-primary text-md-sys-onPrimaryContainer' : 'bg-md-sys-surface2 border-transparent text-md-sys-on-surface'}`}>
              {s.split('(')[0]}
              {activeShip === s && <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-md-sys-primary animate-pulse"></div>}
            </button>
          )}
      </div>
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-md-sys-outline/5 flex-1 content-start">
          <label className="col-span-4 text-[10px] font-black uppercase opacity-60 mb-1 block text-md-sys-on-surface">Prospector Selection</label>
          {[...CHARACTERS].sort().map(c => <button key={c} onClick={() => setActiveHero(c)} className={`px-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeHero === c ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface2 text-md-sys-on-surface'}`}>{c}</button>)}
      </div>
  </div>
);
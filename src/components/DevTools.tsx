import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { useAppStore } from '../store/useAppStore';
import { Match, SHIPS, CHARACTERS, UI_REACH_MODIFIERS } from '../types';
import { TelemetryPanel } from './TelemetryPanel';

interface DevToolsProps {
    logFeed?: any[];
    logStatus?: any;
}

export const DevTools: React.FC<DevToolsProps> = ({ logFeed = [], logStatus = {} }) => {
    const { devMode, setDevMode, setShowResetConfirm, activeUser, showIdMapper, setShowIdMapper, activeView, setActiveView } = useUIState();
    const { setMatches, setPilotRegistry, matches, pilotRegistry } = useGameData();
    const [showLogStream, setShowLogStream] = useState(false);

    const handleDevMock = () => {
        // ... (existing mock logic)
        const mockPlayers = Array.from({ length: 5 }, (_, i) => `Mock Pilot ${Math.floor(Math.random() * 1000)}`);
        setPilotRegistry([...new Set([...pilotRegistry, ...mockPlayers])]);

        const matchCount = Math.floor(Math.random() * 16) + 10;
        const newMatches: Match[] = [];
        const allPilots = [...pilotRegistry, ...mockPlayers];

        for (let i = 0; i < matchCount; i++) {
            const mode = Math.random() > 0.5 ? 'Artifact Brawl' : 'Fleet Battle';
            const ship = SHIPS[Math.floor(Math.random() * SHIPS.length)];
            const teammates = Array.from({ length: Math.floor(Math.random() * 3) }, () => allPilots[Math.floor(Math.random() * allPilots.length)]).filter(p => p);
            const opponents = Array.from({ length: Math.floor(Math.random() * 3) }, () => allPilots[Math.floor(Math.random() * allPilots.length)]).filter(p => p);
            const mins = Math.floor(Math.random() * 18) + 2;
            const time = `${mins.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;
            const numMods = Math.floor(Math.random() * 3);
            const mods = [];
            for (let j = 0; j < numMods; j++) mods.push(UI_REACH_MODIFIERS[Math.floor(Math.random() * UI_REACH_MODIFIERS.length)]);

            newMatches.push({
                id: Date.now() + i,
                timestamp: Date.now() - (i * 86400000),
                date: new Date(Date.now() - (i * 86400000)).toLocaleDateString(),
                mode, player: activeUser || mockPlayers[0], teammates, opponents,
                hero: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)], ship,
                reachModifiers: [...new Set(mods)], kills: {}, result: Math.random() > 0.5 ? 'Win' : 'Loss',
                subType: 'Combat', damageTaken: Math.floor(Math.random() * 500), time
            });
        }
        setMatches([...newMatches, ...matches]);
        alert(`Generated ${matchCount} matches.`);
    };

    if (!devMode) return null;

    return (
        <>
            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[200]">
                <div className="bg-md-sys-surface1 p-2 rounded-xl shadow-2xl border border-md-sys-outline/10 flex flex-col gap-2">
                    <div className="text-label-sm font-black uppercase text-center opacity-40 p-1">Dev Tools</div>
                    <button onClick={() => setShowIdMapper(!showIdMapper)} className={`px-4 py-2 rounded-lg text-label-sm font-bold transition-all ${showIdMapper ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-md-sys-primary'}`}>
                        ID Mapper
                    </button>
                    <button onClick={handleDevMock} className="px-4 py-2 bg-md-sys-surface2 hover:bg-md-sys-surface3 rounded-lg text-label-sm font-bold text-md-sys-primary">
                        Mock Data
                    </button>
                    <button onClick={() => setShowResetConfirm(true)} className="px-4 py-2 bg-md-sys-error-container hover:brightness-110 rounded-lg text-label-sm font-bold text-md-sys-on-error-container">
                        Reset All
                    </button>
                    <button onClick={() => setDevMode(false)} className="px-4 py-2 bg-md-sys-surface3 hover:bg-md-sys-outline/20 rounded-lg text-label-sm font-bold">
                        Exit Dev Mode
                    </button>
                    <button onClick={() => setShowLogStream(!showLogStream)} className={`px-4 py-2 rounded-lg text-label-sm font-bold transition-all ${showLogStream ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-md-sys-primary'}`}>
                        {showLogStream ? 'Hide Telemetry' : 'Show Telemetry'}
                    </button>
                    <button onClick={() => setActiveView('dev-ocr')} className={`px-4 py-2 rounded-lg text-label-sm font-bold transition-all ${activeView === 'dev-ocr' ? 'bg-purple-600 text-white shadow-lg scale-105' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-purple-500'}`}>
                        Dev OCR Lab
                    </button>
                </div>
            </div>

            {showLogStream && (
                <TelemetryPanel logFeed={logFeed} logStatus={logStatus} onClear={() => { }} />
            )}
        </>
    );
};

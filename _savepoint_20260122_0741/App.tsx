import React, { useState, useEffect, useRef } from 'react';
import * as ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Match, GameMode, APP_VERSION, Language, CHARACTERS, SHIPS, UI_REACH_MODIFIERS, KillMap, ColorblindMode, getShipCapacity } from './types';
import { SquadronPanel, RosterPanel, MissionPanel, ActionPanel } from './components/RecordingPanel';
import AnalyticsPanel from './components/AnalyticsPanel';
import HistoryTable from './components/HistoryTable';
import Tutorial from './components/Tutorial';
import { SessionTimer } from './components/SessionTimer';
import { exportToJSON, exportToCSV } from './utils/export';
import { TRANSLATIONS } from './utils/translations';
import { Upload, Download, RefreshCw, Settings, Moon, Sun, Monitor, PlusCircle, HelpCircle, CloudMoon, User, X, Palette, Eye, Globe, ZapOff, Bug, FileJson, AlertOctagon, Layout, HeartCrack, MinusCircle, Grip, RotateCcw, Timer } from 'lucide-react';
import confetti from 'canvas-confetti';

// Fallback for missing WidthProvider
const SimpleWidthProvider = (ComposedComponent: any) => {
  return (props: any) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(1200);

    useEffect(() => {
        const updateWidth = () => {
            if (outerRef.current) {
                setWidth(outerRef.current.offsetWidth);
            } else {
                setWidth(window.innerWidth - 40); // fallback
            }
        };
        
        window.addEventListener('resize', updateWidth);
        // Delay initial measure to ensure DOM is ready
        setTimeout(updateWidth, 100); 
        
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    return (
        <div ref={outerRef} style={{width: '100%'}}>
            <ComposedComponent {...props} width={width} />
        </div>
    );
  };
};

// Defensive access for Responsive
// @ts-ignore
const RGL = ReactGridLayout.default || ReactGridLayout;
// @ts-ignore
const Responsive = RGL.Responsive || ReactGridLayout.Responsive;

// Use custom WidthProvider
const ResponsiveGridLayout = SimpleWidthProvider(Responsive);

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    return defaultValue;
  }
};

const App: React.FC = () => {
  const [activeMode, setActiveMode] = useState<GameMode>('Artifact Brawl');
  const [matches, setMatches] = useState<Match[]>(() => loadFromStorage('wg_v13_matches', []));
  const [players, setPlayers] = useState<string[]>(() => loadFromStorage('wg_v13_players', []));
  const [pilotRegistry, setPilotRegistry] = useState<string[]>(() => loadFromStorage('wg_v13_pilot_registry', []));
  const [favorites, setFavorites] = useState<string[]>(() => loadFromStorage('wg_v13_favorites', []));
  const [pilotNotes, setPilotNotes] = useState<Record<string, string>>(() => loadFromStorage('wg_v13_pilot_notes', {}));
  
  const [activeUser, setActiveUser] = useState<string>(() => {
    const saved = loadFromStorage<string[]>('wg_v13_players', []);
    return saved.length > 0 ? saved[0] : '';
  });

  const [showWelcome, setShowWelcome] = useState(() => loadFromStorage<string[]>('wg_v13_players', []).length === 0);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWizard, setShowWizard] = useState<'Win' | 'Loss' | 'Draw' | null>(null);
  const [isRearranging, setIsRearranging] = useState(false);
  
  // Lifted Recording State
  const [inputMode, setInputMode] = useState<'Smart' | 'Manual'>('Manual'); 
  const [selectedTeammates, setSelectedTeammates] = useState<string[]>([]);
  const [selectedOpponents, setSelectedOpponents] = useState<string[]>([]);
  const [activeHero, setActiveHero] = useState(CHARACTERS[0]);
  const [activeShip, setActiveShip] = useState(SHIPS[0]);
  const [selectedReachModifiers, setSelectedReachModifiers] = useState<string[]>([]);
  const [kills, setKills] = useState<KillMap>({ "AI Legion": 0 });
  const [poiEasy, setPoiEasy] = useState(0);
  const [poiMedium, setPoiMedium] = useState(0);
  const [poiEpic, setPoiEpic] = useState(0);
  const [timeMin, setTimeMin] = useState("");
  const [timeSec, setTimeSec] = useState("");
  const [damageTaken, setDamageTaken] = useState("");
  const [showArtifactSelect, setShowArtifactSelect] = useState(false);

  const [layouts, setLayouts] = useState(() => loadFromStorage('wg_layouts_v6', {
      lg: [
          { i: 'squadron', x: 0, y: 0, w: 6, h: 9 },
          { i: 'roster', x: 6, y: 0, w: 6, h: 9 },
          { i: 'actions', x: 0, y: 9, w: 12, h: 5 },
          { i: 'mission', x: 0, y: 14, w: 12, h: 9 },
          { i: 'analytics', x: 0, y: 23, w: 12, h: 12 },
          { i: 'history', x: 0, y: 35, w: 12, h: 16 }
      ]
  }));

  const [pendingMatchData, setPendingMatchData] = useState<any>(null);
  const [pendingSubType, setPendingSubType] = useState('');
  const [pendingPlacement, setPendingPlacement] = useState<number | null>(null);
  const [pendingArtifactType, setPendingArtifactType] = useState('');

  const [appearanceMode, setAppearanceMode] = useState<'light'|'dark'|'twilight'|'system'>(() => loadFromStorage('wg_mode', 'twilight'));
  const [colorTheme, setColorTheme] = useState<string>(() => loadFromStorage('wg_theme_accent', 'ocean'));
  const [customHue, setCustomHue] = useState<string>(() => loadFromStorage('wg_custom_hue', '0'));
  const [devMode, setDevMode] = useState(false);
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>(() => loadFromStorage('wg_colorblind', 'none'));
  const [disableAnimations, setDisableAnimations] = useState(() => loadFromStorage('wg_disable_animations', false));
  const [language, setLanguage] = useState<Language>(() => loadFromStorage('wg_language', 'en'));
  const [showSessionTimer, setShowSessionTimer] = useState(() => loadFromStorage('wg_show_session_timer', true));

  const t = TRANSLATIONS[language];
  const devClicks = useRef(0);
  const isResetting = useRef(false);

  // Session Timer
  const [sessionStartTime] = useState(Date.now());
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Recording Logic
  const maxTeammates = getShipCapacity(activeShip) - 1;

  useEffect(() => {
    setLayouts(prev => {
        const newLg = prev.lg.map(item => {
            if (item.i === 'mission') {
                // Shrink to 2 (header only) in Smart mode, expand to 9 in Manual
                return { ...item, h: inputMode === 'Smart' ? 2 : 9 };
            }
            return item;
        });
        return { ...prev, lg: newLg };
    });
  }, [inputMode]);

  useEffect(() => {
    setSelectedTeammates(prev => prev.filter((_, i) => i < maxTeammates));
  }, [activeShip, maxTeammates]);

  const toggleTeammate = (name: string) => {
      if (selectedTeammates.includes(name)) setSelectedTeammates(prev => prev.filter(t => t !== name));
      else if (selectedTeammates.length < maxTeammates) setSelectedTeammates(prev => [...prev, name]);
  };

  const toggleOpponent = (name: string) => {
      if (selectedOpponents.includes(name)) setSelectedOpponents(prev => prev.filter(o => o !== name));
      else setSelectedOpponents(prev => [...prev, name]);
  };

  const toggleReachModifier = (mod: string) => {
      if (selectedReachModifiers.includes(mod)) setSelectedReachModifiers(prev => prev.filter(m => m !== mod));
      else setSelectedReachModifiers(prev => [...prev, mod]);
  };

  const initiateSubmission = (result: 'Win' | 'Loss' | 'Draw') => {
      if (!activeUser) { alert("Select a prospector!"); return; }
      const timeStr = (timeMin || timeSec) ? `${timeMin || '00'}:${timeSec || '00'}` : "";
      const dmg = parseInt(damageTaken) || 0;
      const data = {
        activeMode, activeUser, selectedTeammates, selectedOpponents, activeHero, activeShip,
        selectedReachModifiers, kills, time: timeStr, poiEasy, poiMedium, poiEpic, damageTaken: dmg
      };
      handleInitiateSubmission(data, result);
      // Reset manual fields
      setPoiEasy(0); setPoiMedium(0); setPoiEpic(0); setKills({"AI Legion": 0}); setTimeMin(""); setTimeSec(""); setSelectedReachModifiers([]); setDamageTaken("");
  };

  useEffect(() => {
      if (devMode) {
          try {
              // @ts-ignore
              const { ipcRenderer } = window.require('electron');
              ipcRenderer.send('open-devtools');
          } catch (e) {
              console.log("DevTools not available (not in Electron)");
          }
      }
  }, [devMode]);

  useEffect(() => {
    const body = document.body;
    let resolved = appearanceMode;
    if (appearanceMode === 'system') resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    body.setAttribute('data-mode', resolved);
    body.setAttribute('data-theme', colorTheme);
    
    if (colorTheme === 'custom') body.style.setProperty('--app-hue', customHue);
    else body.style.removeProperty('--app-hue');
    
    body.classList.remove('cb-protanopia', 'cb-deuteranopia', 'cb-tritanopia');
    if (colorblindMode !== 'none') body.classList.add(`cb-${colorblindMode}`);
    if (disableAnimations) body.classList.add('no-animate'); else body.classList.remove('no-animate');
  }, [appearanceMode, colorTheme, customHue, colorblindMode, disableAnimations]);

  useEffect(() => {
    if (isResetting.current) return;
    localStorage.setItem('wg_v13_matches', JSON.stringify(matches));
    localStorage.setItem('wg_v13_players', JSON.stringify(players));
    localStorage.setItem('wg_v13_pilot_registry', JSON.stringify(pilotRegistry));
    localStorage.setItem('wg_v13_favorites', JSON.stringify(favorites));
    localStorage.setItem('wg_v13_pilot_notes', JSON.stringify(pilotNotes));
    localStorage.setItem('wg_mode', JSON.stringify(appearanceMode));
    localStorage.setItem('wg_theme_accent', JSON.stringify(colorTheme));
    localStorage.setItem('wg_colorblind', JSON.stringify(colorblindMode));
    localStorage.setItem('wg_disable_animations', JSON.stringify(disableAnimations));
    localStorage.setItem('wg_language', JSON.stringify(language));
    localStorage.setItem('wg_layouts_v6', JSON.stringify(layouts));
    localStorage.setItem('wg_show_session_timer', JSON.stringify(showSessionTimer));
  }, [matches, players, pilotRegistry, favorites, pilotNotes, appearanceMode, colorTheme, colorblindMode, disableAnimations, language, layouts, showSessionTimer]);

  const handleRegisterUser = (name: string) => {
    if (!name.trim()) return;
    if (!players.includes(name)) setPlayers(prev => [...prev, name]);
    setActiveUser(name); setShowWelcome(false);
  };

  const handleDeleteProfile = () => {
      if (!activeUser) return;
      if (!window.confirm(`Delete profile "${activeUser}"? Matches will be preserved.`)) return;
      const newPlayers = players.filter(p => p !== activeUser);
      setPlayers(newPlayers);
      setActiveUser(newPlayers.length > 0 ? newPlayers[0] : '');
      if(newPlayers.length === 0) setShowWelcome(true);
  };

  const handleReset = (backup: boolean) => {
      isResetting.current = true;
      if (backup) exportToJSON({matches, players, pilotRegistry});
      setTimeout(() => { localStorage.clear(); window.location.reload(); }, 500);
  };

  const handleResetLayout = () => {
      if(window.confirm("Reset dashboard layout to default?")) {
          localStorage.removeItem('wg_layouts_v6');
          window.location.reload();
      }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          try {
              const data = JSON.parse(ev.target?.result as string);
              if (data.matches) setMatches(data.matches);
              if (data.players) setPlayers(data.players);
              if (data.pilotRegistry) setPilotRegistry(data.pilotRegistry);
              alert("Import successful!");
          } catch (e) { alert("Failed to import."); }
      };
      reader.readAsText(file);
  };
  
  const handleInitiateSubmission = (data: any, result: 'Win' | 'Loss' | 'Draw') => {
      setPendingMatchData(data);
      setShowWizard(result);
  };

  const handleToggleFavorite = (name: string) => setFavorites(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
  const handleUpdateNote = (name: string, note: string) => setPilotNotes(prev => ({ ...prev, [name]: note }));
  const handleDeletePilot = (name: string) => {
    if (!window.confirm(`Delete pilot profile "${name}"? This cannot be undone.`)) return;
    setPilotRegistry(prev => prev.filter(p => p !== name));
    setFavorites(prev => prev.filter(f => f !== name));
    setPilotNotes(prev => { const n = {...prev}; delete n[name]; return n; });
  };

  const handleRenamePilot = (oldName: string, newName: string) => {
      if (!newName.trim() || pilotRegistry.includes(newName)) return;
      setPilotRegistry(prev => prev.map(p => p === oldName ? newName : p));
      setFavorites(prev => prev.map(f => f === oldName ? newName : f));
      setPilotNotes(prev => { const n = {...prev}; if(n[oldName]) { n[newName] = n[oldName]; delete n[oldName]; } return n; });
      setMatches(prev => prev.map(m => ({ ...m, player: m.player === oldName ? newName : m.player, teammates: m.teammates.map(t => t === oldName ? newName : t), opponents: m.opponents.map(o => o === oldName ? newName : o)})));
      if (activeUser === oldName) setActiveUser(newName);
  };

  const processFinalSubmission = (subType: string) => {
      if(!pendingMatchData) return;
      let finalMods = [...(pendingMatchData.selectedReachModifiers||[])];
      if(showWizard === 'Win' && subType === 'Artifact') finalMods.push(`Artifact: ${pendingArtifactType || 'Healing'}`);
      if(showWizard === 'Win') confetti({ particleCount: 100, spread: 70 });
      
      const newMatch: Match = {
          id: Date.now(), timestamp: Date.now(), date: new Date().toLocaleDateString(),
          mode: pendingMatchData.activeMode, player: pendingMatchData.activeUser,
          teammates: pendingMatchData.selectedTeammates, opponents: pendingMatchData.selectedOpponents,
          hero: pendingMatchData.activeHero, ship: pendingMatchData.activeShip,
          reachModifiers: finalMods, kills: pendingMatchData.kills,
          result: showWizard||'Win', subType: subType||'Combat', placement: pendingPlacement||undefined,
          damageTaken: pendingMatchData.damageTaken || 0, time: pendingMatchData.time,
          poiEasy: pendingMatchData.poiEasy, poiMedium: pendingMatchData.poiMedium, poiEpic: pendingMatchData.poiEpic,
      };
      setMatches(prev => [newMatch, ...prev]);
      setLastActivity(Date.now());
      setShowWizard(null); setPendingMatchData(null); setPendingPlacement(null);
  };
  
  const renderWizard = () => {
    if (!showWizard || !pendingMatchData) return null;
    const isDefeat = showWizard === 'Loss';
    const title = isDefeat ? 'Defeat' : showWizard;
    const bg = showWizard === 'Win' ? 'bg-green-500' : (isDefeat ? 'bg-red-500' : 'bg-slate-500');
    
    return (
        <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowWizard(null)}>
            <div className="bg-md-sys-surface1 p-6 rounded-[32px] max-w-3xl w-full text-center shadow-2xl overflow-hidden flex flex-col animate-scale-in max-h-[95vh]" onClick={e => e.stopPropagation()}>
                <div className={`p-4 -m-6 mb-4 ${bg} text-white`}><h2 className="text-xl font-black uppercase tracking-widest">{title}</h2></div>
                <div className="overflow-y-auto flex-1 flex flex-col gap-3 px-2 py-4 custom-scrollbar">
                     
                     {isDefeat && pendingMatchData.activeMode === 'Artifact Brawl' && (
                          <div className="bg-md-sys-surface2 p-4 rounded-[24px]">
                              <label className="text-xs font-bold uppercase opacity-60 mb-2 block">Placement</label>
                              <div className="grid grid-cols-4 gap-3">
                                  {[2, 3, 4, 5].map(p => (
                                      <button key={p} type="button" onClick={() => setPendingPlacement(p)} className={`p-4 rounded-2xl font-black transition-all ${pendingPlacement === p ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg scale-105' : 'bg-md-sys-surface1 hover:bg-md-sys-surface3'}`}>
                                          {p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`}
                                      </button>
                                  ))}
                              </div>
                          </div>
                     )}

                     <div className="flex flex-wrap gap-3">
                         {showWizard === 'Win' ? <>
                            <button type="button" onClick={() => setPendingSubType('Artifact')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Artifact' ? 'yellow-btn-active shadow-md' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Artifact Victory</button>
                            <button type="button" onClick={() => setPendingSubType('Combat')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Combat' ? 'combat-btn-active shadow-md' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Combat Victory</button>
                         </> : isDefeat ? <>
                            <button onClick={() => setPendingSubType('Eliminated')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Eliminated' ? 'bg-md-sys-error-container text-md-sys-on-error-container' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Eliminated</button>
                            <button onClick={() => setPendingSubType('Surrender')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Surrender' ? 'bg-md-sys-error-container text-md-sys-on-error-container' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Surrender</button>
                         </> : <>
                            <button onClick={() => setPendingSubType('Mutual Elimination')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Mutual Elimination' ? 'bg-slate-600 text-white' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Mutual Elimination</button>
                            <button onClick={() => setPendingSubType('Time Expired')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Time Expired' ? 'bg-slate-600 text-white' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Time Expired</button>
                         </>}
                     </div>

                     {showWizard === 'Win' && pendingSubType === 'Artifact' && (
                        <div className="bg-md-sys-surface2 p-4 rounded-[24px] animate-fade-in">
                            <label className="text-xs font-bold uppercase opacity-60 mb-2 block">Artifact Type</label>
                            <div className="flex gap-2">
                                {['Healing', 'Ice', 'Weapon'].map(type => (
                                    <button key={type} onClick={() => setPendingArtifactType(type)} className={`flex-1 py-3 rounded-xl font-bold transition-all ${pendingArtifactType === type ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md scale-105' : 'bg-md-sys-surface1 hover:bg-md-sys-surface3'}`}>
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>
                     )}
                     
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                         <div className="bg-md-sys-surface2 p-4 rounded-[24px]">
                             <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Duration</label>
                             <div className="flex gap-2 items-center justify-center">
                                 <input type="number" placeholder="00" value={pendingMatchData.time?.split(':')[0] || ''} onChange={e => setPendingMatchData({...pendingMatchData, time: `${e.target.value}:${pendingMatchData.time?.split(':')[1] || '00'}`})} className="w-full bg-md-sys-surface1 rounded-lg text-center font-black p-3 text-lg"/>
                                 <span className="font-black text-xl">:</span>
                                 <input type="number" placeholder="00" value={pendingMatchData.time?.split(':')[1] || ''} onChange={e => setPendingMatchData({...pendingMatchData, time: `${pendingMatchData.time?.split(':')[0] || '00'}:${e.target.value}`})} className="w-full bg-md-sys-surface1 rounded-lg text-center font-black p-3 text-lg"/>
                             </div>
                         </div>
                         <div className="bg-md-sys-surface2 p-4 rounded-[24px]">
                             <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Damage Taken</label>
                             <div className="flex justify-center"><input type="number" placeholder="000" maxLength={3} value={pendingMatchData.damageTaken || ''} onChange={e => setPendingMatchData({...pendingMatchData, damageTaken: e.target.value})} className="w-full bg-md-sys-surface1 rounded-lg text-center font-black p-3 text-lg"/></div>
                         </div>
                         <div className="bg-md-sys-surface2 p-4 rounded-[24px] md:row-span-2 md:col-start-3">
                             <label className="text-[10px] font-black uppercase opacity-60 mb-2 block">Eliminations</label>
                             <div className="space-y-1">
                                 {SHIPS.map(ship => (
                                     <div key={ship} className="flex justify-between items-center bg-md-sys-surface1 p-1.5 rounded-xl">
                                         <span className="text-[9px] font-bold opacity-70 truncate max-w-[80px] ml-2">{ship.split('(')[0]}</span>
                                         <div className="flex gap-1 items-center">
                                             <button onClick={() => setPendingMatchData((p:any) => ({...p, kills: {...p.kills, [ship]: Math.max(0, (p.kills?.[ship]||0)-1)}}))} className="w-6 h-6 bg-md-sys-surface3 rounded">-</button>
                                             <span className="font-black w-5 text-center text-sm">{pendingMatchData.kills?.[ship] || 0}</span>
                                             <button onClick={() => setPendingMatchData((p:any) => ({...p, kills: {...p.kills, [ship]: (p.kills?.[ship]||0)+1}}))} className="w-6 h-6 bg-md-sys-primary text-md-sys-onPrimary rounded">+</button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         </div>
                         <div className="bg-md-sys-surface2 p-4 rounded-[24px] md:col-span-2">
                            <label className="text-xs font-bold uppercase opacity-60 mb-2 block">POI Objectives</label>
                            <div className="grid grid-cols-3 gap-3">{['Easy', 'Medium', 'Epic'].map(tier => (
                                <div key={tier} className="bg-md-sys-surface1 p-2 rounded-2xl text-center shadow-sm">
                                    <div className="text-[9px] font-black opacity-60 uppercase mb-1">{tier}</div>
                                    <div className="text-xl font-black mb-1">{pendingMatchData[`poi${tier}`] || 0}</div>
                                    <div className="flex justify-center gap-1">
                                          <button onClick={() => setPendingMatchData((p:any) => ({...p, [`poi${tier}`]: Math.max(0, (p[`poi${tier}`]||0)-1)}))} className="w-6 h-6 bg-md-sys-surface3 rounded">-</button>
                                          <button onClick={() => setPendingMatchData((p:any) => ({...p, [`poi${tier}`]: (p[`poi${tier}`]||0)+1}))} className="w-6 h-6 bg-md-sys-primary text-md-sys-onPrimary rounded">+</button>
                                    </div>
                                </div>
                            ))}</div>
                         </div>
                     </div>
                </div>
                <div className="p-4 -m-6 mt-4 bg-md-sys-surface2 flex justify-between gap-4">
                    <button type="button" onClick={() => setShowWizard(null)} className="px-8 py-3 rounded-2xl font-black hover:bg-md-sys-surface3">Cancel</button>
                    <button type="button" onClick={() => processFinalSubmission(pendingSubType)} className="px-10 py-3 rounded-2xl font-black bg-md-sys-primary text-md-sys-onPrimary flex-1 hover:brightness-110 shadow-lg">Confirm</button>
                </div>
            </div>
        </div>
    );
  };

  const handleDevMock = () => {
    // Generate random players
    const mockPlayers = Array.from({length: 5}, (_, i) => `Mock Pilot ${Math.floor(Math.random()*1000)}`);
    // setPlayers(prev => [...new Set([...prev, ...mockPlayers])]); // Keep profile list clean
    setPilotRegistry(prev => [...new Set([...prev, ...mockPlayers])]);
    
    // Generate 10-25 random matches
    const matchCount = Math.floor(Math.random() * 16) + 10;
    const newMatches: Match[] = [];
    const allPilots = [...pilotRegistry, ...mockPlayers];

    for(let i=0; i<matchCount; i++) {
        const mode = Math.random() > 0.5 ? 'Artifact Brawl' : 'Fleet Battle';
        const ship = SHIPS[Math.floor(Math.random() * SHIPS.length)];
        const teammates = Array.from({length: Math.floor(Math.random() * 3)}, () => allPilots[Math.floor(Math.random() * allPilots.length)]).filter(p => p);
        const opponents = Array.from({length: Math.floor(Math.random() * 3)}, () => allPilots[Math.floor(Math.random() * allPilots.length)]).filter(p => p);
        
        const mins = Math.floor(Math.random() * 18) + 2;
        const secs = Math.floor(Math.random() * 60);
        const time = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        const numMods = Math.floor(Math.random() * 3);
        const mods = [];
        for(let j=0; j<numMods; j++) mods.push(UI_REACH_MODIFIERS[Math.floor(Math.random() * UI_REACH_MODIFIERS.length)]);

        newMatches.push({
            id: Date.now() + i,
            timestamp: Date.now() - (i * 86400000),
            date: new Date(Date.now() - (i * 86400000)).toLocaleDateString(),
            mode,
            player: activeUser || mockPlayers[0],
            teammates,
            opponents,
            hero: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)],
            ship,
            reachModifiers: [...new Set(mods)],
            kills: {},
            result: Math.random() > 0.5 ? 'Win' : 'Loss',
            subType: 'Combat',
            damageTaken: Math.floor(Math.random() * 500),
            time
        });
    }
    setMatches(prev => [...newMatches, ...prev]);
    alert(`Generated ${matchCount} matches and ${mockPlayers.length} mock players.`);
  };

  return (
    <div className="min-h-screen pb-20 p-4 md:p-6 flex justify-center bg-md-sys-background text-md-sys-on-background">
      <style>{`
        .react-grid-item > .react-resizable-handle {
          width: 20px;
          height: 20px;
          bottom: 5px;
          right: 5px;
          cursor: se-resize;
          z-index: 1000;
        }
        .react-grid-item > .react-resizable-handle::after {
          content: "";
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: 12px;
          height: 12px;
          border-right: 3px solid rgba(255, 255, 255, 0.4);
          border-bottom: 3px solid rgba(255, 255, 255, 0.4);
          border-bottom-right-radius: 4px;
        }
        .react-grid-item:hover > .react-resizable-handle::after {
          border-color: rgba(255, 255, 255, 0.8);
        }
      `}</style>
      {showWelcome && (
            <div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4">
                <div className="bg-md-sys-surface1 p-10 rounded-[40px] max-w-lg w-full text-center shadow-2xl border-md-sys-outline/20">
                    <h1 className="text-4xl font-black mb-2 text-md-sys-primary uppercase">{t.welcome}</h1>
                    <p className="mb-8 opacity-60 font-bold uppercase tracking-widest text-xs">{t.enterCallsign}</p>
                    <input id="welcome-input" autoFocus className="w-full bg-md-sys-surface2 p-4 rounded-2xl text-center font-bold text-xl outline-none mb-6 border-2 border-transparent focus:border-md-sys-primary" placeholder={t.prospector} onKeyDown={e => {if(e.key==='Enter') handleRegisterUser(e.currentTarget.value)}} />
                    <div className="grid grid-cols-3 gap-2 mb-8">{['en','es','mx','pt','br','zh'].map(l => <button key={l} onClick={() => setLanguage(l as any)} className={`p-2 rounded-xl font-bold uppercase text-xs ${language===l ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md scale-105' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>{l}</button>)}</div>
                    <button onClick={() => { const el = document.getElementById('welcome-input') as HTMLInputElement; handleRegisterUser(el.value); }} className="w-full py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg">Launch</button>
                </div>
            </div>
      )}
      <div className="w-full max-w-[1800px] flex flex-col gap-6 animate-fade-in">
        <header className="md-card flex flex-col md:flex-row justify-between items-center gap-4 bg-md-sys-surface1 p-6 rounded-[32px] shadow-lg">
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-black tracking-tighter select-none">WILDGATE STAT TRACKER</h1>
            <span onClick={() => { devClicks.current++; if(devClicks.current>=5) setDevMode(true); }} className="text-sm font-bold bg-md-sys-surface3 px-3 py-1.5 rounded-lg text-md-sys-primary select-none cursor-pointer opacity-60 hover:opacity-100" title="Version Info">{APP_VERSION}</span>
            {devMode && <span className="text-xs font-black bg-red-500 text-white px-2 py-1 rounded">DEV MODE</span>}
          </div>
          
          {showSessionTimer && <SessionTimer startTime={sessionStartTime} matches={matches} lastActivity={lastActivity} />}

          <div className="flex flex-col md:flex-row items-center gap-4">
             <div className="flex items-center gap-2 bg-md-sys-surface2 px-6 py-3 rounded-full border-md-sys-outline/10 shadow-inner">
                <User size={20} className="text-md-sys-primary"/>
                <select value={activeUser} onChange={(e) => setActiveUser(e.target.value)} className="bg-transparent font-bold outline-none cursor-pointer text-base" title="Select Active Prospector">{players.map(p => <option key={p} value={p}>{p}</option>)}</select>
                <button onClick={() => { const n = prompt("New profile:"); if(n) handleRegisterUser(n); }} className="p-2 hover:bg-md-sys-surface3 rounded-full" title="Create New Profile"><PlusCircle size={20} className="text-md-sys-primary hover:scale-110" /></button>
                <button onClick={handleDeleteProfile} className="p-2 hover:bg-red-500/20 hover:text-red-500 rounded-full transition-colors" title="Delete Profile" disabled={!activeUser}><MinusCircle size={20} /></button>
             </div>
             <div className="bg-md-sys-surface2 p-1 rounded-full flex gap-1 border-md-sys-outline/5 shadow-inner">
                <button onClick={() => setActiveMode('Artifact Brawl')} className={`px-4 py-2 rounded-full text-xs font-black ${activeMode === 'Artifact Brawl' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'text-md-sys-on-surface/60 hover:bg-md-sys-surface3'}`}>{t.artifactBrawl}</button>
                <button onClick={() => setActiveMode('Fleet Battle')} className={`px-4 py-2 rounded-full text-xs font-black ${activeMode === 'Fleet Battle' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'text-md-sys-on-surface/60 hover:bg-md-sys-surface3'}`}>{t.fleetBattle}</button>
             </div>
             <div className="flex gap-2">
                <button onClick={() => setShowTutorial(true)} className="p-3.5 bg-md-sys-surface2 rounded-full border-md-sys-outline/10 hover:bg-md-sys-surface3" title="Tutorial"><HelpCircle size={18} /></button>
                <button onClick={() => setAppearanceMode(appearanceMode === 'light' ? 'dark' : (appearanceMode === 'dark' ? 'twilight' : 'light'))} className="p-3.5 bg-md-sys-surface2 rounded-full border-md-sys-outline/10 hover:bg-md-sys-surface3" title="Toggle Appearance"><Moon size={18} /></button>
                <button onClick={() => setShowSettings(true)} className="p-3.5 bg-md-sys-surface2 rounded-full border-md-sys-outline/10 hover:bg-md-sys-surface3" title="Open Settings"><Settings size={18} /></button>
                {isRearranging && (
                    <button onClick={handleResetLayout} className="p-3.5 bg-md-sys-surface2 rounded-full border-md-sys-outline/10 hover:bg-md-sys-error-container hover:text-md-sys-on-error-container animate-fade-in" title="Reset Layout"><RotateCcw size={18} /></button>
                )}
                <button onClick={() => setIsRearranging(!isRearranging)} className={`p-3.5 rounded-full border-md-sys-outline/10 transition-all ${isRearranging ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`} title="Edit Layout"><Layout size={18} /></button>
            </div>
          </div>
        </header>

        <ResponsiveGridLayout 
            className="layout" 
            layouts={layouts} 
            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
            cols={{lg: 12, md: 10, sm: 6, xs: 4, xxs: 2}}
            rowHeight={30}
            margin={[24, 24]}
            onLayoutChange={(layout, layouts) => {
                setLayouts(layouts);
                localStorage.setItem('wg_layouts_v6', JSON.stringify(layouts));
            }}
            isDraggable={isRearranging}
            isResizable={isRearranging}
            draggableHandle=".grid-drag-handle"
        >
            <div key="squadron">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <SquadronPanel activeShip={activeShip} setActiveShip={setActiveShip} activeHero={activeHero} setActiveHero={setActiveHero} />
            </div>
            <div key="roster">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <RosterPanel 
                    pilotRegistry={pilotRegistry} favorites={favorites} pilotNotes={pilotNotes} 
                    selectedTeammates={selectedTeammates} toggleTeammate={toggleTeammate}
                    selectedOpponents={selectedOpponents} toggleOpponent={toggleOpponent}
                    onAddPilot={(n:string) => setPilotRegistry(p=>[...p,n])}
                    onToggleFavorite={handleToggleFavorite} onUpdateNote={handleUpdateNote} 
                    onDeletePilot={handleDeletePilot} onRenamePilot={handleRenamePilot}
                />
            </div>
            <div key="mission">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <MissionPanel 
                    inputMode={inputMode} setInputMode={setInputMode} 
                    timeMin={timeMin} setTimeMin={setTimeMin} timeSec={timeSec} setTimeSec={setTimeSec} 
                    damageTaken={damageTaken} setDamageTaken={setDamageTaken} 
                    poiEasy={poiEasy} setPoiEasy={setPoiEasy} poiMedium={poiMedium} setPoiMedium={setPoiMedium} poiEpic={poiEpic} setPoiEpic={setPoiEpic}
                    selectedReachModifiers={selectedReachModifiers} toggleReachModifier={toggleReachModifier}
                    showArtifactSelect={showArtifactSelect} setShowArtifactSelect={setShowArtifactSelect}
                />
            </div>
            <div key="actions">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <ActionPanel inputMode={inputMode} setInputMode={setInputMode} initiateSubmission={initiateSubmission} />
            </div>
            
            <div key="analytics" className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg overflow-hidden flex flex-col">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <AnalyticsPanel matches={matches} currentMode={activeMode} language={language} />
            </div>
            <div key="history" className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg overflow-hidden flex flex-col">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <HistoryTable matches={matches.filter(m => m.mode === activeMode)} onDelete={(id) => setMatches(prev => prev.filter(m => m.id !== id))} onEdit={() => {}} onPin={(id) => setMatches(prev => prev.map(m => m.id === id ? { ...m, isPinned: !m.isPinned } : m))} language={language} />
            </div>
        </ResponsiveGridLayout>

        {renderWizard()}
        {showTutorial && <Tutorial onComplete={() => setShowTutorial(false)} onSkip={() => setShowTutorial(false)} />}
        
        {showSettings && (
            <div className="fixed top-0 left-0 h-full w-full z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
                <div className="bg-md-sys-surface1 p-8 rounded-[32px] w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh] border-md-sys-outline/10 flex flex-col gap-8" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center"><h2 className="text-3xl font-black uppercase tracking-tight">{t.settings}</h2><button onClick={() => setShowSettings(false)} className="p-3 hover:bg-md-sys-surface2 rounded-full"><X/></button></div>
                    <div className="space-y-6">
                        <h3 className="text-sm font-black uppercase opacity-60 flex items-center gap-2 border-b border-md-sys-outline/10 pb-2"><Palette size={16}/> Appearance</h3>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-80 mb-3 block">Theme Accent</label>
                            <div className="grid grid-cols-4 gap-3 mb-4">
                                {['ocean', 'emerald', 'crimson', 'amber', 'amethyst', 'cyan'].map(th => (
                                    <button key={th} onClick={() => setColorTheme(th)} className={`h-12 rounded-xl border-2 uppercase text-[10px] font-black ${colorTheme === th ? 'bg-md-sys-primary-container border-md-sys-primary text-md-sys-onPrimaryContainer' : 'bg-md-sys-surface2 border-transparent hover:bg-md-sys-surface3'}`}>{th}</button>
                                ))} 
                                <button onClick={() => setColorTheme('custom')} className={`h-12 rounded-xl border-2 uppercase text-[10px] font-black ${colorTheme === 'custom' ? 'bg-md-sys-primary-container border-md-sys-primary text-md-sys-onPrimaryContainer' : 'bg-md-sys-surface2 border-transparent hover:bg-md-sys-surface3'}`}>Custom</button>
                            </div>
                            {colorTheme === 'custom' && (
                                <div className="bg-md-sys-surface2 p-4 rounded-2xl flex items-center gap-4">
                                    <input type="range" min="0" max="360" value={customHue} onChange={(e) => { setCustomHue(e.target.value); localStorage.setItem('wg_custom_hue', e.target.value); }} className="flex-1 h-2 bg-gradient-to-r from-red-500 via-green-500 to-blue-500 rounded-lg appearance-none cursor-pointer"/>
                                    <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm" style={{backgroundColor: `hsl(${customHue}, 50%, 50%)`}}></div>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-md-sys-surface2 p-5 rounded-2xl">
                                <span className="text-xs font-bold opacity-80 block mb-3">Colorblind Mode</span>
                                <select value={colorblindMode} onChange={(e) => setColorblindMode(e.target.value as any)} className="w-full bg-md-sys-surface1 p-2 rounded-lg text-sm font-bold outline-none border border-md-sys-outline/10">
                                    <option value="none">None</option>
                                    <option value="protanopia">Protanopia</option>
                                    <option value="deuteranopia">Deuteranopia</option>
                                    <option value="tritanopia">Tritanopia</option>
                                </select>
                            </div>
                            <div className="bg-md-sys-surface2 p-5 rounded-2xl flex flex-col justify-between">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-bold opacity-80">Reduced Motion</span>
                                    <button onClick={() => setDisableAnimations(!disableAnimations)} className={`w-12 h-6 rounded-full transition-colors ${disableAnimations ? 'bg-md-sys-primary' : 'bg-md-sys-surface3'} relative`}>
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${disableAnimations ? 'left-7' : 'left-1'}`}></div>
                                    </button>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold opacity-80">Session Timer</span>
                                    <button onClick={() => setShowSessionTimer(!showSessionTimer)} className={`w-12 h-6 rounded-full transition-colors ${showSessionTimer ? 'bg-md-sys-primary' : 'bg-md-sys-surface3'} relative`}>
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${showSessionTimer ? 'left-7' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <h3 className="text-sm font-black uppercase opacity-60 flex items-center gap-2 border-b border-md-sys-outline/10 pb-2"><FileJson size={16}/> Data Management</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => exportToCSV(matches)} className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 font-bold text-xs"><Download size={24}/> Export CSV</button>
                            <button onClick={() => exportToJSON({matches, players, pilotRegistry})} className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 font-bold text-xs"><FileJson size={24}/> Backup JSON</button>
                            <label className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 font-bold text-xs cursor-pointer"><Upload size={24}/> Restore JSON <input type="file" hidden onChange={handleImport}/></label>
                            <button onClick={() => setShowResetConfirm(true)} className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-error-container text-md-sys-on-error-container rounded-2xl hover:brightness-110 font-bold text-xs"><RefreshCw size={24}/> Reset Data</button>
                        </div>
                    </div>
                    <div className="text-center opacity-40 text-[10px] font-mono">Wildgate Stat Tracker {APP_VERSION} • {matches.length} Missions Logged</div>
                </div>
            </div>
        )}

        {showResetConfirm && (
             <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={() => setShowResetConfirm(false)}>
                <div className="bg-md-sys-surface1 p-10 rounded-[40px] w-full max-w-md shadow-2xl border-2 border-md-sys-error" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-4 text-md-sys-error mb-6"><AlertOctagon size={48} /><h2 className="text-3xl font-black uppercase tracking-tighter">Reset Data?</h2></div>
                    <p className="text-base opacity-80 mb-10 font-bold leading-relaxed">This action will delete ALL match history and pilot records. This cannot be undone.</p>
                    <div className="flex flex-col gap-4">
                        <button onClick={() => handleReset(true)} className="w-full py-5 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg">Backup & Reset</button>
                        <button onClick={() => handleReset(false)} className="w-full py-5 bg-md-sys-error-container text-md-sys-on-error-container rounded-2xl font-black uppercase tracking-widest hover:brightness-110">Just Reset</button>
                        <button onClick={() => setShowResetConfirm(false)} className="w-full py-5 bg-md-sys-surface3 rounded-2xl font-black uppercase tracking-widest hover:bg-md-sys-surface-variant">Cancel</button>
                    </div>
                </div>
             </div>
        )}

        {devMode && (
            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[200]">
                <div className="bg-md-sys-surface1 p-2 rounded-xl shadow-2xl border border-md-sys-outline/10 flex flex-col gap-2">
                    <div className="text-[10px] font-black uppercase text-center opacity-40 p-1">Dev Tools</div>
                    <button onClick={handleDevMock} className="px-4 py-2 bg-md-sys-surface2 hover:bg-md-sys-surface3 rounded-lg text-xs font-bold text-md-sys-primary">
                        Mock Data (+10-25)
                    </button>
                    <button onClick={() => setShowResetConfirm(true)} className="px-4 py-2 bg-md-sys-error-container hover:brightness-110 rounded-lg text-xs font-bold text-md-sys-on-error-container">
                        Reset All
                    </button>
                    <button onClick={() => setDevMode(false)} className="px-4 py-2 bg-md-sys-surface3 hover:bg-md-sys-outline/20 rounded-lg text-xs font-bold">
                        Exit Dev Mode
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;
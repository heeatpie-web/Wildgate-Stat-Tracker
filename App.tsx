import React, { useState, useEffect, useRef } from 'react';
import { Match, GameMode, APP_VERSION, Language, CHARACTERS, SHIPS, UI_REACH_MODIFIERS, KillMap, ColorblindMode, getShipCapacity, DrillDownTarget } from './types';
import { DashboardLayout } from './components/DashboardLayout';
import { SquadronPanel } from './components/recording/SquadronPanel';
import { RosterPanel } from './components/recording/RosterPanel';
import { MissionPanel } from './components/recording/MissionPanel';
import { ActionPanel } from './components/recording/ActionPanel';
import AnalyticsPanel from './components/AnalyticsPanel';
import HistoryTable from './components/HistoryTable';
import Tutorial from './components/Tutorial';
import { SessionTimer } from './components/SessionTimer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { exportToJSON, exportToCSV, parseShareCode } from './utils/export';
import { TRANSLATIONS } from './utils/translations';
import { CHANGELOG } from './utils/changelog';
import { StorageService } from './utils/storage';
import { Toast } from './components/Toast';
import { useTiltMonitor } from './hooks/useTiltMonitor';
import { useDiscordRPC } from './hooks/useDiscordRPC';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Upload, Download, RefreshCw, Settings, Moon, Sun, Monitor, PlusCircle, HelpCircle, CloudMoon, User, X, Palette, Eye, Globe, ZapOff, Bug, FileJson, AlertOctagon, Layout, HeartCrack, MinusCircle, Grip, RotateCcw, Timer, Share2, Rocket, PartyPopper, Save, Edit } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import confetti from 'canvas-confetti';
import { useAppStore } from './store/useAppStore';
// @ts-ignore
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';

const ResponsiveGridLayout = WidthProvider(Responsive);

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

const App: React.FC = () => {
  const {
    matches, setMatches, addMatch, updateMatch, deleteMatch,
    players, setPlayers,
    pilotRegistry, setPilotRegistry,
    favorites, setFavorites,
    pilotNotes, setPilotNotes,
    lastActivity, setLastActivity,
    renamePilot, updatePilotNote, toggleFavorite,
    addPlayer, deletePlayer, addToRegistry, removeFromRegistry,

    activeMode, setActiveMode,
    activeUser, setActiveUser,
    appearanceMode, setAppearanceMode,
    colorTheme, setColorTheme,
    customHue, setCustomHue,
    devMode, setDevMode,
    colorblindMode, setColorblindMode,
    disableAnimations, setDisableAnimations,
    language, setLanguage,
    showSessionTimer, setShowSessionTimer,
    customBgUrl, setCustomBgUrl,

    isLoading, setIsLoading,
    showWelcome, setShowWelcome,
    showTutorial, setShowTutorial,
    showSettings, setShowSettings,
    showChangelog, setShowChangelog,
    showResetConfirm, setShowResetConfirm,
    isRearranging, setIsRearranging,
    toast, setToast,
    drillDownTarget, setDrillDownTarget,
    showWelcomeBack, setShowWelcomeBack,
    isLayoutReady, setIsLayoutReady,
    updateStatus, setUpdateStatus,
    inputMode, setInputMode,
    showArtifactSelect, setShowArtifactSelect,
    layouts, setLayouts,

    selectedTeammates, setSelectedTeammates, toggleTeammate,
    selectedOpponents, setSelectedOpponents, toggleOpponent,
    activeHero, setActiveHero,
    activeShip, setActiveShip,
    activeWeapons, setActiveWeapons,
    matchStartTime, setMatchStartTime,
    isMatchInProgress, setIsMatchInProgress,
    selectedReachModifiers, setSelectedReachModifiers, toggleReachModifier,
    kills, setKills,
    poiEasy, setPoiEasy,
    poiMedium, setPoiMedium,
    poiEpic, setPoiEpic,
    timeMin, setTimeMin,
    timeSec, setTimeSec,
    damageTaken, setDamageTaken,
    currentNote, setCurrentNote,
    pendingMatchData, setPendingMatchData,
    pendingSubType, setPendingSubType,
    pendingPlacement, setPendingPlacement,
    pendingArtifactType, setPendingArtifactType,
    showWizard, setShowWizard,
    sessionStartTime
  } = useAppStore();

  const t = TRANSLATIONS[language];
  const devClicks = useRef(0);
  const isResetting = useRef(false);

  // Session Timer
  // const [lastActivity, setLastActivity] = useState(Date.now()); // Already in store
  const sessionMatches = matches.filter(m => m.timestamp >= sessionStartTime);
  const sessionWins = sessionMatches.filter(m => m.result === 'Win').length;

  // Keyboard Shortcuts

  // Mount Effects
  useEffect(() => {
      // Welcome Back Splash
      if (activeUser && !showWelcome) {
          setShowWelcomeBack(true);
          setTimeout(() => setShowWelcomeBack(false), 2000);
      }
      
      // Changelog Check
      const lastSeen = localStorage.getItem('wg_last_seen_version');
      if (lastSeen !== APP_VERSION && !showWelcome) {
          setShowChangelog(true);
      }

      // Reveal layout after short delay to prevent jank
      setTimeout(() => setIsLayoutReady(true), 150);
  }, []);

  // Discord Rich Presence Sync
  useDiscordRPC(sessionWins, sessionMatches.length, activeMode, sessionStartTime);

  // Update Listeners
  useEffect(() => {
    if (!ipcRenderer) return;
    const onAvailable = () => setUpdateStatus('available');
    const onDownloaded = () => setUpdateStatus('downloaded');
    const onNotAvailable = () => { setUpdateStatus('not-available'); setTimeout(() => setUpdateStatus('idle'), 3000); };
    const onError = (_: any, msg: string) => { 
        console.error("AutoUpdater Error:", msg);
        setUpdateStatus('not-available'); 
        alert("Update Check Failed: " + msg);
        setTimeout(() => setUpdateStatus('idle'), 3000); 
    };
    
    ipcRenderer.on('update_available', onAvailable);
    ipcRenderer.on('update_downloaded', onDownloaded);
    ipcRenderer.on('update_not_available', onNotAvailable);
    ipcRenderer.on('update_error', onError);
    return () => {
        ipcRenderer.removeListener('update_available', onAvailable);
        ipcRenderer.removeListener('update_downloaded', onDownloaded);
        ipcRenderer.removeListener('update_not_available', onNotAvailable);
        ipcRenderer.removeListener('update_error', onError);
    };
  }, []);

  // Keyboard Shortcuts
  useKeyboardShortcuts({
      onWin: () => initiateSubmission('Win'),
      onLoss: () => initiateSubmission('Loss')
  }, showWizard);

  // Recording Logic
  const maxTeammates = getShipCapacity(activeShip) - 1;

  useEffect(() => {
    // Sync teammates with ship capacity if changed
    setSelectedTeammates(selectedTeammates.filter((_, i) => i < maxTeammates));
  }, [activeShip, maxTeammates]);

  const initiateSubmission = (result: 'Win' | 'Loss' | 'Draw') => {
      if (!activeUser) { alert("Select a prospector!"); return; }
      
      let finalTimeMin = timeMin;
      let finalTimeSec = timeSec;

      // Auto-calculate time if match was in progress and manual time is empty
      if (isMatchInProgress && matchStartTime && !timeMin && !timeSec) {
          const durationMs = Date.now() - matchStartTime;
          const totalSeconds = Math.floor(durationMs / 1000);
          finalTimeMin = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
          finalTimeSec = (totalSeconds % 60).toString().padStart(2, '0');
          
          // Reset match timer after capture
          setIsMatchInProgress(false);
          setMatchStartTime(null);
      }

      const timeStr = (finalTimeMin || finalTimeSec) ? `${finalTimeMin || '00'}:${finalTimeSec || '00'}` : "";
      const dmg = parseInt(damageTaken) || 0;
      const data = {
        activeMode, activeUser, selectedTeammates, selectedOpponents, activeHero, activeShip, weapons: activeWeapons,
        selectedReachModifiers, kills, time: timeStr, poiEasy, poiMedium, poiEpic, damageTaken: dmg, notes: currentNote
      };
      handleInitiateSubmission(data, result);
      // Reset manual fields
      setPoiEasy(0); setPoiMedium(0); setPoiEpic(0); setKills({"AI Legion": 0}); setTimeMin(""); setTimeSec(""); setSelectedReachModifiers([]); setDamageTaken(""); setCurrentNote(""); setActiveWeapons({});
  };

  const handleCheckUpdates = () => {
      if (!ipcRenderer) return;
      setUpdateStatus('checking');
      ipcRenderer.send('check-for-updates');
  };

  const handleBackupDB = async () => {
      const res = await StorageService.backup();
      if (res && res.success) {
          alert(`Backup saved to:\n${res.path}`);
      } else {
          alert("Backup failed: " + (res?.error || "Unknown error"));
      }
  };

  const handleRestartUpdate = () => {
      if (ipcRenderer) ipcRenderer.send('restart_app');
  };

  const closeChangelog = () => {
      localStorage.setItem('wg_last_seen_version', APP_VERSION);
      setShowChangelog(false);
  };

  useEffect(() => {
      if (devMode) {
          try {
              if (ipcRenderer) ipcRenderer.send('open-devtools');
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

  const handleRegisterUser = (name: string) => {
    if (!name.trim()) return;
    if (!players.includes(name)) addPlayer(name);
    setActiveUser(name); setShowWelcome(false);
  };

  const handleDeleteProfile = () => {
      if (!activeUser) return;
      if (!window.confirm(`Delete profile "${activeUser}"? Matches will be preserved.`)) return;
      const newPlayers = players.filter(p => p !== activeUser);
      deletePlayer(activeUser);
      setActiveUser(newPlayers.length > 0 ? newPlayers[0] : '');
      if(newPlayers.length === 0) setShowWelcome(true);
  };

  const handleReset = (backup: boolean) => {
      if (backup) exportToJSON({matches, players, pilotRegistry});
      setTimeout(() => { localStorage.clear(); window.location.reload(); }, 500);
  };

  const defaultLayouts = {
      lg: [
          { i: 'squadron', x: 0, y: 0, w: 6, h: 9 },
          { i: 'roster', x: 6, y: 0, w: 6, h: 9 },
          { i: 'actions', x: 0, y: 9, w: 12, h: 6 },
          { i: 'mission', x: 0, y: 15, w: 12, h: 12 },
          { i: 'analytics', x: 0, y: 27, w: 12, h: 16 },
          { i: 'history', x: 0, y: 43, w: 12, h: 23 }
      ]
  };

  const currentLayouts = (layouts && layouts.lg && layouts.lg.length > 0) ? layouts : defaultLayouts;
  
  const finalLayouts = {
      lg: (currentLayouts.lg || defaultLayouts.lg).map((l: any) => ({ ...l, static: !isRearranging })),
      md: (currentLayouts.md || currentLayouts.lg || defaultLayouts.lg).map((l: any) => ({ ...l, static: !isRearranging })),
      sm: (currentLayouts.sm || currentLayouts.lg || defaultLayouts.lg).map((l: any) => ({ ...l, static: !isRearranging })),
      xs: (currentLayouts.xs || currentLayouts.lg || defaultLayouts.lg).map((l: any) => ({ ...l, static: !isRearranging })),
      xxs: (currentLayouts.xxs || currentLayouts.lg || defaultLayouts.lg).map((l: any) => ({ ...l, static: !isRearranging }))
  };

  const handleResetLayout = () => {
      if(window.confirm("Reset dashboard layout to default?")) {
          setLayouts(defaultLayouts);
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

  const handleImportShareCode = () => {
      const code = prompt("Paste your Match Share Code here:");
      if (!code) return;
      try {
          const match = parseShareCode(code);
          if (match) {
              addMatch(match as Match);
              alert("Match imported successfully!");
          }
      } catch (e) {
          alert("Invalid or corrupt share code.");
      }
  };
  
  const handleInitiateSubmission = (data: any, result: 'Win' | 'Loss' | 'Draw') => {
      setPendingMatchData(data);
      setShowWizard(result);
  };

  const handleToggleFavorite = (name: string) => toggleFavorite(name);
  const handleUpdateNote = (name: string, note: string) => updatePilotNote(name, note);
  const handleDeletePilot = (name: string) => {
    if (!window.confirm(`Delete pilot profile "${name}"? This cannot be undone.`)) return;
    removeFromRegistry(name);
    if(favorites.includes(name)) toggleFavorite(name);
  };

  const handleRenamePilot = (oldName: string, newName: string) => {
      if (!newName.trim() || pilotRegistry.includes(newName)) return;
      renamePilot(oldName, newName);
      if (activeUser === oldName) setActiveUser(newName);
  };

  const processFinalSubmission = (subType: string) => {
      if(!pendingMatchData) return;
      let finalMods = [...(pendingMatchData.selectedReachModifiers||[])];
      if(subType === 'Artifact') finalMods.push(`Artifact: ${pendingArtifactType || 'Healing'}`);
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
          notes: pendingMatchData.notes
      };
      addMatch(newMatch);
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
                            <button onClick={() => setPendingSubType('Artifact')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Artifact' ? 'bg-md-sys-error-container text-md-sys-on-error-container' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Artifact</button>
                         </> : <>
                            <button onClick={() => setPendingSubType('Mutual Elimination')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Mutual Elimination' ? 'bg-slate-600 text-white' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Mutual Elimination</button>
                            <button onClick={() => setPendingSubType('Time Expired')} className={`flex-1 p-4 rounded-2xl font-bold ${pendingSubType === 'Time Expired' ? 'bg-slate-600 text-white' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3'}`}>Time Expired</button>
                         </>}
                     </div>

                     {pendingSubType === 'Artifact' && (
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
                                 {[...SHIPS, "AI Legion"].map(ship => (
                                     <div key={ship} className={`flex justify-between items-center p-1.5 rounded-xl ${ship === 'AI Legion' ? 'bg-purple-500/20 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 'bg-md-sys-surface1'}`}>
                                         <span className={`text-[9px] font-bold truncate max-w-[80px] ml-2 ${ship === 'AI Legion' ? 'text-purple-300' : 'opacity-70'}`}>{ship.split('(')[0]}</span>
                                         <div className="flex gap-1 items-center">
                                             <button onClick={() => setPendingMatchData((p:any) => ({...p, kills: {...p.kills, [ship]: Math.max(0, (p.kills?.[ship]||0)-1)}}))} className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${ship === 'AI Legion' ? 'bg-purple-500/30 hover:bg-purple-500/50 text-purple-200' : 'bg-md-sys-surface3'}`}>-</button>
                                             <span className={`font-black w-5 text-center text-sm ${ship === 'AI Legion' ? 'text-purple-200' : ''}`}>{pendingMatchData.kills?.[ship] || 0}</span>
                                             <button onClick={() => setPendingMatchData((p:any) => ({...p, kills: {...p.kills, [ship]: (p.kills?.[ship]||0)+1}}))} className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${ship === 'AI Legion' ? 'bg-purple-500 text-white hover:brightness-110 shadow-lg shadow-purple-500/20' : 'bg-md-sys-primary text-md-sys-onPrimary'}`}>+</button>
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
    // setPlayers([...new Set([...players, ...mockPlayers])]); // Keep profile list clean
    setPilotRegistry([...new Set([...pilotRegistry, ...mockPlayers])]);
    
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
    setMatches([...newMatches, ...matches]);
    alert(`Generated ${matchCount} matches and ${mockPlayers.length} mock players.`);
  };

  const renderDrillDown = () => {
    if (!drillDownTarget) return null;
    
    // Filter matches based on target
    const targetMatches = matches.filter(m => {
        if (m.mode !== activeMode) return false;
        
        if (drillDownTarget.type === 'Teammate') return (m.teammates || []).includes(drillDownTarget.name);
        if (drillDownTarget.type === 'Opponent') return (m.opponents || []).includes(drillDownTarget.name);
        if (drillDownTarget.type === 'Ship') return (m.ship || '').includes(drillDownTarget.name);
        if (drillDownTarget.type === 'Hero') return (m.hero || '') === drillDownTarget.name;
        if (drillDownTarget.type === 'Artifact') return m.subType === 'Artifact' && (m.reachModifiers || []).some(r => r.includes(drillDownTarget.name));
        
        return true; // For KPIs that use all matches
    }).sort((a, b) => a.timestamp - b.timestamp);

    const trendData = targetMatches.map((m, i) => ({
        idx: i + 1,
        rollingWinRate: Math.round((targetMatches.slice(0, i + 1).filter(x => x.result === 'Win').length / (i + 1)) * 100)
    }));
    
    // Calculate simple stats
    const totalWins = targetMatches.filter(m => m.result === 'Win').length;
    const wr = targetMatches.length > 0 ? Math.round((totalWins / targetMatches.length) * 100) : 0;

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6 animate-fade-in" onClick={() => setDrillDownTarget(null)}>
          <div className="bg-md-sys-surface1 w-full max-w-5xl rounded-[40px] p-10 shadow-2xl border border-md-sys-outline/20" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-10">
                  <div>
                      <div className="text-sm font-black uppercase opacity-40 tracking-[0.2em] mb-1">Deep Dive Analysis • {drillDownTarget.type}</div>
                      <h2 className="text-5xl font-black">{drillDownTarget.name}</h2>
                      <div className="flex gap-4 mt-4">
                          <div className="bg-md-sys-surface2 px-4 py-2 rounded-xl text-xs font-black uppercase"><span className="opacity-60">Matches:</span> {targetMatches.length}</div>
                          <div className="bg-md-sys-surface2 px-4 py-2 rounded-xl text-xs font-black uppercase"><span className="opacity-60">Win Rate:</span> <span className={wr >= 50 ? 'text-green-500' : 'text-red-500'}>{wr}%</span></div>
                      </div>
                  </div>
                  <button onClick={() => setDrillDownTarget(null)} className="p-4 bg-md-sys-surface2 rounded-full hover:bg-md-sys-surface3"><X size={24}/></button>
              </div>
              
              {targetMatches.length < 2 ? (
                  <div className="h-80 w-full bg-md-sys-surface2 rounded-[32px] flex items-center justify-center opacity-40 font-bold uppercase tracking-widest">Not enough data for trend analysis</div>
              ) : (
                  <div className="h-80 w-full bg-md-sys-surface2 rounded-[32px] p-6 border border-md-sys-outline/5 shadow-inner">
                      <h4 className="text-xs font-black uppercase tracking-widest mb-6 opacity-60">Rolling Win Rate Over Time</h4>
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendData}>
                              <defs><linearGradient id="colorWin" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={wr >= 50 ? "#22c55e" : "#ef4444"} stopOpacity={0.3}/><stop offset="95%" stopColor={wr >= 50 ? "#22c55e" : "#ef4444"} stopOpacity={0}/></linearGradient></defs>
                              <CartesianGrid strokeOpacity={0.05} vertical={false}/>
                              <XAxis dataKey="idx" tick={{fontSize: 12}} label={{ value: 'Matches', position: 'insideBottom', offset: -5 }}/>
                              <YAxis tick={{fontSize: 12}} label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft' }} domain={[0, 100]}/>
                              <Tooltip contentStyle={{backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '16px', border: 'none'}}/>
                              <Area type="monotone" dataKey="rollingWinRate" name="Win Rate" stroke={wr >= 50 ? "#22c55e" : "#ef4444"} strokeWidth={4} fillOpacity={1} fill="url(#colorWin)" />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
              )}
          </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-20 p-4 md:p-6 flex justify-center bg-md-sys-background text-md-sys-on-background" style={{ backgroundImage: customBgUrl ? `url(${customBgUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
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
      {showWelcomeBack && (
          <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center p-4 animate-fade-out pointer-events-none">
              <div className="bg-md-sys-surface1 px-10 py-6 rounded-[40px] shadow-2xl border border-md-sys-outline/20 text-center animate-scale-in">
                  <h2 className="text-2xl font-black uppercase tracking-widest text-md-sys-primary">{t.welcomeBack} {activeUser}!</h2>
                  <div className="text-xs font-bold opacity-60 mt-2 uppercase tracking-wide">System Online</div>
              </div>
          </div>
      )}
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
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className={`w-full max-w-[1800px] flex flex-col gap-3 transition-opacity duration-500 ${isLayoutReady ? 'opacity-100' : 'opacity-0'}`}>
        <header className="md-card flex flex-col md:flex-row justify-between items-center gap-4 bg-md-sys-surface1 p-6 rounded-[32px] shadow-lg">
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-black tracking-tighter select-none">WILDGATE STAT TRACKER</h1>
            <span onClick={() => { devClicks.current++; if(devClicks.current>=5) setDevMode(true); }} className="text-sm font-bold bg-md-sys-surface3 px-3 py-1.5 rounded-lg text-md-sys-primary select-none cursor-pointer opacity-60 hover:opacity-100" title="Version Info">{APP_VERSION}</span>
            {devMode && <span className="text-xs font-black bg-red-500 text-white px-2 py-1 rounded">DEV MODE</span>}
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-4">
             <div className="flex items-center gap-2 bg-md-sys-surface2 px-6 py-3 rounded-full border-md-sys-outline/10 shadow-inner">
                <User size={20} className="text-md-sys-primary"/>
                <select value={activeUser} onChange={(e) => setActiveUser(e.target.value)} className="bg-transparent font-bold outline-none cursor-pointer text-base" title="Select Active Prospector">{players.map(p => <option key={p} value={p}>{p}</option>)}</select>
                <button onClick={() => { const n = prompt("New profile:"); if(n) handleRegisterUser(n); }} className="p-2 hover:bg-md-sys-surface3 rounded-full" title="Create New Profile"><PlusCircle size={20} className="text-md-sys-primary hover:scale-110" /></button>
                <button onClick={() => { if(!activeUser) return; const n = prompt("Rename profile:", activeUser); if(n && n !== activeUser) handleRenamePilot(activeUser, n); }} className="p-2 hover:bg-md-sys-surface3 rounded-full transition-colors" title="Rename Profile" disabled={!activeUser}><Edit size={20} className="text-md-sys-primary hover:scale-110" /></button>
                <button onClick={handleDeleteProfile} className="p-2 hover:bg-red-500/20 hover:text-red-500 rounded-full transition-colors" title="Delete Profile" disabled={!activeUser}><MinusCircle size={20} /></button>
             </div>
             <div className="bg-md-sys-surface2 p-1 rounded-full flex gap-1 border-md-sys-outline/5 shadow-inner">
                <button onClick={() => setActiveMode('Artifact Brawl')} className={`px-4 py-2 rounded-full text-xs font-black ${activeMode === 'Artifact Brawl' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'text-md-sys-on-surface/60 hover:bg-md-sys-surface3'}`}>{t.artifactBrawl}</button>
                <button onClick={() => setActiveMode('Fleet Battle')} className={`px-4 py-2 rounded-full text-xs font-black ${activeMode === 'Fleet Battle' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'text-md-sys-on-surface/60 hover:bg-md-sys-surface3'}`}>{t.fleetBattle}</button>
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
            layouts={finalLayouts}
            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
            cols={{lg: 12, md: 10, sm: 6, xs: 4, xxs: 2}}
            rowHeight={30}
            margin={[16, 16]}
            onLayoutChange={(layout: any, layouts: any) => {
                if (isRearranging) {
                    setLayouts(layouts);
                    localStorage.setItem('wg_layouts_v11', JSON.stringify(layouts));
                }
            }}
            isDraggable={isRearranging}
            isResizable={isRearranging}
            draggableHandle=".grid-drag-handle"
        >
            <div key="squadron">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <ErrorBoundary>
                    <SquadronPanel 
                        activeShip={activeShip} 
                        setActiveShip={setActiveShip} 
                        activeHero={activeHero} 
                        setActiveHero={setActiveHero} 
                    />
                </ErrorBoundary>
            </div>
            <div key="roster">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <ErrorBoundary>
                    <RosterPanel 
                        pilotRegistry={pilotRegistry} favorites={favorites} pilotNotes={pilotNotes} 
                        selectedTeammates={selectedTeammates} toggleTeammate={toggleTeammate}
                        selectedOpponents={selectedOpponents} toggleOpponent={toggleOpponent}
                        onAddPilot={(n:string) => setPilotRegistry([...pilotRegistry, n])}
                        onToggleFavorite={handleToggleFavorite} onUpdateNote={handleUpdateNote} 
                        onDeletePilot={handleDeletePilot} onRenamePilot={handleRenamePilot}
                        onDrillDown={(name, type) => setDrillDownTarget({name, type})}
                    />
                </ErrorBoundary>
            </div>
            <div key="mission">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <ErrorBoundary>
                    <MissionPanel 
                        inputMode={inputMode} setInputMode={setInputMode} 
                        timeMin={timeMin} setTimeMin={setTimeMin} timeSec={timeSec} setTimeSec={setTimeSec} 
                        damageTaken={damageTaken} setDamageTaken={setDamageTaken} 
                        poiEasy={poiEasy} setPoiEasy={setPoiEasy} poiMedium={poiMedium} setPoiMedium={setPoiMedium} poiEpic={poiEpic} setPoiEpic={setPoiEpic}
                        selectedReachModifiers={selectedReachModifiers} toggleReachModifier={toggleReachModifier}
                        showArtifactSelect={showArtifactSelect} setShowArtifactSelect={setShowArtifactSelect}
                        currentNote={currentNote} setCurrentNote={setCurrentNote}
                        kills={kills} setKills={setKills}
                        weapons={activeWeapons} setWeapons={setActiveWeapons}
                    />
                </ErrorBoundary>
            </div>
            <div key="actions">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <ErrorBoundary>
                    <ActionPanel 
                        inputMode={inputMode} 
                        setInputMode={setInputMode} 
                        initiateSubmission={initiateSubmission}
                        showSessionTimer={showSessionTimer}
                        sessionStartTime={sessionStartTime}
                        matches={matches}
                        lastActivity={lastActivity}
                        onRefreshActivity={() => setLastActivity(Date.now())}
                        matchStartTime={matchStartTime}
                        isMatchInProgress={isMatchInProgress}
                        onStartMatch={() => { setMatchStartTime(Date.now()); setIsMatchInProgress(true); }}
                        onResetMatch={() => { setMatchStartTime(null); setIsMatchInProgress(false); }}
                    />
                </ErrorBoundary>
            </div>
            
            <div key="analytics">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <ErrorBoundary>
                    <AnalyticsPanel 
                        matches={matches} 
                        currentMode={activeMode} 
                        language={language} 
                        currentUser={activeUser}
                        onDrillDown={(name, type) => setDrillDownTarget({name, type})}
                    />
                </ErrorBoundary>
            </div>
            <div key="history" className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg overflow-hidden flex flex-col">
                {isRearranging && <div className="grid-drag-handle absolute top-2 right-2 p-2 bg-white/20 rounded-full cursor-move z-50 hover:bg-white/40"><Grip size={16}/></div>}
                <ErrorBoundary>
                    <HistoryTable 
                        matches={matches.filter(m => m.mode === activeMode)} 
                        onDelete={(id) => deleteMatch(id)} 
                        onEdit={(updatedMatch) => updateMatch(updatedMatch)} 
                        onPin={(id) => {
                            const m = matches.find(m => m.id === id);
                            if(m) updateMatch({ ...m, isPinned: !m.isPinned });
                        }} 
                        language={language} 
                        onDrillDown={(name, type) => setDrillDownTarget({name, type})}
                    />
                </ErrorBoundary>
            </div>
        </ResponsiveGridLayout>

        {showChangelog && (
            <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4 animate-fade-in" onClick={closeChangelog}>
                <div className="bg-md-sys-surface1 w-full max-w-xl rounded-[40px] p-10 shadow-2xl border border-md-sys-outline/20 animate-scale-in" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <div className="text-sm font-black uppercase opacity-40 tracking-widest mb-1">System Updated</div>
                            <h2 className="text-4xl font-black flex items-center gap-3"><PartyPopper className="text-md-sys-primary"/> Version {APP_VERSION}</h2>
                        </div>
                        <button onClick={closeChangelog} className="p-3 bg-md-sys-surface2 rounded-full hover:bg-md-sys-surface3"><X size={20}/></button>
                    </div>
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar">
                        {CHANGELOG[APP_VERSION]?.map((item, i) => (
                            <div key={i} className="flex gap-4 items-start">
                                <div className="w-2 h-2 rounded-full bg-md-sys-primary mt-2 flex-shrink-0"></div>
                                <div className="text-sm font-bold opacity-80 leading-relaxed">{item}</div>
                            </div>
                        ))}
                    </div>
                    <button onClick={closeChangelog} className="w-full mt-10 py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg">Got it!</button>
                </div>
            </div>
        )}

        {renderDrillDown()}
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
                                {[
                                    { id: 'ocean', c: '#0ea5e9' }, { id: 'emerald', c: '#10b981' }, 
                                    { id: 'crimson', c: '#ef4444' }, { id: 'amber', c: '#f59e0b' }, 
                                    { id: 'amethyst', c: '#a855f7' }, { id: 'cyan', c: '#06b6d4' }
                                ].map(th => (
                                    <button key={th.id} onClick={() => setColorTheme(th.id)} className={`h-12 rounded-xl border-2 relative overflow-hidden transition-all hover:scale-105 ${colorTheme === th.id ? 'border-white shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'}`} style={{backgroundColor: th.c}}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                                        {colorTheme === th.id && <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-white rounded-full shadow-sm"></div></div>}
                                    </button>
                                ))} 
                                <button onClick={() => setColorTheme('custom')} className={`h-12 rounded-xl border-2 uppercase text-[10px] font-black flex items-center justify-center ${colorTheme === 'custom' ? 'bg-md-sys-primary-container border-md-sys-primary text-md-sys-onPrimaryContainer' : 'bg-md-sys-surface2 border-transparent hover:bg-md-sys-surface3'}`}>Custom</button>
                            </div>
                            {colorTheme === 'custom' && (
                                <div className="bg-md-sys-surface2 p-4 rounded-2xl flex items-center gap-4">
                                    <input type="range" min="0" max="360" value={customHue} onChange={(e) => { setCustomHue(e.target.value); localStorage.setItem('wg_custom_hue', e.target.value); }} className="flex-1 h-2 bg-gradient-to-r from-red-500 via-green-500 to-blue-500 rounded-lg appearance-none cursor-pointer"/>
                                    <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm" style={{backgroundColor: `hsl(${customHue}, 50%, 50%)`}}></div>
                                </div>
                            )}
                        </div>
                        <div className="bg-md-sys-surface2 p-5 rounded-2xl">
                            <label className="text-xs font-bold uppercase opacity-80 mb-3 block">Custom Background URL</label>
                            <div className="flex gap-2">
                                <input type="text" value={customBgUrl} onChange={(e) => setCustomBgUrl(e.target.value)} placeholder="https://example.com/wallpaper.jpg" className="flex-1 bg-md-sys-surface1 rounded-xl px-4 py-2 text-sm font-bold outline-none border border-md-sys-outline/10 focus:border-md-sys-primary"/>
                                {customBgUrl && <button onClick={() => setCustomBgUrl('')} className="p-2 bg-md-sys-surface1 hover:bg-md-sys-error-container hover:text-md-sys-on-error-container rounded-xl"><X size={16}/></button>}
                            </div>
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
                            <button onClick={handleBackupDB} className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 font-bold text-xs"><Save size={24}/> Backup Database</button>
                            <button onClick={() => exportToCSV(matches)} className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 font-bold text-xs"><Download size={24}/> Export CSV</button>
                            <button onClick={() => exportToJSON({matches, players, pilotRegistry})} className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 font-bold text-xs"><FileJson size={24}/> Export JSON</button>
                            <label className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 font-bold text-xs cursor-pointer"><Upload size={24}/> Restore JSON <input type="file" hidden onChange={handleImport}/></label>
                            <button onClick={() => setShowResetConfirm(true)} className="flex flex-col items-center justify-center gap-2 p-6 bg-md-sys-error-container text-md-sys-on-error-container rounded-2xl hover:brightness-110 font-bold text-xs col-span-2"><RefreshCw size={24}/> Reset All Data</button>
                        </div>
                        <div className="bg-md-sys-surface2 p-5 rounded-2xl">
                            <label className="text-xs font-bold uppercase opacity-80 mb-3 block">Import Match Code</label>
                            <button onClick={handleImportShareCode} className="w-full py-3 bg-md-sys-primary text-md-sys-onPrimary rounded-xl font-black uppercase tracking-widest hover:brightness-110 flex items-center justify-center gap-2"><Share2 size={18}/> Import from Share Code</button>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <h3 className="text-sm font-black uppercase opacity-60 flex items-center gap-2 border-b border-md-sys-outline/10 pb-2"><Timer size={16}/> Software Update</h3>
                        <div className="bg-md-sys-surface2 p-5 rounded-2xl flex flex-col gap-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-xs font-bold uppercase opacity-80">Update Status</div>
                                    <div className="text-[10px] font-mono opacity-40">Version {APP_VERSION}</div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-xs font-black uppercase ${updateStatus === 'downloaded' ? 'text-green-500' : (updateStatus === 'available' ? 'text-amber-500' : 'opacity-40')}`}>
                                        {updateStatus === 'checking' ? 'Checking...' : 
                                         updateStatus === 'available' ? 'Downloading...' : 
                                         updateStatus === 'downloaded' ? 'Ready to Install' : 
                                         updateStatus === 'not-available' ? 'Up to Date' : 'No Check Performed'}
                                    </div>
                                </div>
                            </div>
                            {updateStatus === 'downloaded' ? (
                                <button onClick={handleRestartUpdate} className="w-full py-3 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg animate-pulse">Restart & Update</button>
                            ) : (
                                <button onClick={handleCheckUpdates} disabled={updateStatus === 'checking'} className="w-full py-3 bg-md-sys-surface3 rounded-xl font-black uppercase tracking-widest hover:bg-md-sys-primary hover:text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                                    <RefreshCw size={16} className={updateStatus === 'checking' ? 'animate-spin' : ''}/> Check for Updates
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="text-center opacity-40 text-[10px] font-mono mt-4">Wildgate Stat Tracker {APP_VERSION} • {matches.length} Missions Logged</div>
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

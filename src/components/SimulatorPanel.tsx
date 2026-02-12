import React, { useState, useEffect, useRef } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { processTelemetryEvent, TelemetryContext, TelemetryActions } from '../utils/telemetryProcessor';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';

interface SimEvent {
    ClientTimestamp: number;
    EventName: string;
    Payload: any;
}

const SimulatorPanel: React.FC = () => {
    const {
        isSimulation, setIsSimulation,
        setIsMatchInProgress, setMatchStartTime, setOverlayPhase, setKills, kills,
        setTimeMin, setTimeSec, updatePlayerIdMapping, playerIdMap, pilotRegistry,
        addTimelineEvent
    } = useGameData();

    const [events, setEvents] = useState<SimEvent[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0); // Index
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [currentSimTime, setCurrentSimTime] = useState<string>("0:00");
    const [status, setStatus] = useState("Idle");
    const [archiveFiles, setArchiveFiles] = useState<any[]>([]);
    const [selectedArchive, setSelectedArchive] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Load Archive List
    const fetchArchives = async (autoLoadLatest = false) => {
        setStatus("Fetching archives...");
        try {
            const api = getElectronAPI();
            if (!api) {
                setStatus("Error: IPC not available");
                return;
            }
            const list = await api.invoke('list-telemetry-archives');
            console.log('[Simulator] Found archives:', list?.length);
            setArchiveFiles(list || []);

            if (!list || list.length === 0) {
                setStatus("No archives found on disk");
            } else {
                setStatus(`Found ${list.length} archives`);
            }

            // Auto-load latest if requested and we have archives
            if (autoLoadLatest && list && list.length > 0 && events.length === 0) {
                handleLoadArchive(list[0].filename);
            }
        } catch (e: any) {
            console.error("Failed to list archives", e);
            setStatus(`List Error: ${e.message}`);
        }
    };

    useEffect(() => {
        if (isSimulation) fetchArchives(true); // Auto-load latest when entering sim mode
    }, [isSimulation]);

    const handleLoadArchive = async (filename: string) => {
        if (!filename) return;
        setLoading(true);
        setStatus(`Loading ${filename}...`);
        try {
            const api = getElectronAPI();
            if (!api) throw new Error("IPC not available");

            const data = await api.invoke('load-telemetry-archive-file', filename);
            const rawEvents = Array.isArray(data) ? data : (data.telemetry || []);
            const sorted = rawEvents.sort((a: any, b: any) => (a.ClientTimestamp || 0) - (b.ClientTimestamp || 0));
            setEvents(sorted);
            setStatus(`Loaded ${sorted.length} events from ${filename}`);
            setProgress(0);
        } catch (e: any) {
            setStatus(`Load Error: ${e.message}`);
        }
        setLoading(false);
    };

    const loadLatestArchive = () => {
        if (archiveFiles.length > 0) {
            handleLoadArchive(archiveFiles[0].filename);
        } else {
            setStatus("No archives found");
        }
    };

    // Load File
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const content = evt.target?.result as string;
                const parsed = JSON.parse(content);
                // Handle different array formats (direct array or wrapper)
                const rawEvents = Array.isArray(parsed) ? parsed : (parsed.telemetry || []);

                // Sort by timestamp
                const sorted = rawEvents.sort((a: any, b: any) => (a.ClientTimestamp || 0) - (b.ClientTimestamp || 0));

                setEvents(sorted);
                setStatus(`Loaded ${sorted.length} events.`);
                setProgress(0);
            } catch (err) {
                setStatus("Error parsing JSON");
            }
        };
        reader.readAsText(file);
    };

    // Toggle Simulation Mode
    const toggleSimMode = () => {
        const newState = !isSimulation;
        setIsSimulation(newState);
        if (newState) {
            setStatus("Simulation Active - Live updates blocked");
        } else {
            setStatus("Simulation Disabled");
            setIsPlaying(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    // Playback Loop
    useEffect(() => {
        if (isPlaying && isSimulation && events.length > 0) {
            timerRef.current = setInterval(() => {
                setProgress(prev => {
                    const next = prev + 1;
                    if (next >= events.length) {
                        setIsPlaying(false);
                        setStatus("Simulation Complete");
                        return prev;
                    }
                    return next;
                });
            }, 100 / playbackSpeed); // Simple tick based, not real-time accurate yet
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isPlaying, isSimulation, events, playbackSpeed]);

    // Process Event on Tick
    useEffect(() => {
        if (progress > 0 && progress < events.length && isSimulation) {
            const event = events[progress];

            // Build Context & Actions (Same as Live Monitor)
            const actions: TelemetryActions = {
                setTimeMin, setTimeSec,
                setIsMatchInProgress,
                setMatchStartTime,
                setOverlayPhase: (p: any) => setOverlayPhase(p), // Type cast if needed
                setToast: (t) => Logger.info('Sim', t.message), // Don't spam real toasts
                updatePlayerIdMapping,
                setShowWizard: () => {}, // No-op for simulation
            };

            const context: TelemetryContext = {
                matchStartTime: events[0].ClientTimestamp * 1000,
                isMatchInProgress: true, // Force true for sim usually
                playerIdMap,
                pilotRegistry
            };

            // Update Time Display
            const startTime = events[0].ClientTimestamp;
            const curTime = event.ClientTimestamp;
            const diff = curTime - startTime;
            const m = Math.floor(diff / 60);
            const s = Math.floor(diff % 60);
            setCurrentSimTime(`${m}:${s.toString().padStart(2, '0')}`);

            processTelemetryEvent(event, actions, context);
        }
    }, [progress]);

    if (!isSimulation && events.length === 0) {
        return (
            <div className="p-4 md3-card rounded-xl border border-md-sys-outline/10">
                <h3 className="font-black text-md-sys-primary">Match Simulator</h3>
                <div className="mt-4">
                    <button onClick={toggleSimMode} className="px-4 py-2 bg-md-sys-primary text-md-sys-on-primary rounded-lg font-bold">
                        Enter Simulation Mode
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-4 md3-card rounded-xl border-2 border-md-sys-error">
            <div className="flex justify-between items-center">
                <h3 className="font-black text-md-sys-error uppercase">Simulation Mode Active</h3>
                <button onClick={toggleSimMode} className="md3-btn-tonal text-label-sm font-bold hover:bg-md-sys-error hover:text-white">
                    Exit
                </button>
            </div>

            <div className="flex flex-col gap-3 md3-card p-3 rounded-xl border border-md-sys-outline/10">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1 flex-1">
                        <span className="text-label-sm font-black uppercase opacity-40">Archive Selection</span>
                        <div className="flex gap-2">
                            <select
                                value={selectedArchive}
                                onChange={(e) => setSelectedArchive(e.target.value)}
                                className="md3-textfield md3-textfield--outlined flex-1 text-label-sm font-bold"
                            >
                                <option value="">Select an archive...</option>
                                {archiveFiles.map(f => (
                                    <option key={f.filename} value={f.filename}>
                                        {new Date(f.date).toLocaleString()} ({Math.round(f.size / 1024)} KB)
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => handleLoadArchive(selectedArchive)}
                                disabled={!selectedArchive || loading}
                                className="md3-btn-filled text-label-sm font-black uppercase tracking-wider disabled:opacity-30 font-sans"
                            >
                                {loading ? '...' : 'Load'}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-label-sm font-black uppercase opacity-40">Quick Action</span>
                        <button
                            onClick={loadLatestArchive}
                            disabled={loading || archiveFiles.length === 0}
                            className="md3-btn-tonal text-label-sm font-black uppercase tracking-wider disabled:opacity-30 font-sans"
                        >
                            Load Latest
                        </button>
                    </div>
                </div>

                <div className="h-[1px] bg-md-sys-outline/10 w-full" />

                <div className="flex items-center gap-3">
                    <span className="text-label-sm font-black uppercase opacity-40 whitespace-nowrap">Manual JSON</span>
                    <input type="file" accept=".json" onChange={handleFileUpload} className="text-label-sm file:md3-btn-tonal file:border-none file:px-2 file:py-1 file:rounded file:text-label-sm file:font-bold file:mr-2" />
                    <div className="text-label-sm font-mono opacity-70 ml-auto">{status}</div>
                </div>
            </div>

            {events.length > 0 && (
                <>
                    <div className="flex gap-2 justify-center items-center">
                        <button onClick={() => setIsPlaying(!isPlaying)} className="md3-btn-filled p-3 rounded-full hover:scale-105 active:scale-95 transition-transform">
                            {isPlaying ? (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                            ) : (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            )}
                        </button>

                        <div className="flex flex-col items-center min-w-[100px]">
                            <span className="text-2xl font-black font-mono">{currentSimTime}</span>
                            <span className="text-label-sm uppercase tracking-wider opacity-60">Match Time</span>
                        </div>

                        <div className="flex gap-1">
                            {[1, 5, 10, 50].map(s => (
                                <button key={s} onClick={() => setPlaybackSpeed(s)} className={`md3-chip text-label-sm ${playbackSpeed === s ? 'bg-md-sys-primary text-md-sys-onPrimary' : ''}`}>
                                    {s}x
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w-full h-2 md3-surface-high rounded-full overflow-hidden">
                        <div
                            className="h-full bg-md-sys-primary transition-all duration-75 ease-linear"
                            style={{ width: `${(progress / events.length) * 100}%` }}
                        />
                    </div>

                    <div className="bg-black/20 p-2 rounded font-mono text-label-sm h-24 overflow-y-auto">
                        <div className="opacity-50 mb-1">Current Event: {progress}/{events.length}</div>
                        {events[progress] ? (
                            <div className="text-md-sys-primary">{JSON.stringify(events[progress], null, 2)}</div>
                        ) : (
                            <div className="opacity-30">Waiting...</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default SimulatorPanel;


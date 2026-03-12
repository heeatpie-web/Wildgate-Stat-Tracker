import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { processTelemetryEvent, TelemetryContext, TelemetryActions } from '../utils/telemetryProcessor';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';
import {
    getTelemetryEventTimestamp,
    normalizeTelemetryArchivePayload,
    type TelemetryArchiveEvent,
} from '../utils/telemetryArchive';

type SimEvent = TelemetryArchiveEvent;

interface TelemetryArchiveEntry {
    archiveId: string;
    filename: string;
    date: number;
    size: number;
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Unknown error';

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
    const [archiveFiles, setArchiveFiles] = useState<TelemetryArchiveEntry[]>([]);
    const [selectedArchive, setSelectedArchive] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const eventsRef = useRef<SimEvent[]>(events);
    const isSimulationRef = useRef(isSimulation);
    const playerIdMapRef = useRef(playerIdMap);
    const pilotRegistryRef = useRef(pilotRegistry);

    useEffect(() => { eventsRef.current = events; }, [events]);
    useEffect(() => { isSimulationRef.current = isSimulation; }, [isSimulation]);
    useEffect(() => { playerIdMapRef.current = playerIdMap; }, [playerIdMap]);
    useEffect(() => { pilotRegistryRef.current = pilotRegistry; }, [pilotRegistry]);

    const handleLoadArchive = useCallback(async (archiveId: string) => {
        if (!archiveId) return;
        setLoading(true);
        const selected = archiveFiles.find(a => a.archiveId === archiveId);
        setStatus(`Loading ${selected?.filename || archiveId}...`);
        try {
            const api = getElectronAPI();
            if (!api) throw new Error("IPC not available");

            const raw = await api.invoke('load-telemetry-archive-file', { archiveId });
            if (raw?.success === false) {
                throw new Error(raw.message || 'Archive load failed');
            }
            const payload = raw?.success ? raw.data : raw;
            const rawEvents = normalizeTelemetryArchivePayload(payload);
            const sorted = [...rawEvents].sort(
                (a, b) => getTelemetryEventTimestamp(a) - getTelemetryEventTimestamp(b)
            );
            setEvents(sorted);
            setStatus(`Loaded ${sorted.length} events from ${selected?.filename || archiveId}`);
            setProgress(0);
        } catch (error) {
            setStatus(`Load Error: ${errorMessage(error)}`);
        }
        setLoading(false);
    }, [archiveFiles]);

    // Load Archive List
    const fetchArchives = useCallback(async (autoLoadLatest = false) => {
        setStatus("Fetching archives...");
        try {
            const api = getElectronAPI();
            if (!api) {
                setStatus("Error: IPC not available");
                return;
            }
            const raw = await api.invoke('list-telemetry-archives');
            if (raw?.success === false) {
                throw new Error(raw.message || 'Failed to list archives');
            }
            const list = raw?.success ? (raw.data?.archives || []) : (Array.isArray(raw) ? raw : []);
            console.log('[Simulator] Found archives:', list?.length);
            setArchiveFiles(list || []);

            if (!list || list.length === 0) {
                setStatus("No archives found on disk");
            } else {
                setStatus(`Found ${list.length} archives`);
            }

            // Auto-load latest if requested and we have archives
            if (autoLoadLatest && list && list.length > 0 && eventsRef.current.length === 0) {
                setSelectedArchive(list[0].archiveId);
                void handleLoadArchive(list[0].archiveId);
            }
        } catch (error) {
            console.error("Failed to list archives", error);
            setStatus(`List Error: ${errorMessage(error)}`);
        }
    }, [handleLoadArchive]);

    useEffect(() => {
        if (isSimulation) void fetchArchives(true); // Auto-load latest when entering sim mode
    }, [fetchArchives, isSimulation]);

    const loadLatestArchive = () => {
        if (archiveFiles.length > 0) {
            setSelectedArchive(archiveFiles[0].archiveId);
            handleLoadArchive(archiveFiles[0].archiveId);
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
                const rawEvents = normalizeTelemetryArchivePayload(parsed);

                // Sort by timestamp
                const sorted = [...rawEvents].sort(
                    (a, b) => getTelemetryEventTimestamp(a) - getTelemetryEventTimestamp(b)
                );

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
        const liveEvents = eventsRef.current;
        if (progress > 0 && progress < liveEvents.length && isSimulationRef.current) {
            const event = liveEvents[progress];

            // Build Context & Actions (Same as Live Monitor)
            const actions: TelemetryActions = {
                setTimeMin, setTimeSec,
                setIsMatchInProgress,
                setMatchStartTime,
                setOverlayPhase,
                setToast: (t) => Logger.info('Sim', t.message), // Don't spam real toasts
                updatePlayerIdMapping,
                setShowWizard: () => {}, // No-op for simulation
            };

            const startSeconds = liveEvents[0] ? getTelemetryEventTimestamp(liveEvents[0]) : 0;
            const currentSeconds = getTelemetryEventTimestamp(event);

            const context: TelemetryContext = {
                matchStartTime: startSeconds * 1000,
                isMatchInProgress: true, // Force true for sim usually
                playerIdMap: playerIdMapRef.current,
                pilotRegistry: pilotRegistryRef.current
            };

            // Update Time Display
            const diff = Math.max(0, currentSeconds - startSeconds);
            const m = Math.floor(diff / 60);
            const s = Math.floor(diff % 60);
            setCurrentSimTime(`${m}:${s.toString().padStart(2, '0')}`);

            processTelemetryEvent(event, actions, context);
        }
    }, [progress, setIsMatchInProgress, setMatchStartTime, setOverlayPhase, setTimeMin, setTimeSec, updatePlayerIdMapping]);

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
                <button onClick={toggleSimMode} className="md3-btn-tonal text-label-sm font-bold hover:bg-md-sys-error hover:text-on-scrim">
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
                                    <option key={f.archiveId} value={f.archiveId}>
                                        {new Date(f.date).toLocaleString()} ({Math.round(f.size / 1024)} KB)
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => handleLoadArchive(selectedArchive)}
                                disabled={!selectedArchive || loading}
                                className="md3-btn-filled text-label-sm font-black uppercase tracking-wider disabled:opacity-disabled font-sans"
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
                            className="md3-btn-tonal text-label-sm font-black uppercase tracking-wider disabled:opacity-disabled font-sans"
                        >
                            Load Latest
                        </button>
                    </div>
                </div>

                <div className="h-1px bg-md-sys-outline/10 w-full" />

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

                        <div className="flex flex-col items-center min-w-100px">
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

                    <div className="bg-scrim-20 p-2 rounded font-mono text-label-sm h-24 overflow-y-auto">
                        <div className="opacity-40 mb-1">Current Event: {progress}/{events.length}</div>
                        {events[progress] ? (
                            <div className="text-md-sys-primary">{JSON.stringify(events[progress], null, 2)}</div>
                        ) : (
                            <div className="opacity-40">Waiting...</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default SimulatorPanel;


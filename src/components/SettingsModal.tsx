import React from 'react';
import { Palette, FileJson, Save, Download, RefreshCw, X } from 'lucide-react';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { APP_VERSION } from '../types';
import { exportToCSV, exportToJSON } from '../utils/export';
import { StorageService } from '../utils/storage';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

export const SettingsModal: React.FC = () => {
    const {
        appearanceMode, setAppearanceMode,
        colorTheme, setColorTheme,
        customHue, setCustomHue,
        colorblindMode, setColorblindMode,
        disableAnimations, setDisableAnimations,
        soundEnabled, setSoundEnabled,
        showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl,
        overlayStyle, setOverlayStyle,
        language, // unused in modal for now
    } = useUserPreferences();

    const {
        showSettings, setShowSettings,
        isOverlayMode,
        updateStatus, setUpdateStatus,
        setShowResetConfirm,
        enableAutoLogRecording, setEnableAutoLogRecording,
        setShowIdMapper,
        devMode, setDevMode
    } = useUIState();

    const { matches, players, pilotRegistry } = useGameData();

    if (!showSettings) return null;

    const handleBackupDB = async () => {
        const res = await StorageService.backup();
        if (res && res.success) {
            alert(`Backup saved to:\n${res.path}`);
        } else {
            alert("Backup failed: " + (res?.error || "Unknown error"));
        }
    };

    const handleCheckUpdates = () => {
        if (!ipcRenderer) return;
        setUpdateStatus('checking');
        ipcRenderer.send('check-for-updates');
    };

    const handleRestartUpdate = () => {
        if (ipcRenderer) ipcRenderer.send('restart_app');
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
            <div
                className={`bg-md-sys-surface1 rounded-3xl shadow-2xl border border-md-sys-outline/10 overflow-hidden ${isOverlayMode ? 'max-w-[400px]' : 'max-w-2xl'} w-full max-h-[85vh] flex flex-col`}
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex justify-between items-center p-6 border-b border-md-sys-outline/10">
                    <h2 className="text-xl font-bold">Settings</h2>
                    <button
                        onClick={() => setShowSettings(false)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-md-sys-surface2 rounded-xl transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                    {/* Appearance Section */}
                    <section>
                        <h3 className="text-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4">
                            <Palette size={16} /> Appearance
                        </h3>

                        {/* Theme Accent */}
                        <div className="bg-md-sys-surface2 p-4 rounded-2xl mb-4">
                            <label className="text-xs font-semibold opacity-70 block mb-3">Theme Accent</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { id: 'ocean', c: '#0ea5e9' }, { id: 'emerald', c: '#10b981' },
                                    { id: 'crimson', c: '#ef4444' }, { id: 'amber', c: '#f59e0b' },
                                    { id: 'amethyst', c: '#a855f7' }, { id: 'cyan', c: '#06b6d4' }
                                ].map(th => (
                                    <button
                                        key={th.id}
                                        onClick={() => setColorTheme(th.id)}
                                        className={`h-10 rounded-xl transition-all hover:scale-105 ${colorTheme === th.id ? 'ring-2 ring-white ring-offset-2 ring-offset-md-sys-surface2' : 'opacity-70 hover:opacity-100'}`}
                                        style={{ backgroundColor: th.c }}
                                    />
                                ))}
                                <button
                                    onClick={() => setColorTheme('custom')}
                                    className={`h-10 rounded-xl text-xs font-bold transition-all ${colorTheme === 'custom' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface3 hover:bg-md-sys-primary/20'}`}
                                >
                                    Custom
                                </button>
                            </div>
                            {colorTheme === 'custom' && (
                                <div className="mt-4 flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max="360"
                                        value={customHue}
                                        onChange={(e) => { setCustomHue(e.target.value); localStorage.setItem('wg_custom_hue', e.target.value); }}
                                        className="flex-1 h-2 bg-gradient-to-r from-red-500 via-green-500 to-blue-500 rounded-full appearance-none cursor-pointer"
                                    />
                                    <div
                                        className="w-8 h-8 rounded-full border-2 border-white/50 shadow-lg"
                                        style={{ backgroundColor: `hsl(${customHue}, 50%, 50%)` }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Background URL */}
                        <div className="bg-md-sys-surface2 p-4 rounded-2xl mb-4">
                            <label className="text-xs font-semibold opacity-70 block mb-2">Background URL</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customBgUrl}
                                    onChange={(e) => setCustomBgUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1 bg-md-sys-surface1 rounded-xl px-4 py-2.5 text-sm outline-none border border-md-sys-outline/10 focus:border-md-sys-primary transition-colors"
                                />
                                {customBgUrl && (
                                    <button
                                        onClick={() => setCustomBgUrl('')}
                                        className="w-10 h-10 flex items-center justify-center bg-md-sys-surface1 hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Toggles Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-md-sys-surface2 p-4 rounded-2xl">
                                <label className="text-xs font-semibold opacity-70 block mb-2">Colorblind Mode</label>
                                <select
                                    value={colorblindMode}
                                    onChange={(e) => setColorblindMode(e.target.value as any)}
                                    className="w-full bg-md-sys-surface1 p-2.5 rounded-xl text-sm font-medium outline-none border border-md-sys-outline/10 focus:border-md-sys-primary"
                                >
                                    <option value="none">None</option>
                                    <option value="protanopia">Protanopia</option>
                                    <option value="deuteranopia">Deuteranopia</option>
                                    <option value="tritanopia">Tritanopia</option>
                                </select>
                            </div>

                            <div className="bg-md-sys-surface2 p-4 rounded-2xl space-y-3">
                                {/* Toggle Switch Component Inline */}
                                {[
                                    { label: 'Reduced Motion', value: disableAnimations, setter: setDisableAnimations, color: 'bg-md-sys-primary' },
                                    { label: 'Session Timer', value: showSessionTimer, setter: setShowSessionTimer, color: 'bg-md-sys-primary' },
                                    { label: 'Sound Effects', value: soundEnabled, setter: setSoundEnabled, color: 'bg-green-600' },
                                ].map((toggle, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <span className="text-xs font-medium opacity-80">{toggle.label}</span>
                                        <button
                                            onClick={() => toggle.setter(!toggle.value)}
                                            className={`w-11 h-6 rounded-full transition-colors ${toggle.value ? toggle.color : 'bg-md-sys-surface3'} relative`}
                                        >
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${toggle.value ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="text-xs font-medium opacity-80 block">Auto Log Rec.</span>
                                        <span className="text-[10px] opacity-40 uppercase font-bold">Experimental</span>
                                    </div>
                                    <button
                                        onClick={() => setEnableAutoLogRecording(!enableAutoLogRecording)}
                                        className={`w-11 h-6 rounded-full transition-colors ${enableAutoLogRecording ? 'bg-purple-600' : 'bg-md-sys-surface3'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enableAutoLogRecording ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-md-sys-outline/10">
                                    <div>
                                        <span className="text-xs font-medium opacity-80 block">Developer Mode</span>
                                        <span className="text-[10px] opacity-40 uppercase font-bold text-red-400">Advanced</span>
                                    </div>
                                    <button
                                        onClick={() => setDevMode(!devMode)}
                                        className={`w-11 h-6 rounded-full transition-colors ${devMode ? 'bg-red-500' : 'bg-md-sys-surface3'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${devMode ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Overlay Style Section */}
                    <section className="bg-md-sys-surface2 p-4 rounded-2xl">
                        <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                            Overlay Style
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setOverlayStyle('compact')}
                                className={`p-4 rounded-xl text-center transition-all ${overlayStyle === 'compact' ? 'bg-md-sys-primary text-md-sys-onPrimary ring-2 ring-md-sys-primary/50' : 'bg-md-sys-surface1 hover:bg-md-sys-surface3'}`}
                            >
                                <div className="text-sm font-bold">Compact</div>
                                <div className="text-xs opacity-60">Small opaque popup</div>
                            </button>
                            <button
                                onClick={() => setOverlayStyle('transparent')}
                                className={`p-4 rounded-xl text-center transition-all ${overlayStyle === 'transparent' ? 'bg-md-sys-primary text-md-sys-onPrimary ring-2 ring-md-sys-primary/50' : 'bg-md-sys-surface1 hover:bg-md-sys-surface3'}`}
                            >
                                <div className="text-sm font-bold">Transparent</div>
                                <div className="text-xs opacity-60">Float over game</div>
                            </button>
                        </div>
                    </section>

                    {/* Data & Updates Section - Full Mode Only */}
                    {!isOverlayMode && (
                        <section>
                            <h3 className="text-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4">
                                <FileJson size={16} /> Data & Updates
                            </h3>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <button
                                    onClick={handleBackupDB}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 transition-colors"
                                >
                                    <Save size={20} />
                                    <span className="text-xs font-bold">Backup</span>
                                </button>
                                <button
                                    onClick={() => exportToCSV(matches)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 transition-colors"
                                >
                                    <Download size={20} />
                                    <span className="text-xs font-bold">Export CSV</span>
                                </button>
                                <button
                                    onClick={() => exportToJSON({ matches, players, pilotRegistry })}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-md-sys-surface2 rounded-2xl hover:bg-md-sys-surface3 transition-colors"
                                >
                                    <FileJson size={20} />
                                    <span className="text-xs font-bold">Export JSON</span>
                                </button>
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl transition-colors"
                                >
                                    <RefreshCw size={20} />
                                    <span className="text-xs font-bold">Reset Data</span>
                                </button>
                                <button
                                    onClick={() => setShowIdMapper(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 rounded-2xl transition-colors col-span-2"
                                >
                                    <FileJson size={20} />
                                    <span className="text-xs font-bold">Manage ID Mappings</span>
                                </button>
                            </div>

                            {/* Update Section */}
                            <div className="bg-md-sys-surface2 p-4 rounded-2xl flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-bold">Update</div>
                                    <div className="text-xs font-mono opacity-50">v{APP_VERSION}</div>
                                </div>
                                {updateStatus === 'downloaded' ? (
                                    <button
                                        onClick={handleRestartUpdate}
                                        className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all animate-pulse"
                                    >
                                        Restart to Update
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCheckUpdates}
                                        disabled={updateStatus === 'checking'}
                                        className="px-5 py-2.5 bg-md-sys-surface3 rounded-xl text-sm font-bold hover:bg-md-sys-primary hover:text-md-sys-onPrimary disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                                        Check for Updates
                                    </button>
                                )}
                            </div>
                        </section>
                    )}
                    {/* Save Footer (Optional visual confirmation) */}
                    <div className="pt-6 border-t border-md-sys-outline/10">
                        <button
                            onClick={() => {
                                setShowSettings(false);
                            }}
                            className="w-full py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-bold uppercase tracking-widest hover:brightness-110 shadow-lg transition-all"
                        >
                            Done
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};


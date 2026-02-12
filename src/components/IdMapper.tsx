import React, { useState, useMemo } from 'react';
import { Save, Trash2, Download, Upload, Users, UserMinus, UserCheck, Eye, ChevronDown, FileJson, X } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { PlayerRole } from '../store/slices/createMappingSlice';
import Logger from '../utils/logger';

// Role badge component
const RoleBadge: React.FC<{ role: PlayerRole }> = ({ role }) => {
    const styles: Record<PlayerRole, { bg: string; text: string; label: string }> = {
        teammate: { bg: 'bg-success-soft', text: 'text-success', label: 'Teammate' },
        opponent: { bg: 'bg-danger-soft', text: 'text-danger', label: 'Opponent' },
        mixed: { bg: 'bg-warning-soft', text: 'text-warning', label: 'Mixed' },
        unknown: { bg: 'md3-surface-high', text: 'text-md-sys-on-surface/40', label: 'Unknown' }
    };
    const s = styles[role];
    return (
        <span className={`px-1.5 py-0.5 rounded text-label-xs font-bold uppercase ${s.bg} ${s.text}`}>
            {s.label}
        </span>
    );
};

export const IdMapper: React.FC = () => {
    const {
        detectedUnknowns,
        knownMappings,
        playerProfiles,
        addMapping,
        removeMapping,
        importMappings,
        getPlayerRole,
        getMostFrequentOpponents,
        getMostFrequentTeammates
    } = useAppStore();
    const { setToast } = useUIState();
    const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
    const [jsonInput, setJsonInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'unknowns' | 'known' | 'relationships'>('unknowns');

    // Computed relationship data
    const topOpponents = useMemo(() => getMostFrequentOpponents(5), [playerProfiles]);
    const topTeammates = useMemo(() => getMostFrequentTeammates(5), [playerProfiles]);

    const handleSave = (id: string) => {
        const name = nameInputs[id];
        if (name && name.trim()) {
            addMapping(id, name.trim());
            const newInputs = { ...nameInputs };
            delete newInputs[id];
            setNameInputs(newInputs);
            setToast({ message: "Mapping Saved", type: 'success' });
            Logger.info('IdMapper', `Saved mapping: ${id} -> ${name.trim()}`);
        }
    };

    const handleExport = () => {
        const exportData = {
            mappings: knownMappings,
            profiles: playerProfiles,
            exportedAt: new Date().toISOString()
        };
        const data = JSON.stringify(exportData, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wildgate_id_mappings_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({ message: "Mappings Exported", type: 'success' });
        Logger.info('IdMapper', `Exported ${Object.keys(knownMappings).length} mappings`);
    };

    const handleImport = () => {
        try {
            const parsed = JSON.parse(jsonInput);
            // Support both old format (direct mappings) and new format (with profiles)
            const mappings = parsed.mappings || parsed;
            if (typeof mappings === 'object') {
                importMappings(mappings);
                setJsonInput('');
                setToast({ message: "Mappings Imported Successfully", type: 'success' });
                Logger.info('IdMapper', `Imported mappings`);
            }
        } catch (e) {
            setToast({ message: "Invalid JSON", type: 'error' });
            Logger.error('IdMapper', 'Import failed', e);
        }
    };

    const formatLastSeen = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div className="flex flex-col gap-4 p-4 md3-card rounded-xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-md-sys-on-surface">ID Mapping</h3>
                    <p className="text-label-sm text-md-sys-on-surface/60">Track players and relationships</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => {
                        const lines = Object.entries(knownMappings).map(([id, name]) => `    '${id}': '${name}'`).join(',\n');
                        const code = `// Paste into utils/guids.ts\n${lines}`;
                        navigator.clipboard.writeText(code);
                        setToast({ message: "Copied to Clipboard!", type: 'success' });
                    }} className="flex items-center gap-2 px-3 py-1.5 bg-md-sys-primary/10 text-md-sys-primary rounded-lg text-body font-bold hover:bg-md-sys-primary/20 transition-colors">
                        <FileJson size={14} /> Copy Code
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 bg-md-sys-primary/10 text-md-sys-primary rounded-lg text-body font-bold hover:bg-md-sys-primary/20 transition-colors">
                        <Download size={14} /> Export JSON
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="md3-surface-high p-2 rounded-lg flex items-center gap-2">
                <Users size={14} className="opacity-60" />
                <input
                    type="text"
                    placeholder="Search IDs or Names..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-1 bg-transparent text-label-sm outline-none font-medium placeholder:opacity-40"
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="opacity-60 hover:opacity-100">
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 md3-surface-high p-1 rounded-lg">
                {[
                    { id: 'unknowns', label: 'Unknowns', count: Object.keys(detectedUnknowns).length },
                    { id: 'known', label: 'Known', count: Object.keys(knownMappings).length },
                    { id: 'relationships', label: 'Relationships', count: Object.keys(playerProfiles).length }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 px-3 py-2 rounded-md text-label-sm font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === tab.id
                            ? 'bg-md-sys-primary text-md-sys-onPrimary'
                            : 'hover:bg-md-sys-on-surface/10 text-md-sys-on-surface/60'
                            }`}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-label-sm ${activeTab === tab.id ? 'bg-md-sys-on-surface/20' : 'md3-surface-high'
                                }`}>{tab.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0">
                {/* Unknowns Tab */}
                {activeTab === 'unknowns' && (
                    <div className="md3-card rounded-lg p-2 max-h-60 overflow-y-auto space-y-2">
                        {Object.keys(detectedUnknowns).length === 0 ? (
                            <div className="text-center p-8 text-label-sm opacity-40">No unknown IDs detected yet</div>
                        ) : (
                            Object.entries(detectedUnknowns)
                                .filter(([id, meta]) =>
                                    !searchTerm ||
                                    id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    (playerProfiles[id] && playerProfiles[id].name?.toLowerCase().includes(searchTerm.toLowerCase()))
                                )
                                .map(([id, meta]) => {
                                    const profile = playerProfiles[id];
                                    const role = getPlayerRole(id);
                                    return (
                                        <div key={id} className="flex items-center gap-3 md3-surface-high p-2 rounded-md">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-label-sm font-mono opacity-40 bg-black/20 px-1 rounded">{meta.type}</span>
                                                    <RoleBadge role={role} />
                                                </div>
                                                <div className="text-label-sm font-mono truncate select-all opacity-60 mt-0.5" title={id}>{id.slice(0, 20)}...</div>
                                                <div className="flex gap-3 text-label-sm opacity-40 mt-1">
                                                    <span>Seen {profile?.sightings || 1}x</span>
                                                    <span>{formatLastSeen(meta.lastSeen)}</span>
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Name..."
                                                value={nameInputs[id] || ''}
                                                onChange={e => setNameInputs({ ...nameInputs, [id]: e.target.value })}
                                                className="md3-textfield md3-textfield--outlined w-24 text-label-sm"
                                                onKeyDown={e => e.key === 'Enter' && handleSave(id)}
                                            />
                                            <button
                                                onClick={() => handleSave(id)}
                                                disabled={!nameInputs[id]}
                                                className="md3-icon-btn text-success disabled:opacity-disabled"
                                            >
                                                <Save size={14} />
                                            </button>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                )}

                {/* Known Tab */}
                {activeTab === 'known' && (
                    <div className="md3-card rounded-lg p-2 max-h-60 overflow-y-auto space-y-1">
                        {Object.entries(knownMappings)
                            .filter(([id, name]) =>
                                !searchTerm ||
                                name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                id.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .length === 0 ? (
                            <div className="text-center p-8 text-label-sm opacity-40">No mappings match '{searchTerm}'</div>
                        ) : (
                            Object.entries(knownMappings)
                                .filter(([id, name]) =>
                                    !searchTerm ||
                                    name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    id.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                                .map(([id, name]) => {
                                    const profile = playerProfiles[id];
                                    const role = getPlayerRole(id);
                                    return (
                                        <div key={id} className="flex items-center justify-between md3-surface-high/50 px-3 py-2 rounded text-label-sm group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <span className="font-bold text-md-sys-primary truncate">{name}</span>
                                                <RoleBadge role={role} />
                                                {profile && (
                                                    <span className="text-label-sm opacity-40">
                                                        {profile.sightings}x seen
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => removeMapping(id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-danger hover:bg-danger/10 rounded transition-all"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                )}

                {/* Relationships Tab */}
                {activeTab === 'relationships' && (
                    <div className="space-y-4">
                        {/* Player Profiles - Direct from playerProfiles data */}
                        <div className="md3-card rounded-lg p-3">
                            <h4 className="text-label-sm font-bold uppercase tracking-wide text-md-sys-primary flex items-center gap-2 mb-2">
                                <Users size={12} /> Player Sightings ({Object.keys(playerProfiles).length})
                            </h4>
                            {Object.keys(playerProfiles).length === 0 ? (
                                <div className="text-label-sm opacity-40 text-center py-4">No player sightings recorded yet. Use Smart Capture or Smart Scan to detect players.</div>
                            ) : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {Object.entries(playerProfiles)
                                        .filter(([id, profile]: [string, any]) =>
                                            !searchTerm ||
                                            (profile.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            id.toLowerCase().includes(searchTerm.toLowerCase())
                                        )
                                        .sort((a: any, b: any) => (b[1].sightings || 0) - (a[1].sightings || 0))
                                        .map(([id, profile]: [string, any]) => {
                                            const role = getPlayerRole(id);
                                            const playedWithCount = Object.values(profile.playedWith || {}).reduce((a: number, b: any) => a + (b as number), 0) as number;
                                            const playedAgainstCount = Object.values(profile.playedAgainst || {}).reduce((a: number, b: any) => a + (b as number), 0) as number;
                                            const lastSeen = profile.lastSeen ? formatLastSeen(profile.lastSeen) : 'Unknown';
                                            const topTeam = profile.teamColors ? Object.entries(profile.teamColors).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] : null;
                                            const topShip = profile.ships ? Object.entries(profile.ships).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] : null;

                                            return (
                                                <div key={id} className="flex items-center gap-2 md3-surface-high/50 px-2 py-1.5 rounded text-label-sm group">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold truncate">{profile.name || id.slice(0, 12) + '...'}</span>
                                                            <RoleBadge role={role} />
                                                        </div>
                                                        <div className="flex gap-3 text-label-sm opacity-60 mt-0.5">
                                                            <span>{profile.sightings || 0}x seen</span>
                                                            <span>{lastSeen}</span>
                                                            {topTeam && <span className="capitalize">{topTeam}</span>}
                                                            {topShip && <span>{topShip}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 text-label-sm shrink-0">
                                                        {playedWithCount > 0 && (
                                                            <span className="text-success">{playedWithCount} with</span>
                                                        )}
                                                        {playedAgainstCount > 0 && (
                                                            <span className="text-danger">{playedAgainstCount} vs</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>

                        {/* Top Opponents */}
                        <div className="md3-card rounded-lg p-3">
                            <h4 className="text-label-sm font-bold uppercase tracking-wide text-danger flex items-center gap-2 mb-2">
                                <UserMinus size={12} /> Frequent Opponents
                            </h4>
                            {topOpponents.length === 0 ? (
                                <div className="text-label-sm opacity-40 text-center py-2">No opponent data yet</div>
                            ) : (
                                <div className="space-y-1">
                                    {topOpponents.map((p, i) => (
                                        <div key={p.id} className="flex items-center gap-2 text-label-sm">
                                            <span className="w-4 text-danger font-bold">{i + 1}</span>
                                            <span className="flex-1 truncate font-medium">{p.name || p.id.slice(0, 12) + '...'}</span>
                                            <span className="text-danger/60">{Object.values(p.playedAgainst).reduce((a, b) => a + b, 0)} games</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Top Teammates */}
                        <div className="md3-card rounded-lg p-3">
                            <h4 className="text-label-sm font-bold uppercase tracking-wide text-success flex items-center gap-2 mb-2">
                                <UserCheck size={12} /> Frequent Teammates
                            </h4>
                            {topTeammates.length === 0 ? (
                                <div className="text-label-sm opacity-40 text-center py-2">No teammate data yet</div>
                            ) : (
                                <div className="space-y-1">
                                    {topTeammates.map((p, i) => (
                                        <div key={p.id} className="flex items-center gap-2 text-label-sm">
                                            <span className="w-4 text-success font-bold">{i + 1}</span>
                                            <span className="flex-1 truncate font-medium">{p.name || p.id.slice(0, 12) + '...'}</span>
                                            <span className="text-success/60">{Object.values(p.playedWith).reduce((a, b) => a + b, 0)} games</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Import Section */}
            <details className="border-t border-md-sys-outline/10 pt-4">
                <summary className="text-label-sm font-bold cursor-pointer hover:text-md-sys-primary transition-colors flex items-center gap-1">
                    <ChevronDown size={12} /> Advanced: Import JSON
                </summary>
                <div className="mt-2 flex gap-2">
                    <textarea
                        value={jsonInput}
                        onChange={e => setJsonInput(e.target.value)}
                        placeholder='Paste JSON here: {"ID": "Name", ...}'
                        className="md3-textfield md3-textfield--outlined flex-1 h-20 text-label-sm font-mono"
                    />
                    <button onClick={handleImport} className="md3-btn-tonal text-label-sm font-bold">
                        Import
                    </button>
                </div>
            </details>
        </div>
    );
};


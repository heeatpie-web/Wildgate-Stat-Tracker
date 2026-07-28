import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Save, Trash2, Download, Upload, Users, UserMinus, UserCheck, Eye, ChevronDown, FileJson, X, Pencil } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { PlayerRole } from '../store/slices/createMappingSlice';
import type { MappingEntityType } from '../types';
import { SHIPS, CHARACTERS, WEAPONS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT } from '../types';
import { normalizeDetectedUnknownMappings } from '../services/mappingContract';
import Logger from '../utils/logger';
import { getPerkCatalogWithLegacyNames, getProspectorEquipmentCatalog, getProspectorWeaponCatalog, getShipCatalog } from './patch/patchEntityCatalog';
import {
    getTeammateIdentityConfidence,
    getTeammateIdentityDisplayName,
} from '../utils/teammateIdentity';

type MappingDomain = 'players' | 'ships' | 'weapons' | 'equipment' | 'perks';
type MappingTag = 'prospector' | 'ship' | 'weapon' | 'equipment' | 'perk' | 'player';

const normalizeLabel = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeEntityLabel = (value: unknown) => normalizeLabel(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\s*player\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SHIP_SET = new Set(getShipCatalog(SHIPS || []).flatMap((name) => {
    const normalized = normalizeEntityLabel(name);
    const withoutSoloPrefix = normalized.replace(/^solo\s+/, '').trim();
    const firstToken = withoutSoloPrefix.split(/\s+/)[0] || '';
    return [normalized, withoutSoloPrefix, firstToken].filter(Boolean);
}));
const PROSPECTOR_SET = new Set((CHARACTERS || []).map((name) => normalizeEntityLabel(name)));
const WEAPON_SET = new Set([
    ...(WEAPONS || []),
    ...getProspectorWeaponCatalog(CHARACTER_WEAPONS || []),
].map((name) => normalizeEntityLabel(name)));
const EQUIPMENT_SET = new Set(getProspectorEquipmentCatalog(CHARACTER_EQUIPMENT || []).map((name) => normalizeEntityLabel(name)));
// Legacy-inclusive so perk names from older matches are still classified as perks.
const PERK_SET = new Set(getPerkCatalogWithLegacyNames().map((name) => normalizeEntityLabel(name)));
const SHIP_KEYWORDS = ['drone', 'privateer', 'interceptor', 'gunship', 'fighter', 'frigate', 'raider', 'brawler', 'carrier'];
const WEAPON_KEYWORDS = ['cannon', 'rifle', 'pistol', 'launcher', 'beam', 'turret', 'blaster', 'weapon'];
const EQUIPMENT_KEYWORDS = ['shield', 'module', 'booster', 'utility', 'gear', 'ability', 'equipment'];
const PERK_KEYWORDS = ['perk', 'jetpack', 'teleport', 'wings', 'inventor', 'defender', 'resourcing', 'engineering', 'salvager', 'boarder', 'factory', 'smash', 'explorer', 'bomber'];
const SHIP_TYPE_HINTS = ['attackdrone', 'drone', 'privateer', 'interceptor', 'gunship', 'fighter', 'frigate', 'raider', 'brawler', 'carrier'];

const hasAliasMatch = (value: string, aliases: Set<string>): boolean => {
    const normalizedValue = normalizeEntityLabel(value);
    if (!normalizedValue) return false;
    if (aliases.has(normalizedValue)) return true;
    const padded = ` ${normalizedValue} `;
    for (const alias of aliases) {
        if (!alias || alias.length < 3) continue;
        if (padded.includes(` ${alias} `)) return true;
    }
    return false;
};

const inferTagFromKeywords = (value: string): MappingTag | null => {
    const normalizedValue = normalizeEntityLabel(value);
    if (!normalizedValue) return null;
    if (SHIP_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) return 'ship';
    if (WEAPON_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) return 'weapon';
    if (EQUIPMENT_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) return 'equipment';
    if (PERK_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) return 'perk';
    return null;
};

const looksLikeShipEntity = (value: unknown): boolean => {
    const normalizedValue = normalizeEntityLabel(value);
    if (!normalizedValue) return false;
    if (SHIP_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) return true;
    const compact = normalizedValue.replace(/[^a-z0-9]/g, '');
    return SHIP_TYPE_HINTS.some((hint) => compact.includes(hint));
};

const inferDomainFromName = (name: string): MappingDomain | null => {
    if (!name) return null;
    if (hasAliasMatch(name, SHIP_SET)) return 'ships';
    if (hasAliasMatch(name, WEAPON_SET)) return 'weapons';
    if (hasAliasMatch(name, EQUIPMENT_SET)) return 'equipment';
    if (hasAliasMatch(name, PERK_SET)) return 'perks';
    if (hasAliasMatch(name, PROSPECTOR_SET)) return 'players';
    const inferredTag = inferTagFromKeywords(name);
    if (inferredTag === 'ship') return 'ships';
    if (inferredTag === 'weapon') return 'weapons';
    if (inferredTag === 'equipment') return 'equipment';
    return null;
};

const inferTagFromName = (name: string): MappingTag | null => {
    if (!name) return null;
    if (hasAliasMatch(name, SHIP_SET)) return 'ship';
    if (hasAliasMatch(name, PROSPECTOR_SET)) return 'prospector';
    if (hasAliasMatch(name, WEAPON_SET)) return 'weapon';
    if (hasAliasMatch(name, EQUIPMENT_SET)) return 'equipment';
    if (hasAliasMatch(name, PERK_SET)) return 'perk';
    const inferredTag = inferTagFromKeywords(name);
    if (inferredTag === 'perk') return null;
    if (inferredTag) return inferredTag;
    return null;
};

const normalizeGuidKey = (value: unknown): string => String(value || '')
    .replace(/[{}-]/g, '')
    .trim()
    .toUpperCase();

const extractUnknownGuidPrefix = (value: unknown): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^unknown\s*\(([^)]+)\)$/i);
    if (!match) return '';
    return normalizeGuidKey(match[1]).slice(0, 4);
};

const resolveMappedActiveShipSource = (
    currentSource: 'manual' | 'telemetry' | 'ocr' | undefined,
    telemetryWillBeUpdated: boolean
): 'manual' | 'telemetry' => {
    if (currentSource === 'manual') return 'manual';
    if (currentSource === 'telemetry') return 'telemetry';
    return telemetryWillBeUpdated ? 'telemetry' : 'manual';
};

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
        uidMappings,
        playerProfiles,
        teammateIdentityRecords,
        addMapping,
        setUidMapping,
        removeMapping,
        removeUidMapping,
        importMappings,
        getPlayerRole,
        getMostFrequentOpponents,
        getMostFrequentTeammates,
        activeShip,
        shipSource,
        telemetryDetectedShip,
        setActiveShip,
        currentLoadout,
        setCurrentLoadout,
        pendingMatchData,
        setPendingMatchData,
        sessionShipTypes,
        setSessionShipTypes,
    } = useAppStore();
    const { pushNotification } = useUIState();
    const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
    const [editingKnownKey, setEditingKnownKey] = useState<string | null>(null);
    const [jsonInput, setJsonInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'unknowns' | 'known' | 'relationships'>(() => (
        Object.keys(detectedUnknowns || {}).length > 0 ? 'unknowns' : 'known'
    ));
    const previousUnknownCountRef = useRef(Object.keys(detectedUnknowns || {}).length);
    const normalizedUnknowns = useMemo(
        () => normalizeDetectedUnknownMappings(detectedUnknowns),
        [detectedUnknowns]
    );

    const resolveUnknownDomain = (id: string, rawType?: MappingEntityType, candidateName?: string): MappingDomain => {
        const normalizedType = String(rawType || '').trim().toLowerCase();
        if (normalizedType.includes('ship')) {
            return 'ships';
        }
        if (normalizedType.includes('perk') || normalizedType.includes('trait')) {
            return 'perks';
        }
        if (normalizedType.includes('weapon')) {
            return 'weapons';
        }
        if (normalizedType.includes('equipment') || normalizedType.includes('gear') || normalizedType.includes('utility')) {
            return 'equipment';
        }

        const normalizedId = String(id || '').trim().toLowerCase();
        if (normalizedId.startsWith('ship')) return 'ships';
        if (normalizedId.startsWith('perk') || normalizedId.startsWith('pk')) return 'perks';
        if (normalizedId.startsWith('wpn') || normalizedId.startsWith('weapon') || normalizedId.startsWith('cw')) return 'weapons';
        if (normalizedId.startsWith('equip') || normalizedId.startsWith('gear') || normalizedId.startsWith('ce')) return 'equipment';

        const inferredFromName = inferDomainFromName(String(candidateName || ''));
        if (inferredFromName) return inferredFromName;

        if (normalizedType.includes('hero') || normalizedType.includes('player') || normalizedType.includes('pilot')) {
            return 'players';
        }

        return 'players';
    };

    const resolvePersistedDomain = (
        domain: MappingDomain,
        id: string,
        candidateName: string,
        rawType?: MappingEntityType
    ): MappingDomain => {
        if (domain !== 'players') return domain;
        const inferred = resolveUnknownDomain(id, rawType, candidateName);
        return inferred === 'players' ? domain : inferred;
    };

    const applyMappingByDomain = (domain: MappingDomain, id: string, name: string) => {
        if (domain === 'players') {
            addMapping(id, name);
            return;
        }
        setUidMapping(domain, id, name);
        if (domain !== 'ships') return;

        const normalizedId = normalizeGuidKey(id);
        const guidPrefix = normalizedId.slice(0, 4);
        if (!guidPrefix) return;
        const matchesUnknownGuid = (value: unknown): boolean => (
            extractUnknownGuidPrefix(value) === guidPrefix
        );

        const replaceActiveShip = matchesUnknownGuid(activeShip);
        const replaceTelemetryShip = matchesUnknownGuid(telemetryDetectedShip);
        const activeShipUpdateSource = replaceActiveShip
            ? resolveMappedActiveShipSource(shipSource, replaceTelemetryShip)
            : null;

        if (replaceActiveShip && activeShipUpdateSource) {
            setActiveShip(name, activeShipUpdateSource);
        }
        if (replaceTelemetryShip && activeShipUpdateSource !== 'telemetry') {
            setActiveShip(name, 'telemetry');
        }

        if (currentLoadout?.ship && matchesUnknownGuid(currentLoadout.ship)) {
            setCurrentLoadout({
                ...currentLoadout,
                ship: name,
            });
        }

        if (pendingMatchData) {
            const pendingShip = String(pendingMatchData.ship || '');
            const pendingLoadoutShip = String(pendingMatchData.loadout?.ship || '');
            const replacePendingShip = matchesUnknownGuid(pendingShip);
            const replacePendingLoadoutShip = matchesUnknownGuid(pendingLoadoutShip);
            if (replacePendingShip || replacePendingLoadoutShip) {
                setPendingMatchData({
                    ...pendingMatchData,
                    ship: replacePendingShip ? name : pendingMatchData.ship,
                    loadout: pendingMatchData.loadout
                        ? {
                            ...pendingMatchData.loadout,
                            ship: replacePendingLoadoutShip ? name : pendingMatchData.loadout.ship,
                        }
                        : pendingMatchData.loadout,
                });
            }
        }

        if (sessionShipTypes && Object.keys(sessionShipTypes).length > 0) {
            let shipTypesChanged = false;
            const nextShipTypes = Object.fromEntries(
                Object.entries(sessionShipTypes).map(([key, value]) => {
                    if (!matchesUnknownGuid(value)) return [key, value];
                    shipTypesChanged = true;
                    return [key, name];
                })
            );
            if (shipTypesChanged) {
                setSessionShipTypes(nextShipTypes, 'manual');
            }
        }
    };

    const getTagFromUnknownType = (rawType?: MappingEntityType): MappingTag | null => {
        const normalizedType = normalizeLabel(rawType);
        if (normalizedType.includes('hero')) return 'prospector';
        if (normalizedType.includes('ship')) return 'ship';
        if (looksLikeShipEntity(normalizedType)) return 'ship';
        if (normalizedType.includes('perk') || normalizedType.includes('trait')) return 'perk';
        if (normalizedType.includes('weapon')) return 'weapon';
        if (normalizedType.includes('equipment') || normalizedType.includes('gear') || normalizedType.includes('utility')) return 'equipment';
        return null;
    };

    const inferMappingTag = (entry: { id: string; name: string; domain: MappingDomain }): MappingTag => {
        if (entry.domain === 'ships') return 'ship';
        if (entry.domain === 'weapons') return 'weapon';
        if (entry.domain === 'equipment') return 'equipment';
        if (entry.domain === 'perks') return 'perk';

        const unknownTypeTag = getTagFromUnknownType(normalizedUnknowns?.[entry.id]?.type);
        if (unknownTypeTag) return unknownTypeTag;

        const normalizedId = normalizeLabel(entry.id);
        if (normalizedId.startsWith('ship')) return 'ship';
        if (looksLikeShipEntity(normalizedId)) return 'ship';
        if (normalizedId.startsWith('wpn') || normalizedId.startsWith('weapon') || normalizedId.startsWith('cw')) return 'weapon';
        if (normalizedId.startsWith('equip') || normalizedId.startsWith('gear') || normalizedId.startsWith('ce')) return 'equipment';

        const inferredByName = inferTagFromName(entry.name);
        if (inferredByName) return inferredByName;

        return 'player';
    };

    const mappingTagStyle: Record<MappingTag, { label: string; className: string }> = {
        prospector: {
            label: 'PROSPECTOR',
            className: 'bg-info/15 text-info',
        },
        ship: {
            label: 'SHIP',
            className: 'bg-md-sys-primary/15 text-md-sys-primary',
        },
        weapon: {
            label: 'WEAPON',
            className: 'bg-warning-soft text-warning',
        },
        equipment: {
            label: 'EQUIPMENT',
            className: 'bg-success-soft text-success',
        },
        perk: {
            label: 'PERK',
            className: 'bg-warning-soft text-warning',
        },
        player: {
            label: 'PLAYER',
            className: 'md3-surface-high text-md-sys-on-surface/50',
        },
    };

    const inferRelationshipTag = useCallback((id: string, name: string): MappingTag => {
        const unknownTypeTag = getTagFromUnknownType(normalizedUnknowns?.[id]?.type);
        if (unknownTypeTag) return unknownTypeTag;

        if ((uidMappings?.ships || {})[id]) return 'ship';
        if ((uidMappings?.weapons || {})[id]) return 'weapon';
        if ((uidMappings?.equipment || {})[id]) return 'equipment';
        if ((uidMappings?.perks || {})[id]) return 'perk';
        if ((uidMappings?.players || {})[id]) {
            const inferredFromName = inferTagFromName(name);
            return inferredFromName || 'player';
        }

        const normalizedId = normalizeLabel(id);
        if (normalizedId.startsWith('ship')) return 'ship';
        if (looksLikeShipEntity(normalizedId)) return 'ship';
        if (normalizedId.startsWith('perk') || normalizedId.startsWith('pk')) return 'perk';
        if (normalizedId.startsWith('wpn') || normalizedId.startsWith('weapon') || normalizedId.startsWith('cw')) return 'weapon';
        if (normalizedId.startsWith('equip') || normalizedId.startsWith('gear') || normalizedId.startsWith('ce')) return 'equipment';
        if (normalizedId.startsWith('hero') || normalizedId.startsWith('char') || normalizedId.startsWith('prospector')) return 'prospector';

        const inferredByName = inferTagFromName(name);
        if (inferredByName) return inferredByName;

        return 'player';
    }, [normalizedUnknowns, uidMappings]);

    // Computed relationship data
    const topOpponents = useMemo(() => getMostFrequentOpponents(5), [getMostFrequentOpponents]);
    const topTeammates = useMemo(() => getMostFrequentTeammates(5), [getMostFrequentTeammates]);
    const knownEntries = useMemo(() => {
        const entries: Array<{ key: string; id: string; name: string; domain: MappingDomain }> = [];
        const pushDomain = (domain: MappingDomain, mappings: Record<string, string>) => {
            Object.entries(mappings || {}).forEach(([id, name]) => {
                if (!name) return;
                entries.push({ key: `${domain}:${id}`, id, name, domain });
            });
        };
        pushDomain('players', uidMappings?.players || {});
        pushDomain('ships', uidMappings?.ships || {});
        pushDomain('weapons', uidMappings?.weapons || {});
        pushDomain('equipment', uidMappings?.equipment || {});
        pushDomain('perks', uidMappings?.perks || {});

        // Preserve legacy knownMappings player entries not represented in uidMappings.players.
        Object.entries(knownMappings || {}).forEach(([id, name]) => {
            if (!name) return;
            if ((uidMappings?.players || {})[id]) return;
            entries.push({ key: `players:${id}`, id, name, domain: 'players' });
        });
        return entries;
    }, [knownMappings, uidMappings]);
    const relationshipEntries = useMemo(
        () => Object.entries(playerProfiles)
            .filter(([id, profile]: [string, any]) => inferRelationshipTag(id, profile.name || '') === 'player'),
        [inferRelationshipTag, playerProfiles]
    );
    const teammateIdentityEntries = useMemo(
        () => Object.values(teammateIdentityRecords || {})
            .sort((left, right) => Number(right.lastSeenAt || 0) - Number(left.lastSeenAt || 0)),
        [teammateIdentityRecords]
    );

    useEffect(() => {
        const unknownCount = Object.keys(normalizedUnknowns || {}).length;
        if (unknownCount > 0 && previousUnknownCountRef.current === 0) {
            setActiveTab('unknowns');
        }
        previousUnknownCountRef.current = unknownCount;
    }, [normalizedUnknowns]);

    const notifyIdMapper = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        pushNotification({
            message,
            type,
            source: 'id-mapper',
            deepLink: { type: 'openIdMapper' },
        });
    };

    const handleSave = (id: string) => {
        const name = nameInputs[id];
        if (name && name.trim()) {
            const trimmed = name.trim();
            const domain = resolvePersistedDomain(
                resolveUnknownDomain(id, normalizedUnknowns[id]?.type, trimmed),
                id,
                trimmed,
                normalizedUnknowns[id]?.type
            );
            applyMappingByDomain(domain, id, trimmed);
            const newInputs = { ...nameInputs };
            delete newInputs[id];
            setNameInputs(newInputs);
            notifyIdMapper('Mapping Saved', 'success');
            Logger.info('IdMapper', `Saved mapping: ${domain}:${id} -> ${trimmed}`);
        }
    };

    const handleKnownSave = (entry: { key: string; id: string; name: string; domain: MappingDomain }) => {
        const nextName = (nameInputs[entry.key] || '').trim();
        if (!nextName) return;
        applyMappingByDomain(
            resolvePersistedDomain(entry.domain, entry.id, nextName, normalizedUnknowns[entry.id]?.type),
            entry.id,
            nextName
        );
        setNameInputs((prev) => {
            const updated = { ...prev };
            delete updated[entry.key];
            return updated;
        });
        setEditingKnownKey(null);
        notifyIdMapper('Mapping Updated', 'success');
        Logger.info('IdMapper', `Updated mapping: ${entry.domain}:${entry.id} -> ${nextName}`);
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
        notifyIdMapper('Mappings Exported', 'success');
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
                notifyIdMapper('Mappings Imported Successfully', 'success');
                Logger.info('IdMapper', `Imported mappings`);
            }
        } catch (e) {
            notifyIdMapper('Invalid JSON', 'error');
            Logger.error('IdMapper', 'Import failed', e);
        }
    };

    const formatLastSeen = (timestamp: number) => {
        if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown';
        const diff = Date.now() - timestamp;
        if (diff < 0) return '0s ago';
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const mins = Math.floor(diff / 60000);
        const secRemainder = Math.floor((diff % 60000) / 1000);
        if (mins < 60) return `${mins}m ${secRemainder}s ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) {
            const minRemainder = mins % 60;
            return `${hours}h ${minRemainder}m ${secRemainder}s ago`;
        }
        return new Date(timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const teammateStatusStyle: Record<string, string> = {
        learning: 'bg-info/15 text-info',
        auto_linked: 'bg-success-soft text-success',
        confirmed: 'bg-md-sys-primary/15 text-md-sys-primary',
        conflicted: 'bg-warning-soft text-warning',
    };

    return (
        <div className="idmapper-shell flex flex-col gap-4 p-4 md3-card rounded-xl">
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
                        notifyIdMapper('Copied to Clipboard!', 'success');
                    }} className="idmapper-click-target flex items-center gap-2 px-3 py-1.5 bg-md-sys-primary/10 text-md-sys-primary rounded-lg text-body font-bold hover:bg-md-sys-primary/20 transition-colors">
                        <FileJson size={14} /> Copy Code
                    </button>
                    <button onClick={handleExport} className="idmapper-click-target flex items-center gap-2 px-3 py-1.5 bg-md-sys-primary/10 text-md-sys-primary rounded-lg text-body font-bold hover:bg-md-sys-primary/20 transition-colors">
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
                    { id: 'unknowns', label: 'Unknowns', count: Object.keys(normalizedUnknowns).length },
                    { id: 'known', label: 'Known', count: knownEntries.length },
                    { id: 'relationships', label: 'Relationships', count: relationshipEntries.length + teammateIdentityEntries.length }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`idmapper-click-target flex-1 px-3 py-2 rounded-md text-label-sm font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === tab.id
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
                        {Object.keys(normalizedUnknowns).length === 0 ? (
                            <div className="text-center p-6 text-label-sm opacity-50 space-y-2">
                                <div>No unknown IDs detected yet.</div>
                                <div className="flex items-center justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('known')}
                                        className="px-2 py-1 rounded-control md3-btn-tonal text-label-sm font-bold"
                                    >
                                        View Known
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('relationships')}
                                        className="px-2 py-1 rounded-control md3-btn-tonal text-label-sm font-bold"
                                    >
                                        View Relationships
                                    </button>
                                </div>
                            </div>
                        ) : (
                            Object.entries(normalizedUnknowns)
                                .filter(([id, meta]) =>
                                    !searchTerm ||
                                    id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    (playerProfiles[id] && playerProfiles[id].name?.toLowerCase().includes(searchTerm.toLowerCase()))
                                )
                                .map(([id, meta]) => {
                                    const profile = playerProfiles[id];
                                    const role = getPlayerRole(id);
                                    return (
                                        <div key={id} className="idmapper-click-target flex items-center gap-3 md3-surface-high p-2 rounded-md">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-label-sm font-mono opacity-40 bg-scrim-20 px-1 rounded">{meta.type}</span>
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
                                                aria-label={`Save mapping for ${id}`}
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
                        {knownEntries
                            .filter((entry) =>
                                !searchTerm ||
                                entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                entry.id.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .length === 0 ? (
                            <div className="text-center p-8 text-label-sm opacity-40">No mappings match '{searchTerm}'</div>
                        ) : (
                            knownEntries
                                .filter((entry) =>
                                    !searchTerm ||
                                    entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    entry.id.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                                .map((entry) => {
                                    const profile = playerProfiles[entry.id];
                                    const role = getPlayerRole(entry.id);
                                    const mappingTag = inferMappingTag(entry);
                                    const tagStyle = mappingTagStyle[mappingTag];
                                    const isEditing = editingKnownKey === entry.key;
                                    const editValue = nameInputs[entry.key] ?? '';
                                    return (
                                        <div key={entry.key} className="flex items-center justify-between gap-2 md3-surface-high px-3 py-2 rounded text-label-sm group">
                                            <div className="flex items-center gap-3 overflow-hidden min-w-0">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editValue}
                                                        onChange={(e) => setNameInputs((prev) => ({ ...prev, [entry.key]: e.target.value }))}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleKnownSave(entry);
                                                            if (e.key === 'Escape') {
                                                                setEditingKnownKey(null);
                                                                setNameInputs((prev) => {
                                                                    const updated = { ...prev };
                                                                    delete updated[entry.key];
                                                                    return updated;
                                                                });
                                                            }
                                                        }}
                                                        autoFocus
                                                        className="md3-textfield md3-textfield--outlined w-44 text-label-sm"
                                                        aria-label={`Edit mapping name for ${entry.id}`}
                                                    />
                                                ) : (
                                                    <span className="font-bold text-md-sys-primary truncate">{entry.name}</span>
                                                )}
                                                {entry.domain === 'players' && role !== 'unknown' && <RoleBadge role={role} />}
                                                <span className={`px-1.5 py-0.5 rounded text-label-xs font-bold uppercase ${tagStyle.className}`}>
                                                    {tagStyle.label}
                                                </span>
                                                {entry.domain === 'players' && profile && (
                                                    <>
                                                        <span className="text-label-sm opacity-40">{profile.sightings}x seen</span>
                                                        <span className="text-label-sm opacity-35">{formatLastSeen(profile.lastSeen)}</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-100">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleKnownSave(entry)}
                                                            disabled={!editValue.trim() || editValue.trim() === entry.name}
                                                            className="p-1 text-success hover:bg-success/10 rounded disabled:opacity-disabled"
                                                            aria-label={`Save mapping for ${entry.id}`}
                                                        >
                                                            <Save size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingKnownKey(null);
                                                                setNameInputs((prev) => {
                                                                    const updated = { ...prev };
                                                                    delete updated[entry.key];
                                                                    return updated;
                                                                });
                                                            }}
                                                            className="p-1 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/10 rounded"
                                                            aria-label={`Cancel editing mapping for ${entry.id}`}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setEditingKnownKey(entry.key);
                                                                setNameInputs((prev) => ({ ...prev, [entry.key]: entry.name }));
                                                            }}
                                                            className="p-1 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/10 rounded transition-colors"
                                                            aria-label={`Edit mapping for ${entry.id}`}
                                                        >
                                                            <Pencil size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (entry.domain === 'players') {
                                                                    removeMapping(entry.id);
                                                                    return;
                                                                }
                                                                removeUidMapping(entry.domain, entry.id);
                                                            }}
                                                            className="p-1 text-danger hover:bg-danger/10 rounded transition-colors"
                                                            aria-label={`Delete mapping for ${entry.id}`}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                )}

                {/* Relationships Tab */}
                {activeTab === 'relationships' && (
                    <div className="space-y-4">
                        <div className="md3-card rounded-lg p-3">
                            <h4 className="text-label-sm font-bold uppercase tracking-wide text-md-sys-primary flex items-center gap-2 mb-2">
                                <Eye size={12} /> Teammate Identity Links ({teammateIdentityEntries.length})
                            </h4>
                            {teammateIdentityEntries.length === 0 ? (
                                <div className="text-label-sm opacity-40 text-center py-4">No teammate identity evidence yet. Teammate IDs will start learning as telemetry and OCR overlap across matches.</div>
                            ) : (
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {teammateIdentityEntries
                                        .filter((record: any) => {
                                            const displayName = getTeammateIdentityDisplayName(record);
                                            return !searchTerm
                                                || displayName.toLowerCase().includes(searchTerm.toLowerCase())
                                                || String(record.playerId || '').toLowerCase().includes(searchTerm.toLowerCase());
                                        })
                                        .map((record: any) => {
                                            const displayName = getTeammateIdentityDisplayName(record) || String(record.playerId || '').slice(0, 12);
                                            const confidence = Math.round(getTeammateIdentityConfidence(record) * 100);
                                            const statusLabel = String(record.status || 'learning')
                                                .replace(/_/g, ' ')
                                                .replace(/\b\w/g, (char) => char.toUpperCase());
                                            const statusStyle = teammateStatusStyle[String(record.status || 'learning')] || teammateStatusStyle.learning;
                                            return (
                                                <div key={record.playerId} className="flex items-center gap-2 md3-surface-high px-2 py-1.5 rounded text-label-sm">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold truncate">{displayName}</span>
                                                            <span className={`px-1.5 py-0.5 rounded text-label-xs font-bold uppercase ${statusStyle}`}>
                                                                {statusLabel}
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-3 text-label-sm opacity-60 mt-0.5">
                                                            <span className="font-mono">{String(record.playerId || '').slice(0, 12)}...</span>
                                                            <span>{record.sampleCount || 0} samples</span>
                                                            <span>{confidence}% confidence</span>
                                                            <span>{formatLastSeen(Number(record.lastSeenAt || 0))}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>

                        {/* Player Profiles - Direct from playerProfiles data */}
                        <div className="md3-card rounded-lg p-3">
                            <h4 className="text-label-sm font-bold uppercase tracking-wide text-md-sys-primary flex items-center gap-2 mb-2">
                                <Users size={12} /> Player Sightings ({relationshipEntries.length})
                            </h4>
                            {relationshipEntries.length === 0 ? (
                                <div className="text-label-sm opacity-40 text-center py-4">No player sightings recorded yet. Use Smart Capture or Smart Scan to detect players.</div>
                            ) : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {relationshipEntries
                                        .filter(([id, profile]: [string, any]) =>
                                            !searchTerm ||
                                            (profile.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            id.toLowerCase().includes(searchTerm.toLowerCase())
                                        )
                                        .sort((a: any, b: any) => (Number(b[1].lastSeen || 0) - Number(a[1].lastSeen || 0)))
                                        .map(([id, profile]: [string, any]) => {
                                            const role = getPlayerRole(id);
                                            const entityTag = inferRelationshipTag(id, profile.name || '');
                                            const entityTagStyle = mappingTagStyle[entityTag];
                                            const playedWithCount = Object.values(profile.playedWith || {}).reduce((a: number, b: any) => a + (b as number), 0) as number;
                                            const playedAgainstCount = Object.values(profile.playedAgainst || {}).reduce((a: number, b: any) => a + (b as number), 0) as number;
                                            const lastSeen = profile.lastSeen ? formatLastSeen(profile.lastSeen) : 'Unknown';
                                            const topTeam = profile.teamColors ? Object.entries(profile.teamColors).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] : null;
                                            const topShip = profile.ships ? Object.entries(profile.ships).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] : null;

                                            return (
                                                <div key={id} className="flex items-center gap-2 md3-surface-high px-2 py-1.5 rounded text-label-sm group">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold truncate">{profile.name || id.slice(0, 12) + '...'}</span>
                                                            <RoleBadge role={role} />
                                                            <span className={`px-1.5 py-0.5 rounded text-label-xs font-bold uppercase ${entityTagStyle.className}`}>
                                                                {entityTagStyle.label}
                                                            </span>
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


import React from 'react';
import { ChevronRight, ChevronDown, Plus, X, Check } from 'lucide-react';
import { SHIPS, getShipColor } from '../../types';
import { UI_REACH_MODIFIERS } from '../../utils/constants';
import { normalizeOcrName } from '../../utils/stringUtils';

export const Section: React.FC<{
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    collapsible?: boolean;
    collapsed?: boolean;
    onToggle?: () => void;
}> = ({ title, icon, children, collapsible = false, collapsed = false, onToggle }) => (
    <div className="md3-surface-high rounded-2xl sc-bordered p-4 sc-editor-section">
        <button
            type="button"
            onClick={collapsible ? onToggle : undefined}
            className={`w-full flex items-center justify-between gap-2 ${collapsible ? 'cursor-pointer' : 'cursor-default'} ${collapsed ? '' : 'mb-3'}`}
        >
            <div className="flex items-center gap-2">
                {icon ? (
                    <div className="w-8 h-8 rounded-2xl bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center sc-bordered sc-editor-section-icon">
                        {icon}
                    </div>
                ) : null}
                <span className="text-label-sm font-black text-md-sys-on-surface/65 tracking-wide-22 uppercase sc-editor-section-title">{title}</span>
            </div>
            {collapsible && (
                <span className="text-md-sys-on-surface/40">
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
            )}
        </button>
        {!collapsed && children}
    </div>
);

export const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; accent?: 'primary' | 'danger' | 'success' | 'warning' }> = ({ icon, label, value, accent = 'primary' }) => (
    <div className={`sc-stat-card sc-stat-card--${accent}`}>
        <div className="sc-stat-card__icon">
            {icon}
        </div>
        <div className="sc-stat-card__body">
            <span className="sc-stat-card__label">{label}</span>
            <span className="sc-stat-card__value">{value}</span>
        </div>
    </div>
);

export const EditableStatCard: React.FC<{
    icon: React.ReactNode; label: string; value: string;
    onSave?: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean;
    accent?: 'primary' | 'danger' | 'success' | 'warning';
}> = ({ icon, label, value, onSave, placeholder, type, readOnly, accent = 'primary' }) => {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => { setDraft(value); }, [value]);

    if (readOnly || !onSave) {
        return <StatCard icon={icon} label={label} value={value} accent={accent} />;
    }

    return (
        <div
            className={`sc-stat-card sc-stat-card--${accent} sc-stat-card--editable`}
            onClick={() => { if (!editing) { setEditing(true); setDraft(value === '--' ? '' : value); } }}
        >
            <div className="sc-stat-card__icon">
                {icon}
            </div>
            <div className="sc-stat-card__body">
                <span className="sc-stat-card__label">{label}</span>
                {editing ? (
                    <input
                        type={type || 'text'}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => { onSave(draft); setEditing(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
                        className="sc-stat-card__input"
                        placeholder={placeholder}
                        min={type === 'number' ? 0 : undefined}
                        autoFocus
                    />
                ) : (
                    <span className="sc-stat-card__value">{value}</span>
                )}
            </div>
        </div>
    );
};

export const ModifierAdder: React.FC<{ existing: string[]; onAdd: (mod: string) => void }> = ({ existing, onAdd }) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const available = UI_REACH_MODIFIERS.filter(m => !existing.includes(m) && m.toLowerCase().includes(search.toLowerCase()));

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="md3-icon-btn bg-warning-soft text-warning hover:bg-warning-soft-strong" aria-label="Add modifier">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-1 md3-surface-high rounded-lg p-2 min-w-180px">
            <div className="flex items-center gap-1">
                <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search modifiers..."
                    className="flex-1 bg-transparent text-label-sm outline-none"
                    autoFocus
                />
                <button onClick={() => { setOpen(false); setSearch(''); }} className="md3-icon-btn w-5 h-5 text-danger" aria-label="Close modifier picker"><X size={10} /></button>
            </div>
            <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
                {available.slice(0, 10).map(m => (
                    <button key={m} onClick={() => { onAdd(m); setOpen(false); setSearch(''); }}
                        className="text-left text-label-sm px-1.5 py-0.5 rounded hover:bg-warning-soft text-warning transition-colors">
                        {m}
                    </button>
                ))}
                {available.length === 0 && <span className="text-label-xs opacity-40 text-center py-1">No modifiers available</span>}
            </div>
        </div>
    );
};

export const KillAdder: React.FC<{ existingShips: string[]; onAdd: (ship: string) => void }> = ({ existingShips, onAdd }) => {
    const [open, setOpen] = React.useState(false);

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="md3-icon-btn bg-success-soft text-success hover:bg-success-soft-strong" aria-label="Add kill entry">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-0.5 md3-surface-high rounded-lg p-2 min-w-40">
            {SHIPS.map(s => (
                <button key={s} onClick={() => { onAdd(s); setOpen(false); }}
                    className="text-left text-label-sm px-1.5 py-0.5 rounded hover:bg-success-soft text-success transition-colors flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getShipColor(s) }} />
                    {s.replace(/ \(\d Player\)/, '')}
                    {existingShips.includes(s) && <span className="opacity-40 ml-auto">+1</span>}
                </button>
            ))}
            <button onClick={() => setOpen(false)} className="text-label-xs opacity-40 hover:opacity-60 text-center mt-1">Cancel</button>
        </div>
    );
};

export const InlinePlayerAdd: React.FC<{
    onAdd: (name: string) => void;
    pilotRegistry?: string[];
    onAddToRoster?: (name: string) => void;
}> = ({ onAdd, pilotRegistry = [], onAddToRoster }) => {
    const [adding, setAdding] = React.useState(false);
    const [name, setName] = React.useState('');
    const listId = React.useId();
    const normalizedRegistry = React.useMemo(() => (
        new Map(
            pilotRegistry
                .map((pilot) => {
                    const normalized = normalizeOcrName(pilot).toLowerCase();
                    return normalized ? [normalized, pilot] : null;
                })
                .filter((entry): entry is [string, string] => !!entry)
        )
    ), [pilotRegistry]);
    const normalizedDraft = normalizeOcrName(name || '');
    const existingRosterName = normalizedDraft
        ? normalizedRegistry.get(normalizedDraft.toLowerCase()) || ''
        : '';
    const hasRosterAddAction = Boolean(
        onAddToRoster
        && normalizedDraft.length >= 2
        && !existingRosterName
    );
    const commitAdd = () => {
        const trimmed = normalizeOcrName(name || '');
        if (!trimmed) return;
        onAdd(existingRosterName || trimmed);
        setName('');
        setAdding(false);
    };
    const addDraftToRoster = () => {
        if (!onAddToRoster) return;
        const trimmed = normalizeOcrName(name || '');
        if (!trimmed || trimmed.length < 2) return;
        if (normalizedRegistry.has(trimmed.toLowerCase())) return;
        onAddToRoster(trimmed);
    };

    if (!adding) {
        return (
            <button onClick={() => setAdding(true)} className="md3-icon-btn bg-danger-soft text-danger hover:bg-danger-soft-strong" aria-label="Add player">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <input
                value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && normalizeOcrName(name || '')) {
                        commitAdd();
                    }
                    if (e.key === 'Escape') {
                        setAdding(false);
                        setName('');
                    }
                }}
                placeholder="Name..."
                className="md3-textfield--outlined px-2 py-0.5 text-label-sm outline-none w-24"
                list={pilotRegistry.length > 0 ? listId : undefined}
                autoFocus
            />
            {hasRosterAddAction && (
                <button
                    type="button"
                    onClick={addDraftToRoster}
                    className="px-1.5 py-0.5 rounded-md text-label-xs font-bold bg-info-soft text-info hover:bg-info-soft-strong transition-colors"
                    aria-label="Add player to roster"
                    title="Add player to roster"
                >
                    +R
                </button>
            )}
            <button onClick={commitAdd} className="md3-icon-btn w-5 h-5 text-success" aria-label="Confirm player add"><Check size={10} /></button>
            <button onClick={() => { setAdding(false); setName(''); }} className="md3-icon-btn w-5 h-5 text-danger" aria-label="Cancel player add"><X size={10} /></button>
            {pilotRegistry.length > 0 && (
                <datalist id={listId}>
                    {pilotRegistry.map((pilot) => (
                        <option key={pilot} value={pilot} />
                    ))}
                </datalist>
            )}
        </div>
    );
};

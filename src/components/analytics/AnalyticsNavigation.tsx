import React from 'react';
import { LayoutDashboard, Gauge, Users, Globe, BookOpen } from 'lucide-react';

export type AnalyticsCategory = 'overview' | 'performance' | 'team' | 'environment' | 'narrative';

interface AnalyticsNavigationProps {
    activeCategory: AnalyticsCategory;
    onSelectCategory: (category: AnalyticsCategory) => void;
}

const CATEGORIES: { id: AnalyticsCategory; label: string; icon: React.ReactNode; tone: string; activeTone: string }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} />, tone: 'text-md-sys-primary', activeTone: 'bg-md-sys-primary text-md-sys-onPrimary' },
    { id: 'performance', label: 'Performance', icon: <Gauge size={16} />, tone: 'text-success', activeTone: 'bg-success-soft text-success border border-success/25' },
    { id: 'team', label: 'Team', icon: <Users size={16} />, tone: 'text-info', activeTone: 'bg-info-soft text-info border border-info/25' },
    { id: 'environment', label: 'Environment', icon: <Globe size={16} />, tone: 'text-warning', activeTone: 'bg-warning-soft text-warning border border-warning/25' },
    { id: 'narrative', label: 'Narrative', icon: <BookOpen size={16} />, tone: 'text-accent', activeTone: 'bg-accent-soft text-accent border border-accent/25' },
];

export const AnalyticsNavigation: React.FC<AnalyticsNavigationProps> = ({ activeCategory, onSelectCategory }) => {
    return (
        <div className="md3-surface rounded-card p-1 flex gap-1 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => (
                <button
                    key={cat.id}
                    onClick={() => onSelectCategory(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-control text-label-sm font-bold uppercase tracking-wide transition-all whitespace-nowrap border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary ${
                        activeCategory === cat.id
                            ? `${cat.activeTone} shadow-sm`
                            : `text-md-sys-on-surface/72 hover:bg-md-sys-surfaceContainerHigh hover:text-md-sys-on-surface`
                    }`}
                >
                    <span className={activeCategory === cat.id ? '' : cat.tone}>{cat.icon}</span>
                    {cat.label}
                </button>
            ))}
        </div>
    );
};

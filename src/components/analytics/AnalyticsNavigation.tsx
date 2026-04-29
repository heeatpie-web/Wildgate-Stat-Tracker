import React from 'react';
import { LayoutDashboard, Gauge, Users, Globe, Target, TrendingUp } from 'lucide-react';

export type AnalyticsCategory = 'overview' | 'performance' | 'team' | 'environment' | 'entities' | 'meta';

interface AnalyticsNavigationProps {
    activeCategory: AnalyticsCategory;
    onSelectCategory: (category: AnalyticsCategory) => void;
}

const CATEGORIES: {
    id: AnalyticsCategory;
    label: string;
    icon: React.ReactNode;
    tone: 'primary' | 'success' | 'info' | 'warning' | 'accent';
    iconIdleClass: string;
}[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} aria-hidden />, tone: 'primary', iconIdleClass: 'text-md-sys-primary' },
    { id: 'performance', label: 'Performance', icon: <Gauge size={16} aria-hidden />, tone: 'success', iconIdleClass: 'text-success' },
    { id: 'team', label: 'Team', icon: <Users size={16} aria-hidden />, tone: 'info', iconIdleClass: 'text-info' },
    { id: 'environment', label: 'Environment', icon: <Globe size={16} aria-hidden />, tone: 'warning', iconIdleClass: 'text-warning' },
    { id: 'entities', label: 'Entities', icon: <Target size={16} aria-hidden />, tone: 'accent', iconIdleClass: 'text-accent' },
    { id: 'meta', label: 'Meta', icon: <TrendingUp size={16} aria-hidden />, tone: 'primary', iconIdleClass: 'text-md-sys-primary' },
];

export const AnalyticsNavigation: React.FC<AnalyticsNavigationProps> = ({ activeCategory, onSelectCategory }) => {
    return (
        <div className="at-cat-nav no-scrollbar">
            {CATEGORIES.map((cat) => {
                const active = activeCategory === cat.id;
                return (
                    <button
                        key={cat.id}
                        type="button"
                        data-active={active ? 'true' : 'false'}
                        data-tone={cat.tone}
                        onClick={() => onSelectCategory(cat.id)}
                        className="at-cat-btn px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary"
                    >
                        <span className={active ? 'text-md-sys-on-primary' : cat.iconIdleClass}>{cat.icon}</span>
                        {cat.label}
                    </button>
                );
            })}
        </div>
    );
};

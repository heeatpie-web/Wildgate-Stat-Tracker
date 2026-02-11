import React from 'react';
import { ChevronRight } from 'lucide-react';
import { VisualMode } from '../../types';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';

interface AnalyticsCardProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    onExpand?: () => void;
    visualMode: VisualMode;
    className?: string;
    accentColor?: string;
}

export const AnalyticsCard: React.FC<AnalyticsCardProps> = ({ title, icon, children, onExpand, visualMode, className = '', accentColor }) => {
    const dense = visualMode === 'dense';
    const { uiStyle } = useUserPreferences();
    const isLegacy = uiStyle === 'legacy';

    return (
        <div className={`
                relative overflow-hidden group transition-all duration-300
                ${isLegacy ? 'md3-card shadow-sm border border-md-sys-outlineVariant/45' : 'md3-card bg-gradient-to-b from-md-sys-surface to-md-sys-surfaceContainerLowest'}
                ${dense ? 'p-3 rounded-xl' : 'p-4 rounded-2xl'}
                ${onExpand ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0' : ''}
                ${className}
            `}
            onClick={onExpand}>

            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-transparent" />

            {accentColor && (
                isLegacy
                    ? <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 blur-2xl ${accentColor}`} />
                    : <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentColor} opacity-80`} />
            )}

            <div className="flex justify-between items-center mb-2.5 relative z-10">
                <div className={`flex items-center gap-2 font-bold uppercase tracking-widest text-md-sys-on-surface/60 group-hover:text-md-sys-on-surface transition-colors ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
                    <span className="opacity-80">{icon}</span>
                    <span>{title}</span>
                </div>
                {onExpand && <ChevronRight size={dense ? 12 : 14} className="opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />}
            </div>

            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
};






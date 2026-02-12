import React from 'react';
import { ChevronRight } from 'lucide-react';
import { VisualMode } from '../../types';

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

    return (
        <div className={`
                relative overflow-hidden group transition-all duration-300
                mg-surface-high
                ${dense ? 'p-3 rounded-card' : 'p-4 rounded-card'}
                ${onExpand ? 'cursor-pointer hover:shadow-lg' : ''}
                ${className}
            `}
            onClick={onExpand}>

            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-transparent" />

            {accentColor && (
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentColor} opacity-80`} />
            )}

            <div className="flex justify-between items-center mb-2.5 relative z-10">
                <div className={`flex items-center gap-2 font-bold uppercase tracking-widest text-md-sys-on-surface/60 group-hover:text-md-sys-on-surface transition-colors ${dense ? 'text-label-xs' : 'text-label-sm'}`}>
                    <span className="opacity-60">{icon}</span>
                    <span>{title}</span>
                </div>
                {onExpand && <ChevronRight size={dense ? 12 : 14} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />}
            </div>

            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
};






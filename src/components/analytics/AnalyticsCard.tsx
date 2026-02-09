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
        <div className={`bg-md-sys-surface2 rounded-2xl relative overflow-hidden border border-white/5 shadow-sm group transition-all ${dense ? 'p-3' : 'p-6'} ${onExpand ? 'cursor-pointer hover:scale-[1.01] hover:border-md-sys-primary/20' : ''} ${className}`}
            onClick={onExpand}>
            {accentColor && <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 blur-2xl ${accentColor}`}></div>}
            <div className="flex justify-between items-center mb-2">
                <div className={`flex items-center gap-2 font-black uppercase tracking-widest opacity-60 ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
                    {icon} {title}
                </div>
                {onExpand && <ChevronRight size={dense ? 12 : 14} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />}
            </div>
            {children}
        </div>
    );
};

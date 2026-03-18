import React from 'react';
import { ChevronRight, Pin } from 'lucide-react';
import { VisualMode } from '../../types';

interface AnalyticsCardProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    onExpand?: () => void;
    visualMode: VisualMode;
    className?: string;
    accentColor?: string;
    variant?: 'glass' | 'solid' | 'flat';
    pinId?: string;
    isPinned?: boolean;
    onTogglePin?: (id: string) => void;
}

export const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
    title,
    icon,
    children,
    onExpand,
    visualMode,
    className = '',
    accentColor,
    variant = 'glass',
    pinId,
    isPinned,
    onTogglePin,
}) => {
    const dense = visualMode === 'dense';

    const getVariantClasses = () => {
        switch (variant) {
            case 'solid':
                return 'md3-surface';
            case 'flat':
                return 'bg-transparent border border-md-sys-outlineVariant/50';
            case 'glass':
            default:
                return 'mg-surface-high';
        }
    };

    const getPaddingClasses = () => {
        if (dense) {
            // Tighter padding for non-glass variants in dense mode
            return variant === 'glass' ? 'p-3' : 'p-2.5';
        }
        return 'p-4';
    };

    return (
        <div className={`
                relative overflow-hidden group transition-all duration-300
                ${getVariantClasses()}
                ${getPaddingClasses()} rounded-card
                ${onExpand ? 'cursor-pointer hover:shadow-lg' : ''}
                ${className}
            `}
            onClick={onExpand}>

            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-transparent" />

            {accentColor && (
                <div className={`absolute left-0 top-0 bottom-0 w-3px ${accentColor} opacity-80`} />
            )}

            <div className="flex justify-between items-center mb-2.5 relative z-10">
                <div className={`flex items-center gap-2 font-bold uppercase tracking-widest text-md-sys-on-surface/60 group-hover:text-md-sys-on-surface transition-colors ${dense ? 'text-label-xs' : 'text-label-sm'}`}>
                    <span className="opacity-60">{icon}</span>
                    <span>{title}</span>
                </div>
                {pinId && (
                    <button
                        data-no-pin
                        aria-label={isPinned ? 'Unpin tile' : 'Pin tile for export'}
                        onClick={(e) => { e.stopPropagation(); onTogglePin?.(pinId); }}
                        className={`flex items-center justify-center transition-colors ${isPinned ? 'text-md-sys-primary' : 'text-md-sys-on-surface/30 hover:text-md-sys-on-surface/70'}`}
                    >
                        <Pin
                            size={dense ? 12 : 14}
                            fill={isPinned ? 'currentColor' : 'none'}
                        />
                    </button>
                )}
                {onExpand && <ChevronRight size={dense ? 12 : 14} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />}
            </div>

            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
};






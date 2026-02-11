import React, { useMemo } from 'react';
import { Match, VisualMode, MomentumData, SessionSummaryData, PeriodComparisonData, TimePatternData, KillEfficiencyData } from '../../types';
import { synthesizeNarrative, type EssaySection } from '../../utils/analyticsEditorial';
import { TrendingUp, TrendingDown, Minus, BookOpen } from 'lucide-react';
import { SparklineWidget } from './SparklineWidget';

interface VisualEssayViewProps {
    matches: Match[];
    winRate: number;
    currentStreak: number;
    momentum: MomentumData;
    sessionSummary: SessionSummaryData;
    periodComparison: PeriodComparisonData;
    timePatterns: TimePatternData;
    killEfficiency: KillEfficiencyData;
    socialData: { teammates: [string, { wins: number; total: number }][]; opponents: [string, { wins: number; total: number }][] };
    synergyMatrix: Record<string, Record<string, { wins: number; total: number }>>;
    visualMode: VisualMode;
}

const TrendIcon: React.FC<{ trend?: 'up' | 'down' | 'stable' }> = ({ trend }) => {
    if (trend === 'up') return <TrendingUp size={12} className="text-green-400" />;
    if (trend === 'down') return <TrendingDown size={12} className="text-red-400" />;
    return <Minus size={12} className="opacity-30" />;
};

const SectionCard: React.FC<{ section: EssaySection; index: number }> = ({ section, index }) => (
    <div className="md3-card rounded-2xl p-6 space-y-4 animate-fade-in" style={{ animationDelay: `${index * 80}ms` }}>
        <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-md-sys-primary/20 flex items-center justify-center text-md-sys-primary text-[10px] font-black">
                {index + 1}
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wide">{section.title}</h3>
        </div>

        <p className="text-sm leading-relaxed opacity-70">{section.body}</p>

        {section.metrics && section.metrics.length > 0 && (
            <div className="flex gap-3 pt-2 border-t border-md-sys-outlineVariant/30">
                {section.metrics.map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5 md3-surface-high px-3 py-1.5 rounded-lg">
                        <TrendIcon trend={m.trend} />
                        <span className="text-xs font-bold">{m.value}</span>
                        <span className="text-[9px] opacity-40 uppercase">{m.label}</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export const VisualEssayView: React.FC<VisualEssayViewProps> = ({
    matches, winRate, currentStreak, momentum, sessionSummary,
    periodComparison, timePatterns, killEfficiency, socialData,
    synergyMatrix, visualMode,
}) => {
    const essay = useMemo(() => synthesizeNarrative({
        matches, winRate, currentStreak, momentum, sessionSummary,
        periodComparison, timePatterns, killEfficiency, socialData, synergyMatrix,
    }), [matches, winRate, currentStreak, momentum, sessionSummary, periodComparison, timePatterns, killEfficiency, socialData, synergyMatrix]);

    const momentumSparkline = useMemo(() =>
        (momentum?.timeline || []).map(p => ({ value: p.score })),
    [momentum]);

    const dense = visualMode === 'dense';

    return (
        <div className={`flex flex-col gap-4 overflow-y-auto custom-scrollbar pb-8 ${dense ? 'max-w-4xl' : 'max-w-3xl'} mx-auto`}>
            {/* Hero Header */}
            <div className="bg-gradient-to-br from-md-sys-primary/10 to-transparent rounded-2xl border border-md-sys-primary/20 p-6 text-center space-y-2">
                <BookOpen size={24} className="mx-auto text-md-sys-primary opacity-60" />
                <h1 className="text-xl font-black uppercase tracking-tight">{essay.headline}</h1>
                <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold">
                    {matches.length} matches analyzed
                </p>
                {momentumSparkline.length > 3 && (
                    <div className="flex justify-center pt-2 w-48 mx-auto">
                        <SparklineWidget data={momentumSparkline} height={32} color="var(--color-accent)" />
                    </div>
                )}
            </div>

            {/* Essay Sections */}
            {essay.sections.map((section, i) => (
                <SectionCard key={section.id} section={section} index={i} />
            ))}

            {/* Footer */}
            <div className="text-center text-[9px] uppercase tracking-widest opacity-20 font-bold py-4">
                End of Analysis
            </div>
        </div>
    );
};





import React from 'react';
import { Match, Insight, DrillDownTarget, VisualMode } from '../../types';
import { RelationshipInsight } from '../../utils/analytics';
import { Skull, Handshake, Ghost, Swords, Users, Rocket, Lightbulb, Crown, Flame, Zap, User, Target, AlertTriangle } from 'lucide-react';
import { TiltMeter } from '../TiltMeter';
import { getInsightToneClasses } from './insightTone';

const getIconComponent = (type: Insight['iconType']) => {
    switch (type) {
        case 'Rocket': return <Rocket size={20} />;
        case 'Crown': return <Crown size={20} />;
        case 'Flame': return <Flame size={20} />;
        case 'Zap': return <Zap size={20} />;
        case 'Users': return <Users size={20} />;
        case 'User': return <User size={20} />;
        case 'Skull': return <Skull size={20} />;
        case 'Target': return <Target size={20} />;
        case 'Crosshair': return <Swords size={20} />;
        case 'AlertTriangle': return <AlertTriangle size={20} />;
        case 'Ghost': return <Ghost size={20} />;
        default: return <Lightbulb size={20} />;
    }
};

interface InsightsViewProps {
    insights: Insight[];
    relationshipInsights: RelationshipInsight[];
    filteredMatches: Match[];
    onDrillDown: (name: string, type: DrillDownTarget['type']) => void;
    visualMode: VisualMode;
}

export const InsightsView: React.FC<InsightsViewProps> = ({ insights, relationshipInsights, filteredMatches, onDrillDown, visualMode }) => {
    const dense = visualMode === 'dense';
    const enrichedInsights = insights.map(insight => ({ ...insight, icon: getIconComponent(insight.iconType) }));

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            {relationshipInsights.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-body font-black uppercase opacity-60 mb-4 flex items-center gap-2">
                        <Users size={16} /> Player Relationships
                    </h3>
                    <div className={`grid gap-4 ${dense ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
                        {relationshipInsights.map((rel, i) => (
                            <div key={i} onClick={() => onDrillDown(rel.playerName, rel.type === 'ally' ? 'Teammate' : 'Opponent')}
                                className={`md3-card rounded-2xl relative overflow-hidden transition-all cursor-pointer hover:border-md-sys-primary/20 ${dense ? 'p-4' : 'p-6'}`}>
                                <div className={`absolute -top-4 -right-4 w-20 h-20 opacity-10 rounded-full blur-2xl ${
                                    rel.type === 'nemesis' ? 'bg-danger' : rel.type === 'ally' ? 'bg-success' : rel.type === 'stalker' ? 'bg-accent' : 'bg-warning'
                                }`}></div>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-on-scrim mb-3 ${
                                    rel.type === 'nemesis' ? 'bg-danger' : rel.type === 'ally' ? 'bg-success' : rel.type === 'stalker' ? 'bg-accent' : 'bg-warning'
                                }`}>
                                    {rel.type === 'nemesis' ? <Skull size={18} /> : rel.type === 'ally' ? <Handshake size={18} /> : rel.type === 'stalker' ? <Ghost size={18} /> : <Swords size={18} />}
                                </div>
                                <div className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-0.5">
                                    {rel.type === 'nemesis' ? 'Nemesis' : rel.type === 'ally' ? 'Loyal Ally' : rel.type === 'stalker' ? 'Stalker' : 'Frenemy'}
                                </div>
                                <div className={`font-black leading-tight truncate ${dense ? 'text-lg' : 'text-xl'}`}>{rel.playerName}</div>
                                <div className="text-label-sm font-bold opacity-40">{rel.encounters} encounters</div>
                                {rel.topShip && (
                                    <div className="text-label-xs font-black opacity-40 mt-1 flex items-center gap-1">
                                        <Rocket size={10} className="text-md-sys-primary" /> {rel.topShip}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className={`grid gap-4 pb-4 ${dense ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                {enrichedInsights.map((stat, i) => {
                    const toneClasses = getInsightToneClasses(stat.tone);
                    return (
                        <div key={i} className={`md3-card relative overflow-hidden transition-all cursor-pointer group rounded-2xl hover:border-md-sys-primary/20 ${dense ? '!p-6' : '!p-8'}`}>
                            <div className={`absolute -top-6 -right-6 w-32 h-32 opacity-10 rounded-full ${toneClasses.glowBg} blur-2xl`}></div>
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${toneClasses.badgeBg} ${toneClasses.badgeText}`}>{stat.icon}</div>
                        <div className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-1">{stat.title}</div>
                        <div className="text-label-sm font-bold uppercase opacity-40 mb-4">{stat.subtitle}</div>
                        <div className={`font-black leading-tight mb-2 tracking-tight ${dense ? 'text-2xl' : 'text-3xl'}`}>{stat.value}</div>
                        <div className="text-label-sm font-bold px-2 py-1 md3-surface-low rounded-lg inline-block">{stat.subValue}</div>
                        </div>
                    );
                })}
                {enrichedInsights.length === 0 && relationshipInsights.length === 0 && (
                    <div className="col-span-full text-center opacity-60 text-body font-bold uppercase p-12">Not enough data to generate insights.</div>
                )}
            </div>
            <div className="md3-card rounded-2xl p-6">
                <TiltMeter recentMatches={filteredMatches.slice(-5)} />
            </div>
        </div>
    );
};






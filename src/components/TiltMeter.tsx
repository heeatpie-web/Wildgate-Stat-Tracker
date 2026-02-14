import React from 'react';
import { Match } from '../types';
import { Activity, Zap } from 'lucide-react';

interface TiltMeterProps {
    recentMatches: Match[];
}

export const TiltMeter: React.FC<TiltMeterProps> = ({ recentMatches }) => {
    // Calculate Tilt Score
    // 0 = Zen, 100 = Raging
    // Factors:
    // - Recent Losses (high weight)
    // - Short Match Duration on Loss (high weight - "rage quit" or fast death)
    // - High Damage Taken on Loss (frustration)
    
    let tiltScore = 0;
    let explanation = "Stable";
    
    // Sort recent matches by time (newest first)
    const matches = [...recentMatches].sort((a,b) => b.timestamp - a.timestamp);
    
    if (matches.length > 0) {
        // Consecutive Losses
        let lossStreak = 0;
        for (const m of matches) {
            if (m.result === 'Loss') lossStreak++;
            else break;
        }
        
        tiltScore += lossStreak * 20;

        // Quick Deaths? (Time < 2 mins)
        const quickDeaths = matches.filter(m => m.result === 'Loss' && m.time && parseInt(m.time.split(':')[0]) < 2).length;
        tiltScore += quickDeaths * 15;
    }

    tiltScore = Math.min(100, Math.max(0, tiltScore));

    if (tiltScore > 80) explanation = "CRITICAL TILT";
    else if (tiltScore > 60) explanation = "High Frustration";
    else if (tiltScore > 40) explanation = "Agitated";
    else if (tiltScore > 20) explanation = "Focused";
    else explanation = "Zen Master";

    const color = tiltScore > 80 ? 'bg-danger' : tiltScore > 50 ? 'bg-warning' : tiltScore > 20 ? 'bg-warning' : 'bg-success';

    return (
        <div className="md3-card p-6 rounded-xl flex items-center gap-6 shadow-lg border border-md-sys-outline/10">
            <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-md-sys-surface3" />
                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={`${tiltScore * 2.51} 251`} className={tiltScore > 80 ? "text-danger" : "text-success"} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black">{tiltScore}%</span>
                    <span className="text-label-xs font-bold uppercase opacity-60">Tilt</span>
                </div>
            </div>
            
            <div className="flex-1">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-body font-bold uppercase flex items-center gap-2"><Zap size={16}/> Mental State Analysis</h3>
                    <span className={`px-3 py-1 rounded-full text-label-sm font-bold uppercase text-on-scrim ${color}`}>{explanation}</span>
                </div>
                <div className="text-label-sm opacity-60 leading-relaxed font-medium">
                    {tiltScore > 50 
                        ? "Warning: Performance decay detected. Recent rapid losses indicate high frustration risk. Recommended: 5m break."
                        : "Mental state is optimal. Recent performance indicates stable focus and decision making."}
                </div>
            </div>
        </div>
    );
};



import React, { useMemo } from 'react';
import { Match } from '../types';

interface RivalryGraphProps {
  matches: Match[];
  currentUser: string;
}

export const RivalryGraph: React.FC<RivalryGraphProps> = ({ matches, currentUser }) => {
  // 1. Process Data
  const { nodes, links } = useMemo(() => {
    const playerCounts: Record<string, { wins: number, total: number }> = {};
    
    matches.forEach(m => {
      const allParticipants = [...m.teammates, ...m.opponents].filter(p => p !== currentUser);
      allParticipants.forEach(p => {
        if (!playerCounts[p]) playerCounts[p] = { wins: 0, total: 0 };
        playerCounts[p].total++;
        // "Win" here means "My Win Rate against/with them" context
        // If opponent: My Win = I beat them.
        // If teammate: My Win = We won together.
        if (m.result === 'Win') playerCounts[p].wins++;
      });
    });

    const topRivals = Object.entries(playerCounts)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 12); // Top 12 interactions

    // Simple Circular Layout
    const center = { x: 300, y: 300 };
    const radius = 200;
    
    const nodes = topRivals.map(([name, stats], i) => {
      const angle = (i / topRivals.length) * 2 * Math.PI;
      return {
        id: name,
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
        stats
      };
    });

    // Links (Connections to Center/Me)
    const links = nodes.map(n => ({
      source: center,
      target: { x: n.x, y: n.y },
      weight: n.stats.total,
      winRate: n.stats.wins / n.stats.total
    }));

    return { nodes, links, center };
  }, [matches, currentUser]);

  if (nodes.length === 0) return <div className="text-center p-10 opacity-40 uppercase font-black text-label-sm">No rivalry data yet</div>;

  return (
    <div className="w-full h-[600px] flex items-center justify-center md3-card rounded-2xl overflow-hidden relative">
      <h3 className="absolute top-6 left-6 text-label-sm font-black uppercase opacity-60">Rivalry Network</h3>
      <svg width="600" height="600" viewBox="0 0 600 600" className="w-full h-full max-w-[600px] max-h-[600px]">
        {/* Links */}
        {links.map((link, i) => (
          <line 
            key={i}
            x1={link.source.x} y1={link.source.y}
            x2={link.target.x} y2={link.target.y}
            stroke={link.winRate > 0.5 ? 'var(--color-success)' : 'var(--color-danger)'}
            strokeWidth={Math.max(1, Math.min(10, link.weight / 2))}
            strokeOpacity="0.4"
          />
        ))}

        {/* Center Node (Me) */}
        <circle cx={300} cy={300} r={40} fill="var(--md-sys-color-primary)" />
        <text x={300} y={300} dy="5" textAnchor="middle" fill="var(--md-sys-color-on-primary)" fontSize="14" fontWeight="900">ME</text>

        {/* Rival Nodes */}
        {nodes.map(n => (
          <g key={n.id} className="cursor-pointer hover:opacity-80 transition-opacity">
            <circle 
              cx={n.x} cy={n.y} 
              r={Math.max(20, Math.min(50, n.stats.total * 3))} 
              fill="var(--md-sys-color-surface1)" 
              stroke={n.stats.wins / n.stats.total > 0.5 ? 'var(--color-success)' : 'var(--color-danger)'} 
              strokeWidth="4"
            />
            <text x={n.x} y={n.y} dy="-10" textAnchor="middle" fill="var(--md-sys-color-on-surface)" fontSize="10" fontWeight="900" className="uppercase">{n.id}</text>
            <text x={n.x} y={n.y} dy="5" textAnchor="middle" fill="var(--md-sys-color-on-surface)" fontSize="9" opacity="0.6" fontWeight="bold">{n.stats.total} Games</text>
            <text x={n.x} y={n.y} dy="18" textAnchor="middle" fill={n.stats.wins / n.stats.total > 0.5 ? 'var(--color-success)' : 'var(--color-danger)'} fontSize="9" fontWeight="900">{Math.round((n.stats.wins/n.stats.total)*100)}% WR</text>
          </g>
        ))}
      </svg>
    </div>
  );
};



import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Match, SHIPS, Language, getShipColor, CHARACTERS, UI_REACH_MODIFIERS, PIE_COLORS } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, LineChart, Line, AreaChart, Area } from 'recharts';
import { Flame, Swords, Heart, Skull, Trophy, Lightbulb, ChevronUp, X, Activity, Crown, BarChart3, TrendingUp, Calendar, Zap, Users, Rocket, ChevronRight, User, Clock, Target, PieChart as PieIcon, Minus, Plus, List, ShieldCheck, Moon, Sun, Ghost, Crosshair, Handshake } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';

interface AnalyticsPanelProps {
  matches: Match[];
  currentMode: string;
  language: Language;
}

const getColor = (name: string) => {
    if (!name) return PIE_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % PIE_COLORS.length);
    return PIE_COLORS[index];
};

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ matches, currentMode, language }) => {
  const t = TRANSLATIONS[language];
  const [viewMode, setViewMode] = useState<'Standard' | 'Pro' | 'Insights' | 'Social'>('Standard');
  const [drillDownTarget, setDrillDownTarget] = useState<{ type: 'Ship' | 'Hero' | 'Teammate' | 'Artifact' | 'KPI', name: string } | null>(null);

  // Pro View State
  const [proResultType, setProResultType] = useState<'Win' | 'Loss' | 'All'>('All');
  const [proMetric, setProMetric] = useState('ship_usage');
  const [proChartType, setProChartType] = useState<'pie' | 'bar' | 'line'>('bar');

  const filteredMatches = useMemo(() => matches.filter(m => m.mode === currentMode).sort((a, b) => a.timestamp - b.timestamp), [matches, currentMode]);
  
  const winRate = useMemo(() => {
    if (filteredMatches.length === 0) return 0;
    return Math.round((filteredMatches.filter(m => m.result === 'Win').length / filteredMatches.length) * 100);
  }, [filteredMatches]);

  const currentStreak = useMemo(() => {
    const reversed = [...filteredMatches].reverse();
    let streak = 0;
    for (const m of reversed) { if (m.result === 'Win') streak++; else break; }
    return streak;
  }, [filteredMatches]);

  const insights = useMemo(() => {
      if (filteredMatches.length < 2) return [];
      const res: any[] = [];
      const wins = filteredMatches.filter(m => m.result === 'Win');
      
      // 1. The Specialist (Most Piloted)
      const shipCounts: Record<string, number> = {};
      filteredMatches.forEach(m => { const s = (m.ship || 'Unknown').split('(')[0]; shipCounts[s] = (shipCounts[s]||0)+1; });
      const topShip = Object.entries(shipCounts).sort((a,b)=>b[1]-a[1])[0];
      if(topShip) res.push({ title: "The Specialist", subtitle: "Most Piloted Vessel", value: topShip[0], subValue: `${topShip[1]} Sorties`, color: "bg-blue-500", icon: <Rocket/>, priority: 10 });

      // 2. Ace Pilot (Best Hero WR)
      const heroStats: Record<string, {wins: number, total: number}> = {};
      filteredMatches.forEach(m => { const h = m.hero || 'Unknown'; if(!heroStats[h]) heroStats[h] = {wins:0, total:0}; heroStats[h].total++; if(m.result === 'Win') heroStats[h].wins++; });
      const topHero = Object.entries(heroStats).filter(([_, s]) => s.total >= 3).sort((a,b) => (b[1].wins/b[1].total) - (a[1].wins/a[1].total))[0];
      if(topHero) res.push({ title: "Ace Pilot", subtitle: "Best Hero Win Rate", value: topHero[0], subValue: `${Math.round((topHero[1].wins/topHero[1].total)*100)}% Win Rate`, color: "bg-green-500", icon: <Crown/>, priority: 20 });

      // 3. Top Gun (Highest Damage)
      const topDmg = [...filteredMatches].sort((a,b) => (b.damageTaken||0) - (a.damageTaken||0))[0];
      if(topDmg && (topDmg.damageTaken||0) > 500) res.push({ title: "Top Gun", subtitle: "Highest Damage Record", value: `${topDmg.damageTaken} DMG`, subValue: `${(topDmg.ship||'').split('(')[0]}`, color: "bg-red-500", icon: <Flame/>, priority: 15 });

      // 4. Blitz (Fastest Win)
      const fastWin = [...wins].filter(m => m.time && m.time.includes(':')).sort((a,b) => {
          const [am, as] = (a.time||'99:99').split(':').map(Number);
          const [bm, bs] = (b.time||'99:99').split(':').map(Number);
          return (am*60+as) - (bm*60+bs);
      })[0];
      if(fastWin) res.push({ title: "Blitz", subtitle: "Fastest Victory", value: fastWin.time, subValue: `${(fastWin.ship||'').split('(')[0]}`, color: "bg-yellow-500", icon: <Zap/>, priority: 25 });

      // 5. Snail (Slowest Win)
      const slowWin = [...wins].filter(m => m.time && m.time.includes(':')).sort((a,b) => {
          const [am, as] = (a.time||'00:00').split(':').map(Number);
          const [bm, bs] = (b.time||'00:00').split(':').map(Number);
          return (bm*60+bs) - (am*60+as);
      })[0];
      if(slowWin) res.push({ title: "The Grinder", subtitle: "Longest Victory", value: slowWin.time, subValue: "Endurance Test", color: "bg-slate-500", icon: <Clock/>, priority: 5 });

      // 6. Objective Master (Max POIs)
      const maxPoi = [...filteredMatches].sort((a,b) => ((b.poiEasy||0)+(b.poiMedium||0)+(b.poiEpic||0)) - ((a.poiEasy||0)+(a.poiMedium||0)+(a.poiEpic||0)))[0];
      const totalPoi = (maxPoi?.poiEasy||0)+(maxPoi?.poiMedium||0)+(maxPoi?.poiEpic||0);
      if(maxPoi && totalPoi > 5) res.push({ title: "Objective Master", subtitle: "Most POIs Secured", value: `${totalPoi} Captures`, subValue: "Tactical Genius", color: "bg-teal-500", icon: <Target/>, priority: 18 });

      // 7. Flawless (0 Damage Win)
      const flawless = wins.find(m => (m.damageTaken||0) === 0);
      if(flawless) res.push({ title: "Flawless", subtitle: "Zero Damage Victory", value: "Untouchable", subValue: `${(flawless.ship||'').split('(')[0]}`, color: "bg-cyan-400", icon: <ShieldCheck/>, priority: 50 });

      // 8. Pacifist (0 Kills Win)
      const pacifist = wins.find(m => Object.values(m.kills||{}).reduce((a,b)=>a+b,0) === 0);
      if(pacifist) res.push({ title: "Pacifist", subtitle: "Zero Kill Victory", value: "Peacekeeper", subValue: "Diplomatic Win", color: "bg-indigo-400", icon: <Ghost/>, priority: 30 });

      // 9. Warlord (>5 Kills Win)
      const warlord = wins.find(m => Object.values(m.kills||{}).reduce((a,b)=>a+b,0) >= 5);
      if(warlord) res.push({ title: "Warlord", subtitle: "High Kill Count", value: `${Object.values(warlord.kills||{}).reduce((a,b)=>a+b,0)} Eliminations`, subValue: "Ace Status", color: "bg-red-600", icon: <Crosshair/>, priority: 30 });

      // 10. Night Owl / Early Bird
      const hours = wins.map(m => new Date(m.timestamp).getHours());
      const nightWins = hours.filter(h => h >= 22 || h < 4).length;
      const morningWins = hours.filter(h => h >= 4 && h < 10).length;
      if(nightWins > 2 && nightWins > wins.length * 0.4) res.push({ title: "Night Owl", subtitle: "Late Night Dominance", value: `${nightWins} Wins`, subValue: "After Hours", color: "bg-indigo-900", icon: <Moon/>, priority: 12 });
      if(morningWins > 2 && morningWins > wins.length * 0.4) res.push({ title: "Early Bird", subtitle: "Morning Routine", value: `${morningWins} Wins`, subValue: "Rise & Grind", color: "bg-orange-400", icon: <Sun/>, priority: 12 });

      return res.sort((a,b) => b.priority - a.priority);
  }, [filteredMatches]);

  const socialData = useMemo(() => {
      const teammates: Record<string, { wins: number, total: number }> = {};
      const opponents: Record<string, { wins: number, total: number }> = {};

      filteredMatches.forEach(m => {
          m.teammates.forEach(t => {
              if (!teammates[t]) teammates[t] = { wins: 0, total: 0 };
              teammates[t].total++;
              if (m.result === 'Win') teammates[t].wins++;
          });
          m.opponents.forEach(o => {
              if (!opponents[o]) opponents[o] = { wins: 0, total: 0 };
              opponents[o].total++;
              if (m.result === 'Win') opponents[o].wins++;
          });
      });

      const sortFn = (a: any, b: any) => b[1].total - a[1].total; // Sort by encounters
      
      return {
          teammates: Object.entries(teammates).sort(sortFn).slice(0, 10),
          opponents: Object.entries(opponents).sort(sortFn).slice(0, 10)
      };
  }, [filteredMatches]);

  const getProData = useMemo(() => {
      const targetMatches = proResultType === 'All' ? filteredMatches : filteredMatches.filter(m => m.result === proResultType);
      
      if (proChartType === 'line') {
          // Identify Top Entities first
          let topEntities: string[] = [];
          if (proMetric.includes('ship')) {
              const counts: Record<string, number> = {};
              targetMatches.forEach(m => { const s = (m.ship||'Unknown').split('(')[0]; counts[s] = (counts[s]||0)+1; });
              topEntities = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 5).map(e=>e[0]);
          } else if (proMetric.includes('hero')) {
              const counts: Record<string, number> = {};
              targetMatches.forEach(m => { const h = m.hero||'Unknown'; counts[h] = (counts[h]||0)+1; });
              topEntities = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 5).map(e=>e[0]);
          } else if (proMetric.includes('teammate')) {
              const counts: Record<string, number> = {};
              targetMatches.forEach(m => (m.teammates||[]).forEach(t => counts[t] = (counts[t]||0)+1));
              topEntities = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 10).map(e=>e[0]);
          } else if (proMetric.includes('opponent')) {
              const counts: Record<string, number> = {};
              targetMatches.forEach(m => (m.opponents||[]).forEach(t => counts[t] = (counts[t]||0)+1));
              topEntities = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 10).map(e=>e[0]);
          } else if (proMetric.includes('artifact')) {
               const counts: Record<string, number> = {};
               targetMatches.filter(m => m.subType === 'Artifact').forEach(m => {
                   const type = (m.reachModifiers||[]).find(r => r.startsWith('Artifact:'))?.split(': ')[1] || 'Unknown';
                   counts[type] = (counts[type]||0)+1;
               });
               topEntities = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 5).map(e=>e[0]);
          }

          const dailyData: Record<string, any> = {};
          
          targetMatches.forEach(m => {
              const date = new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              if (!dailyData[date]) dailyData[date] = { name: date };
              
              const relevantEntities = [];
              if (proMetric.includes('ship')) relevantEntities.push((m.ship||'Unknown').split('(')[0]);
              else if (proMetric.includes('hero')) relevantEntities.push(m.hero||'Unknown');
              else if (proMetric.includes('teammate')) relevantEntities.push(...(m.teammates||[]));
              else if (proMetric.includes('opponent')) relevantEntities.push(...(m.opponents||[]));
              else if (proMetric.includes('artifact') && m.subType==='Artifact') {
                  relevantEntities.push((m.reachModifiers||[]).find(r => r.startsWith('Artifact:'))?.split(': ')[1] || 'Unknown');
              }

              relevantEntities.forEach(ent => {
                  if (topEntities.includes(ent)) {
                       if (proMetric.includes('win_rate')) {
                           if(!dailyData[date][ent]) dailyData[date][ent] = 0;
                           if (m.result === 'Win') dailyData[date][ent] += 1;
                       } else if (proMetric.includes('damage')) {
                           if(!dailyData[date][ent]) dailyData[date][ent] = {sum:0, count:0};
                           dailyData[date][ent].sum += m.damageTaken || 0;
                           dailyData[date][ent].count++;
                       } else {
                           if(!dailyData[date][ent]) dailyData[date][ent] = 0;
                           dailyData[date][ent] += 1;
                       }
                  }
              });
          });

          const finalData = Object.values(dailyData).map((d: any) => {
              const newD = { ...d };
              if (proMetric.includes('damage')) {
                  topEntities.forEach(e => {
                      if(newD[e]) newD[e] = Math.round(newD[e].sum / newD[e].count);
                      else newD[e] = 0;
                  });
              }
              topEntities.forEach(e => { if(newD[e] === undefined) newD[e] = 0; });
              return newD;
          });

          return { data: finalData, keys: topEntities };
      }

      let data: { name: string; value: number; count?: number }[] = [];

      if (proMetric === 'ship_usage') {
          const counts: Record<string, number> = {};
          targetMatches.forEach(m => { const s = (m.ship||'Unknown').split('(')[0]; counts[s] = (counts[s] || 0) + 1; });
          data = Object.entries(counts).map(([name, value]) => ({ name, value }));
      } else if (proMetric === 'hero_usage') {
          const counts: Record<string, number> = {};
          targetMatches.forEach(m => { const h = m.hero||'Unknown'; counts[h] = (counts[h] || 0) + 1; });
          data = Object.entries(counts).map(([name, value]) => ({ name, value }));
      } else if (proMetric === 'teammate_usage') {
          const counts: Record<string, number> = {};
          targetMatches.forEach(m => (m.teammates||[]).forEach(tm => counts[tm] = (counts[tm] || 0) + 1));
          data = Object.entries(counts).map(([name, value]) => ({ name, value }));
      } else if (proMetric === 'opponent_usage') {
          const counts: Record<string, number> = {};
          targetMatches.forEach(m => (m.opponents||[]).forEach(op => counts[op] = (counts[op] || 0) + 1));
          data = Object.entries(counts).map(([name, value]) => ({ name, value }));
      } else if (proMetric === 'win_rate_ship') {
          const stats: Record<string, { wins: number, total: number }> = {};
          filteredMatches.forEach(m => {
              const name = (m.ship||'Unknown').split('(')[0];
              if (!stats[name]) stats[name] = { wins: 0, total: 0 };
              stats[name].total++;
              if (m.result === 'Win') stats[name].wins++;
          });
          data = Object.entries(stats).map(([name, s]) => ({ name, value: Math.round((s.wins / s.total) * 100), count: s.total }));
      } else if (proMetric === 'win_rate_artifact') {
           const stats: Record<string, { wins: number, total: number }> = {};
           filteredMatches.filter(m => m.subType === 'Artifact').forEach(m => {
               const artifact = (m.reachModifiers||[]).find(r => r.startsWith('Artifact:'))?.split(': ')[1] || 'Unknown';
               if (!stats[artifact]) stats[artifact] = { wins: 0, total: 0 };
               stats[artifact].total++;
               if (m.result === 'Win') stats[artifact].wins++;
           });
           data = Object.entries(stats).map(([name, s]) => ({ name, value: Math.round((s.wins / s.total) * 100), count: s.total }));
      } else if (proMetric === 'avg_damage_ship') {
          const stats: Record<string, { totalDmg: number, count: number }> = {};
          targetMatches.forEach(m => {
               const name = (m.ship||'Unknown').split('(')[0];
               if (!stats[name]) stats[name] = { totalDmg: 0, count: 0 };
               stats[name].totalDmg += m.damageTaken || 0;
               stats[name].count++;
          });
          data = Object.entries(stats).map(([name, s]) => ({ name, value: Math.round(s.totalDmg / s.count) }));
      }

      return data.sort((a, b) => b.value - a.value).slice(0, 15); 
  }, [filteredMatches, proResultType, proMetric, proChartType]);

  const renderProView = () => {
      const isLine = proChartType === 'line';
      const chartData = isLine ? (getProData as any).data : (Array.isArray(getProData) ? getProData : []);
      const lineKeys = isLine ? (getProData as any).keys : [];

      return (
        <div className="md-card !p-6 flex flex-col gap-6 animate-fade-in h-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex bg-md-sys-surface2 p-1.5 rounded-2xl">
                    <button onClick={() => setProChartType('bar')} className={`p-2 rounded-xl ${proChartType === 'bar' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:bg-md-sys-surface3'}`}><BarChart3 size={20}/></button>
                    <button onClick={() => setProChartType('pie')} className={`p-2 rounded-xl ${proChartType === 'pie' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:bg-md-sys-surface3'}`}><PieIcon size={20}/></button>
                    <button onClick={() => setProChartType('line')} className={`p-2 rounded-xl ${proChartType === 'line' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:bg-md-sys-surface3'}`}><TrendingUp size={20}/></button>
                </div>
                
                <div className="flex overflow-x-auto gap-2 max-w-full pb-2 md:pb-0 custom-scrollbar">
                     {['ship_usage', 'hero_usage', 'teammate_usage', 'opponent_usage', 'win_rate_ship', 'win_rate_artifact', 'avg_damage_ship'].map(m => {
                         let label = m.replace(/_/g, ' ');
                         if (proResultType === 'Loss') {
                             label = label.replace('win rate', 'loss rate');
                         }
                         return (
                             <button key={m} onClick={() => setProMetric(m)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap border-2 transition-all ${proMetric === m ? 'bg-md-sys-primary-container border-md-sys-primary text-md-sys-onPrimaryContainer' : 'bg-md-sys-surface2 border-transparent hover:bg-md-sys-surface3'}`}>
                                 {label}
                             </button>
                         );
                     })}
                </div>

                <div className="flex bg-md-sys-surface2 p-1 rounded-xl">
                    <button onClick={() => setProResultType('Win')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${proResultType === 'Win' ? 'bg-green-600 text-white shadow-lg' : 'opacity-60 hover:opacity-100'}`}>Victories</button>
                    <button onClick={() => setProResultType('Loss')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${proResultType === 'Loss' ? 'bg-red-600 text-white shadow-lg' : 'opacity-60 hover:opacity-100'}`}>Defeats</button>
                    <button onClick={() => setProResultType('All')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${proResultType === 'All' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-60 hover:opacity-100'}`}>All</button>
                </div>
            </div>

            <div className="flex-1 min-h-[400px] w-full bg-md-sys-surface2 rounded-[32px] p-8 border border-md-sys-outline/5 shadow-inner">
                 <ResponsiveContainer width="100%" height="100%">
                     {proChartType === 'bar' ? (
                         <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 40, top: 20, bottom: 20 }}>
                             <CartesianGrid strokeOpacity={0.1} horizontal={false}/>
                             <XAxis type="number" hide/>
                             <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11, fontWeight: 'bold'}} interval={0}/>
                             <Tooltip cursor={{fill: 'var(--md-sys-color-surface3)', opacity: 0.4}} contentStyle={{backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'}}/>
                             <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                                {chartData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={getColor(String(entry.name || ''))} />)}
                                <LabelList dataKey="value" position="right" style={{fontSize: 12, fontWeight: 'bold', fill: 'var(--md-sys-color-on-surface)'}} />
                             </Bar>
                         </BarChart>
                     ) : proChartType === 'pie' ? (
                         <PieChart>
                             <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={180} innerRadius={100} paddingAngle={2}>
                                {chartData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={getColor(String(entry.name || ''))} stroke="var(--md-sys-color-surface2)" strokeWidth={4}/>)}
                             </Pie>
                             <Tooltip contentStyle={{backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'}} itemStyle={{color: 'var(--md-sys-color-on-surface)'}}/>
                             <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '12px', fontWeight: 'bold', opacity: 0.8}}/>
                         </PieChart>
                     ) : (
                        <LineChart data={chartData} margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                            <CartesianGrid strokeOpacity={0.1} vertical={false}/>
                            <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 'bold'}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fontSize: 11, fontWeight: 'bold'}} axisLine={false} tickLine={false}/>
                            <Tooltip contentStyle={{backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'}}/>
                            <Legend wrapperStyle={{fontSize: '10px', fontWeight: 'bold', opacity: 0.8}} />
                            {lineKeys.map((key: string) => (
                                <Line key={key} type="monotone" dataKey={key} stroke={getColor(String(key))} strokeWidth={3} dot={{r: 4, fill: getColor(String(key))}} activeDot={{r: 6}} />
                            ))}
                        </LineChart>
                     )}
                 </ResponsiveContainer>
            </div>
        </div>
      );
  };

  const renderDrillDown = () => {
    if (!drillDownTarget) return null;
    const trendData = filteredMatches.map((m, i) => ({
        idx: i + 1,
        rollingWinRate: Math.round((filteredMatches.slice(0, i + 1).filter(x => x.result === 'Win').length / (i + 1)) * 100)
    }));

    return createPortal(
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6 animate-fade-in" onClick={() => setDrillDownTarget(null)}>
          <div className="bg-md-sys-surface1 w-full max-w-5xl rounded-[40px] p-10 shadow-2xl border border-md-sys-outline/20" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-10">
                  <div>
                      <div className="text-sm font-black uppercase opacity-40 tracking-[0.2em] mb-1">Deep Dive Analysis</div>
                      <h2 className="text-5xl font-black">{drillDownTarget.name}</h2>
                  </div>
                  <button onClick={() => setDrillDownTarget(null)} className="p-4 bg-md-sys-surface2 rounded-full hover:bg-md-sys-surface3"><X size={24}/></button>
              </div>
              <div className="h-80 w-full bg-md-sys-surface2 rounded-[32px] p-6 border border-md-sys-outline/5 shadow-inner">
                  <h4 className="text-xs font-black uppercase tracking-widest mb-6 opacity-60">Rolling Win Rate Over Time</h4>
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                          <defs><linearGradient id="colorWin" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-win)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--color-win)" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeOpacity={0.05} vertical={false}/>
                          <XAxis dataKey="idx" tick={{fontSize: 12}} label={{ value: 'Matches', position: 'insideBottom', offset: -5 }}/>
                          <YAxis tick={{fontSize: 12}} label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft' }}/>
                          <Tooltip contentStyle={{backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '16px', border: 'none'}}/>
                          <Area type="monotone" dataKey="rollingWinRate" name="Win Rate" stroke="var(--color-win)" strokeWidth={4} fillOpacity={1} fill="url(#colorWin)" />
                      </AreaChart>
                  </ResponsiveContainer>
              </div>
          </div>
      </div>, document.body
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-slide-up h-full">
      {renderDrillDown()}
      <div className="md-card flex flex-col md:flex-row justify-between items-center gap-4 bg-md-sys-surface1 p-6 rounded-[32px] shadow-sm flex-shrink-0">
          <div><h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3"><Activity className="text-md-sys-primary"/> Performance Statistics</h2><p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-1">Detailed Combat Analysis • {currentMode}</p></div>
          <div className="flex bg-md-sys-surface2 p-1.5 rounded-full shadow-inner">
              <button onClick={() => setViewMode('Standard')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Standard' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}>Dashboard</button>
              <button onClick={() => setViewMode('Pro')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Pro' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}>Detailed</button>
              <button onClick={() => setViewMode('Insights')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Insights' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}><Lightbulb size={16} className="inline mr-2"/>Insights</button>
              <button onClick={() => setViewMode('Social')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Social' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}><Handshake size={16} className="inline mr-2"/>Social</button>
          </div>
      </div>
      {viewMode === 'Pro' ? renderProView() : viewMode === 'Insights' ? (
          <div className="md-card !p-0 overflow-hidden shadow-lg rounded-[32px] max-h-[600px] overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
                  {insights.map((stat, i) => <div key={i} className="md-card !p-8 relative overflow-hidden shadow-lg hover:scale-105 transition-transform cursor-pointer group rounded-[32px] bg-md-sys-surface2"><div className={`absolute -top-6 -right-6 w-32 h-32 opacity-10 rounded-full ${stat.color} blur-2xl`}></div><div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg ${stat.color}`}>{stat.icon}</div><div className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">{stat.title}</div><div className="text-[10px] font-bold uppercase opacity-40 mb-6">{stat.subtitle}</div><div className="text-xl font-black leading-tight mb-2">{stat.value}</div><div className="text-xs font-bold px-3 py-1 bg-md-sys-surface1 rounded-lg inline-block">{stat.subValue}</div></div>)}
                  {insights.length === 0 && <div className="col-span-full text-center opacity-60 text-sm font-bold uppercase p-12">Not enough data to generate insights.</div>}
              </div>
          </div>
      ) : viewMode === 'Social' ? (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
              <div className="md-card flex flex-col bg-md-sys-surface2 !rounded-[32px] overflow-hidden shadow-lg">
                  <div className="p-6 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Swords size={16}/> Top Rivals (Opponents)</h3></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
                      {socialData.opponents.length === 0 ? <div className="opacity-40 text-xs font-bold text-center py-10">No opponent data</div> : 
                      socialData.opponents.map(([name, stat], i) => (
                          <div key={name} className="flex justify-between items-center py-3 border-b border-md-sys-outline/10 last:border-0">
                              <div className="flex items-center gap-3">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i===0?'bg-red-500 text-white':'bg-md-sys-surface3'}`}>{i+1}</div>
                                  <span className="font-bold text-sm">{name}</span>
                              </div>
                              <div className="text-right">
                                  <div className="text-xs font-black" style={{color: (stat.wins/stat.total) < 0.5 ? 'var(--color-win)' : 'var(--color-loss)'}}>{Math.round((stat.wins/stat.total)*100)}% WR</div>
                                  <div className="text-[9px] font-bold opacity-40">{stat.total} Encounters</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
              <div className="md-card flex flex-col bg-md-sys-surface2 !rounded-[32px] overflow-hidden shadow-lg">
                  <div className="p-6 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Handshake size={16}/> Best Wingmen (Teammates)</h3></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
                      {socialData.teammates.length === 0 ? <div className="opacity-40 text-xs font-bold text-center py-10">No teammate data</div> : 
                      socialData.teammates.map(([name, stat], i) => (
                          <div key={name} className="flex justify-between items-center py-3 border-b border-md-sys-outline/10 last:border-0">
                              <div className="flex items-center gap-3">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i===0?'bg-green-500 text-white':'bg-md-sys-surface3'}`}>{i+1}</div>
                                  <span className="font-bold text-sm">{name}</span>
                              </div>
                              <div className="text-right">
                                  <div className="text-xs font-black" style={{color: (stat.wins/stat.total) > 0.5 ? 'var(--color-win)' : 'var(--color-loss)'}}>{Math.round((stat.wins/stat.total)*100)}% WR</div>
                                  <div className="text-[9px] font-bold opacity-40">{stat.total} Missions</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      ) : ( <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div onClick={() => setDrillDownTarget({type: 'KPI', name: 'Win Ratio Analysis'})} className="md-card p-6 !rounded-[28px] relative overflow-hidden group cursor-pointer hover:bg-md-sys-surface2 hover:scale-[1.02] shadow-sm"><div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Trophy size={64}/></div><div className="text-4xl font-black mb-1 tracking-tighter" style={{color: winRate >= 50 ? 'var(--color-win)' : 'var(--color-loss)'}}>{winRate}%</div><div className="text-[10px] font-black uppercase tracking-widest opacity-60">Win Rate</div></div>
              <div onClick={() => setDrillDownTarget({type: 'KPI', name: 'Win Streak Analysis'})} className="md-card p-6 !rounded-[28px] relative overflow-hidden group cursor-pointer hover:bg-md-sys-surface2 hover:scale-[1.02] shadow-sm"><div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Flame size={64}/></div><div className="text-4xl font-black mb-1 text-orange-500 tracking-tighter">{currentStreak}</div><div className="text-[10px] font-black uppercase tracking-widest opacity-60">Active Streak</div></div>
              <div onClick={() => setDrillDownTarget({type: 'KPI', name: 'Total Sorties Analysis'})} className="md-card p-6 !rounded-[28px] relative overflow-hidden group shadow-sm cursor-pointer hover:bg-md-sys-surface2"><div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Swords size={64}/></div><div className="text-4xl font-black mb-1 text-md-sys-primary tracking-tighter">{filteredMatches.length}</div><div className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Sorties</div></div>
              <div className="md-card p-6 !rounded-[28px] relative overflow-hidden group shadow-sm"><div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Zap size={64}/></div><div className="text-4xl font-black mb-1 text-blue-400 tracking-tighter">{Math.round(filteredMatches.length / 14)}</div><div className="text-[10px] font-black uppercase tracking-widest opacity-60">Daily Avg</div></div>
          </div>
          
          {insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {insights.slice(0, 3).map((stat, i) => (
                      <div key={i} onClick={() => setViewMode('Insights')} className="md-card !p-6 relative overflow-hidden shadow-lg hover:scale-105 transition-transform cursor-pointer group rounded-[32px] bg-md-sys-surface2 flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg flex-shrink-0 ${stat.color}`}>{stat.icon}</div>
                          <div className="overflow-hidden">
                              <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">{stat.title}</div>
                              <div className="text-lg font-black leading-tight truncate">{stat.value}</div>
                              <div className="text-[10px] font-bold opacity-40 truncate">{stat.subtitle}</div>
                          </div>
                          <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${stat.color} opacity-10 blur-2xl`}></div>
                      </div>
                  ))}
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="md-card flex flex-col bg-md-sys-surface2 !rounded-[24px] overflow-hidden shadow-lg min-h-[250px] border border-md-sys-outline/5">
                  <div className="p-6 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Swords size={16}/> Top Rivals</h3></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
                      {socialData.opponents.slice(0, 5).map(([name, stat], i) => (
                          <div key={name} className="flex justify-between items-center py-2 border-b border-md-sys-outline/10 last:border-0">
                              <div className="flex items-center gap-3"><div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${i===0?'bg-red-500 text-white':'bg-md-sys-surface3'}`}>{i+1}</div><span className="font-bold text-xs">{name}</span></div>
                              <div className="text-right"><div className="text-[10px] font-black" style={{color: (stat.wins/stat.total) < 0.5 ? 'var(--color-win)' : 'var(--color-loss)'}}>{Math.round((stat.wins/stat.total)*100)}% WR</div><div className="text-[8px] font-bold opacity-40">{stat.total} Enc.</div></div>
                          </div>
                      ))}
                      {socialData.opponents.length === 0 && <div className="opacity-40 text-xs font-bold text-center py-10">No data</div>}
                  </div>
              </div>
              <div className="md-card flex flex-col bg-md-sys-surface2 !rounded-[24px] overflow-hidden shadow-lg min-h-[250px] border border-md-sys-outline/5">
                  <div className="p-6 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Handshake size={16}/> Best Wingmen</h3></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
                      {socialData.teammates.slice(0, 5).map(([name, stat], i) => (
                          <div key={name} className="flex justify-between items-center py-2 border-b border-md-sys-outline/10 last:border-0">
                              <div className="flex items-center gap-3"><div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${i===0?'bg-green-500 text-white':'bg-md-sys-surface3'}`}>{i+1}</div><span className="font-bold text-xs">{name}</span></div>
                              <div className="text-right"><div className="text-[10px] font-black" style={{color: (stat.wins/stat.total) > 0.5 ? 'var(--color-win)' : 'var(--color-loss)'}}>{Math.round((stat.wins/stat.total)*100)}% WR</div><div className="text-[8px] font-bold opacity-40">{stat.total} Missions</div></div>
                          </div>
                      ))}
                      {socialData.teammates.length === 0 && <div className="opacity-40 text-xs font-bold text-center py-10">No data</div>}
                  </div>
              </div>
          </div>
      </> )}
    </div>
  );
};

export default AnalyticsPanel;
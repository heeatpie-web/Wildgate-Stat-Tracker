import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Match, SHIPS, Language, getShipColor, CHARACTERS, UI_REACH_MODIFIERS, PIE_COLORS, DrillDownTarget, Insight } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, LineChart, Line, AreaChart, Area, ScatterChart, Scatter, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Flame, Swords, Heart, Skull, Trophy, Lightbulb, ChevronUp, X, Activity, Crown, BarChart3, TrendingUp, Calendar, Zap, Users, Rocket, ChevronRight, User, Clock, Target, PieChart as PieIcon, Minus, Plus, List, ShieldCheck, Moon, Sun, Ghost, Crosshair, Handshake, Network, Radar as RadarIcon, ScatterChart as ScatterIcon } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { RivalryGraph } from './RivalryGraph';
import { calculateInsights, calculateSocialData, calculateSynergyMatrix } from '../utils/analytics';

interface AnalyticsPanelProps {
  matches: Match[];
  currentMode: string;
  language: Language;
  currentUser: string;
  onDrillDown: (name: string, type: DrillDownTarget['type']) => void;
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

const getIconComponent = (type: Insight['iconType']) => {
    switch (type) {
        case 'Rocket': return <Rocket/>;
        case 'Crown': return <Crown/>;
        case 'Flame': return <Flame/>;
        case 'Zap': return <Zap/>;
        case 'Clock': return <Clock/>;
        case 'Target': return <Target/>;
        case 'ShieldCheck': return <ShieldCheck/>;
        case 'Ghost': return <Ghost/>;
        case 'Crosshair': return <Crosshair/>;
        case 'Moon': return <Moon/>;
        case 'Sun': return <Sun/>;
        default: return <Lightbulb/>;
    }
};

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ matches, currentMode, language, currentUser, onDrillDown }) => {
  const t = TRANSLATIONS[language];
  const [viewMode, setViewMode] = useState<'Standard' | 'Pro' | 'Synergy' | 'Insights' | 'Social'>('Standard');
  const [showSocialGraph, setShowSocialGraph] = useState(false);
  const [timeRange, setTimeRange] = useState<'All' | 'Recent'>('All');

  // Pro View State
  const [proResultType, setProResultType] = useState<'Win' | 'Loss' | 'All'>('All');
  const [proMetric, setProMetric] = useState('ship_usage');
  const [proChartType, setProChartType] = useState<'pie' | 'bar' | 'line' | 'scatter' | 'radar'>('bar');

  const filteredMatches = useMemo(() => {
      let m = matches.filter(m => m.mode === currentMode).sort((a, b) => a.timestamp - b.timestamp);
      if (timeRange === 'Recent') m = m.slice(-20);
      return m;
  }, [matches, currentMode, timeRange]);

  const previousMatches = useMemo(() => {
      let m = matches.filter(m => m.mode === currentMode).sort((a, b) => a.timestamp - b.timestamp);
      if (timeRange === 'Recent') {
          const start = Math.max(0, m.length - 40);
          const end = Math.max(0, m.length - 20);
          return m.slice(start, end);
      }
      return []; 
  }, [matches, currentMode, timeRange]);

  const calculateTrend = (currentVal: number, prevVal: number, type: 'percent' | 'count' = 'percent') => {
      if (previousMatches.length === 0) return null;
      const diff = currentVal - prevVal;
      if (diff === 0) return <span className="text-[10px] font-bold opacity-40 ml-2">-</span>;
      const isPositiveGood = true; 
      const color = diff > 0 ? (isPositiveGood ? 'text-green-500' : 'text-red-500') : (isPositiveGood ? 'text-red-500' : 'text-green-500');
      return <span className={`text-[10px] font-black ml-2 ${color}`}>{diff > 0 ? '+' : ''}{diff}{type === 'percent' ? '%' : ''}</span>;
  };
  
  const winRate = useMemo(() => {
    if (filteredMatches.length === 0) return 0;
    return Math.round((filteredMatches.filter(m => m.result === 'Win').length / filteredMatches.length) * 100);
  }, [filteredMatches]);

  const prevWinRate = useMemo(() => {
      if (previousMatches.length === 0) return 0;
      return Math.round((previousMatches.filter(m => m.result === 'Win').length / previousMatches.length) * 100);
  }, [previousMatches]);

  const currentStreak = useMemo(() => {
    const reversed = [...filteredMatches].reverse();
    let streak = 0;
    for (const m of reversed) { if (m.result === 'Win') streak++; else break; }
    return streak;
  }, [filteredMatches]);

  const avgSortiesPerDay = useMemo(() => Math.round(filteredMatches.length / 14), [filteredMatches]);
  const prevAvgSorties = useMemo(() => Math.round(previousMatches.length / 14), [previousMatches]);

  const insights = useMemo(() => {
      return calculateInsights(filteredMatches).map(insight => ({
          ...insight,
          icon: getIconComponent(insight.iconType)
      }));
  }, [filteredMatches]);

  const socialData = useMemo(() => calculateSocialData(filteredMatches), [filteredMatches]);

  const getProData = useMemo(() => {
      const targetMatches = proResultType === 'All' ? filteredMatches : filteredMatches.filter(m => m.result === proResultType);
      
      if (proChartType === 'scatter') {
          return targetMatches.map(m => ({
              x: m.time ? parseInt(m.time.split(':')[0])*60 + parseInt(m.time.split(':')[1]) : 0,
              y: m.damageTaken || 0,
              name: (m.ship||'').split('(')[0],
              result: m.result
          })).filter(d => d.y > 0 && d.x > 0);
      }

      if (proChartType === 'radar') {
          const shipStats: Record<string, {wins: number, total: number, damage: number}> = {};
          filteredMatches.forEach(m => {
              const s = (m.ship||'Unknown').split('(')[0];
              if(!shipStats[s]) shipStats[s] = {wins:0, total:0, damage:0};
              shipStats[s].total++;
              shipStats[s].damage += (m.damageTaken||0);
              if(m.result === 'Win') shipStats[s].wins++;
          });
          
          const topShips = Object.entries(shipStats).sort((a,b)=>b[1].total - a[1].total).slice(0, 3);
          const maxTotal = Math.max(...topShips.map(s => s[1].total), 1);
          const maxDmg = Math.max(...topShips.map(s => s[1].damage / s[1].total), 1);

          return [
              { subject: 'Win Rate', ...topShips.reduce((acc, [name, s]) => ({...acc, [name]: Math.round((s.wins/s.total)*100)}), {}), fullMark: 100 },
              { subject: 'Pick Rate', ...topShips.reduce((acc, [name, s]) => ({...acc, [name]: Math.round((s.total/filteredMatches.length)*100)}), {}), fullMark: 100 },
              { subject: 'Dmg Eff', ...topShips.reduce((acc, [name, s]) => ({...acc, [name]: Math.round(((s.damage/s.total)/maxDmg)*100)}), {}), fullMark: 100 },
          ];
      }

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
          } else if (proMetric === 'weapon_win_rate') {
               const counts: Record<string, number> = {};
               targetMatches.forEach(m => Object.keys(m.weapons || {}).forEach(w => counts[w] = (counts[w]||0)+1));
               topEntities = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 5).map(e=>e[0]);
          } else if (proMetric === 'objective_impact') {
               return { data: [], keys: [] };
          }

          const dailyData: Record<string, any> = {};
          
          targetMatches.forEach(m => {
              const date = new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              if (!dailyData[date]) dailyData[date] = { name: date };
              
              const relevantEntities: string[] = [];
              if (proMetric.includes('ship')) relevantEntities.push((m.ship||'Unknown').split('(')[0]);
              else if (proMetric.includes('hero')) relevantEntities.push(m.hero||'Unknown');
              else if (proMetric.includes('teammate')) relevantEntities.push(...(m.teammates||[]));
              else if (proMetric.includes('opponent')) relevantEntities.push(...(m.opponents||[]));
              else if (proMetric.includes('artifact') && m.subType==='Artifact') {
                  relevantEntities.push((m.reachModifiers||[]).find(r => r.startsWith('Artifact:'))?.split(': ')[1] || 'Unknown');
              } else if (proMetric === 'weapon_win_rate') {
                  relevantEntities.push(...Object.keys(m.weapons || {}));
              }

              relevantEntities.forEach(ent => {
                  if (topEntities.includes(ent)) {
                       if (proMetric.includes('win_rate')) {
                           if(!dailyData[date][ent]) dailyData[date][ent] = 0;
                           if (m.result === 'Win') dailyData[date][ent] += 1;
                       } else if (proMetric.includes('damage')) {
                           const dmg = m.damageTaken || 0;
                           if (dmg > 0) {
                               if(!dailyData[date][ent]) dailyData[date][ent] = {sum:0, count:0};
                               dailyData[date][ent].sum += dmg;
                               dailyData[date][ent].count++;
                           }
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
                      if(newD[e] && newD[e].count > 0) newD[e] = Math.round(newD[e].sum / newD[e].count);
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
               const dmg = m.damageTaken || 0;
               if (dmg > 0) {
                   if (!stats[name]) stats[name] = { totalDmg: 0, count: 0 };
                   stats[name].totalDmg += dmg;
                   stats[name].count++;
               }
          });
          data = Object.entries(stats).map(([name, s]) => ({ name, value: Math.round(s.totalDmg / s.count) }));
      } else if (proMetric === 'weapon_win_rate') {
          const stats: Record<string, { wins: number, total: number }> = {};
          filteredMatches.forEach(m => {
              if (m.weapons) {
                  Object.keys(m.weapons).forEach(w => {
                      if (m.weapons![w] > 0) {
                          if (!stats[w]) stats[w] = { wins: 0, total: 0 };
                          stats[w].total++;
                          if (m.result === 'Win') stats[w].wins++;
                      }
                  });
              }
          });
          data = Object.entries(stats).map(([name, s]) => ({ name, value: Math.round((s.wins / s.total) * 100), count: s.total }));
      } else if (proMetric === 'objective_impact') {
          const winPois = { total: 0, count: 0 };
          const lossPois = { total: 0, count: 0 };
          filteredMatches.forEach(m => {
              const pois = (m.poiEasy||0) + (m.poiMedium||0) + (m.poiEpic||0);
              if (m.result === 'Win') { winPois.total += pois; winPois.count++; }
              else if (m.result === 'Loss') { lossPois.total += pois; lossPois.count++; }
          });
          data = [
              { name: 'Avg POIs (Win)', value: winPois.count ? Number((winPois.total / winPois.count).toFixed(1)) : 0 },
              { name: 'Avg POIs (Loss)', value: lossPois.count ? Number((lossPois.total / lossPois.count).toFixed(1)) : 0 }
          ];
      }

      return data.sort((a, b) => b.value - a.value).slice(0, 15); 
  }, [filteredMatches, proResultType, proMetric, proChartType]);

  const synergyMatrix = useMemo(() => calculateSynergyMatrix(filteredMatches), [filteredMatches]);

  const renderSynergyMatrix = () => {
      return (
          <div className="md-card !p-6 flex flex-col gap-6 animate-fade-in flex-1 min-h-0">
              <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black uppercase tracking-tight">Hero x Ship Synergy Matrix</h3>
                  <div className="flex gap-4 text-xs font-bold opacity-60">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 bg-md-sys-primary rounded-sm opacity-20"></div> Low WR</div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 bg-md-sys-primary rounded-sm"></div> High WR</div>
                  </div>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full border-collapse">
                      <thead>
                          <tr>
                              <th className="p-2"></th>
                              {CHARACTERS.map(c => <th key={c} className="p-2 text-[10px] font-black uppercase rotate-45 origin-bottom-left translate-x-4">{c}</th>)}
                          </tr>
                      </thead>
                      <tbody>
                          {Object.keys(synergyMatrix).map(ship => (
                              <tr key={ship}>
                                  <td className="p-2 text-[10px] font-black uppercase text-right">{ship}</td>
                                  {CHARACTERS.map(hero => {
                                      const stat = synergyMatrix[ship][hero];
                                      const wr = stat.total > 0 ? stat.wins / stat.total : 0;
                                      const opacity = stat.total > 0 ? 0.2 + (wr * 0.8) : 0.05;
                                      return (
                                          <td key={hero} className="p-1">
                                              <div className="w-full h-10 rounded-lg flex items-center justify-center relative group transition-all hover:scale-110 hover:z-10 hover:shadow-lg bg-md-sys-primary" style={{ opacity }}>
                                                  {stat.total > 0 && <span className="text-[10px] font-black text-md-sys-onPrimary relative z-20">{Math.round(wr * 100)}%</span>}
                                                  {stat.total > 0 && (
                                                      <div className="absolute bottom-full mb-2 bg-black/80 text-white text-[10px] p-2 rounded-lg whitespace-nowrap hidden group-hover:block z-50 pointer-events-none">
                                                          <div className="font-black">{hero} & {ship}</div>
                                                          <div>Win Rate: {Math.round(wr*100)}%</div>
                                                          <div>Matches: {stat.total}</div>
                                                      </div>
                                                  )}
                                              </div>
                                          </td>
                                      );
                                  })}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  };

  const renderProView = () => {
      const isLine = proChartType === 'line';
      const chartData = isLine ? (getProData as any).data : (Array.isArray(getProData) ? getProData : []);
      const lineKeys = isLine ? (getProData as any).keys : [];

      return (
        <div className="md-card !p-6 flex flex-col gap-6 animate-fade-in flex-1 min-h-0">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex bg-md-sys-surface2 p-1.5 rounded-2xl">
                    <button onClick={() => setProChartType('bar')} className={`p-2 rounded-xl ${proChartType === 'bar' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:bg-md-sys-surface3'}`}><BarChart3 size={20}/></button>
                    <button onClick={() => setProChartType('pie')} className={`p-2 rounded-xl ${proChartType === 'pie' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:bg-md-sys-surface3'}`}><PieIcon size={20}/></button>
                    <button onClick={() => setProChartType('line')} className={`p-2 rounded-xl ${proChartType === 'line' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:bg-md-sys-surface3'}`}><TrendingUp size={20}/></button>
                </div>
                
                <div className="flex overflow-x-auto gap-2 max-w-full pb-2 md:pb-0 custom-scrollbar">
                     {['ship_usage', 'hero_usage', 'teammate_usage', 'opponent_usage', 'win_rate_ship', 'win_rate_artifact', 'avg_damage_ship', 'weapon_win_rate', 'objective_impact'].map(m => {
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

            <div className="h-[500px] w-full bg-md-sys-surface2 rounded-[32px] p-4 md:p-8 border border-md-sys-outline/5 shadow-inner overflow-hidden">
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
                             <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2}>
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

  return (
    <div className="bg-md-sys-surface1 rounded-[32px] p-4 shadow-lg h-full flex flex-col gap-4 animate-slide-up overflow-hidden">
      <div className="md-card flex flex-col md:flex-row justify-between items-center gap-4 bg-md-sys-surface1 p-6 rounded-[32px] shadow-sm flex-shrink-0">
          <div><h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3"><Activity className="text-md-sys-primary"/> Performance Statistics</h2><p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-1">Detailed Combat Analysis • {currentMode}</p></div>
          <div className="flex gap-4">
              <div className="flex bg-md-sys-surface2 p-1.5 rounded-full shadow-inner">
                  <button onClick={() => setTimeRange('All')} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${timeRange === 'All' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}>All Time</button>
                  <button onClick={() => setTimeRange('Recent')} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${timeRange === 'Recent' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}>Recent (20)</button>
              </div>
              <div className="flex bg-md-sys-surface2 p-1.5 rounded-full shadow-inner">
                  <button onClick={() => setViewMode('Standard')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Standard' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}>Dashboard</button>
                  <button onClick={() => setViewMode('Pro')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Pro' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}>Detailed</button>
                  <button onClick={() => setViewMode('Synergy')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Synergy' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}><Network size={16} className="inline mr-2"/>Synergy</button>
                  <button onClick={() => setViewMode('Insights')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Insights' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}><Lightbulb size={16} className="inline mr-2"/>Insights</button>
                  <button onClick={() => setViewMode('Social')} className={`px-6 py-2 rounded-full text-xs font-black uppercase ${viewMode === 'Social' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-lg' : 'opacity-60 hover:bg-md-sys-surface3'}`}><Handshake size={16} className="inline mr-2"/>Social</button>
              </div>
          </div>
      </div>
      {viewMode === 'Pro' ? renderProView() : viewMode === 'Synergy' ? renderSynergyMatrix() : viewMode === 'Insights' ? (
          <div className="md-card !p-0 overflow-hidden shadow-lg rounded-[32px] max-h-[600px] flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
                  {insights.map((stat, i) => <div key={i} className="md-card !p-8 relative overflow-hidden shadow-lg hover:scale-105 transition-transform cursor-pointer group rounded-[32px] bg-md-sys-surface2"><div className={`absolute -top-6 -right-6 w-32 h-32 opacity-10 rounded-full ${stat.color} blur-2xl`}></div><div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg ${stat.color}`}>{stat.icon}</div><div className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">{stat.title}</div><div className="text-[10px] font-bold uppercase opacity-40 mb-6">{stat.subtitle}</div><div className="text-xl font-black leading-tight mb-2">{stat.value}</div><div className="text-xs font-bold px-3 py-1 bg-md-sys-surface1 rounded-lg inline-block">{stat.subValue}</div></div>)}
                  {insights.length === 0 && <div className="col-span-full text-center opacity-60 text-sm font-bold uppercase p-12">Not enough data to generate insights.</div>}
              </div>
          </div>
      ) : viewMode === 'Social' ? (
          <div className="flex-1 flex flex-col overflow-hidden h-full">
              <div className="flex justify-end mb-4">
                  <button onClick={() => setShowSocialGraph(!showSocialGraph)} className="flex items-center gap-2 px-4 py-2 bg-md-sys-surface2 rounded-xl text-xs font-bold uppercase hover:bg-md-sys-primary hover:text-white transition-all shadow-sm">
                      {showSocialGraph ? <List size={16}/> : <Network size={16}/>} {showSocialGraph ? "View List" : "View Network"}
                  </button>
              </div>
              
              {showSocialGraph ? (
                  <RivalryGraph matches={filteredMatches} currentUser={currentUser} />
              ) : (
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
                      <div className="md-card flex flex-col bg-md-sys-surface2 !rounded-[32px] overflow-hidden shadow-lg">
                          <div className="p-6 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Swords size={16}/> Top Rivals (Opponents)</h3></div>
                          <div className="flex-1 p-6 pt-2">
                              {socialData.opponents.length === 0 ? <div className="opacity-40 text-xs font-bold text-center py-10">No opponent data</div> : 
                              socialData.opponents.map(([name, stat], i) => (
                                  <div key={name} onClick={() => onDrillDown(name, 'Opponent')} className="flex justify-between items-center py-3 border-b border-md-sys-outline/10 last:border-0 cursor-pointer hover:bg-md-sys-surface3 p-2 rounded-xl transition-colors">
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
                          <div className="flex-1 p-6 pt-2">
                              {socialData.teammates.length === 0 ? <div className="opacity-40 text-xs font-bold text-center py-10">No teammate data</div> : 
                              socialData.teammates.map(([name, stat], i) => (
                                  <div key={name} onClick={() => onDrillDown(name, 'Teammate')} className="flex justify-between items-center py-3 border-b border-md-sys-outline/10 last:border-0 cursor-pointer hover:bg-md-sys-surface3 p-2 rounded-xl transition-colors">
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
              )}
          </div>
      ) : ( <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div onClick={() => onDrillDown('Win Ratio Analysis', 'KPI')} className="md-card p-4 !rounded-[28px] relative overflow-hidden group cursor-pointer hover:bg-md-sys-surface2 hover:scale-[1.02] shadow-sm">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Trophy size={48}/></div>
                  <div className="flex items-end gap-1 mb-1">
                      <div className="text-3xl font-black tracking-tighter" style={{color: winRate >= 50 ? 'var(--color-win)' : 'var(--color-loss)'}}>{winRate}%</div>
                      {calculateTrend(winRate, prevWinRate)}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Win Rate</div>
              </div>
              <div onClick={() => onDrillDown('Win Streak Analysis', 'KPI')} className="md-card p-4 !rounded-[28px] relative overflow-hidden group cursor-pointer hover:bg-md-sys-surface2 hover:scale-[1.02] shadow-sm"><div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Flame size={48}/></div><div className="text-3xl font-black mb-1 text-orange-500 tracking-tighter">{currentStreak}</div><div className="text-[10px] font-black uppercase tracking-widest opacity-60">Active Streak</div></div>
              <div onClick={() => onDrillDown('Total Sorties Analysis', 'KPI')} className="md-card p-4 !rounded-[28px] relative overflow-hidden group shadow-sm cursor-pointer hover:bg-md-sys-surface2">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Swords size={48}/></div>
                  <div className="flex items-end gap-1 mb-1">
                      <div className="text-3xl font-black text-md-sys-primary tracking-tighter">{filteredMatches.length}</div>
                      {calculateTrend(filteredMatches.length, previousMatches.length, 'count')}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Sorties</div>
              </div>
              <div className="md-card p-4 !rounded-[28px] relative overflow-hidden group shadow-sm">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Zap size={48}/></div>
                  <div className="flex items-end gap-1 mb-1">
                      <div className="text-3xl font-black text-blue-400 tracking-tighter">{avgSortiesPerDay}</div>
                      {calculateTrend(avgSortiesPerDay, prevAvgSorties, 'count')}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Daily Avg</div>
              </div>
          </div>
          
          {insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {insights.slice(0, 3).map((stat, i) => (
                      <div key={i} onClick={() => setViewMode('Insights')} className="md-card !p-4 relative overflow-hidden shadow-lg hover:scale-105 transition-transform cursor-pointer group rounded-[32px] bg-md-sys-surface2 flex items-center gap-4">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="md-card flex flex-col bg-md-sys-surface2 !rounded-[24px] overflow-hidden shadow-lg min-h-[180px] border border-md-sys-outline/5">
                  <div className="p-6 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Swords size={16}/> Top Rivals</h3></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
                      {socialData.opponents.slice(0, 5).map(([name, stat], i) => (
                          <div key={name} onClick={() => onDrillDown(name, 'Opponent')} className="flex justify-between items-center py-2 border-b border-md-sys-outline/10 last:border-0 cursor-pointer hover:bg-md-sys-surface3 p-1.5 rounded-lg transition-colors">
                              <div className="flex items-center gap-3"><div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${i===0?'bg-red-500 text-white':'bg-md-sys-surface3'}`}>{i+1}</div><span className="font-bold text-xs">{name}</span></div>
                              <div className="text-right"><div className="text-[10px] font-black" style={{color: (stat.wins/stat.total) < 0.5 ? 'var(--color-win)' : 'var(--color-loss)'}}>{Math.round((stat.wins/stat.total)*100)}% WR</div><div className="text-[8px] font-bold opacity-40">{stat.total} Enc.</div></div>
                          </div>
                      ))}
                      {socialData.opponents.length === 0 && <div className="opacity-40 text-xs font-bold text-center py-10">No data</div>}
                  </div>
              </div>
              <div className="md-card flex flex-col bg-md-sys-surface2 !rounded-[24px] overflow-hidden shadow-lg min-h-[180px] border border-md-sys-outline/5">
                  <div className="p-6 pb-2"><h3 className="text-sm font-black uppercase flex items-center gap-2 opacity-60"><Handshake size={16}/> Best Wingmen</h3></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
                      {socialData.teammates.slice(0, 5).map(([name, stat], i) => (
                          <div key={name} onClick={() => onDrillDown(name, 'Teammate')} className="flex justify-between items-center py-2 border-b border-md-sys-outline/10 last:border-0 cursor-pointer hover:bg-md-sys-surface3 p-1.5 rounded-lg transition-colors">
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
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Match, Language, DrillDownTarget } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { Trash2, Edit2, Pin, ChevronDown, ChevronUp, Clock, Image as ImageIcon, Download, ArrowUpDown, Users, Swords, X, FileText, Share2, Save, Ghost } from 'lucide-react';
import html2canvas from 'html2canvas';

import { EditMatchModal } from './EditMatchModal';

interface HistoryTableProps {
  matches: Match[];
  onDelete: (id: number) => void;
  onEdit: (match: Match) => void;
  onPin: (id: number) => void;
  language: Language;
  onDrillDown?: (name: string, type: DrillDownTarget['type']) => void;
}

const timeAgo = (timestamp: number): string => {
    if (!timestamp) return '';
    const now = new Date();
    const seconds = Math.floor((now.getTime() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
};

const HistoryTable: React.FC<HistoryTableProps> = ({ matches, onDelete, onEdit, onPin, language, onDrillDown }) => {
  const t = TRANSLATIONS[language];
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Match | 'timeAgo'>('timestamp');
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedMatches, setSelectedMatches] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'Infinity'>(10);

  const [selectedMatchForDetails, setSelectedMatchForDetails] = useState<Match | null>(null);
  const [editingNoteMatch, setEditingNoteMatch] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => setCurrentPage(1), [searchTerm, itemsPerPage]);

  const filteredMatches = useMemo(() => matches.filter(m => {
    const term = searchTerm.toLowerCase();
    const player = m.player?.toLowerCase() || '';
    const ship = m.ship?.toLowerCase() || '';
    const hero = m.hero?.toLowerCase() || '';
    const result = m.result?.toLowerCase() || '';
    const subType = m.subType?.toLowerCase() || '';
    const note = m.notes?.toLowerCase() || '';
    
    return (
      player.includes(term) ||
      ship.includes(term) ||
      hero.includes(term) ||
      result.includes(term) ||
      subType.includes(term) ||
      note.includes(term) ||
      (m.teammates || []).some(t => t.toLowerCase().includes(term)) ||
      (m.opponents || []).some(o => o.toLowerCase().includes(term)) ||
      (m.reachModifiers || []).some(r => r.toLowerCase().includes(term))
    );
  }), [matches, searchTerm]);

  const sortedMatches = useMemo(() => {
    const sortFn = (a: Match, b: Match) => {
        let valA: any, valB: any;
        if (sortField === 'timeAgo') {
            valA = a['timestamp'] || 0;
            valB = b['timestamp'] || 0;
        } else if (sortField === 'time') {
            const timeToSec = (t?: string) => {
                if (!t) return 0;
                const parts = t.split(':').map(Number);
                return (parts[0] || 0) * 60 + (parts[1] || 0);
            };
            valA = timeToSec(a.time);
            valB = timeToSec(b.time);
        } else {
            valA = a[sortField] || 0;
            valB = b[sortField] || 0;
        }
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    };

    const pinned = filteredMatches.filter(m => m.isPinned).sort(sortFn);
    const unpinned = filteredMatches.filter(m => !m.isPinned).sort(sortFn);
    
    return [...pinned, ...unpinned];
  }, [filteredMatches, sortField, sortDesc]);

  const paginatedMatches = useMemo(() => {
      if (itemsPerPage === 'Infinity') return sortedMatches;
      const start = (currentPage - 1) * (itemsPerPage as number);
      return sortedMatches.slice(start, start + (itemsPerPage as number));
  }, [sortedMatches, currentPage, itemsPerPage]);

  const handleSort = (field: keyof Match | 'timeAgo') => {
    if (sortField === field) setSortDesc(!sortDesc);
    else { setSortField(field); setSortDesc(true); }
  };

  const toggleSelection = (id: number) => {
      setSelectedMatches(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleDelete = (id: number) => {
      if (window.confirm("Are you sure you want to delete this match record? This cannot be undone.")) {
          onDelete(id);
      }
  };

  const handleOpenNote = (match: Match) => {
      setEditingNoteMatch(match);
      setNoteText(match.notes || "");
  };

  const handleSaveNote = () => {
      if (editingNoteMatch) {
          onEdit({ ...editingNoteMatch, notes: noteText });
          setEditingNoteMatch(null);
      }
  };
  
  const handleExportJPG = async () => {
      if (selectedMatches.length === 0) return;
      const targetMatches = sortedMatches.filter(m => selectedMatches.includes(m.id));
      
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = '600px';
      container.style.backgroundColor = '#121212';
      container.style.padding = '40px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '20px';
      container.style.fontFamily = 'sans-serif';
      document.body.appendChild(container);

      targetMatches.forEach(m => {
          const isWin = m.result === 'Win';
          const color = isWin ? '#22c55e' : (m.result === 'Loss' ? '#ef4444' : '#94a3b8');
          
          const card = document.createElement('div');
          card.innerHTML = `
            <div style="background: #1e1e1e; padding: 24px; border-radius: 24px; border: 1px solid #333; color: white; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden;">
                <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: ${color};"></div>
                <div style="position: absolute; right: -20px; bottom: -20px; width: 100px; height: 100px; border-radius: 50%; background: ${color}; opacity: 0.1; filter: blur(20px);"></div>
                <div>
                    <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; opacity: 0.5; margin-bottom: 4px;">Mission Report</div>
                    <div style="font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; color: ${color};">${m.result}</div>
                    <div style="font-size: 12px; font-weight: 700; opacity: 0.8; margin-top: 4px;">${(m.ship || '').split('(')[0]} • ${m.hero}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 24px; font-weight: 900;">${m.damageTaken || 0}</div>
                    <div style="font-size: 10px; font-weight: 700; opacity: 0.5; text-transform: uppercase;">Damage Taken</div>
                    <div style="margin-top: 8px; font-size: 14px; font-weight: 700; font-family: monospace;">${m.time || '--:--'}</div>
                </div>
            </div>
          `;
          container.appendChild(card);
      });

      try {
          const canvas = await html2canvas(container, { backgroundColor: '#121212' });
          const link = document.createElement('a');
          link.download = `wildgate-export-${Date.now()}.jpg`;
          link.href = canvas.toDataURL('image/jpeg', 0.9);
          link.click();
      } catch(e) {
          alert("Export failed.");
      }
      document.body.removeChild(container);
  };

  return (
    <div className="w-full flex flex-col gap-4 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-md-sys-on-surface">Match History</h2>
        <input 
          type="text" 
          placeholder="Search logs..." 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
          className="bg-md-sys-surface2 px-4 py-2 rounded-xl text-sm font-bold outline-none text-md-sys-on-surface border border-md-sys-outline/10 focus:border-md-sys-primary w-full md:w-64 transition-all"
        />
      </div>

      <div className="md-card !p-0 overflow-hidden shadow-lg border border-md-sys-outline/5">
        <div className="p-4 bg-md-sys-surface2 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-bold text-md-sys-on-surface/60 border-b border-md-sys-outline/10">
            <div className="flex items-center gap-2">
                <span className="uppercase tracking-wider text-[10px]">Rows per page:</span>
                <select 
                    value={itemsPerPage} 
                    onChange={(e) => setItemsPerPage(e.target.value === 'Infinity' ? 'Infinity' : Number(e.target.value))} 
                    className="bg-md-sys-surface1 rounded-lg px-2 py-1 outline-none border-transparent focus:border-md-sys-primary border-2 transition-all cursor-pointer"
                >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={40}>40</option>
                    <option value="Infinity">All</option>
                </select>
            </div>
            <div className="uppercase tracking-widest text-[10px] opacity-60">
                {itemsPerPage === 'Infinity' ? `Showing All ${sortedMatches.length} Missions` : `Page ${currentPage} of ${Math.ceil(sortedMatches.length / (itemsPerPage as number)) || 1} • ${sortedMatches.length} Missions`}
            </div>
            <div className="flex gap-2">
                <button 
                    disabled={currentPage === 1 || itemsPerPage === 'Infinity'} 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-4 py-1.5 bg-md-sys-surface1 rounded-lg disabled:opacity-30 hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-all font-black uppercase text-[10px] tracking-wider"
                >
                    Prev
                </button>
                <button 
                    disabled={itemsPerPage === 'Infinity' || currentPage >= Math.ceil(sortedMatches.length / (itemsPerPage as number))} 
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="px-4 py-1.5 bg-md-sys-surface1 rounded-lg disabled:opacity-30 hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-all font-black uppercase text-[10px] tracking-wider"
                >
                    Next
                </button>
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-md-sys-surface2 text-[10px] font-black uppercase text-md-sys-on-surface/60 tracking-widest border-b border-md-sys-outline/10">
                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('result')}>Outcome</th>
                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('timeAgo')}>Time</th>
                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('ship')}>Ship & Hero</th>
                <th className="p-4 cursor-pointer hover:text-md-sys-primary transition-colors" onClick={() => handleSort('time')}>Duration</th>
                <th className="p-4">Teammates</th>
                <th className="p-4">Opponents</th>
                <th className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <span>Actions</span>
                        {selectedMatches.length > 0 && <button onClick={handleExportJPG} title="Export Selection as JPG" className="p-1 bg-md-sys-primary rounded text-white opacity-50 hover:opacity-100"><ImageIcon size={12}/></button>}
                    </div>
                </th>
                <th className="w-2 p-0"></th>
              </tr>
            </thead>
            <tbody className="text-sm font-bold text-md-sys-on-surface">
              {sortedMatches.length === 0 ? (
                <tr>
                    <td colSpan={8}>
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                            <Ghost size={64} className="mb-4 text-md-sys-primary animate-pulse"/>
                            <h3 className="text-xl font-black uppercase tracking-widest">No Flight Logs Found</h3>
                            <p className="text-xs font-bold mt-2">Start your engines, Commander.</p>
                        </div>
                    </td>
                </tr>
              ) : (
                paginatedMatches.map(m => {
                  const isWin = m.result === 'Win';
                  const isLoss = m.result === 'Loss';
                  const rowBg = isWin ? 'bg-green-500/30' : (isLoss ? 'bg-red-500/30' : 'bg-slate-500/30');
                  const accentColor = isWin ? '#22c55e' : (isLoss ? '#ef4444' : '#94a3b8');
                  
                  return (
                  <tr key={m.id} onClick={() => setSelectedMatchForDetails(m)} className={`border-b border-md-sys-outline/5 transition-colors group ${rowBg} hover:brightness-125 cursor-pointer`}>
                    <td className="p-4">
                        <div>
                            <span className={`text-lg font-black uppercase tracking-tighter ${isWin ? 'text-green-500' : (isLoss ? 'text-red-500' : 'text-slate-500')}`}>
                                {m.result}
                            </span>
                            <div className="text-[10px] opacity-50 font-bold">{m.subType}</div>
                        </div>
                    </td>
                    <td className="p-4 text-xs opacity-60">{timeAgo(m.timestamp)}</td>
                    <td className="p-4">
                        <div className="flex flex-col">
                            <span>{(m.ship || 'Unknown').split('(')[0]}</span>
                            <span className="text-[10px] opacity-50">{m.hero || 'Unknown'}</span>
                        </div>
                    </td>
                    <td className="p-4 font-mono opacity-80">{m.time || '--:--'}</td>
                    <td className="p-4 text-xs max-w-[150px] truncate">
                        {(m.teammates && m.teammates.length > 0) ? m.teammates.map((t, i) => (
                            <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(t, 'Teammate'); }} className="hover:underline hover:text-blue-400 cursor-pointer">
                                {t}{i < m.teammates.length - 1 ? ', ' : ''}
                            </span>
                        )) : <span className="opacity-40 italic">None</span>}
                    </td>
                    <td className="p-4 text-xs max-w-[150px] truncate">
                        {(m.opponents && m.opponents.length > 0) ? m.opponents.map((o, i) => (
                            <span key={i} onClick={(e) => { e.stopPropagation(); onDrillDown?.(o, 'Opponent'); }} className="hover:underline hover:text-red-400 cursor-pointer">
                                {o}{i < m.opponents.length - 1 ? ', ' : ''}
                            </span>
                        )) : <span className="opacity-40 italic">None</span>}
                    </td>
                    <td className="p-4 text-right">
                        <div className="flex justify-end items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setEditingMatch(m)} className="p-2 rounded-lg transition-all opacity-30 group-hover:opacity-100 hover:bg-md-sys-surface3 text-md-sys-on-surface/40" title="Edit"><Edit2 size={14}/></button>
                            <button onClick={() => handleOpenNote(m)} className={`p-2 rounded-lg transition-all opacity-30 group-hover:opacity-100 ${m.notes ? 'text-md-sys-primary !opacity-100' : 'hover:bg-md-sys-surface3 text-md-sys-on-surface/40'}`} title="Notes"><FileText size={14} className={m.notes ? 'fill-current' : ''}/></button>
                            <button onClick={() => handleDelete(m.id)} className="p-2 rounded-lg transition-all opacity-30 group-hover:opacity-100 hover:bg-md-sys-error-container hover:text-md-sys-on-error-container text-md-sys-on-surface/40" title="Delete"><Trash2 size={14}/></button>
                            <button onClick={() => onPin(m.id)} className={`p-2 rounded-lg transition-all opacity-30 group-hover:opacity-100 ${m.isPinned ? 'bg-yellow-500 text-black !opacity-100' : 'hover:bg-md-sys-surface3 text-md-sys-on-surface/40'}`} title="Pin"><Pin size={14} className={m.isPinned ? 'fill-black' : ''}/></button>
                            <input type="checkbox" checked={selectedMatches.includes(m.id)} onChange={() => toggleSelection(m.id)} className="ml-2 rounded cursor-pointer opacity-30 group-hover:opacity-100 checked:opacity-100 transition-opacity"/>
                        </div>
                    </td>
                    <td className="w-2 p-0 relative overflow-hidden">
                        <svg width="100%" height="100%" viewBox="0 0 10 100" preserveAspectRatio="none" className="absolute inset-0">
                            <path d="M 0 0 Q 8 50 0 100" fill="none" stroke={accentColor} strokeWidth="4" strokeLinecap="round" opacity="0.5"/>
                            <path d="M 4 0 Q 12 50 4 100" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingMatch && <EditMatchModal match={editingMatch} onClose={() => setEditingMatch(null)} onSave={(m) => { onEdit(m); setEditingMatch(null); }} />}

      {editingNoteMatch && createPortal(
          <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingNoteMatch(null)}>
              <div className="bg-md-sys-surface1 w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-md-sys-outline/20 flex flex-col gap-6" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center">
                      <h3 className="text-xl font-black uppercase tracking-tight">Mission Notes</h3>
                      <button onClick={() => setEditingNoteMatch(null)}><X size={20}/></button>
                  </div>
                  <div className="bg-md-sys-surface2 p-4 rounded-2xl border border-md-sys-outline/10">
                      <div className="text-[10px] font-black uppercase opacity-60 mb-2">Match Details</div>
                      <div className="text-sm font-bold">{editingNoteMatch.result} • {(editingNoteMatch.ship||'').split('(')[0]} • {editingNoteMatch.hero}</div>
                      <div className="text-xs opacity-60 mt-1">{new Date(editingNoteMatch.timestamp).toLocaleString()}</div>
                  </div>
                  <textarea 
                      value={noteText} 
                      onChange={(e) => setNoteText(e.target.value)} 
                      placeholder="Add notes about strategy, mistakes, or key moments..." 
                      className="w-full h-32 bg-md-sys-surface2 rounded-2xl p-4 text-sm font-bold outline-none resize-none border border-transparent focus:border-md-sys-primary transition-all"
                  />
                  <div className="flex gap-2">
                      <button onClick={() => setEditingNoteMatch(null)} className="flex-1 py-3 rounded-xl font-black bg-md-sys-surface2 hover:bg-md-sys-surface3">Cancel</button>
                      <button onClick={handleSaveNote} className="flex-1 py-3 rounded-xl font-black bg-md-sys-primary text-md-sys-onPrimary hover:brightness-110 flex items-center justify-center gap-2"><Save size={16}/> Save Note</button>
                  </div>
              </div>
          </div>, document.body
      )}

      {selectedMatchForDetails && createPortal(
          <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedMatchForDetails(null)}>
              <div className="bg-md-sys-surface1 w-full max-w-2xl rounded-[40px] p-8 shadow-2xl border border-md-sys-outline/20 flex flex-col gap-6 animate-scale-in max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-start">
                      <div>
                          <div className="text-xs font-black uppercase opacity-40 tracking-widest mb-1">Mission Report</div>
                          <h2 className="text-4xl font-black uppercase tracking-tighter">{selectedMatchForDetails.result}</h2>
                          <div className={`text-sm font-bold ${selectedMatchForDetails.result==='Win'?'text-green-500':'text-red-500'}`}>{selectedMatchForDetails.subType}</div>
                      </div>
                      <button onClick={() => setSelectedMatchForDetails(null)} className="p-3 bg-md-sys-surface2 rounded-full hover:bg-md-sys-surface3"><X size={20}/></button>
                  </div>
                  
                  {selectedMatchForDetails.notes && (
                      <div className="bg-md-sys-surface2 p-6 rounded-3xl border-l-4 border-md-sys-primary">
                          <div className="text-[10px] font-black uppercase opacity-60 mb-2 flex items-center gap-2"><FileText size={12}/> Captain's Log</div>
                          <div className="text-sm font-medium italic opacity-80 leading-relaxed">"{selectedMatchForDetails.notes}"</div>
                      </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div className="bg-md-sys-surface2 p-4 rounded-3xl">
                          <div className="text-[10px] font-black uppercase opacity-60 mb-2">Pilot Loadout</div>
                          <div className="text-xl font-black mb-1">{(selectedMatchForDetails.ship || 'Unknown').split('(')[0]}</div>
                          <div className="text-sm opacity-70 mb-2">{selectedMatchForDetails.hero}</div>
                          {selectedMatchForDetails.weapons && Object.keys(selectedMatchForDetails.weapons).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                  {Object.entries(selectedMatchForDetails.weapons).filter(([_, count]) => count > 0).map(([w, count]) => (
                                      <span key={w} className="px-2 py-1 bg-md-sys-surface3 rounded-lg text-[10px] font-black uppercase border border-md-sys-outline/10">
                                          {w} {count > 1 && <span className="text-md-sys-primary">x{count}</span>}
                                      </span>
                                  ))}
                              </div>
                          )}
                      </div>
                      <div className="bg-md-sys-surface2 p-4 rounded-3xl">
                          <div className="text-[10px] font-black uppercase opacity-60 mb-2">Performance</div>
                          <div className="flex justify-between items-end">
                              <div>
                                  <div className="text-xl font-black">{selectedMatchForDetails.damageTaken || 0}</div>
                                  <div className="text-[10px] font-bold opacity-60">Damage Taken</div>
                              </div>
                              <div className="text-right">
                                  <div className="text-xl font-black">{selectedMatchForDetails.time || '--:--'}</div>
                                  <div className="text-[10px] font-bold opacity-60">Duration</div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {selectedMatchForDetails.kills && Object.values(selectedMatchForDetails.kills).some(v => v > 0) && (
                      <div className="bg-md-sys-surface2 p-6 rounded-3xl border border-md-sys-outline/5">
                          <div className="text-[10px] font-black uppercase opacity-60 mb-4 flex items-center gap-2"><Swords size={12}/> Combat Record (Eliminations)</div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {Object.entries(selectedMatchForDetails.kills).filter(([_, count]) => count > 0).map(([ship, count]) => (
                                  <div key={ship} className={`p-3 rounded-2xl flex justify-between items-center ${ship === 'AI Legion' ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-md-sys-surface1 border border-md-sys-outline/5'}`}>
                                      <span className={`text-[10px] font-bold uppercase ${ship === 'AI Legion' ? 'text-purple-300' : 'opacity-60'}`}>{ship.split('(')[0]}</span>
                                      <span className={`text-lg font-black ${ship === 'AI Legion' ? 'text-purple-200' : ''}`}>{count}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  <div className="bg-md-sys-surface2 p-6 rounded-3xl">
                      <div className="flex justify-between mb-4">
                          <div>
                              <div className="text-[10px] font-black uppercase opacity-60 mb-2">Squadron</div>
                              <div className="flex flex-wrap gap-2">
                                  {(selectedMatchForDetails.teammates || []).length > 0 ? (selectedMatchForDetails.teammates || []).map(t => (
                                      <span key={t} onClick={() => onDrillDown?.(t, 'Teammate')} className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-bold cursor-pointer hover:bg-blue-500/40 transition-colors">
                                          {t}
                                      </span>
                                  )) : <span className="opacity-40 text-xs italic">None</span>}
                              </div>
                          </div>
                          <div className="text-right">
                              <div className="text-[10px] font-black uppercase opacity-60 mb-2">Hostiles</div>
                              <div className="flex flex-wrap gap-2 justify-end">
                                  {(selectedMatchForDetails.opponents || []).length > 0 ? (selectedMatchForDetails.opponents || []).map(t => (
                                      <span key={t} onClick={() => onDrillDown?.(t, 'Opponent')} className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-xs font-bold cursor-pointer hover:bg-red-500/40 transition-colors">
                                          {t}
                                      </span>
                                  )) : <span className="opacity-40 text-xs italic">None</span>}
                              </div>
                          </div>
                      </div>
                  </div>

                  {selectedMatchForDetails.reachModifiers && selectedMatchForDetails.reachModifiers.length > 0 && (
                      <div className="bg-md-sys-surface2 p-4 rounded-3xl">
                          <div className="text-[10px] font-black uppercase opacity-60 mb-2">Modifiers & Artifacts</div>
                          <div className="flex flex-wrap gap-2">
                              {selectedMatchForDetails.reachModifiers.map(m => <span key={m} className="px-3 py-1 bg-md-sys-surface3 rounded-lg text-xs font-bold border border-md-sys-outline/10">{m}</span>)}
                          </div>
                      </div>
                  )}
                  
                  <div className="text-center text-[10px] font-mono opacity-30 uppercase tracking-widest mt-2">
                      ID: {selectedMatchForDetails.id} • {new Date(selectedMatchForDetails.timestamp).toLocaleString()}
                  </div>
              </div>
          </div>, document.body
      )}
    </div>
  );
};

export default HistoryTable;
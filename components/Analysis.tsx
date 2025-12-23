import React, { useState, useMemo } from 'react';
import { Player, Match } from '../types';
import { Card } from './Card';
import { predictMatchOutcome, GeneratedMatch } from '../services/autoMatchmaker';
import { User, Users, Swords, History, Calendar, ArrowRightLeft, BrainCircuit, Shield, CheckCircle2 } from 'lucide-react';

interface AnalysisProps {
  players: Player[];
  matches: Match[];
}

interface ComparisonStats {
  totalMatches: number;
  wins1: number;
  wins2: number;
  history: Match[];
}

export const Analysis: React.FC<AnalysisProps> = ({ players, matches }) => {
  const [mode, setMode] = useState<'individual' | 'pair'>('individual');
  
  // Individual Mode State
  const [selectedId1, setSelectedId1] = useState<string>('');
  const [selectedId2, setSelectedId2] = useState<string>('');

  // Pair Mode State (Pair A: p1 & p2 | Pair B: p3 & p4)
  const [pair1P1, setPair1P1] = useState<string>('');
  const [pair1P2, setPair1P2] = useState<string>('');
  const [pair2P1, setPair2P1] = useState<string>('');
  const [pair2P2, setPair2P2] = useState<string>('');

  // --- HELPER: PLAYER MAP & SORTED ---
  const playerMap = useMemo(() => {
    return new Map<string, Player>(players.map(p => [String(p.id), p]));
  }, [players]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  // --- AI PREDICTION LOGIC ---
  const aiPrediction: GeneratedMatch | null = useMemo(() => {
    try {
        if (mode === 'individual') {
            if (selectedId1 && selectedId2 && selectedId1 !== selectedId2) {
                return predictMatchOutcome([selectedId1], [selectedId2], players, matches);
            }
        } else {
             if (pair1P1 && pair1P2 && pair2P1 && pair2P2 && pair1P1 !== pair1P2 && pair2P1 !== pair2P2) {
                return predictMatchOutcome([pair1P1, pair1P2], [pair2P1, pair2P2], players, matches);
             }
        }
    } catch (e) {
        console.error("AI Prediction Error:", e);
    }
    return null;
  }, [mode, selectedId1, selectedId2, pair1P1, pair1P2, pair2P1, pair2P2, players, matches]);


  // --- LOGIC: COMPARE ---
  const stats = useMemo<ComparisonStats>(() => {
    // Validation
    if (mode === 'individual') {
        if (!selectedId1 || !selectedId2 || selectedId1 === selectedId2) {
            return { totalMatches: 0, wins1: 0, wins2: 0, history: [] };
        }
    } else {
        // Pair Mode Validation
        if (!pair1P1 || !pair1P2 || !pair2P1 || !pair2P2) return { totalMatches: 0, wins1: 0, wins2: 0, history: [] };
        // Unique players check (basic)
        if (pair1P1 === pair1P2 || pair2P1 === pair2P2) return { totalMatches: 0, wins1: 0, wins2: 0, history: [] };
    }

    const relevantMatches = matches.filter(m => {
        if (!m.team1 || !m.team2) return false;

        const team1Ids = m.team1.map(String);
        const team2Ids = m.team2.map(String);

        if (mode === 'individual') {
            const p1InTeam1 = team1Ids.includes(selectedId1);
            const p1InTeam2 = team2Ids.includes(selectedId1);
            const p2InTeam1 = team1Ids.includes(selectedId2);
            const p2InTeam2 = team2Ids.includes(selectedId2);

            return (p1InTeam1 && p2InTeam2) || (p1InTeam2 && p2InTeam1);
        } else {
            // Pair Mode Logic
            // Check if Team1 has Pair 1 members AND Team2 has Pair 2 members
            const t1HasPair1 = team1Ids.includes(pair1P1) && team1Ids.includes(pair1P2);
            const t2HasPair2 = team2Ids.includes(pair2P1) && team2Ids.includes(pair2P2);

            // Check reverse
            const t1HasPair2 = team1Ids.includes(pair2P1) && team1Ids.includes(pair2P2);
            const t2HasPair1 = team2Ids.includes(pair1P1) && team2Ids.includes(pair1P2);

            return (t1HasPair1 && t2HasPair2) || (t1HasPair2 && t2HasPair1);
        }
    });

    let wins1 = 0;
    let wins2 = 0;

    relevantMatches.forEach(m => {
        const team1Ids = m.team1.map(String);
        let isEntity1InTeam1 = false;
        
        if (mode === 'individual') {
            isEntity1InTeam1 = team1Ids.includes(selectedId1);
        } else {
            // In Pair mode, Entity 1 is Pair 1
            isEntity1InTeam1 = team1Ids.includes(pair1P1) && team1Ids.includes(pair1P2);
        }

        const winner = m.winner; 

        if (isEntity1InTeam1) {
            if (winner === 1) wins1++; else wins2++;
        } else {
            if (winner === 2) wins1++; else wins2++;
        }
    });

    const sortedHistory = relevantMatches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
        totalMatches: relevantMatches.length,
        wins1,
        wins2,
        history: sortedHistory
    };

  }, [matches, mode, selectedId1, selectedId2, pair1P1, pair1P2, pair2P1, pair2P2]);

  // --- RENDER HELPERS ---
  const getName = (side: 1 | 2) => {
      if (mode === 'individual') {
          const id = side === 1 ? selectedId1 : selectedId2;
          return playerMap.get(id)?.name || 'Unknown';
      } else {
          const p1 = side === 1 ? pair1P1 : pair2P1;
          const p2 = side === 1 ? pair1P2 : pair2P2;
          const n1 = playerMap.get(p1)?.name || '...';
          const n2 = playerMap.get(p2)?.name || '...';
          return `${n1} & ${n2}`;
      }
  };

  const getWinRate = (wins: number) => {
      if (stats.totalMatches === 0) return 0;
      return Math.round((wins / stats.totalMatches) * 100);
  };

  // Helper to check if a player ID is part of the "Focused" comparison
  const isComparedPlayer = (id: string) => {
      if (mode === 'individual') return id === selectedId1 || id === selectedId2;
      return [pair1P1, pair1P2, pair2P1, pair2P2].includes(id);
  };

  const renderNames = (ids: string[]) => {
      const safeIds = ids.map(String);
      return (
          <div className="flex flex-col text-xs sm:text-sm">
              {safeIds.map((id, idx) => {
                  const pName = playerMap.get(id)?.name || 'Unknown';
                  const isHighlighted = isComparedPlayer(id);
                  return (
                      <span key={idx} className={`${isHighlighted ? 'font-bold text-slate-900 bg-yellow-100 px-1 rounded w-fit' : 'text-slate-500'} truncate`}>
                          {pName}
                      </span>
                  );
              })}
          </div>
      );
  };

  // --- UI COMPONENTS FOR SELECTORS ---
  const PlayerSelect = ({ value, onChange, exclude, label }: { value: string, onChange: (val: string) => void, exclude: string[], label: string }) => (
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 bg-white border border-slate-300 rounded-lg shadow-sm text-slate-900 text-sm font-medium focus:ring-2 focus:ring-pickle-500 outline-none"
      >
        <option value="">{label}</option>
        {sortedPlayers.filter(p => !exclude.includes(String(p.id))).map(p => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
        ))}
      </select>
  );

  return (
    <div className="space-y-6 animate-fade-in">
        
        {/* MODE TOGGLE */}
        <div className="bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 flex gap-2">
             <button
                onClick={() => setMode('individual')}
                className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all text-sm ${mode === 'individual' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
             >
                 <User className="w-4 h-4" /> Cá Nhân
             </button>
             <button
                onClick={() => setMode('pair')}
                className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all text-sm ${mode === 'pair' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
             >
                 <Users className="w-4 h-4" /> Cặp Đôi
             </button>
        </div>

        {/* SELECTORS AREA */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            {mode === 'individual' ? (
                <div className="flex flex-col md:flex-row gap-4 items-center justify-center">
                    <div className="w-full md:w-1/3">
                        <PlayerSelect 
                            value={selectedId1} 
                            onChange={setSelectedId1} 
                            exclude={[selectedId2]} 
                            label="-- Chọn Người A --" 
                        />
                    </div>
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-500 font-black text-[10px] shrink-0">VS</div>
                    <div className="w-full md:w-1/3">
                        <PlayerSelect 
                            value={selectedId2} 
                            onChange={setSelectedId2} 
                            exclude={[selectedId1]} 
                            label="-- Chọn Người B --" 
                        />
                    </div>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    {/* Pair 1 Selector */}
                    <div className="flex-1 w-full bg-white p-3 rounded-lg border border-slate-200 shadow-sm relative">
                        <div className="absolute -top-2.5 left-3 px-2 bg-white text-[10px] font-bold text-pickle-600 uppercase tracking-wider border border-slate-100 rounded">
                            Cặp Đôi 1
                        </div>
                        <div className="flex flex-col gap-2 mt-1">
                            <PlayerSelect value={pair1P1} onChange={setPair1P1} exclude={[pair1P2, pair2P1, pair2P2]} label="Thành viên 1" />
                            <PlayerSelect value={pair1P2} onChange={setPair1P2} exclude={[pair1P1, pair2P1, pair2P2]} label="Thành viên 2" />
                        </div>
                    </div>

                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-white font-black text-[10px] shrink-0 shadow-lg z-10">
                        VS
                    </div>

                    {/* Pair 2 Selector */}
                    <div className="flex-1 w-full bg-white p-3 rounded-lg border border-slate-200 shadow-sm relative">
                        <div className="absolute -top-2.5 right-3 px-2 bg-white text-[10px] font-bold text-blue-600 uppercase tracking-wider border border-slate-100 rounded">
                            Cặp Đôi 2
                        </div>
                        <div className="flex flex-col gap-2 mt-1">
                            <PlayerSelect value={pair2P1} onChange={setPair2P1} exclude={[pair1P1, pair1P2, pair2P2]} label="Thành viên 1" />
                            <PlayerSelect value={pair2P2} onChange={setPair2P2} exclude={[pair1P1, pair1P2, pair2P1]} label="Thành viên 2" />
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* AI PREDICTION CARD */}
        {aiPrediction && (
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl p-5 text-white shadow-lg animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BrainCircuit className="w-32 h-32" />
                </div>
                
                <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
                    <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm shadow-inner shrink-0">
                        <BrainCircuit className="w-8 h-8 text-yellow-300 animate-pulse" />
                    </div>
                    
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="font-bold text-lg uppercase tracking-wider mb-1 flex items-center justify-center md:justify-start gap-2">
                            AI Nhận Định
                            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                                Match Quality: {aiPrediction.analysis.qualityScore.toFixed(0)}/100
                            </span>
                        </h3>
                        
                        <div className="mt-2 p-3 bg-white/10 rounded-lg border border-white/20">
                            {aiPrediction.handicap ? (
                                <div className="flex items-center gap-3">
                                    <Shield className="w-8 h-8 text-yellow-400 shrink-0" />
                                    <div className="text-left">
                                        <div className="font-bold text-yellow-300 text-lg leading-tight">
                                            Kèo Chấp: {aiPrediction.handicap.team === 1 ? (mode === 'pair' ? 'Cặp 1' : 'Người 1') : (mode === 'pair' ? 'Cặp 2' : 'Người 2')} chấp +{aiPrediction.handicap.points} điểm
                                        </div>
                                        <div className="text-xs text-white/80 italic mt-1">
                                            {aiPrediction.handicap.reason}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />
                                    <div className="text-left">
                                        <div className="font-bold text-green-300 text-lg leading-tight">
                                            Kèo Đồng Banh (Cân Bằng)
                                        </div>
                                        <div className="text-xs text-white/80 italic mt-1">
                                            Chênh lệch trình độ không đáng kể.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* COMPARISON DISPLAY */}
        {( (mode === 'individual' && selectedId1 && selectedId2) || (mode === 'pair' && pair1P1 && pair1P2 && pair2P1 && pair2P2) ) ? (
            <>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Stats Card */}
                <Card className="md:col-span-3 bg-white border-none shadow-lg overflow-hidden relative">
                    {/* Background decoration */}
                    <div className="absolute top-0 left-0 w-1/2 h-1 bg-pickle-500 z-10"></div>
                    <div className="absolute top-0 right-0 w-1/2 h-1 bg-blue-500 z-10"></div>
                    
                    <div className="flex flex-col gap-6 pt-4">
                        {/* HEAD TO HEAD HEADER */}
                        <div className="flex justify-between items-center text-center">
                             <div className="flex-1">
                                <h3 className="text-sm md:text-xl font-bold text-slate-900 truncate px-1 leading-tight">{getName(1)}</h3>
                                <div className="text-3xl md:text-4xl font-black text-pickle-600 mt-2">{stats.wins1}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Thắng</div>
                             </div>

                             <div className="flex flex-col items-center px-2">
                                 <div className="text-2xl md:text-3xl font-black text-slate-300">
                                     <Swords className="w-8 h-8 md:w-10 md:h-10" />
                                 </div>
                                 <div className="text-xs font-bold text-slate-500 mt-2 whitespace-nowrap bg-slate-100 px-2 py-0.5 rounded-full">{stats.totalMatches} Trận</div>
                             </div>

                             <div className="flex-1">
                                <h3 className="text-sm md:text-xl font-bold text-slate-900 truncate px-1 leading-tight">{getName(2)}</h3>
                                <div className="text-3xl md:text-4xl font-black text-blue-600 mt-2">{stats.wins2}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Thắng</div>
                             </div>
                        </div>

                        {/* WINRATE BAR */}
                        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                            {stats.totalMatches > 0 ? (
                                <>
                                    <div 
                                        style={{ width: `${getWinRate(stats.wins1)}%` }}
                                        className="h-full bg-pickle-500 transition-all duration-500"
                                    ></div>
                                    <div 
                                        style={{ width: `${getWinRate(stats.wins2)}%` }}
                                        className="h-full bg-blue-500 transition-all duration-500"
                                    ></div>
                                </>
                            ) : (
                                <div className="w-full h-full bg-slate-200"></div>
                            )}
                        </div>
                        <div className="flex justify-between text-xs font-bold text-slate-500 px-1">
                            <span>{getWinRate(stats.wins1)}% Win Rate</span>
                            <span>{getWinRate(stats.wins2)}% Win Rate</span>
                        </div>
                    </div>
                </Card>
             </div>

             {/* HISTORY LIST */}
             <div className="space-y-3">
                 <h4 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                     <History className="w-5 h-5" /> Lịch sử đối đầu
                 </h4>
                 {stats.history.length > 0 ? (
                    <div className="space-y-2">
                        {stats.history.map(match => {
                             const team1Ids = match.team1.map(String);
                             const team2Ids = match.team2.map(String);

                             // Determine if Entity 1 is Team 1
                             let isE1Team1 = false;
                             if (mode === 'individual') {
                                 isE1Team1 = team1Ids.includes(selectedId1);
                             } else {
                                 isE1Team1 = team1Ids.includes(pair1P1) && team1Ids.includes(pair1P2);
                             }
                             
                             const teamLeftIds = isE1Team1 ? team1Ids : team2Ids;
                             const teamRightIds = isE1Team1 ? team2Ids : team1Ids;

                             const scoreLeft = isE1Team1 ? match.score1 : match.score2;
                             const scoreRight = isE1Team1 ? match.score2 : match.score1;
                             
                             const winner = match.winner;
                             const isLeftWin = (isE1Team1 && winner === 1) || (!isE1Team1 && winner === 2);

                             return (
                                <div key={match.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                                    <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-1">
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(match.date).toLocaleDateString('vi-VN')}
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${match.type === 'tournament' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-yellow-50 text-yellow-600 border-yellow-100'}`}>
                                            {match.type === 'tournament' ? 'GIẢI ĐẤU' : 'KÈO'}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className={`flex-1 ${isLeftWin ? 'opacity-100' : 'opacity-70'}`}>
                                            {renderNames(teamLeftIds)}
                                        </div>

                                        <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4">
                                            <div className={`text-lg sm:text-xl font-mono font-black ${isLeftWin ? 'text-green-600' : 'text-slate-400'}`}>
                                                {scoreLeft}
                                            </div>
                                            <div className="text-slate-300 font-bold">-</div>
                                            <div className={`text-lg sm:text-xl font-mono font-black ${!isLeftWin ? 'text-green-600' : 'text-slate-400'}`}>
                                                {scoreRight}
                                            </div>
                                        </div>

                                        <div className={`flex-1 text-right ${!isLeftWin ? 'opacity-100' : 'opacity-70'}`}>
                                            {renderNames(teamRightIds)}
                                        </div>
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                 ) : (
                    <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Chưa có trận đấu nào giữa hai bên.
                    </div>
                 )}
             </div>
            </>
        ) : (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
                 <ArrowRightLeft className="w-16 h-16 mb-4 opacity-20" />
                 <p>Vui lòng chọn đầy đủ người chơi để so sánh.</p>
            </div>
        )}
    </div>
  );
};
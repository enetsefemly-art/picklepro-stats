import React, { useMemo, useState } from 'react';
import { Player, Match } from '../types';
import { calculatePlayerStats } from '../services/storageService';
import { Trophy, Medal, TrendingUp, TrendingDown, Filter, Banknote, Users, User } from 'lucide-react';

interface LeaderboardProps {
  players: Player[]; // Original list of players
  matches: Match[]; // All matches to calculate from
}

type FilterType = 'all' | 'month' | 'week' | 'day';
type LeaderboardType = 'betting' | 'tournament';
type TournamentViewType = 'pairs' | 'individual';

interface PairStats {
    id: string; // "p1-p2"
    playerIds: string[];
    names: string;
    wins: number;
    losses: number;
    pointsScored: number;
    pointsConceded: number;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ players: initialPlayers, matches }) => {
  const [activeTab, setActiveTab] = useState<LeaderboardType>('betting');
  const [tournamentView, setTournamentView] = useState<TournamentViewType>('pairs');
  const [sortBy, setSortBy] = useState<'points' | 'wins' | 'winRate'>('points');
  
  // Advanced Filter State - DEFAULT IS 'month'
  const [filterType, setFilterType] = useState<FilterType>('month');
  
  // Time States
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedDay, setSelectedDay] = useState<string>(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  
  const getCurrentWeekVal = () => {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNumber = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  };
  const [selectedWeek, setSelectedWeek] = useState<string>(getCurrentWeekVal());

  // Filter matches based on time selection AND tab type
  const filteredMatches = useMemo(() => {
    return matches.filter(match => {
        // 1. Filter by Tab Type
        const matchType = match.type || 'betting';
        if (matchType !== activeTab) return false;

        // 2. Filter by Date
        if (filterType === 'all') return true;
        
        const matchDate = new Date(match.date);
        
        if (filterType === 'day') {
            return match.date.startsWith(selectedDay);
        }

        if (filterType === 'month') {
             return match.date.startsWith(selectedMonth);
        }
        
        if (filterType === 'week') {
            const d = new Date(matchDate);
            d.setHours(0,0,0,0);
            d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
            const week1 = new Date(d.getFullYear(), 0, 4);
            const weekNumber = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
            const matchWeekVal = `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
            
            return matchWeekVal === selectedWeek;
        }
        
        return true;
    });
  }, [matches, filterType, selectedMonth, selectedWeek, selectedDay, activeTab]);

  // --- BETTING (Individual) LOGIC ---
  const bettingStats = useMemo(() => {
    if (activeTab !== 'betting') return [];
    // Recalculate stats based ONLY on filtered matches
    return calculatePlayerStats(initialPlayers, filteredMatches);
  }, [initialPlayers, filteredMatches, activeTab]);

  const sortedBettingPlayers = useMemo(() => {
    return [...bettingStats]
      .filter(p => p.matchesPlayed > 0) // HIDE PLAYERS WITH 0 MATCHES
      .sort((a, b) => {
      if (sortBy === 'points') {
        if (b.totalRankingPoints !== a.totalRankingPoints) return b.totalRankingPoints - a.totalRankingPoints;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.pointsScored - b.pointsConceded) - (a.pointsScored - a.pointsConceded);
      } else if (sortBy === 'wins') {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.pointsScored - b.pointsConceded) - (a.pointsScored - a.pointsConceded);
      } else {
        const rateA = a.matchesPlayed ? a.wins / a.matchesPlayed : 0;
        const rateB = b.matchesPlayed ? b.wins / b.matchesPlayed : 0;
        if (rateB !== rateA) return rateB - rateA;
         return (b.pointsScored - b.pointsConceded) - (a.pointsScored - a.pointsConceded);
      }
    });
  }, [bettingStats, sortBy]);


  // --- TOURNAMENT (Pair) LOGIC ---
  const sortedTournamentPairs = useMemo(() => {
      if (activeTab !== 'tournament' || tournamentView !== 'pairs') return [];

      const pairsMap = new Map<string, PairStats>();
      const playerLookup = new Map<string, Player>(initialPlayers.map(p => [p.id, p] as [string, Player]));

      const getPairId = (ids: string[]) => ids.slice().sort().join('-');
      const getPairName = (ids: string[]) => ids.map(id => playerLookup.get(id)?.name || 'Unknown').join(' & ');

      // Pre-calculate H2H Matrix to use in sorting
      // Map<pairId, Map<opponentPairId, netWins>>
      // netWins > 0 means key beat opponent
      const h2hMatrix = new Map<string, Map<string, number>>();
      
      const updateH2H = (p1Id: string, p2Id: string, winner: 1 | 2) => {
          if (!h2hMatrix.has(p1Id)) h2hMatrix.set(p1Id, new Map());
          if (!h2hMatrix.has(p2Id)) h2hMatrix.set(p2Id, new Map());
          
          const val1 = h2hMatrix.get(p1Id)!.get(p2Id) || 0;
          const val2 = h2hMatrix.get(p2Id)!.get(p1Id) || 0;

          if (winner === 1) {
              h2hMatrix.get(p1Id)!.set(p2Id, val1 + 1);
              h2hMatrix.get(p2Id)!.set(p1Id, val2 - 1);
          } else {
              h2hMatrix.get(p1Id)!.set(p2Id, val1 - 1);
              h2hMatrix.get(p2Id)!.set(p1Id, val2 + 1);
          }
      };

      filteredMatches.forEach(match => {
          if (match.team1.length === 0 || match.team2.length === 0) return;

          const pId1 = getPairId(match.team1);
          const pId2 = getPairId(match.team2);
          
          // --- APPLY SAME SCORE FIX LOGIC AS INDIVIDUAL STATS ---
          let s1 = Number(match.score1);
          let s2 = Number(match.score2);
          if (isNaN(s1)) s1 = 0;
          if (isNaN(s2)) s2 = 0;
          const winner = Number(match.winner);

          if (winner === 1 && s1 <= s2) s1 = s2 + 1;
          else if (winner === 2 && s2 <= s1) s2 = s1 + 1;
          // ----------------------------------------------------

          // Process Team 1 Stats
          if (!pairsMap.has(pId1)) {
              pairsMap.set(pId1, { id: pId1, playerIds: match.team1, names: getPairName(match.team1), wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 });
          }
          const stats1 = pairsMap.get(pId1)!;
          stats1.pointsScored += s1;
          stats1.pointsConceded += s2;
          if (winner === 1) stats1.wins++;
          else stats1.losses++;

          // Process Team 2 Stats
          if (!pairsMap.has(pId2)) {
            pairsMap.set(pId2, { id: pId2, playerIds: match.team2, names: getPairName(match.team2), wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 });
          }
          const stats2 = pairsMap.get(pId2)!;
          stats2.pointsScored += s2;
          stats2.pointsConceded += s1;
          if (winner === 2) stats2.wins++;
          else stats2.losses++;
          
          // Update H2H
          updateH2H(pId1, pId2, match.winner);
      });

      const pairs = Array.from(pairsMap.values());

      return pairs
          .filter(p => (p.wins + p.losses) > 0) // HIDE PAIRS WITH 0 MATCHES
          .sort((a, b) => {
              // 1. Match Differential (Wins - Losses)
              const diffA = a.wins - a.losses;
              const diffB = b.wins - b.losses;
              if (diffA !== diffB) return diffB - diffA;

              // 2. Head to Head Record
              const h2h = h2hMatrix.get(a.id)?.get(b.id) || 0;
              if (h2h !== 0) {
                  // If h2h > 0, A beat B (net). We want A first (negative return).
                  return -h2h;
              }

              // 3. Point Differential
              const pDiffA = a.pointsScored - a.pointsConceded;
              const pDiffB = b.pointsScored - b.pointsConceded;
              return pDiffB - pDiffA;
          });

  }, [activeTab, tournamentView, filteredMatches, initialPlayers]);

  // --- TOURNAMENT (Individual) LOGIC ---
  const sortedTournamentIndividuals = useMemo(() => {
    if (activeTab !== 'tournament' || tournamentView !== 'individual') return [];

    const statsMap = new Map<string, {
        player: Player;
        wins: number;
        losses: number;
    }>();

    // Init stats for all players to ensure we have base data
    initialPlayers.forEach(p => {
        statsMap.set(p.id, { player: p, wins: 0, losses: 0 });
    });

    // Populate wins/losses from filtered matches (for this period)
    filteredMatches.forEach(m => {
        const isTeam1Win = m.winner === 1;
        m.team1.forEach(id => {
            const s = statsMap.get(id);
            if(s) isTeam1Win ? s.wins++ : s.losses++;
        });
        m.team2.forEach(id => {
            const s = statsMap.get(id);
            if(s) !isTeam1Win ? s.wins++ : s.losses++;
        });
    });

    return Array.from(statsMap.values())
        .map(item => {
             // Use the PRE-CALCULATED tournament rating from App State
             // Fallback to initial logic if undefined, but it should be defined by calculatePlayerStats now
             const rating = item.player.tournamentRating || (item.player.initialPoints || 0) > 20 ? 6.0 : (item.player.initialPoints || 6.0);
             
             return {
                 ...item,
                 rating
             };
        })
        .filter(item => (item.wins + item.losses) > 0) // HIDE PLAYERS WITH 0 MATCHES IN TOURNAMENT
        .sort((a, b) => {
            // Sort by Rating (High to Low)
            if (b.rating !== a.rating) return b.rating - a.rating;
            // Then by Wins
            return b.wins - a.wins;
        });
  }, [activeTab, tournamentView, filteredMatches, initialPlayers]);


  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="font-mono text-slate-500 w-5 text-center">{index + 1}</span>;
  };

  return (
    <div className="space-y-4">
       {/* Top Tabs */}
       <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
            <button
                onClick={() => setActiveTab('betting')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm transition-all ${
                    activeTab === 'betting' 
                    ? 'bg-pickle-600 text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
                <Banknote className="w-4 h-4" /> BXH Kèo
            </button>
            <button
                onClick={() => setActiveTab('tournament')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm transition-all ${
                    activeTab === 'tournament' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
                <Trophy className="w-4 h-4" /> BXH Giải
            </button>
        </div>

      {/* Filter Controls */}
      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        
        {/* Time Filters - High Contrast Mode */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between w-full border-b border-slate-100 pb-3 mb-1">
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-bold text-slate-900">Thời gian:</span>
                <select 
                    value={filterType} 
                    onChange={(e) => setFilterType(e.target.value as FilterType)}
                    className="text-sm border border-slate-300 bg-white rounded-md px-2 py-1 focus:ring-2 focus:ring-pickle-500 font-bold text-slate-900"
                >
                    <option value="day">Theo Ngày</option>
                    <option value="month">Theo Tháng</option>
                    <option value="week">Theo Tuần</option>
                    <option value="all">Toàn bộ</option>
                </select>
            </div>

            {/* Specific Date Pickers based on Type - High Contrast */}
            {filterType === 'day' && (
                <input 
                    type="date" 
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="text-sm border border-slate-300 bg-white rounded-md px-2 py-1 text-slate-900 font-bold focus:outline-none focus:border-pickle-500 shadow-sm"
                />
            )}

            {filterType === 'month' && (
                <input 
                    type="month" 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="text-sm border border-slate-300 bg-white rounded-md px-2 py-1 text-slate-900 font-bold focus:outline-none focus:border-pickle-500 shadow-sm"
                />
            )}

            {filterType === 'week' && (
                <input 
                    type="week" 
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="text-sm border border-slate-300 bg-white rounded-md px-2 py-1 text-slate-900 font-bold focus:outline-none focus:border-pickle-500 shadow-sm"
                />
            )}
        </div>

        {/* View Controls */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
            {/* Betting Sort */}
            {activeTab === 'betting' && (
                <div className="flex flex-wrap gap-2 text-sm w-full sm:w-auto">
                    <span className="text-sm font-bold text-slate-900 mr-2 flex items-center w-full sm:w-auto mb-2 sm:mb-0">Xếp theo:</span>
                    <button
                        onClick={() => setSortBy('points')}
                        className={`flex-1 sm:flex-none px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors font-medium ${sortBy === 'points' ? 'bg-pickle-600 border-pickle-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}
                    >
                        Điểm
                    </button>
                    <button
                        onClick={() => setSortBy('wins')}
                        className={`flex-1 sm:flex-none px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors font-medium ${sortBy === 'wins' ? 'bg-pickle-600 border-pickle-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}
                    >
                        Thắng
                    </button>
                    <button
                        onClick={() => setSortBy('winRate')}
                        className={`flex-1 sm:flex-none px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors font-medium ${sortBy === 'winRate' ? 'bg-pickle-600 border-pickle-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}
                    >
                        Tỉ Lệ
                    </button>
                </div>
            )}

            {/* Tournament View Toggle */}
            {activeTab === 'tournament' && (
                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-full sm:w-auto">
                    <button
                        onClick={() => setTournamentView('pairs')}
                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                            tournamentView === 'pairs' 
                            ? 'bg-pickle-600 text-white shadow-sm' 
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Users className="w-4 h-4" /> Cặp Đôi
                    </button>
                    <button
                        onClick={() => setTournamentView('individual')}
                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                            tournamentView === 'individual' 
                            ? 'bg-pickle-600 text-white shadow-sm' 
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <User className="w-4 h-4" /> Cá Nhân
                    </button>
                </div>
            )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-0 sm:p-0">
        <div className="w-full">
          <table className="w-full text-sm text-left table-fixed">
            <thead className="bg-slate-50 text-slate-700 uppercase text-[10px] sm:text-xs font-bold border-b border-slate-100">
              <tr>
                <th className="hidden sm:table-cell px-4 py-4 w-16">Hạng</th>
                <th className="px-3 sm:px-6 py-4 w-[50%] sm:w-auto">
                    {activeTab === 'betting' ? 'Người Chơi' : (tournamentView === 'pairs' ? 'Cặp Đôi' : 'Người Chơi')}
                </th>
                
                {activeTab === 'betting' && <th className="px-1 sm:px-6 py-4 text-center w-[20%] sm:w-auto">Điểm XH</th>}
                
                {activeTab === 'tournament' && tournamentView === 'individual' && (
                    <th className="px-1 sm:px-6 py-4 text-center w-[20%] sm:w-auto">Rating</th>
                )}

                <th className="hidden sm:table-cell px-6 py-4 text-center">Trận</th>
                <th className="px-2 sm:px-6 py-4 text-center w-[30%] sm:w-auto">Thắng/Thua</th>
                
                {activeTab === 'betting' && <th className="hidden sm:table-cell px-6 py-4 text-center">Tỉ Lệ</th>}
                
                {(activeTab === 'betting' || tournamentView === 'pairs') && (
                     <th className="hidden sm:table-cell px-6 py-4 text-right">Hiệu Số</th>
                )}
                
                {activeTab === 'tournament' && tournamentView === 'pairs' && (
                    <th className="hidden sm:table-cell px-6 py-4 text-right">HS (Điểm)</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* BETTING LIST */}
              {activeTab === 'betting' && sortedBettingPlayers.map((player, index) => {
                const winRate = player.matchesPlayed > 0 ? Math.round((player.wins / player.matchesPlayed) * 100) : 0;
                const pointDiff = player.pointsScored - player.pointsConceded;
                
                return (
                  <tr key={player.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* PC Rank */}
                    <td className="hidden sm:table-cell px-6 py-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {getRankIcon(index)}
                      </div>
                    </td>
                    
                    {/* Name & Mobile Info */}
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-center gap-2 sm:gap-0">
                         {/* Mobile Rank Badge */}
                         <div className="sm:hidden flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center border border-slate-200">
                             {index + 1}
                         </div>
                         <div className="flex flex-col min-w-0">
                            <div className="font-semibold text-slate-900 truncate text-sm sm:text-base">{player.name}</div>
                            {/* Mobile Stats Subtext */}
                            <div className="flex items-center gap-2 sm:hidden text-[10px] text-slate-500 mt-0.5">
                                <span className={`${winRate >= 50 ? 'text-green-600' : 'text-orange-500'}`}>{winRate}% Win</span>
                                <span>•</span>
                                <span className={`${pointDiff > 0 ? 'text-green-600' : 'text-slate-400'}`}>{pointDiff > 0 ? '+' : ''}{pointDiff} HS</span>
                            </div>
                         </div>
                      </div>
                    </td>
                    
                    {/* Points */}
                    <td className="px-1 sm:px-6 py-3 sm:py-4 text-center">
                        <span className="font-bold text-pickle-700 bg-pickle-50/50 px-2 py-1 rounded text-sm sm:text-base">
                            {player.totalRankingPoints}
                        </span>
                    </td>
                    
                    {/* PC Matches */}
                    <td className="hidden sm:table-cell px-6 py-4 text-center text-slate-700 font-medium">{player.matchesPlayed}</td>
                    
                    {/* W/L */}
                    <td className="px-2 sm:px-6 py-3 sm:py-4 text-center font-medium text-slate-700 text-xs sm:text-sm">
                        <span className="text-green-600">{player.wins}</span> / <span className="text-slate-400">{player.losses}</span>
                        <div className="sm:hidden text-[10px] text-slate-400 mt-0.5">({player.matchesPlayed} trận)</div>
                    </td>
                    
                    {/* PC Winrate */}
                    <td className="hidden sm:table-cell px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`${winRate >= 50 ? 'text-green-600' : 'text-orange-500'} font-medium`}>{winRate}%</span>
                      </div>
                    </td>
                    
                    {/* PC Diff */}
                    <td className="hidden sm:table-cell px-6 py-4 text-right">
                       <span className={`inline-flex items-center gap-1 ${pointDiff > 0 ? 'text-green-600' : pointDiff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                         {pointDiff > 0 ? '+' : ''}{pointDiff}
                         {pointDiff > 0 ? <TrendingUp className="w-3 h-3"/> : pointDiff < 0 ? <TrendingDown className="w-3 h-3"/> : null}
                       </span>
                    </td>
                  </tr>
                );
              })}

              {/* TOURNAMENT PAIRS LIST */}
              {activeTab === 'tournament' && tournamentView === 'pairs' && sortedTournamentPairs.map((pair, index) => {
                  const matchDiff = pair.wins - pair.losses;
                  const pointDiff = pair.pointsScored - pair.pointsConceded;
                  const totalMatches = pair.wins + pair.losses;

                  return (
                    <tr key={pair.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="hidden sm:table-cell px-6 py-4 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                                {getRankIcon(index)}
                            </div>
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4">
                            <div className="flex items-center gap-2 sm:gap-0">
                                <div className="sm:hidden flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center border border-slate-200">
                                     {index + 1}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <div className="font-semibold text-slate-900 whitespace-pre-wrap text-xs sm:text-base leading-tight">{pair.names}</div>
                                    <div className="flex items-center gap-2 sm:hidden text-[10px] text-slate-500 mt-1">
                                         <span>HS: {matchDiff > 0 ? '+' : ''}{matchDiff}</span>
                                    </div>
                                </div>
                            </div>
                        </td>
                        
                        {/* Hidden Points Col placeholder for alignment if needed, but not used here for pairs usually */}
                        
                        <td className="hidden sm:table-cell px-6 py-4 text-center text-slate-700 font-medium">{totalMatches}</td>
                        <td className="px-2 sm:px-6 py-3 sm:py-4 text-center font-medium text-slate-700 text-xs sm:text-sm">
                            <span className="text-pickle-600">{pair.wins}</span> - <span className="text-red-500">{pair.losses}</span>
                            <div className="sm:hidden text-[10px] text-slate-400 mt-0.5">({totalMatches} trận)</div>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 text-right font-bold text-slate-800">
                            {matchDiff > 0 ? '+' : ''}{matchDiff}
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 text-right text-slate-500">
                            {pointDiff > 0 ? '+' : ''}{pointDiff}
                        </td>
                    </tr>
                  )
              })}

              {/* TOURNAMENT INDIVIDUALS LIST */}
              {activeTab === 'tournament' && tournamentView === 'individual' && sortedTournamentIndividuals.map((item, index) => {
                  return (
                    <tr key={item.player.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="hidden sm:table-cell px-6 py-4 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                                {getRankIcon(index)}
                            </div>
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4">
                            <div className="flex items-center gap-2 sm:gap-0">
                                <div className="sm:hidden flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center border border-slate-200">
                                     {index + 1}
                                </div>
                                <div className="font-semibold text-slate-900 text-sm sm:text-base truncate">{item.player.name}</div>
                            </div>
                        </td>
                        <td className="px-1 sm:px-6 py-3 sm:py-4 text-center">
                            <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs sm:text-sm font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                {item.rating.toFixed(1)}
                            </div>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 text-center text-slate-700 font-medium">{item.wins + item.losses}</td>
                        <td className="px-2 sm:px-6 py-3 sm:py-4 text-center font-medium text-slate-700 text-xs sm:text-sm">
                            <span className="text-pickle-600">{item.wins}</span> - <span className="text-red-500">{item.losses}</span>
                            <div className="sm:hidden text-[10px] text-slate-400 mt-0.5">({item.wins + item.losses} trận)</div>
                        </td>
                    </tr>
                  )
              })}
            </tbody>
          </table>
        </div>
        
        {/* Empty States */}
        {((activeTab === 'betting' && sortedBettingPlayers.length === 0) || 
          (activeTab === 'tournament' && tournamentView === 'pairs' && sortedTournamentPairs.length === 0) ||
          (activeTab === 'tournament' && tournamentView === 'individual' && sortedTournamentIndividuals.length === 0)
         ) && (
          <div className="p-8 text-center text-slate-500">
              <p className="mb-2">Chưa có dữ liệu cho bộ lọc này.</p>
              <p className="text-xs">Chỉ những người chơi đã thi đấu trong thời gian chọn mới được hiển thị.</p>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Match, Player } from '../types';
import { Card } from './Card';
import { Trash2, Calendar, Filter, X, Banknote, Trophy, User } from 'lucide-react';

interface RecentMatchesProps {
  matches: Match[];
  players: Player[];
  onDeleteMatch?: (id: string) => void;
}

export const RecentMatches: React.FC<RecentMatchesProps> = ({ matches, players, onDeleteMatch }) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'betting' | 'tournament'>('betting');

  // Memoize player map for performance and stability
  const playerMap = useMemo(() => {
    return new Map<string, Player>(players.map(p => [String(p.id), p]));
  }, [players]);

  // Sort players for dropdown
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const getNames = (ids: string[]) => {
    if (!ids || ids.length === 0) return '---';
    return ids.map(id => playerMap.get(String(id))?.name || 'Unknown').join(' & ');
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatGroupDate = (isoString: string) => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(isoString).toLocaleDateString('vi-VN', options);
  };

  // Filter and Sort Matches
  const filteredAndSortedMatches = useMemo(() => {
    // 1. Filter by Tab (Type)
    let result = matches.filter(m => {
        const type = m.type || 'betting'; // Handle legacy data
        return type === activeTab;
    });

    // 2. Filter by date if selected
    if (selectedDate) {
      result = result.filter(m => {
        return m.date.startsWith(selectedDate);
      });
    }

    // 3. Filter by Player if selected
    if (selectedPlayerId) {
      result = result.filter(m => {
         const t1 = m.team1.map(String);
         const t2 = m.team2.map(String);
         return t1.includes(selectedPlayerId) || t2.includes(selectedPlayerId);
      });
    }

    // 4. Sort Descending
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches, selectedDate, selectedPlayerId, activeTab]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation(); 
    setTimeout(() => {
        if (onDeleteMatch && window.confirm('Bạn có chắc muốn xóa trận đấu này? Lịch sử điểm số sẽ được cập nhật lại.')) {
            onDeleteMatch(id);
        }
    }, 10);
  };

  // Grouping Logic
  const groupedMatches: { date: string, matches: Match[] }[] = [];
  filteredAndSortedMatches.forEach(match => {
    const dateKey = match.date.split('T')[0];
    const lastGroup = groupedMatches[groupedMatches.length - 1];
    
    if (lastGroup && lastGroup.date === dateKey) {
      lastGroup.matches.push(match);
    } else {
      groupedMatches.push({ date: dateKey, matches: [match] });
    }
  });

  return (
    <div className="space-y-4">
        {/* Tabs - INCREASED CONTRAST */}
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 sticky top-16 z-30">
            <button
                onClick={() => setActiveTab('betting')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm transition-all ${
                    activeTab === 'betting' 
                    ? 'bg-pickle-600 text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
                <Banknote className="w-4 h-4" /> Lịch Sử Kèo
            </button>
            <button
                onClick={() => setActiveTab('tournament')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm transition-all ${
                    activeTab === 'tournament' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
                <Trophy className="w-4 h-4" /> Lịch Sử Giải
            </button>
        </div>

        <Card className="h-full flex flex-col p-0 sm:p-6" classNameTitle="px-4">
          {/* Filters Control */}
          <div className="flex flex-col sm:flex-row gap-2 mb-2 mx-2 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100 sticky top-0 z-20">
              {/* Date Filter */}
              <div className="flex items-center gap-2">
                  <Filter className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-700 font-bold whitespace-nowrap">Ngày:</span>
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-pickle-500 w-full sm:w-auto h-7"
                  />
                  {selectedDate && (
                    <button 
                        onClick={() => setSelectedDate('')}
                        className="p-1 hover:bg-slate-200 rounded-full transition-colors flex-shrink-0"
                        title="Xóa lọc ngày"
                    >
                        <X className="w-3 h-3 text-slate-500" />
                    </button>
                  )}
              </div>

              {/* Player Filter */}
              <div className="flex items-center gap-2 sm:ml-4">
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-700 font-bold whitespace-nowrap">Người chơi:</span>
                  <select 
                      value={selectedPlayerId}
                      onChange={(e) => setSelectedPlayerId(e.target.value)}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-pickle-500 w-full sm:w-auto h-7"
                  >
                      <option value="">Tất cả</option>
                      {sortedPlayers.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                   {selectedPlayerId && (
                    <button 
                        onClick={() => setSelectedPlayerId('')}
                        className="p-1 hover:bg-slate-200 rounded-full transition-colors flex-shrink-0"
                        title="Xóa lọc người chơi"
                    >
                        <X className="w-3 h-3 text-slate-500" />
                    </button>
                  )}
              </div>
          </div>

          {/* Matches List - ADDED SCROLL CONTAINER */}
          <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-250px)] px-2 pb-4">
              {groupedMatches.map(group => (
              <div key={group.date} className="space-y-2">
                  {/* Date Separator */}
                  <div className="flex items-center gap-3 py-1 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                    <div className="h-px flex-1 bg-slate-100"></div>
                    <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[10px] uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                        <Calendar className="w-3 h-3" />
                        {formatGroupDate(group.date)}
                    </div>
                    <div className="h-px flex-1 bg-slate-100"></div>
                  </div>

                  {/* Matches in this group */}
                  {group.matches.map(match => (
                  <div key={match.id} className="relative flex flex-col justify-center p-2 rounded border border-slate-100 bg-white hover:border-slate-300 transition-colors shadow-sm gap-1">
                      
                      {/* Header Line */}
                      <div className="flex items-center justify-between text-[10px] leading-none">
                          <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-500">{formatDate(match.date).split(' ')[1]}</span>
                              <span className="text-slate-300">|</span>
                              
                              {/* TYPE BADGE (Static) */}
                              <span 
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${
                                    (match.type || 'betting') === 'tournament'
                                    ? 'bg-blue-50 text-blue-600 border-blue-100'
                                    : 'bg-yellow-50 text-yellow-600 border-yellow-100'
                                }`}
                              >
                                 <span className="font-bold">{(match.type || 'betting') === 'tournament' ? 'GIẢI' : 'KÈO'}</span>
                              </span>

                              <span>{match.team1.length === 1 ? 'Đơn' : 'Đôi'}</span>
                              {match.rankingPoints && (match.type || 'betting') === 'betting' && (
                                  <span className="text-green-600 font-bold ml-1">
                                  +{match.rankingPoints}
                                  </span>
                              )}
                          </div>
                          
                          {onDeleteMatch && (
                              <button 
                                  type="button"
                                  onClick={(e) => handleDelete(e, match.id)}
                                  className="text-slate-300 hover:text-red-500 p-1 -mr-1 -mt-1"
                                  title="Xóa trận đấu"
                              >
                                  <Trash2 className="w-3.5 h-3.5" />
                              </button>
                          )}
                      </div>
                      
                      {/* Match Content */}
                      <div className="flex items-center justify-between gap-2">
                          {/* Team 1 */}
                          <div className={`flex-1 text-right text-xs leading-tight line-clamp-2 ${match.winner === 1 ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                            {getNames(match.team1)}
                          </div>

                          {/* Score */}
                          <div className="flex-shrink-0 flex items-center justify-center gap-0.5 w-12 h-6 bg-slate-50 rounded border border-slate-200 font-mono font-bold text-sm">
                            <span className={match.winner === 1 ? 'text-pickle-600' : 'text-slate-400'}>{match.score1}</span>
                            <span className="text-slate-300 text-[10px] mx-0.5">-</span>
                            <span className={match.winner === 2 ? 'text-blue-600' : 'text-slate-400'}>{match.score2}</span>
                          </div>

                          {/* Team 2 */}
                          <div className={`flex-1 text-left text-xs leading-tight line-clamp-2 ${match.winner === 2 ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                            {getNames(match.team2)}
                          </div>
                      </div>
                  </div>
                  ))}
              </div>
              ))}

              {filteredAndSortedMatches.length === 0 && (
                  <div className="text-center text-slate-400 py-8 text-sm">Không tìm thấy trận đấu nào.</div>
              )}
          </div>
        </Card>
    </div>
  );
};

import React, { useMemo } from 'react';
import { Player, Match } from '../types';
import { Card } from './Card';
import { Trophy, TrendingUp, DollarSign, X, AlertTriangle, Target, Gamepad2, Award, Handshake, HeartCrack, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell } from 'recharts';

interface PlayerProfileProps {
  player: Player;
  players: Player[]; // Full list to lookup names
  matches: Match[];
  onClose: () => void;
}

interface RivalStats {
    id: string;
    name: string;
    matchesWith: number; // Matches played against
    winsAgainst: number;
    winRate: number;
}

interface PartnerStats {
    id: string;
    name: string;
    matchesTogether: number;
    winsTogether: number;
    winRate: number;
}

export const PlayerProfile: React.FC<PlayerProfileProps> = ({ player, players, matches, onClose }) => {
  
  // Create a lookup for player names
  // Ensure keys are Strings for safe lookup
  const playerLookup = useMemo(() => new Map(players.map(p => [String(p.id), p])), [players]);

  // --- ANALYSIS LOGIC ---
  const analysis = useMemo(() => {
    // 1. Filter matches involving this player
    // Strict String comparison for IDs
    const currentPid = String(player.id);
    
    const playerMatches = matches
        .filter(m => {
            const t1 = m.team1?.map(String) || [];
            const t2 = m.team2?.map(String) || [];
            return t1.includes(currentPid) || t2.includes(currentPid);
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Data containers
    const opponentsMap = new Map<string, { wins: number; total: number }>();
    const partnersMap = new Map<string, { wins: number; total: number }>();

    playerMatches.forEach(m => {
        const t1 = m.team1.map(String);
        const t2 = m.team2.map(String);
        
        const isTeam1 = t1.includes(currentPid);
        
        // --- RIVAL LOGIC (Opponents) ---
        const opponentIds = isTeam1 ? t2 : t1;
        const winner = Number(m.winner);
        const isWin = isTeam1 ? winner === 1 : winner === 2;

        opponentIds.forEach(oppId => {
            // Skip if playing against self (bug safety)
            if (oppId === currentPid) return;

            if (!opponentsMap.has(oppId)) opponentsMap.set(oppId, { wins: 0, total: 0 });
            const stat = opponentsMap.get(oppId)!;
            stat.total += 1;
            if (isWin) stat.wins += 1;
        });

        // --- PARTNER LOGIC (Teammates) ---
        // Find the OTHER player in my team
        const myTeam = isTeam1 ? t1 : t2;
        const partnerId = myTeam.find(id => id !== currentPid);

        if (partnerId) {
            if (!partnersMap.has(partnerId)) partnersMap.set(partnerId, { wins: 0, total: 0 });
            const stat = partnersMap.get(partnerId)!;
            stat.total += 1;
            if (isWin) stat.wins += 1;
        }
    });

    // --- PROCESS RIVALS ---
    const rivals: RivalStats[] = Array.from(opponentsMap.entries()).map(([id, stat]) => {
        const p = playerLookup.get(String(id));
        return {
            id,
            name: p ? p.name : `Người cũ (${id.slice(-3)})`,
            matchesWith: stat.total,
            winsAgainst: stat.wins,
            winRate: stat.total > 0 ? stat.wins / stat.total : 0
        };
    });

    // Filter Rivals: At least 3 matches against
    const eligibleRivals = rivals.filter(r => r.matchesWith >= 3);

    // Find "Con mồi" (Highest Win Rate)
    let prey = eligibleRivals.length > 0 ? [...eligibleRivals]
        .sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate; 
            return b.matchesWith - a.matchesWith;
        })[0] : undefined;

    // Find "Kị giơ" (Lowest Win Rate)
    let nemesis = eligibleRivals.length > 0 ? [...eligibleRivals]
        .sort((a, b) => {
            if (a.winRate !== b.winRate) return a.winRate - b.winRate; 
            return b.matchesWith - a.matchesWith;
        })[0] : undefined;
    
    // Conflict Resolution for Rivals: If same person is both Prey and Nemesis
    if (prey && nemesis && prey.id === nemesis.id) {
         if (prey.winRate >= 0.5) {
             nemesis = undefined;
         } else {
             prey = undefined;
         }
    }

    // --- PROCESS PARTNERS ---
    const partners: PartnerStats[] = Array.from(partnersMap.entries()).map(([id, stat]) => {
        const p = playerLookup.get(String(id));
        return {
            id,
            name: p ? p.name : `Người cũ (${id.slice(-3)})`,
            matchesTogether: stat.total,
            winsTogether: stat.wins,
            winRate: stat.total > 0 ? stat.wins / stat.total : 0
        };
    });

    // Sort ALL partners by win rate descending for the list
    const sortedPartners = [...partners].sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.matchesTogether - a.matchesTogether;
    });

    // Filter Partners for Highlights: At least 3 matches together
    const eligiblePartners = partners.filter(p => p.matchesTogether >= 3);

    // Find "Hảo huynh đệ" (Best Partner - Highest Win Rate)
    let bestPartner = eligiblePartners.length > 0 ? [...eligiblePartners].sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.matchesTogether - a.matchesTogether;
        })[0] : undefined;

    // Find "Buông tay nhau ra" (Worst Partner - Lowest Win Rate)
    let worstPartner = eligiblePartners.length > 0 ? [...eligiblePartners].sort((a, b) => {
            if (a.winRate !== b.winRate) return a.winRate - b.winRate;
            return b.matchesTogether - a.matchesTogether;
        })[0] : undefined;

    // Conflict Resolution for Partners: If same person is both best and worst
    if (bestPartner && worstPartner && bestPartner.id === worstPartner.id) {
         if (bestPartner.winRate >= 0.5) {
             worstPartner = undefined;
         } else {
             bestPartner = undefined;
         }
    }

    // 3. Chart Data: Weekly Win Rate
    // REFACTOR: Use "Monday of the Week" grouping
    const weeklyMap = new Map<string, { wins: number; total: number; sortKey: number }>();
    
    playerMatches.forEach(m => {
        const d = new Date(m.date);
        
        // Calculate Monday of the week
        const day = d.getDay(); 
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(d);
        monday.setDate(diff);
        monday.setHours(0,0,0,0);
        
        // Label format: "DD/MM" (Ex: 15/12)
        const label = `${monday.getDate().toString().padStart(2, '0')}/${(monday.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const sortKey = monday.getTime();

        if (!weeklyMap.has(label)) weeklyMap.set(label, { wins: 0, total: 0, sortKey });
        const stat = weeklyMap.get(label)!;
        stat.total += 1;
        
        const t1 = m.team1.map(String);
        const isTeam1 = t1.includes(currentPid);
        const winner = Number(m.winner);
        const isWin = isTeam1 ? winner === 1 : winner === 2;
        
        if (isWin) stat.wins += 1;
    });

    const winRateChartData = Array.from(weeklyMap.entries())
        .sort((a, b) => a[1].sortKey - b[1].sortKey) // Sort by time (Monday timestamp)
        .map(([name, stat]) => ({
            name,
            winRate: Math.round((stat.wins / stat.total) * 100)
        }));

    // 4. Chart Data: Daily Financials (Net Profit)
    // Only 'betting' matches
    const financeMap = new Map<string, number>();
    
    playerMatches.filter(m => (m.type || 'betting') === 'betting').forEach(m => {
        const d = new Date(m.date);
        const dateKey = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }); // dd/mm
        
        const points = m.rankingPoints || 50;
        const t1 = m.team1.map(String);
        const isTeam1 = t1.includes(currentPid);
        const winner = Number(m.winner);
        const isWin = isTeam1 ? winner === 1 : winner === 2;
        const impact = isWin ? points : -points;
        
        financeMap.set(dateKey, (financeMap.get(dateKey) || 0) + impact);
    });

    const financeChartData = Array.from(financeMap.entries()).map(([date, amount]) => ({
        date,
        amount
    }));

    return { prey, nemesis, bestPartner, worstPartner, sortedPartners, winRateChartData, financeChartData };

  }, [player, matches, playerLookup]);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/90 backdrop-blur-sm overflow-y-auto animate-fade-in">
        <div className="min-h-full p-4 flex items-center justify-center">
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden relative">
                
                {/* Close Button */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                >
                    <X className="w-5 h-5 text-slate-600" />
                </button>

                {/* HEADER PROFILE */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 md:p-8">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="relative">
                            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-slate-700 border-4 border-slate-600 flex items-center justify-center text-4xl font-bold text-slate-300 shadow-xl">
                                {player.name.charAt(0).toUpperCase()}
                            </div>
                            {(player.championships || 0) > 0 && (
                                <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg border-2 border-slate-800 flex items-center gap-1">
                                    <Trophy className="w-3 h-3 fill-current" />
                                    {player.championships}
                                </div>
                            )}
                        </div>
                        
                        <div className="text-center md:text-left space-y-2">
                            <h2 className="text-3xl font-black tracking-tight">{player.name}</h2>
                            <div className="flex flex-wrap justify-center md:justify-start gap-2">
                                <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold border border-white/20">
                                    ID: {player.id}
                                </span>
                                <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-bold border border-blue-500/30">
                                    Rating: {(player.tournamentRating || player.initialPoints || 0).toFixed(1)}
                                </span>
                            </div>
                            
                            {/* Trophy Case */}
                            {(player.championships || 0) > 0 && (
                                <div className="flex items-center justify-center md:justify-start gap-1 pt-2">
                                    {Array.from({ length: Math.min(player.championships || 0, 5) }).map((_, i) => (
                                        <Trophy key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                                    ))}
                                    {(player.championships || 0) > 5 && (
                                        <span className="text-xs text-yellow-400 font-bold">+{ (player.championships || 0) - 5 }</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 space-y-8 bg-slate-50">
                    
                    {/* STATS GRID */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-4 flex flex-col items-center justify-center text-center border-none shadow-md">
                            <Gamepad2 className="w-6 h-6 text-slate-400 mb-2" />
                            <div className="text-2xl font-black text-slate-800">{player.matchesPlayed}</div>
                            <div className="text-xs text-slate-500 font-bold uppercase">Trận Đấu</div>
                        </Card>
                        
                        <Card className="p-4 flex flex-col items-center justify-center text-center border-none shadow-md">
                            <Award className="w-6 h-6 text-green-500 mb-2" />
                            <div className="text-2xl font-black text-slate-800">
                                {player.matchesPlayed > 0 ? Math.round((player.wins / player.matchesPlayed) * 100) : 0}%
                            </div>
                            <div className="text-xs text-slate-500 font-bold uppercase">Tỉ Lệ Thắng</div>
                        </Card>

                        <Card className="p-4 flex flex-col items-center justify-center text-center border-none shadow-md">
                            <DollarSign className={`w-6 h-6 mb-2 ${player.totalRankingPoints >= 0 ? 'text-green-600' : 'text-red-500'}`} />
                            <div className={`text-2xl font-black ${player.totalRankingPoints >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {player.totalRankingPoints > 0 ? '+' : ''}{player.totalRankingPoints}
                            </div>
                            <div className="text-xs text-slate-500 font-bold uppercase">Luỹ Kế Kèo</div>
                        </Card>

                        <Card className="p-4 flex flex-col items-center justify-center text-center border-none shadow-md bg-yellow-50 border-yellow-200">
                            <Trophy className="w-6 h-6 text-yellow-600 mb-2" />
                            <div className="text-2xl font-black text-yellow-700">{player.championships || 0}</div>
                            <div className="text-xs text-yellow-600 font-bold uppercase">Vô Địch</div>
                        </Card>
                    </div>

                    {/* SECTION: RIVALS & PARTNERS HIGHLIGHTS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* RIVALS (Con mồi & Kị giơ) */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Đối Thủ (Tiêu biểu)</h3>
                            
                            {/* CON MỒI */}
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Target className="w-16 h-16" />
                                </div>
                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    <Target className="w-4 h-4 text-green-500" /> Con mồi quen thuộc
                                </h4>
                                {analysis.prey ? (
                                    <div>
                                        <div className="text-lg font-bold text-slate-800">{analysis.prey.name}</div>
                                        <div className="flex items-center gap-2 mt-1 text-xs">
                                            <span className="font-mono font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                                {Math.round(analysis.prey.winRate * 100)}% Thắng
                                            </span>
                                            <span className="text-slate-400">
                                                / {analysis.prey.matchesWith} trận
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-xs italic py-1">Chưa đủ dữ liệu (tối thiểu 3 trận).</div>
                                )}
                            </div>

                            {/* KỊ GIƠ */}
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <AlertTriangle className="w-16 h-16" />
                                </div>
                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    <AlertTriangle className="w-4 h-4 text-red-500" /> Kị giơ cứng
                                </h4>
                                {analysis.nemesis ? (
                                    <div>
                                        <div className="text-lg font-bold text-slate-800">{analysis.nemesis.name}</div>
                                        <div className="flex items-center gap-2 mt-1 text-xs">
                                            <span className="font-mono font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">
                                                {Math.round((1 - analysis.nemesis.winRate) * 100)}% Thua
                                            </span>
                                            <span className="text-slate-400">
                                                / {analysis.nemesis.matchesWith} trận
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-xs italic py-1">Chưa đủ dữ liệu (tối thiểu 3 trận).</div>
                                )}
                            </div>
                        </div>

                        {/* PARTNERS (Hảo huynh đệ & Buông tay nhau ra) */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Đồng Đội (Tiêu biểu)</h3>

                            {/* HẢO HUYNH ĐỆ (Best Partner) */}
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Handshake className="w-16 h-16" />
                                </div>
                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    <Handshake className="w-4 h-4 text-blue-500" /> Hảo huynh đệ
                                </h4>
                                {analysis.bestPartner ? (
                                    <div>
                                        <div className="text-lg font-bold text-slate-800">{analysis.bestPartner.name}</div>
                                        <div className="flex items-center gap-2 mt-1 text-xs">
                                            <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                                {Math.round(analysis.bestPartner.winRate * 100)}% Thắng
                                            </span>
                                            <span className="text-slate-400">
                                                / {analysis.bestPartner.matchesTogether} trận cùng phe
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-xs italic py-1">Chưa đủ dữ liệu (tối thiểu 3 trận).</div>
                                )}
                            </div>

                            {/* BUÔNG TAY NHAU RA (Worst Partner) */}
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <HeartCrack className="w-16 h-16" />
                                </div>
                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    <HeartCrack className="w-4 h-4 text-purple-500" /> Buông tay nhau ra
                                </h4>
                                {analysis.worstPartner ? (
                                    <div>
                                        <div className="text-lg font-bold text-slate-800">{analysis.worstPartner.name}</div>
                                        <div className="flex items-center gap-2 mt-1 text-xs">
                                            <span className="font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                                                {Math.round((1 - analysis.worstPartner.winRate) * 100)}% Thua
                                            </span>
                                            <span className="text-slate-400">
                                                / {analysis.worstPartner.matchesTogether} trận cùng phe
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-xs italic py-1">Chưa đủ dữ liệu (tối thiểu 3 trận).</div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* NEW SECTION: FULL PARTNER HISTORY LIST */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                            <Users className="w-5 h-5 text-slate-500" />
                            <h3 className="font-bold text-slate-800 text-sm md:text-base">Lịch Sử Đánh Cặp Chi Tiết</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] md:text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3">Người Đánh Cùng</th>
                                        <th className="px-4 py-3 text-center">Số Trận</th>
                                        <th className="px-4 py-3 text-center">Thắng - Thua</th>
                                        <th className="px-4 py-3 text-right">Tỉ Lệ Thắng</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {analysis.sortedPartners.length > 0 ? (
                                        analysis.sortedPartners.map((p, idx) => (
                                            <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold border border-slate-200">
                                                        {idx + 1}
                                                    </span>
                                                    {p.name}
                                                </td>
                                                <td className="px-4 py-3 text-center text-slate-600 font-medium">
                                                    {p.matchesTogether}
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs font-medium">
                                                    <span className="text-green-600">{p.winsTogether}</span>
                                                    <span className="mx-1 text-slate-300">-</span>
                                                    <span className="text-red-500">{p.matchesTogether - p.winsTogether}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={`font-bold ${p.winRate >= 0.5 ? 'text-green-600' : 'text-orange-500'}`}>
                                                        {Math.round(p.winRate * 100)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                                                Chưa có dữ liệu đánh cặp.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* CHARTS SECTION */}
                    <div className="space-y-6">
                        {/* Weekly Win Rate */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">
                                <TrendingUp className="w-4 h-4" /> Phong Độ Tuần (% Thắng)
                            </h4>
                            <div className="h-64 w-full">
                                {analysis.winRateChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={analysis.winRateChartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis 
                                                dataKey="name" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{fontSize: 10, fill: '#64748b'}} 
                                                dy={10} 
                                                interval="preserveStartEnd"
                                            />
                                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} domain={[0, 100]} />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                                formatter={(value: number) => [`${value}%`, 'Tỉ lệ thắng']}
                                            />
                                            <Line type="monotone" dataKey="winRate" stroke="#16a34a" strokeWidth={3} dot={{r: 4, fill: '#16a34a'}} activeDot={{r: 6}} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">Chưa đủ dữ liệu biểu đồ</div>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-400 text-center mt-2 italic">Dữ liệu được gom nhóm theo tuần (Thứ 2)</p>
                        </div>

                        {/* Financial History */}
                         <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">
                                <DollarSign className="w-4 h-4" /> Biến Động Tài Chính (Theo Buổi)
                            </h4>
                            <div className="h-64 w-full">
                                {analysis.financeChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={analysis.financeChartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                                formatter={(value: number) => [`${value > 0 ? '+' : ''}${value}`, 'Điểm']}
                                            />
                                            <ReferenceLine y={0} stroke="#94a3b8" />
                                            <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                                {analysis.financeChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.amount >= 0 ? '#22c55e' : '#ef4444'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">Chưa đủ dữ liệu biểu đồ</div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
  );
};
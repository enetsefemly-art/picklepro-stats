import { Player, Match } from '../types';

// KEYS CẤU HÌNH
// Key hiện tại
const PLAYERS_KEY = 'picklepro_players_v2'; 
const MATCHES_KEY = 'picklepro_matches_v2';

// Danh sách các Key cũ có thể đã được sử dụng trước đây
// Hệ thống sẽ tìm trong các key này nếu key chính bị rỗng
const LEGACY_PLAYER_KEYS = ['picklepro_players', 'players_data', 'pickle_pro_players'];
const LEGACY_MATCH_KEYS = ['picklepro_matches', 'matches_data', 'pickle_pro_matches'];

// NGÀY BẮT ĐẦU TÍNH ĐIỂM RATING (+0.1/-0.1)
// Các trận trước ngày này sẽ không ảnh hưởng đến điểm rating (giữ nguyên điểm gốc)
const RATING_START_DATE = new Date('2024-12-16T00:00:00');

// CONFIG RATING LIMITS
const MAX_RATING = 6.0;
const MIN_RATING = 2.0;
const RATING_STEP = 0.1;

// Initial Mock Data - Chỉ dùng khi KHÔNG tìm thấy bất kỳ dữ liệu nào (New Install)
const INITIAL_PLAYERS: Player[] = [
  { id: '1', name: 'Nguyễn Văn A', initialPoints: 1000, matchesPlayed: 0, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, totalRankingPoints: 1000, tournamentRating: 1000, championships: 0 },
  { id: '2', name: 'Trần Thị B', initialPoints: 1000, matchesPlayed: 0, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, totalRankingPoints: 1000, tournamentRating: 1000, championships: 0 },
  { id: '3', name: 'Lê Văn C', initialPoints: 1000, matchesPlayed: 0, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, totalRankingPoints: 1000, tournamentRating: 1000, championships: 0 },
  { id: '4', name: 'Phạm Thị D', initialPoints: 1000, matchesPlayed: 0, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, totalRankingPoints: 1000, tournamentRating: 1000, championships: 0 },
  { id: '5', name: 'Hoàng Long', initialPoints: 1000, matchesPlayed: 0, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, totalRankingPoints: 1000, tournamentRating: 1000, championships: 0 },
  { id: '6', name: 'Vũ Mai', initialPoints: 1000, matchesPlayed: 0, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, totalRankingPoints: 1000, tournamentRating: 1000, championships: 0 },
];

const INITIAL_MATCHES: Match[] = [];

// --- HELPER FUNCTIONS ---

const safeParse = (data: string | null, fallback: any) => {
    if (!data) return fallback;
    try {
        return JSON.parse(data);
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return fallback;
    }
};

// Hàm tìm kiếm dữ liệu từ nhiều nguồn key khác nhau
const loadFromStorageWithRecovery = (mainKey: string, legacyKeys: string[]) => {
    // 1. Thử lấy từ key chính
    let rawData = localStorage.getItem(mainKey);
    
    // 2. Nếu key chính rỗng, đi lục lọi các key cũ
    if (!rawData) {
        for (const oldKey of legacyKeys) {
            const oldData = localStorage.getItem(oldKey);
            if (oldData) {
                console.log(`[Data Recovery] Found data in legacy key: ${oldKey}. Migrating to ${mainKey}...`);
                rawData = oldData;
                // Lưu ngay sang key mới để lần sau không phải tìm nữa
                localStorage.setItem(mainKey, oldData);
                break;
            }
        }
    }
    return rawData;
};

// --- MAIN EXPORTS ---

export const getPlayers = (): Player[] => {
  const data = loadFromStorageWithRecovery(PLAYERS_KEY, LEGACY_PLAYER_KEYS);

  if (!data) {
    // Nếu vẫn không có dữ liệu, dùng mặc định và lưu lại
    console.log("No existing data found. Initializing with default players.");
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(INITIAL_PLAYERS));
    return INITIAL_PLAYERS;
  }
  
  // MIGRATION & VALIDATION LOGIC
  try {
    const parsedPlayers = JSON.parse(data);
    
    if (!Array.isArray(parsedPlayers)) return INITIAL_PLAYERS;

    // Duyệt qua từng người chơi và chuẩn hóa dữ liệu (đảm bảo không bị lỗi khi thiếu trường)
    const migratedPlayers = parsedPlayers.map((p: any) => ({
      ...p,
      // QUAN TRỌNG: Ép kiểu ID thành chuỗi để tránh lỗi tìm kiếm "Unknown" do lệch kiểu (số vs chuỗi)
      id: String(p.id || Math.random().toString()),
      name: p.name || 'Unknown Player',
      // Giữ nguyên initialPoints cũ, nếu không có thì gán 1000
      initialPoints: typeof p.initialPoints === 'number' ? p.initialPoints : 1000,
      
      // Các chỉ số thống kê sẽ được tính toán lại từ Matches, nhưng ta gán giá trị an toàn
      matchesPlayed: Number(p.matchesPlayed || 0),
      wins: Number(p.wins || 0),
      losses: Number(p.losses || 0),
      pointsScored: Number(p.pointsScored || 0),
      pointsConceded: Number(p.pointsConceded || 0),
      // Total points tạm thời lấy từ storage hoặc initial, sẽ được calculatePlayerStats ghi đè chính xác sau
      totalRankingPoints: typeof p.totalRankingPoints === 'number' ? p.totalRankingPoints : (p.initialPoints || 1000),
      // Mặc định tournamentRating = initialPoints
      tournamentRating: typeof p.tournamentRating === 'number' ? p.tournamentRating : (p.initialPoints || 1000),
      // Cúp vô địch
      championships: typeof p.championships === 'number' ? p.championships : 0
    }));

    return migratedPlayers;
  } catch (e) {
    console.error("Critical Error reading players data:", e);
    return INITIAL_PLAYERS;
  }
};

export const savePlayers = (players: Player[]) => {
  try {
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  } catch (e) {
      console.error("Failed to save players:", e);
  }
};

export const getMatches = (): Match[] => {
  const data = loadFromStorageWithRecovery(MATCHES_KEY, LEGACY_MATCH_KEYS);

  if (!data) {
    localStorage.setItem(MATCHES_KEY, JSON.stringify(INITIAL_MATCHES));
    return INITIAL_MATCHES;
  }
  
  try {
      const parsedMatches = JSON.parse(data);
      if (!Array.isArray(parsedMatches)) return INITIAL_MATCHES;

      // Migration: Đảm bảo trường 'type' tồn tại cho các trận đấu cũ
      const migratedMatches = parsedMatches.map((m: any) => {
          // Robust Number casting to prevent NaN issues from legacy data
          // If score is undefined/null/"" -> 0
          const s1 = Number(m.score1);
          const s2 = Number(m.score2);
          // Ép kiểu winner về số để tránh lỗi logic "1" !== 1
          const w = Number(m.winner);
          
          return {
            ...m,
            id: String(m.id), // Ensure Match ID is string
            type: m.type || 'betting', // Mặc định là 'betting' nếu dữ liệu cũ chưa có
            score1: isNaN(s1) ? 0 : s1, 
            score2: isNaN(s2) ? 0 : s2,
            winner: (w === 1 || w === 2) ? w : 1, // Mặc định winner là 1 nếu lỗi
            rankingPoints: m.rankingPoints !== undefined ? Number(m.rankingPoints) : 50 // Mặc định 50 nếu thiếu
          };
      });
      return migratedMatches;
  } catch (e) {
      console.error("Error reading matches data:", e);
      return INITIAL_MATCHES;
  }
};

export const saveMatches = (matches: Match[]) => {
  try {
      localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
  } catch (e) {
      console.error("Failed to save matches:", e);
  }
};

// Interface helper for pair calculation
interface PairWinStat {
    pairId: string;
    playerIds: string[];
    wins: number;
    losses: number;
    pointsScored: number;
    pointsConceded: number;
}

export const calculatePlayerStats = (players: Player[], matches: Match[]): Player[] => {
  // 1. Reset toàn bộ chỉ số về trạng thái ban đầu
  const resetPlayers = players.map(p => {
      // Logic mới: Điểm đấu hiện tại tương đương điểm gốc (Initial Points)
      const baseRating = typeof p.initialPoints === 'number' ? p.initialPoints : 1000;

      return {
        ...p,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsScored: 0,
        pointsConceded: 0,
        // Điểm tổng Betting bắt đầu từ 0 (Chỉ tính Net Profit)
        totalRankingPoints: 0,
        // Điểm giải đấu bắt đầu từ điểm gốc (không còn normalize về 6.0 nữa)
        tournamentRating: baseRating,
        // Reset Championships để tính toán lại từ đầu lịch sử
        championships: 0 
      };
  });

  const playerMap = new Map(resetPlayers.map(p => [String(p.id), p]));

  // 2. Duyệt qua từng trận đấu để cộng dồn chỉ số
  // Sắp xếp matches theo thời gian để tính điểm Rating lũy tiến đúng thứ tự
  const sortedMatches = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedMatches.forEach(match => {
    const matchDate = new Date(match.date);
    const isBetting = match.type === 'betting' || !match.type; 
    const bettingPoints = (isBetting && match.rankingPoints) ? Number(match.rankingPoints) : 0; 
    
    // Ép kiểu winner về Number để đảm bảo so sánh đúng (Khắc phục lỗi "1" !== 1)
    const winner = Number(match.winner);
    const isTeam1Winner = winner === 1;

    // KIỂM TRA NGÀY ĐỂ ÁP DỤNG RATING
    // Chỉ tính +0.1/-0.1 cho các trận từ ngày 16/12/2025 trở đi
    const shouldApplyRating = matchDate.getTime() >= RATING_START_DATE.getTime();
    
    // --- XỬ LÝ ĐIỂM SỐ (FIX LỖI HIỆU SỐ) ---
    // Ép kiểu số an toàn
    let s1 = Number(match.score1);
    let s2 = Number(match.score2);

    // Xử lý NaN (Not a Number) -> về 0
    if (isNaN(s1)) s1 = 0;
    if (isNaN(s2)) s2 = 0;

    // --- LOGIC SỬA LỖI NGHIÊM NGẶT ---
    // Đảm bảo Hiệu số luôn đúng với kết quả Thắng/Thua.
    if (winner === 1) {
        if (s1 <= s2) s1 = s2 + 1; // Team 1 thắng thì phải hơn điểm Team 2
    } else if (winner === 2) {
        if (s2 <= s1) s2 = s1 + 1; // Team 2 thắng thì phải hơn điểm Team 1
    }

    // --- UPDATE CHỈ SỐ ---
    const updateStats = (pid: string, isWinner: boolean, scoreFor: number, scoreAgainst: number) => {
        const p = playerMap.get(String(pid));
        if (!p) return;

        p.matchesPlayed += 1;
        p.pointsScored += Number(scoreFor) || 0;
        p.pointsConceded += Number(scoreAgainst) || 0;

        // 1. Logic Betting
        if (isWinner) {
            p.wins += 1;
            if (isBetting) p.totalRankingPoints += bettingPoints;
        } else {
            p.losses += 1;
            if (isBetting) p.totalRankingPoints -= bettingPoints;
        }

        // 2. Logic Tournament Rating (Điểm Đấu)
        // Updated Rules: Max 6.0, Min 2.0. No penalty if <= 2.0
        if (shouldApplyRating) {
            let currentRating = p.tournamentRating || p.initialPoints || 0;
            
            if (isWinner) {
                currentRating += RATING_STEP;
                // Cap at Max
                if (currentRating > MAX_RATING) currentRating = MAX_RATING;
            } else {
                // Only deduct if currently ABOVE min rating
                if (currentRating > MIN_RATING) {
                    currentRating -= RATING_STEP;
                    // Cap at Min
                    if (currentRating < MIN_RATING) currentRating = MIN_RATING;
                }
            }
            // Fix floating point precision
            p.tournamentRating = Math.round(currentRating * 100) / 100;
        }
    };

    // QUAN TRỌNG: Lọc trùng lặp người chơi trong cùng một đội
    const team1Unique = [...new Set(match.team1)];
    const team2Unique = [...new Set(match.team2)];

    team1Unique.forEach(pid => updateStats(pid, isTeam1Winner, s1, s2));
    team2Unique.forEach(pid => updateStats(pid, !isTeam1Winner, s2, s1));
  });


  // --- 3. AUTO-CALCULATE CHAMPIONSHIPS ---
  // A. Lọc và nhóm các trận Giải theo tháng
  const tournamentMatches = matches.filter(m => m.type === 'tournament');
  const matchesByMonth = new Map<string, Match[]>(); // Key: "YYYY-MM"

  tournamentMatches.forEach(m => {
      const monthKey = m.date.slice(0, 7); // "2024-12"
      if (!matchesByMonth.has(monthKey)) matchesByMonth.set(monthKey, []);
      matchesByMonth.get(monthKey)!.push(m);
  });

  // B. Xử lý từng tháng để tìm nhà vô địch
  matchesByMonth.forEach((monthlyMatches, monthKey) => {
      const pairStats = new Map<string, PairWinStat>();
      const h2hMatrix = new Map<string, Map<string, number>>();
      const getPairId = (ids: string[]) => ids.map(String).sort().join('-');
      
      monthlyMatches.forEach(m => {
          if (m.team1.length < 2 || m.team2.length < 2) return; // Chỉ xét đánh đôi

          const pId1 = getPairId(m.team1);
          const pId2 = getPairId(m.team2);
          
          let s1 = Number(m.score1);
          let s2 = Number(m.score2);
          const winner = Number(m.winner);
          if (isNaN(s1)) s1 = 0; if (isNaN(s2)) s2 = 0;
          if (winner === 1 && s1 <= s2) s1 = s2 + 1;
          else if (winner === 2 && s2 <= s1) s2 = s1 + 1;

          if (!pairStats.has(pId1)) pairStats.set(pId1, { pairId: pId1, playerIds: m.team1, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 });
          if (!pairStats.has(pId2)) pairStats.set(pId2, { pairId: pId2, playerIds: m.team2, wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 });

          if (!h2hMatrix.has(pId1)) h2hMatrix.set(pId1, new Map());
          if (!h2hMatrix.has(pId2)) h2hMatrix.set(pId2, new Map());

          const ps1 = pairStats.get(pId1)!;
          ps1.pointsScored += s1; ps1.pointsConceded += s2;
          if (winner === 1) ps1.wins++; else ps1.losses++;

          const ps2 = pairStats.get(pId2)!;
          ps2.pointsScored += s2; ps2.pointsConceded += s1;
          if (winner === 2) ps2.wins++; else ps2.losses++;

          const h2h1 = h2hMatrix.get(pId1)!.get(pId2) || 0;
          const h2h2 = h2hMatrix.get(pId2)!.get(pId1) || 0;
          if (winner === 1) {
              h2hMatrix.get(pId1)!.set(pId2, h2h1 + 1);
              h2hMatrix.get(pId2)!.set(pId1, h2h2 - 1);
          } else {
              h2hMatrix.get(pId1)!.set(pId2, h2h1 - 1);
              h2hMatrix.get(pId2)!.set(pId1, h2h2 + 1);
          }
      });

      const sortedPairs = Array.from(pairStats.values())
        .filter(p => (p.wins + p.losses) > 0)
        .sort((a, b) => {
            const netA = a.wins - a.losses;
            const netB = b.wins - b.losses;
            if (netA !== netB) return netB - netA;
            const h2h = h2hMatrix.get(a.pairId)?.get(b.pairId) || 0;
            if (h2h !== 0) return -h2h;
            const pDiffA = a.pointsScored - a.pointsConceded;
            const pDiffB = b.pointsScored - b.pointsConceded;
            if (pDiffA !== pDiffB) return pDiffB - pDiffA;
            return b.pointsScored - a.pointsScored;
        });

      if (sortedPairs.length > 0) {
          const championPair = sortedPairs[0];
          championPair.playerIds.forEach(pid => {
              const p = playerMap.get(String(pid));
              if (p) {
                  p.championships = (p.championships || 0) + 1;
              }
          });
      }
  });

  return Array.from(playerMap.values());
};
import { Player, Match } from '../types';

// --- CONFIG CONSTANTS ---
const D_FACTOR = 1.2;
const K_FACTOR = 0.18;
const SUPPORT_CUTOFF = 2.6; // Rating below this is considered "support" (weak)
const TARGET_DIFF = 1.4; // Ideal rating difference between partners (Strong carries Weak)

interface PlayerForm {
    id: string;
    baseRating: number;
    form: number;
    effectiveRating: number;
}

interface GeneratedPair {
    player1: PlayerForm;
    player2: PlayerForm;
    strength: number; // Sum of effective ratings
    structure: number; // Diff of effective ratings
    cost: number;
}

export interface GeneratedMatch {
    team1: GeneratedPair;
    team2: GeneratedPair;
    matchCost: number;
    handicap?: {
        team: 1 | 2; // 1 for Team 1, 2 for Team 2
        points: number;
        reason: string;
    };
    // NEW: Detailed Analysis for UI
    analysis: {
        team2Synergy: number; // Chemistry score of opponent
        team2Form: number; // Recent performance bonus of opponent
        qualityScore: number; // 0-100 score of match balance
    };
}

export interface AutoMatchResult {
    players: PlayerForm[];
    pairs: GeneratedPair[];
    matches: GeneratedMatch[];
}

// --- STEP 1: LEARN PLAYER FORM ---
const calculatePlayerForms = (players: Player[], matches: Match[]): Map<string, PlayerForm> => {
    // 1. Initialize
    const playerStats = new Map<string, PlayerForm>();
    players.forEach(p => {
        // Normalize rating: If > 20 (old system), map to ~3.0 base, else use rating
        const rawRating = (p.tournamentRating || p.initialPoints || 0);
        const baseRating = rawRating > 20 ? 3.0 : (rawRating || 3.0);
        
        // Ensure ID is string
        playerStats.set(String(p.id), {
            id: String(p.id),
            baseRating: baseRating,
            form: 0,
            effectiveRating: baseRating // will update
        });
    });

    // 2. Chronological Learning
    const sortedMatches = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedMatches.forEach(m => {
        if (!m.team1 || !m.team2 || m.team1.length !== 2 || m.team2.length !== 2) return;
        
        const t1p1 = playerStats.get(String(m.team1[0]));
        const t1p2 = playerStats.get(String(m.team1[1]));
        const t2p1 = playerStats.get(String(m.team2[0]));
        const t2p2 = playerStats.get(String(m.team2[1]));

        if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return;

        // Current Effective Ratings
        const effT1 = (t1p1.baseRating + t1p1.form) + (t1p2.baseRating + t1p2.form);
        const effT2 = (t2p1.baseRating + t2p1.form) + (t2p2.baseRating + t2p2.form);

        // Expected Win Probability for Team 1 (Opponent - Team) / D
        const expectedT1 = 1 / (1 + Math.pow(10, (effT2 - effT1) / D_FACTOR));
        
        const actualS = m.winner === 1 ? 1 : 0;
        
        // Update Delta
        const delta = K_FACTOR * (actualS - expectedT1);
        const share = delta / 2;

        // Update Form
        t1p1.form += share;
        t1p2.form += share;
        t2p1.form -= share; // If T1 won (delta > 0), T2 loses rating. If T1 lost (delta < 0), T2 gains.
        t2p2.form -= share;
    });

    // 3. Finalize Effective Ratings
    playerStats.forEach(p => {
        p.effectiveRating = Number((p.baseRating + p.form).toFixed(2));
    });

    return playerStats;
};

// --- STEP 2: LEARN SYNERGY ---
const calculateSynergyMatrix = (matches: Match[]): Map<string, number> => {
    const pairStats = new Map<string, { games: number, wins: number }>();
    const getPairKey = (id1: string, id2: string) => [String(id1), String(id2)].sort().join('-');

    matches.forEach(m => {
        if (!m.team1 || !m.team2) return;
        
        // Team 1 Pair
        if (m.team1.length === 2) {
            const k = getPairKey(m.team1[0], m.team1[1]);
            if (!pairStats.has(k)) pairStats.set(k, { games: 0, wins: 0 });
            const s = pairStats.get(k)!;
            s.games++;
            if (m.winner === 1) s.wins++;
        }

        // Team 2 Pair
        if (m.team2.length === 2) {
            const k = getPairKey(m.team2[0], m.team2[1]);
            if (!pairStats.has(k)) pairStats.set(k, { games: 0, wins: 0 });
            const s = pairStats.get(k)!;
            s.games++;
            if (m.winner === 2) s.wins++;
        }
    });

    const synergyMap = new Map<string, number>();
    pairStats.forEach((stat, key) => {
        // Smooth winrate: p = (wins + 2) / (games + 4)
        const p = (stat.wins + 2) / (stat.games + 4);
        // Synergy: ln(p / (1-p)) * games / (games + 6)
        // Avoid division by zero or log(0)
        const safeP = Math.max(0.01, Math.min(0.99, p));
        const syn = Math.log(safeP / (1 - safeP)) * (stat.games / (stat.games + 6));
        synergyMap.set(key, syn);
    });

    return synergyMap;
};

// --- STEP 3: PAIRING COST FUNCTION ---
const getPairingCost = (
    p1: PlayerForm, 
    p2: PlayerForm, 
    synergyMatrix: Map<string, number>,
    recentPairs: Set<string>
): number => {
    const diff = Math.abs(p1.effectiveRating - p2.effectiveRating);
    
    // 1. Base Cost: Deviation from target diff (Strong carries Weak)
    let cost = 1.0 * Math.pow(diff - TARGET_DIFF, 2);

    // 2. Penalty: Too similar (Both strong or Both weak, likely)
    if (diff < 0.6) cost += 1.5;

    // 3. Penalty: Gap too huge (Broken team)
    if (diff > 2.0) cost += 3.0;

    // 4. Penalty: Two support players (Weak + Weak) -> Bad game quality
    if (p1.effectiveRating < SUPPORT_CUTOFF && p2.effectiveRating < SUPPORT_CUTOFF) {
        cost += 10.0;
    }

    // 5. Synergy Penalty (Avoid Overpowered or Broken pairs)
    const pairKey = [p1.id, p2.id].sort().join('-');
    const syn = synergyMatrix.get(pairKey) || 0;
    if (Math.abs(syn) > 0.35) {
        // Penalize widely known pairs to force variety
        cost += Math.abs(syn) * 2.0; 
    }

    // 6. Repeat Penalty (Variety)
    if (recentPairs.has(pairKey)) {
        cost += 15.0; // Strong penalty to avoid same team as last session
    }

    return cost;
};

// --- STEP 4: PAIRING ALGORITHM ---
const generateOptimalPairs = (
    pool: PlayerForm[], 
    synergyMatrix: Map<string, number>,
    recentPairs: Set<string>
): GeneratedPair[] => {
    // Greedy Init
    // Sort by rating ASC (Weaker players first) to find them a strong partner
    const sortedPool = [...pool].sort((a, b) => a.effectiveRating - b.effectiveRating);
    const pairs: GeneratedPair[] = [];
    const used = new Set<string>();

    for (let i = 0; i < sortedPool.length; i++) {
        const p1 = sortedPool[i];
        if (used.has(p1.id)) continue;

        let bestPartner: PlayerForm | null = null;
        let minCost = Infinity;

        // Find best partner among remaining
        for (let j = i + 1; j < sortedPool.length; j++) {
            const p2 = sortedPool[j];
            if (used.has(p2.id)) continue;

            const c = getPairingCost(p1, p2, synergyMatrix, recentPairs);
            if (c < minCost) {
                minCost = c;
                bestPartner = p2;
            }
        }

        if (bestPartner) {
            used.add(p1.id);
            used.add(bestPartner.id);
            pairs.push({
                player1: p1,
                player2: bestPartner,
                strength: p1.effectiveRating + bestPartner.effectiveRating,
                structure: Math.abs(p1.effectiveRating - bestPartner.effectiveRating),
                cost: minCost
            });
        }
    }

    // Local Swap Optimization (200 Iterations)
    // Try to swap member 2 of Pair A with member 2 of Pair B
    let currentTotalCost = pairs.reduce((sum, p) => sum + p.cost, 0);

    for (let iter = 0; iter < 200; iter++) {
        if (pairs.length < 2) break;

        // Pick 2 random pairs
        const idx1 = Math.floor(Math.random() * pairs.length);
        let idx2 = Math.floor(Math.random() * pairs.length);
        while (idx1 === idx2) idx2 = Math.floor(Math.random() * pairs.length);

        const pairA = pairs[idx1];
        const pairB = pairs[idx2];

        // Try Swap: (A1, B2) and (B1, A2)
        const costSwap1 = getPairingCost(pairA.player1, pairB.player2, synergyMatrix, recentPairs);
        const costSwap2 = getPairingCost(pairB.player1, pairA.player2, synergyMatrix, recentPairs);
        
        const newTotalCost = currentTotalCost - pairA.cost - pairB.cost + costSwap1 + costSwap2;

        if (newTotalCost < currentTotalCost) {
            // Apply Swap
            const newPairA: GeneratedPair = {
                player1: pairA.player1,
                player2: pairB.player2,
                strength: pairA.player1.effectiveRating + pairB.player2.effectiveRating,
                structure: Math.abs(pairA.player1.effectiveRating - pairB.player2.effectiveRating),
                cost: costSwap1
            };
            const newPairB: GeneratedPair = {
                player1: pairB.player1,
                player2: pairA.player2,
                strength: pairB.player1.effectiveRating + pairA.player2.effectiveRating,
                structure: Math.abs(pairB.player1.effectiveRating - pairA.player2.effectiveRating),
                cost: costSwap2
            };

            pairs[idx1] = newPairA;
            pairs[idx2] = newPairB;
            currentTotalCost = newTotalCost;
        }
    }

    return pairs;
};

// --- STEP 5: MATCHMAKING ---
const generateMatchups = (
    teams: GeneratedPair[],
    recentMatches: Set<string>
): GeneratedMatch[] => {
    // Sort teams by strength descending
    let pool = [...teams].sort((a, b) => b.strength - a.strength);
    const matches: GeneratedMatch[] = [];

    while (pool.length >= 2) {
        const t1 = pool[0];
        pool.shift(); // Remove t1

        let bestOpponentIdx = -1;
        let minMatchCost = Infinity;

        // Find best opponent for t1
        for (let i = 0; i < pool.length; i++) {
            const t2 = pool[i];
            
            // Cost Function
            // 1. Strength Balance
            let cost = 1.0 * Math.pow(t1.strength - t2.strength, 2);
            
            // 2. Structure Balance (Similar style teams play each other)
            cost += 0.7 * Math.pow(t1.structure - t2.structure, 2);

            // 3. Repeat Match Penalty
            // Key: sorted IDs of all 4 players
            const allIds = [t1.player1.id, t1.player2.id, t2.player1.id, t2.player2.id].sort().join('-');
            if (recentMatches.has(allIds)) {
                cost += 50.0; // Heavy penalty
            }

            if (cost < minMatchCost) {
                minMatchCost = cost;
                bestOpponentIdx = i;
            }
        }

        if (bestOpponentIdx !== -1) {
            const t2 = pool[bestOpponentIdx];
            pool.splice(bestOpponentIdx, 1);
            
            // --- STEP 6: HANDICAP ---
            let handicap = undefined;
            const diff = Math.abs(t1.strength - t2.strength);
            let points = 0;

            if (diff > 0.3 && diff <= 0.6) points = 1;
            else if (diff > 0.6 && diff <= 0.9) points = 2;
            else if (diff > 0.9 && diff <= 1.2) points = 3;
            else if (diff > 1.2) points = 4; // Capped or extreme

            const weakerTeam = t1.strength < t2.strength ? 1 : 2;
            const weakPair = weakerTeam === 1 ? t1 : t2;

            // Support Bonus: If weaker team has a clear support player (< 2.6)
            if (points > 0 && (weakPair.player1.effectiveRating < SUPPORT_CUTOFF || weakPair.player2.effectiveRating < SUPPORT_CUTOFF)) {
                points += 1;
            }

            if (points > 0) {
                handicap = {
                    team: weakerTeam,
                    points: points,
                    reason: `Chênh lệch sức mạnh ${diff.toFixed(2)}`
                };
            }

            matches.push({
                team1: t1,
                team2: t2,
                matchCost: minMatchCost,
                handicap,
                analysis: {
                    team2Synergy: 0,
                    team2Form: 0,
                    qualityScore: Math.max(0, 100 - minMatchCost)
                }
            });
        }
    }

    return matches;
};

// --- NEW FUNCTION: FIND TOP MATCHUPS FOR FIXED TEAM ---
export const findTopMatchupsForTeam = (
    fixedTeamIds: [string, string], // [P1, P2]
    poolIds: string[], // Available opponents
    allPlayers: Player[],
    allMatches: Match[]
): GeneratedMatch[] => {
    
    // 1. Learn Form & Stats
    const playerForms = calculatePlayerForms(allPlayers, allMatches);
    const synergyMatrix = calculateSynergyMatrix(allMatches);

    // Get Forms for Fixed Team
    const p1 = playerForms.get(String(fixedTeamIds[0]));
    const p2 = playerForms.get(String(fixedTeamIds[1]));

    if (!p1 || !p2) return [];

    const fixedTeam: GeneratedPair = {
        player1: p1,
        player2: p2,
        strength: p1.effectiveRating + p2.effectiveRating,
        structure: Math.abs(p1.effectiveRating - p2.effectiveRating),
        cost: 0 // Irrelevant for fixed team
    };

    // 2. Generate Candidate Pairs from Pool
    // Ensure strict string lookup
    const pool = poolIds.map(id => playerForms.get(String(id))).filter(p => p !== undefined) as PlayerForm[];
    const candidatePairs: GeneratedPair[] = [];

    // Brute force pairs (n * n-1 / 2) - OK for small pools (< 50 players)
    for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
            const opp1 = pool[i];
            const opp2 = pool[j];

            // Calculate internal pair cost (to prioritize valid teams)
            const pairCost = getPairingCost(opp1, opp2, synergyMatrix, new Set());

            candidatePairs.push({
                player1: opp1,
                player2: opp2,
                strength: opp1.effectiveRating + opp2.effectiveRating,
                structure: Math.abs(opp1.effectiveRating - opp2.effectiveRating),
                cost: pairCost
            });
        }
    }

    // 3. Calculate Match Cost against Fixed Team for each Candidate
    // Use last 50 matches for history context
    const recentMatches = new Set<string>();
    const sortedMatches = [...allMatches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);
    sortedMatches.forEach(m => {
        if (m.team1.length === 2 && m.team2.length === 2) {
            recentMatches.add([...m.team1, ...m.team2].map(String).sort().join('-'));
        }
    });

    const rankedMatchups = candidatePairs.map(candidate => {
        let matchCost = 0;
        
        // A. Match Balance (Strength Diff) - CORRECTED TO 1.0 (Algorithm Step 5)
        matchCost += 1.0 * Math.pow(fixedTeam.strength - candidate.strength, 2);

        // B. Structure Balance (Similar gap teams play better) - CORRECTED TO 0.7 (Algorithm Step 5)
        matchCost += 0.7 * Math.pow(fixedTeam.structure - candidate.structure, 2);

        // C. Internal Pair Quality of Candidate
        // We prefer the opponent team to be "realistic" (not 2 weak players or broken diff)
        matchCost += candidate.cost * 0.5;

        // D. History Repeat Penalty
        const allIds = [p1.id, p2.id, candidate.player1.id, candidate.player2.id].sort().join('-');
        if (recentMatches.has(allIds)) {
            matchCost += 50.0; // Avoid recent rematches
        }

        // --- HANDICAP CALC ---
        let handicap = undefined;
        const diff = Math.abs(fixedTeam.strength - candidate.strength);
        let points = 0;

        if (diff > 0.3 && diff <= 0.6) points = 1;
        else if (diff > 0.6 && diff <= 0.9) points = 2;
        else if (diff > 0.9 && diff <= 1.2) points = 3;
        else if (diff > 1.2) points = 4;

        const weakerTeam = fixedTeam.strength < candidate.strength ? 1 : 2;
        const weakPair = weakerTeam === 1 ? fixedTeam : candidate;

        if (points > 0 && (weakPair.player1.effectiveRating < SUPPORT_CUTOFF || weakPair.player2.effectiveRating < SUPPORT_CUTOFF)) {
            points += 1;
        }

        if (points > 0) {
            handicap = {
                team: weakerTeam as 1 | 2,
                points: points,
                reason: `Chênh lệch ${diff.toFixed(2)}`
            };
        }

        // --- NEW: Calculate Analysis Stats ---
        const pairKey = [candidate.player1.id, candidate.player2.id].sort().join('-');
        const syn = synergyMatrix.get(pairKey) || 0;
        const combinedForm = candidate.player1.form + candidate.player2.form;

        return {
            team1: fixedTeam,
            team2: candidate,
            matchCost,
            handicap,
            analysis: {
                team2Synergy: syn,
                team2Form: combinedForm,
                qualityScore: Math.max(0, 100 - matchCost)
            }
        } as GeneratedMatch;
    });

    // 4. Sort by Match Cost
    // UPDATED SORT: Priority 1: No Handicap (Equal) -> Priority 2: Low Handicap -> Priority 3: Match Cost
    return rankedMatchups.sort((a, b) => {
        const handicapA = a.handicap ? a.handicap.points : 0;
        const handicapB = b.handicap ? b.handicap.points : 0;

        // 1. Equal matches (handicap 0) come first
        if (handicapA === 0 && handicapB > 0) return -1;
        if (handicapA > 0 && handicapB === 0) return 1;

        // 2. Lower handicap points come first
        if (handicapA !== handicapB) return handicapA - handicapB;

        // 3. Better quality score (lower matchCost) comes first
        return a.matchCost - b.matchCost;
    }).slice(0, 10);
};

// --- NEW FUNCTION: PREDICT MATCH OUTCOME (FOR MANUAL ANALYSIS) ---
export const predictMatchOutcome = (
    team1Ids: string[],
    team2Ids: string[],
    allPlayers: Player[],
    allMatches: Match[]
): GeneratedMatch | null => {
    // Basic validation
    if (team1Ids.length === 0 || team2Ids.length === 0) return null;

    // 1. Learn Form & Stats
    const playerForms = calculatePlayerForms(allPlayers, allMatches);
    
    // Construct Team 1
    const t1p1 = playerForms.get(String(team1Ids[0]));
    const t1p2 = team1Ids.length > 1 ? playerForms.get(String(team1Ids[1])) : null;
    
    if (!t1p1) return null;

    // Handle Singles (Mock 2nd player as 0 rating or handle specifically?)
    // For now, we assume doubles logic, but if singles, just use p1
    const t1Rating = t1p1.effectiveRating + (t1p2 ? t1p2.effectiveRating : 0);
    const t1Structure = t1p2 ? Math.abs(t1p1.effectiveRating - t1p2.effectiveRating) : 0;

    const team1Pair: GeneratedPair = {
        player1: t1p1,
        player2: t1p2 || t1p1, // Fallback for types
        strength: t1Rating,
        structure: t1Structure,
        cost: 0
    };

    // Construct Team 2
    const t2p1 = playerForms.get(String(team2Ids[0]));
    const t2p2 = team2Ids.length > 1 ? playerForms.get(String(team2Ids[1])) : null;

    if (!t2p1) return null;

    const t2Rating = t2p1.effectiveRating + (t2p2 ? t2p2.effectiveRating : 0);
    const t2Structure = t2p2 ? Math.abs(t2p1.effectiveRating - t2p2.effectiveRating) : 0;

    const team2Pair: GeneratedPair = {
        player1: t2p1,
        player2: t2p2 || t2p1,
        strength: t2Rating,
        structure: t2Structure,
        cost: 0
    };

    // --- CALCULATE HANDICAP ---
    let handicap = undefined;
    const diff = Math.abs(team1Pair.strength - team2Pair.strength);
    let points = 0;

    // Using the same scale as generateMatchups
    if (diff > 0.3 && diff <= 0.6) points = 1;
    else if (diff > 0.6 && diff <= 0.9) points = 2;
    else if (diff > 0.9 && diff <= 1.2) points = 3;
    else if (diff > 1.2) points = 4;

    const weakerTeam = team1Pair.strength < team2Pair.strength ? 1 : 2;
    const weakPair = weakerTeam === 1 ? team1Pair : team2Pair;

    // Support Bonus check
    // If double, check both. If single, check one.
    const hasWeakLink = (p: GeneratedPair) => {
        return p.player1.effectiveRating < SUPPORT_CUTOFF || (team1Ids.length > 1 && p.player2.effectiveRating < SUPPORT_CUTOFF);
    };

    if (points > 0 && hasWeakLink(weakPair)) {
        points += 1;
    }

    if (points > 0) {
        handicap = {
            team: weakerTeam as 1 | 2,
            points: points,
            reason: `Chênh lệch trình độ ${diff.toFixed(2)}`
        };
    }

    // Match Quality (Simulated)
    // Lower diff = Higher quality
    // Max diff for acceptable match ~ 2.0 -> Score 0
    // Diff 0 -> Score 100
    const quality = Math.max(0, 100 - (diff * 50));

    return {
        team1: team1Pair,
        team2: team2Pair,
        matchCost: 0, // Not needed for single analysis
        handicap,
        analysis: {
            qualityScore: quality,
            team2Form: 0, // Not calculated here
            team2Synergy: 0 // Not calculated here
        }
    };
};

// --- MAIN EXPORT FUNCTION ---
export const runAutoMatchmaker = (
    selectedPlayerIds: string[],
    allPlayers: Player[],
    allMatches: Match[]
): AutoMatchResult => {
    // 0. Filter selected players
    const selectedPlayers = allPlayers.filter(p => selectedPlayerIds.includes(String(p.id)));
    if (selectedPlayers.length % 2 !== 0) {
        throw new Error("Số lượng người chơi phải là số chẵn.");
    }

    // 1. Learn Form & Synergy
    const playerForms = calculatePlayerForms(allPlayers, allMatches);
    const synergyMatrix = calculateSynergyMatrix(allMatches);

    // Filter forms for selected players
    const pool = selectedPlayers.map(p => playerForms.get(String(p.id))!);

    // Context: Recent Pairs & Matches (Last 20 matches)
    const sortedMatches = [...allMatches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);
    const recentPairs = new Set<string>();
    const recentMatches = new Set<string>();

    sortedMatches.forEach(m => {
        if (m.team1.length === 2) recentPairs.add([...m.team1].map(String).sort().join('-'));
        if (m.team2.length === 2) recentPairs.add([...m.team2].map(String).sort().join('-'));
        if (m.team1.length === 2 && m.team2.length === 2) {
            recentMatches.add([...m.team1, ...m.team2].map(String).sort().join('-'));
        }
    });

    // 2. Generate Pairs
    const pairs = generateOptimalPairs(pool, synergyMatrix, recentPairs);

    // 3. Generate Matches
    const matchesResult = generateMatchups(pairs, recentMatches);

    return {
        players: pool,
        pairs,
        matches: matchesResult
    };
};
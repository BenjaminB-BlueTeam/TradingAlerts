/**
 * Shared team data functions: loading matches from Supabase, computing stats,
 * and generating goal timing bar data.
 */

/**
 * Returns the approximate start date of the current football season.
 * European leagues typically start in July/August, so we use July 1 as cutoff.
 * If current month >= 7 (July), season started this year; otherwise last year.
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getCurrentSeasonStart() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

/**
 * Loads matches for a team in a given context (home/away) from Supabase,
 * filtered to the current season only (since ~July 1).
 * @param {number|string} teamId
 * @param {'home'|'away'} context
 * @param {object} supabaseClient - The Supabase client instance (from '$lib/api/supabase.js')
 * @returns {Promise<Array>}
 */
export async function loadTeamMatches(teamId, context, supabaseClient) {
  const col = context === 'home' ? 'home_team_id' : 'away_team_id';
  const today = new Date().toISOString().split('T')[0];
  const seasonStart = getCurrentSeasonStart();
  const { data } = await supabaseClient
    .from('h2h_matches')
    .select('*')
    .eq(col, teamId)
    .gte('match_date', seasonStart)
    .lt('match_date', today)
    .not('goal_events', 'is', null)
    .order('match_date', { ascending: false })
    .limit(30);

  // Filtrer les matchs pré-seedés sans données réelles (goal_events vide)
  return (data || []).filter(m => {
    const events = m.goal_events;
    // Garder les matchs avec goal_events remplis OU avec au moins 1 but (0-0 réel possible)
    if (Array.isArray(events) && events.length > 0) return true;
    // Si goal_events est vide [] mais le match a des buts HT → c'est un vrai match
    if ((m.home_goals_ht || 0) > 0 || (m.away_goals_ht || 0) > 0) return true;
    // Si home_goals + away_goals = 0 et pas de goal_events → pourrait être un 0-0 réel ou un match non joué
    // On garde si last_updated existe (= le daily-seed l'a traité)
    if (m.last_updated) return true;
    return false;
  });
}

/**
 * Computes summary stats from an array of matches for a given context.
 * Returns null if no matches.
 * @param {Array} matches
 * @param {'home'|'away'} context
 * @returns {object|null} { avgGoals, pctGoal1MT, pct2Plus1MT, pctBTTS, pctOver25, avgScored1MT, avgScored2MT, total }
 */
export function computeTeamStats(matches, context) {
  if (!matches.length) return null;
  const scored = matches.map(m => context === 'home' ? (m.home_goals || 0) : (m.away_goals || 0));
  const conceded = matches.map(m => context === 'home' ? (m.away_goals || 0) : (m.home_goals || 0));
  const scoredHT = matches.map(m => context === 'home' ? (m.home_goals_ht || 0) : (m.away_goals_ht || 0));
  const concededHT = matches.map(m => context === 'home' ? (m.away_goals_ht || 0) : (m.home_goals_ht || 0));

  const total = matches.length;
  const avgGoals = +((scored.reduce((a, b) => a + b, 0) + conceded.reduce((a, b) => a + b, 0)) / total).toFixed(2);
  const pctGoal1MT = Math.round(scoredHT.filter(g => g > 0).length / total * 100);
  const pct2Plus1MT = Math.round(scoredHT.filter(g => g >= 2).length / total * 100);
  const pctBTTS = Math.round(matches.filter((_, i) => scored[i] > 0 && conceded[i] > 0).length / total * 100);
  const pctOver25 = Math.round(matches.filter((_, i) => scored[i] + conceded[i] > 2).length / total * 100);
  const avgScored1MT = +(scoredHT.reduce((a, b) => a + b, 0) / total).toFixed(2);
  const avgScored2MT = +((scored.reduce((a, b) => a + b, 0) - scoredHT.reduce((a, b) => a + b, 0)) / total).toFixed(2);

  return { avgGoals, pctGoal1MT, pct2Plus1MT, pctBTTS, pctOver25, avgScored1MT, avgScored2MT, total };
}

/**
 * Generates goal timing bar data for a match in a given context.
 * @param {object} match
 * @param {'home'|'away'} context
 * @returns {{ goals: Array<{min: number, raw: string, pct: number, scored: boolean, label: string}>, total: number, result: 'W'|'D'|'L' }}
 */
export function goalBar(match, context) {
  const isHome = context === 'home';
  const teamGoals = isHome ? (match.home_goals || 0) : (match.away_goals || 0);
  const oppGoals = isHome ? (match.away_goals || 0) : (match.home_goals || 0);
  const totalGoals = teamGoals + oppGoals;

  // Result: W/D/L
  const result = teamGoals > oppGoals ? 'W' : teamGoals === oppGoals ? 'D' : 'L';

  const events = match.goal_events || [];

  // Convertir une minute en position % sur la barre (0-90 min, HT à 50%)
  // Les buts en stoppage time sont plafonnés : 45+X → 45', 90+X → 90'
  function minToPct(min, raw) {
    let capped = min;
    if (raw && raw.includes('+')) {
      const base = parseInt(raw);
      capped = base <= 45 ? 45 : 90;
    } else {
      capped = Math.min(min, 90);
    }
    return Math.min((capped / 90) * 100, 98);
  }

  // If we have goal_events with minutes, use them
  if (events.length > 0 && events[0]?.min) {
    const goals = events.map(g => {
      const scored = isHome ? g.home : !g.home;
      const displayMin = g.raw || String(g.min);
      const label = scored ? `${displayMin}'` : `${displayMin}' \u2014 Encaiss\u00e9`;
      return {
        min: g.min,
        raw: displayMin,
        pct: minToPct(g.min, g.raw),
        scored,
        label,
      };
    });
    return { goals, total: totalGoals, result };
  }

  // Fallback: distribute goals within each half
  const scoredHT = isHome ? (match.home_goals_ht || 0) : (match.away_goals_ht || 0);
  const concededHT = isHome ? (match.away_goals_ht || 0) : (match.home_goals_ht || 0);
  const scored2MT = teamGoals - scoredHT;
  const conceded2MT = oppGoals - concededHT;

  const goals = [];
  for (let i = 0; i < scoredHT; i++) { const m = 10 + i * 12; goals.push({ min: m, raw: String(m), pct: (m / 90) * 100, scored: true, label: `${m}'` }); }
  for (let i = 0; i < concededHT; i++) { const m = 15 + i * 12; goals.push({ min: m, raw: String(m), pct: (m / 90) * 100, scored: false, label: `${m}' \u2014 Encaiss\u00e9` }); }
  for (let i = 0; i < scored2MT; i++) { const m = 55 + i * 12; goals.push({ min: m, raw: String(m), pct: (m / 90) * 100, scored: true, label: `${m}'` }); }
  for (let i = 0; i < conceded2MT; i++) { const m = 60 + i * 12; goals.push({ min: m, raw: String(m), pct: (m / 90) * 100, scored: false, label: `${m}' \u2014 Encaiss\u00e9` }); }
  goals.sort((a, b) => a.min - b.min);

  return { goals, total: totalGoals, result };
}

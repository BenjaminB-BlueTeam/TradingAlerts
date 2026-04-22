/**
 * Shared team data functions: loading matches from Supabase, computing stats,
 * and generating goal timing bar data.
 */

/**
 * Loads the last 15 matches for a team in a given context (home/away) from Supabase.
 * @param {number|string} teamId
 * @param {'home'|'away'} context
 * @param {object} supabaseClient - The Supabase client instance (from '$lib/api/supabase.js')
 * @returns {Promise<Array>}
 */
export async function loadTeamMatches(teamId, context, supabaseClient) {
  const col = context === 'home' ? 'home_team_id' : 'away_team_id';
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabaseClient
    .from('h2h_matches')
    .select('*')
    .eq(col, teamId)
    .lt('match_date', today)
    .order('match_date', { ascending: false })
    .limit(15);

  return data || [];
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
 * @returns {{ goals: Array<{min: number, pct: number, scored: boolean}>, total: number, result: 'W'|'D'|'L' }}
 */
export function goalBar(match, context) {
  const isHome = context === 'home';
  const teamGoals = isHome ? (match.home_goals || 0) : (match.away_goals || 0);
  const oppGoals = isHome ? (match.away_goals || 0) : (match.home_goals || 0);
  const totalGoals = teamGoals + oppGoals;

  // Result: W/D/L
  const result = teamGoals > oppGoals ? 'W' : teamGoals === oppGoals ? 'D' : 'L';

  const events = match.goal_events || [];

  // If we have goal_events with minutes, use them
  if (events.length > 0 && events[0]?.min) {
    const goals = events.map(g => ({
      min: g.min,
      pct: Math.min((g.min / 95) * 100, 98),
      scored: isHome ? g.home : !g.home,
    }));
    return { goals, total: totalGoals, result };
  }

  // Fallback: distribute goals within each half
  const scoredHT = isHome ? (match.home_goals_ht || 0) : (match.away_goals_ht || 0);
  const concededHT = isHome ? (match.away_goals_ht || 0) : (match.home_goals_ht || 0);
  const scored2MT = teamGoals - scoredHT;
  const conceded2MT = oppGoals - concededHT;

  const goals = [];
  for (let i = 0; i < scoredHT; i++) goals.push({ min: 10 + i * 12, pct: (10 + i * 12) / 95 * 100, scored: true });
  for (let i = 0; i < concededHT; i++) goals.push({ min: 15 + i * 12, pct: (15 + i * 12) / 95 * 100, scored: false });
  for (let i = 0; i < scored2MT; i++) goals.push({ min: 55 + i * 12, pct: (55 + i * 12) / 95 * 100, scored: true });
  for (let i = 0; i < conceded2MT; i++) goals.push({ min: 60 + i * 12, pct: (60 + i * 12) / 95 * 100, scored: false });
  goals.sort((a, b) => a.min - b.min);

  return { goals, total: totalGoals, result };
}

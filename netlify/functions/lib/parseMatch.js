/* ================================================
   netlify/functions/lib/parseMatch.js
   Shared parser — converts a FootyStats match object
   into a Supabase h2h_matches row.
   ================================================ */

/**
 * Parse un match FootyStats en row Supabase h2h_matches.
 * @param {object} m - match brut FootyStats
 * @param {object} [opts] - options optionnelles
 * @param {number|string} [opts.seasonId] - forcer le season_id/league_id
 * @returns {object} row formatée pour h2h_matches
 */
function parseMatchRow(m, opts = {}) {
  let goalMinutes = [];
  const homeTimings = m.homeGoals_timings || m.homeGoals || [];
  const awayTimings = m.awayGoals_timings || m.awayGoals || [];
  if (Array.isArray(homeTimings)) {
    homeTimings.forEach(t => {
      const min = parseInt(t);
      if (min > 0) goalMinutes.push({ min, raw: String(t).trim(), home: true });
    });
  }
  if (Array.isArray(awayTimings)) {
    awayTimings.forEach(t => {
      const min = parseInt(t);
      if (min > 0) goalMinutes.push({ min, raw: String(t).trim(), home: false });
    });
  }
  goalMinutes.sort((a, b) => a.min - b.min);

  const seasonId = opts.seasonId != null ? Number(opts.seasonId) : (m.competition_id || null);

  return {
    home_team_id: m.homeID,
    away_team_id: m.awayID,
    home_team_name: m.home_name || null,
    away_team_name: m.away_name || null,
    league_id: opts.seasonId != null ? Number(opts.seasonId) : (m.competition_id || m.league_id || null),
    season_id: seasonId,
    match_id: m.id,
    match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : m.date || '1970-01-01',
    home_goals: m.homeGoalCount ?? m.homeGoals ?? 0,
    away_goals: m.awayGoalCount ?? m.awayGoals ?? 0,
    home_goals_ht: m.team_a_ht_score ?? m.ht_goals_team_a ?? 0,
    away_goals_ht: m.team_b_ht_score ?? m.ht_goals_team_b ?? 0,
    goal_events: goalMinutes,
    last_updated: new Date().toISOString(),
  };
}

module.exports = { parseMatchRow };

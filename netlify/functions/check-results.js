/* ================================================
   netlify/functions/check-results.js
   Vérifie les résultats des alertes pending terminées.
   Cron : toutes les heures via Netlify Scheduled Functions.
   ================================================ */

const FOOTYSTATS_BASE = 'https://api.football-data-api.com';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function footyRequest(endpoint, params = {}) {
  const apiKey = process.env.FOOTYSTATS_API_KEY;
  if (!apiKey) throw new Error('FOOTYSTATS_API_KEY non configurée');
  const url = new URL(`${FOOTYSTATS_BASE}/${endpoint}`);
  url.searchParams.set('key', apiKey);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FootyStats ${endpoint}: HTTP ${res.status}`);
  return await res.json();
}

async function supabaseQuery(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return await res.json();
}

async function supabaseUpdate(table, matchId, updates) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?match_id=eq.${matchId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

function parseGoalMinutes(matchData) {
  const minutes = [];
  const homeTimes = matchData.homeGoals_timings || matchData.homeGoals || [];
  const awayTimes = matchData.awayGoals_timings || matchData.awayGoals || [];
  if (Array.isArray(homeTimes)) {
    homeTimes.forEach(t => { const m = parseInt(t); if (m > 0) minutes.push(m); });
  }
  if (Array.isArray(awayTimes)) {
    awayTimes.forEach(t => { const m = parseInt(t); if (m > 0) minutes.push(m); });
  }
  return minutes;
}

function evaluateFHG(matchData) {
  const goalMinutes = parseGoalMinutes(matchData);
  if (goalMinutes.length > 0) {
    const hasGoal3145 = goalMinutes.some(m => m >= 31 && m <= 45);
    return hasGoal3145 ? 'validated' : 'lost';
  }
  // Fallback: no goal timing data available — use HT goals
  console.warn(`[check-results] match ${matchData.id}: goal_timings unavailable, falling back to ht_goals`);
  const htGoals = (matchData.ht_goals_team_a || 0) + (matchData.ht_goals_team_b || 0);
  return htGoals > 0 ? 'validated' : 'lost';
}

function evaluateDC(matchData, dcBestSide) {
  const homeGoals = matchData.homeGoalCount || 0;
  const awayGoals = matchData.awayGoalCount || 0;
  if (dcBestSide === 'home') return homeGoals >= awayGoals ? 'validated' : 'lost';
  if (dcBestSide === 'away') return awayGoals >= homeGoals ? 'validated' : 'lost';
  return 'lost';
}

exports.handler = async () => {
  const results = { checked: 0, validated: 0, lost: 0, expired: 0, errors: [] };

  try {
    // Alertes pending dont le kickoff est passé depuis > 100 minutes
    const cutoff = Math.floor(Date.now() / 1000) - 100 * 60;
    const alerts = await supabaseQuery(
      'alerts',
      `status=eq.pending&kickoff_unix=lte.${cutoff}&order=kickoff_unix.asc&limit=20`
    );
    console.log(`[check-results] START — ${alerts.length} pending alerts to check`);

    const nowUnix = Math.floor(Date.now() / 1000);
    const STALE_SECONDS = 48 * 60 * 60; // 48 hours

    for (const alert of alerts) {
      try {
        // Staleness check: mark as expired if kickoff was > 48h ago
        if (alert.kickoff_unix && (nowUnix - alert.kickoff_unix) > STALE_SECONDS) {
          const ok = await supabaseUpdate('alerts', alert.match_id, {
            status: 'expired',
            result_checked_at: new Date().toISOString(),
          });
          if (ok) {
            results.checked++;
            results.expired++;
            console.log(`[check-results] match ${alert.match_id} -> expired (stale >48h)`);
          }
          continue;
        }

        const data = await footyRequest('match', { match_id: alert.match_id });
        const matchData = data?.data;
        if (!matchData || matchData.status !== 'complete') continue;

        const signalType = alert.signal_type;
        let newStatus;

        if (signalType === 'FHG') {
          newStatus = evaluateFHG(matchData);
        } else if (signalType === 'DC') {
          newStatus = evaluateDC(matchData, alert.dc_best_side);
        } else if (signalType === 'FHG+DC') {
          const fhgResult = evaluateFHG(matchData);
          const dcResult = evaluateDC(matchData, alert.dc_best_side);
          newStatus = (fhgResult === 'validated' && dcResult === 'validated') ? 'validated' : 'lost';
        } else {
          continue;
        }

        const ok = await supabaseUpdate('alerts', alert.match_id, {
          status: newStatus,
          result_checked_at: new Date().toISOString(),
        });

        if (ok) {
          results.checked++;
          if (newStatus === 'validated') results.validated++;
          else results.lost++;
          console.log(`[check-results] match ${alert.match_id} (${alert.signal_type}) -> ${newStatus}`);
        } else {
          results.errors.push(`Update failed for match ${alert.match_id}`);
        }
      } catch (e) {
        console.error(`[check-results] Error checking match ${alert.match_id}: ${e.message}`);
        results.errors.push(`match ${alert.match_id}: ${e.message}`);
      }
    }
    console.log(`[check-results] END — checked: ${results.checked}, validated: ${results.validated}, lost: ${results.lost}, errors: ${results.errors.length}`);
  } catch (e) {
    console.error(`[check-results] FATAL: ${e.message}`);
    results.errors.push(e.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify(results),
  };
};

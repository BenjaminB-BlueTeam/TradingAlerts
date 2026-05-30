/* ================================================
   supabase.js — Client Supabase + CRUD trades
   Late Goal Tracker
   ================================================ */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies (voir Netlify env vars)')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ============================================================
// H2H QUERIES
// ============================================================

/**
 * Récupère les H2H entre deux équipes depuis Supabase (toutes saisons).
 * Retourne les matchs terminés triés par date.
 */
export async function getH2HFromDB(teamAId, teamBId) {
  const { data, error } = await supabase
    .from('h2h_matches')
    .select('*')
    .or(
      `and(home_team_id.eq.${teamAId},away_team_id.eq.${teamBId}),and(home_team_id.eq.${teamBId},away_team_id.eq.${teamAId})`
    )
    .order('match_date', { ascending: true })
  if (error) { console.error('getH2HFromDB:', error); return [] }
  return data || []
}

/**
 * Convertit un row h2h_matches Supabase au format attendu par analyserDC.
 */
export function h2hRowToApiFormat(row) {
  return {
    id: row.match_id,
    homeID: row.home_team_id,
    awayID: row.away_team_id,
    home_name: row.home_team_name,
    away_name: row.away_team_name,
    homeGoalCount: row.home_goals,
    awayGoalCount: row.away_goals,
    ht_goals_team_a: row.home_goals_ht,
    ht_goals_team_b: row.away_goals_ht,
    date_unix: row.match_date ? new Date(row.match_date).getTime() / 1000 : null,
    status: 'complete',
    goalscorer: row.goal_events || [],
    season: row.season_id,
  }
}

/**
 * Récupère les H2H formatés pour analyserDC.
 */
export async function getH2HForAnalysis(teamAId, teamBId) {
  const rows = await getH2HFromDB(teamAId, teamBId)
  return rows.map(h2hRowToApiFormat)
}

// ============================================================
// HELPERS DEBUG / SEED
// ============================================================

export async function testSupabaseConnection() {
  try {
    const { count, error } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
    if (error) return { success: false, error: error.message }
    return { success: true, message: `Connexion OK — ${count} alerte(s)` }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function getTableCounts() {
  const tables = ['alerts', 'h2h_matches', 'seed_jobs', 'team_lg1_cache', 'teams', 'selected_alerts']
  const counts = {}
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      counts[table] = error ? `erreur: ${error.message}` : count
    } catch (e) {
      console.warn(`Supabase: erreur accès table ${table}`, e);
      counts[table] = 'table absente'
    }
  }
  return counts
}

// ============================================================
// SÉLECTION MANUELLE DES ALERTES (Chantier B)
// ============================================================

/**
 * Sélectionner manuellement une alerte (LG1/DC/LG2).
 */
export async function selectAlert(matchId, signalType, note = null) {
  const { error } = await supabase.from('selected_alerts').insert({
    match_id: matchId,
    signal_type: signalType,
    user_note: note || null,
  });
  if (error) throw error;
}

/**
 * Désélectionner une alerte.
 */
export async function unselectAlert(matchId, signalType) {
  const { error } = await supabase.from('selected_alerts').delete()
    .eq('match_id', matchId)
    .eq('signal_type', signalType);
  if (error) throw error;
}

/**
 * Liste toutes les alertes sélectionnées.
 */
export async function getSelectedAlerts() {
  const { data, error } = await supabase
    .from('selected_alerts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('getSelectedAlerts:', error); return [] }
  return data || []
}

// ============================================================
// ALERTES MANUELLES (sélection depuis /matches)
// ============================================================

/**
 * Crée une alerte manuelle dans `alerts` (algo_version='manual').
 * Idempotent : si l'alerte existe déjà (conflict unique match_id+signal_type), la retourne.
 * @param {object} match - objet match FootyStats (id, homeID, awayID, home_name, away_name, date_unix, competition_id, season_id)
 * @param {'LG1'|'LG2'} strategy
 * @param {string} leagueName - nom de la ligue (résolu par getLeagueName dans /matches)
 */
export async function createManualAlert(match, strategy, leagueName) {
  const signalType = strategy === 'LG1' ? 'LG1_MANUAL' : 'LG2_MANUAL';
  const kickoffUnix = match.date_unix || null;
  let matchDate = null;
  let matchTime = null;
  if (kickoffUnix) {
    const d = new Date(kickoffUnix * 1000);
    matchDate = d.toISOString().slice(0, 10);
    matchTime = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  const row = {
    match_id: match.id,
    match_date: matchDate,
    kickoff_unix: kickoffUnix,
    home_team_id: match.homeID || null,
    away_team_id: match.awayID || null,
    home_team_name: match.home_name || null,
    away_team_name: match.away_name || null,
    league_name: leagueName || null,
    h2h_count: 0,
    signal_type: signalType,
    lg1_pct: null,
    lg1_confidence: null,
    lg1_factors: null,
    confidence: null,
    algo_version: 'manual',
  };

  const { data, error } = await supabase.from('alerts').insert(row).select().single();
  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: fetchErr } = await supabase
        .from('alerts')
        .select('*')
        .eq('match_id', match.id)
        .eq('signal_type', signalType)
        .single();
      if (fetchErr) throw fetchErr;
      return existing;
    }
    throw error;
  }
  return data;
}

// ============================================================
// FAVORIS (équipes favorites)
// ============================================================

export async function getFavorites() {
  const { data, error } = await supabase
    .from('favorite_teams')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('getFavorites:', error); return []; }
  return data || [];
}

export async function addFavoriteTeam(teamId, teamName = null) {
  const { error } = await supabase.from('favorite_teams').insert({
    team_id: teamId,
    team_name: teamName || null,
  });
  // Idempotent : ignore violation d'unicité (23505)
  if (error && error.code !== '23505') throw error;
}

export async function removeFavoriteTeam(teamId) {
  const { error } = await supabase.from('favorite_teams').delete().eq('team_id', teamId);
  if (error) throw error;
}

// ============================================================
// POTENTIEL ÉQUIPES (filtre LG1%/LG2% sur la saison)
// ============================================================

/**
 * Charge les stats LG1/LG2 contextuelles (dom/ext) de toutes les équipes
 * depuis team_lg1_cache. Une seule requête légère (~1 ligne/équipe), le
 * filtrage par seuil se fait ensuite côté client (instantané).
 * Retourne les lignes brutes — la déduplication par équipe (latest) et le
 * filtrage sont gérés par $lib/utils/teamPotential.js.
 *
 * NB cap PostgREST : Supabase plafonne les réponses (souvent 1000 lignes) ;
 * `.limit(5000)` ne contourne PAS ce plafond serveur. Aujourd'hui ~939 lignes
 * donc OK. Le tri `updated_at DESC` privilégie les saisons récentes : si la
 * table dépasse un jour 1000 lignes, ce sont les plus anciennes (que la dédup
 * écarte de toute façon) qui seraient tronquées en premier. À paginer si la
 * volumétrie de team_lg1_cache franchit ce seuil.
 */
export async function getTeamPotentialRows() {
  const { data, error } = await supabase
    .from('team_lg1_cache')
    .select('team_id, team_name, lg1_home_pct, lg1_away_pct, lg2_home_pct, lg2_away_pct, matches_home, matches_away, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5000);
  if (error) { console.error('getTeamPotentialRows:', error); return []; }
  return data || [];
}

// ============================================================
// AUTH
// ============================================================

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message?.toLowerCase().includes('invalid')
      ? 'Email ou mot de passe incorrect'
      : (error.message || 'Erreur de connexion');
    return { user: null, error: msg };
  }
  return { user: data.user, error: null };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) console.error('signOut:', error);
  return !error;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}


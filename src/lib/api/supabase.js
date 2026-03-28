/* ================================================
   supabase.js — Client Supabase + CRUD trades
   FHG Tracker
   ================================================ */

import { createClient } from '@supabase/supabase-js'

// Clé anon publique — conçue pour être exposée en frontend
const SUPABASE_URL = 'https://ikpafgqjmjifpaulctmx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrcGFmZ3FqbWppZnBhdWxjdG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODMxMzAsImV4cCI6MjA5MDI1OTEzMH0._01tjkB0WvN4xeHH78HIDqZk9BIhDxb9qYJ7dYystso'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ============================================================
// MAPPING localStorage ↔ Supabase
// ============================================================

function toRow(trade) {
  return {
    date:        trade.date        || null,
    match:       trade.match       || null,
    ligue:       trade.ligue       || null,
    fhg_pct:     trade.fhgPct      || null,
    strategie:   trade.strategie   || 'fhg',
    badge_1mt:   !!trade.badge1MT,
    h2h:         trade.h2h         || 'insuffisant',
    timer:       trade.timer       || null,
    cote:        trade.cote        || null,
    dc_possible: trade.dcPossible  || null,
    etat_esprit: trade.etatEsprit  || null,
    resultat:    trade.resultat    || 'non_joue',
    notes:       trade.analyse     || null,
    match_id:    trade.matchId     ? String(trade.matchId) : null,
  }
}

function fromRow(row) {
  return {
    id:          row.id,
    date:        row.date,
    match:       row.match,
    ligue:       row.ligue,
    fhgPct:      row.fhg_pct,
    strategie:   row.strategie,
    badge1MT:    row.badge_1mt,
    h2h:         row.h2h,
    timer:       row.timer,
    cote:        row.cote,
    dcPossible:  row.dc_possible,
    etatEsprit:  row.etat_esprit,
    resultat:    row.resultat,
    analyse:     row.notes,
    matchId:     row.match_id,
  }
}

// ============================================================
// CRUD TRADES
// ============================================================

export async function fetchTrades() {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) { console.error('fetchTrades:', error); return null }
  return data.map(fromRow)
}

export async function insertTrade(trade) {
  const { data, error } = await supabase
    .from('trades')
    .insert(toRow(trade))
    .select()
    .single()
  if (error) { console.error('insertTrade:', error); return null }
  return fromRow(data)
}

export async function updateTradeInDB(id, updates) {
  const row = {}
  if (updates.resultat    !== undefined) row.resultat    = updates.resultat
  if (updates.cote        !== undefined) row.cote        = updates.cote
  if (updates.analyse     !== undefined) row.notes       = updates.analyse
  if (updates.etatEsprit  !== undefined) row.etat_esprit = updates.etatEsprit

  const { error } = await supabase
    .from('trades')
    .update(row)
    .eq('id', id)
  if (error) console.error('updateTradeInDB:', error)
}

export async function deleteTradeFromDB(id) {
  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('id', id)
  if (error) console.error('deleteTradeFromDB:', error)
}

// ============================================================
// MIGRATION localStorage → Supabase (premier lancement)
// ============================================================

// ============================================================
// H2H QUERIES (pour Alertes et DC)
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
      .from('trades')
      .select('*', { count: 'exact', head: true })
    if (error) return { success: false, error: error.message }
    return { success: true, message: `Connexion OK — ${count} trade(s)` }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function getTableCounts() {
  const tables = ['trades', 'team_seasons', 'h2h_matches', 'seed_jobs']
  const counts = {}
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      counts[table] = error ? `erreur: ${error.message}` : count
    } catch {
      counts[table] = 'table absente'
    }
  }
  return counts
}

// ============================================================
// MIGRATION localStorage → Supabase (premier lancement)
// ============================================================

export async function migrateLocalTrades(localTrades) {
  if (!localTrades || localTrades.length === 0) return

  const { count, error } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })

  if (error || count > 0) return

  const rows = localTrades.map(toRow)
  const { error: insertError } = await supabase.from('trades').insert(rows)
  if (insertError) {
    console.error('migrateLocalTrades:', insertError)
  } else {
    console.log(`Migration : ${rows.length} trade(s) migrés vers Supabase`)
  }
}

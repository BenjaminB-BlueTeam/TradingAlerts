/* ================================================
   mockData.js — Données de démonstration
   FHG Tracker
   ================================================ */

/**
 * Données mock utilisées quand aucune clé API n'est configurée.
 * Correspond exactement aux 5 matchs de référence du cahier des charges.
 */

export const MOCK_DATA = {

  // ---- MATCHS DU JOUR ----
  matches: [
    {
      id: 'mock_1',
      homeID: 101,
      awayID: 102,
      homeName: 'Bayern Munich',
      awayName: 'Borussia Dortmund',
      leagueName: 'Bundesliga',
      leagueId: 'bundesliga',
      leagueFlag: '🇩🇪',
      time: '20:30',
      date: getTodayStr(),
      status: 'upcoming',
      context: 'DOM',
    },
    {
      id: 'mock_2',
      homeID: 103,
      awayID: 104,
      homeName: 'Bayer Leverkusen',
      awayName: 'RB Leipzig',
      leagueName: 'Bundesliga',
      leagueId: 'bundesliga',
      leagueFlag: '🇩🇪',
      time: '18:30',
      date: getTodayStr(),
      status: 'upcoming',
      context: 'DOM',
    },
    {
      id: 'mock_3',
      homeID: 201,
      awayID: 202,
      homeName: 'Brentford',
      awayName: 'Arsenal',
      leagueName: 'Premier League',
      leagueId: 'premier-league',
      leagueFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      time: '15:00',
      date: getTodayStr(),
      status: 'upcoming',
      context: 'DOM',
    },
    {
      id: 'mock_4',
      homeID: 203,
      awayID: 204,
      homeName: 'Wolverhampton',
      awayName: 'Chelsea',
      leagueName: 'Premier League',
      leagueId: 'premier-league',
      leagueFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      time: '17:30',
      date: getTodayStr(),
      status: 'upcoming',
      context: 'DOM',
    },
    {
      id: 'mock_5',
      homeID: 301,
      awayID: 302,
      homeName: 'RC Lens',
      awayName: 'PSG',
      leagueName: 'Ligue 1',
      leagueId: 'ligue-1',
      leagueFlag: '🇫🇷',
      time: '21:00',
      date: getTodayStr(),
      status: 'upcoming',
      context: 'DOM',
    },
  ],

  // ---- DONNÉES ÉQUIPES ----
  // Ces données sont utilisées par scoring.js
  teams: {
    'bundesliga': [
      {
        id: 101,
        name: 'Bayern Munich',
        matches_played: 26,
        matches_played_n1: 34,
        // FHG 31-45min
        goals_scored_min_31_to_45: 21,       // 81% → taux N
        goals_scored_min_31_to_45_n1: 22,    // 65% → taux N-1
        // Forme 5 derniers
        buts_31_45_sur_5_derniers: 4,
        // 1MT bonus
        matches_scored_first_half: 20,       // 78%
        // DC
        pct_retour_si_encaisse: 72,
        pct_victoire_domicile: 82,
        // Distribution buts par tranche (pour graphique)
        dist_buts: { '0-15': 8, '16-30': 12, '31-45': 21, '46-60': 14, '61-75': 18, '76-90': 16 },
      },
      {
        id: 102,
        name: 'Borussia Dortmund',
        matches_played: 26,
        matches_played_n1: 34,
        goals_scored_min_31_to_45: 14,
        goals_scored_min_31_to_45_n1: 15,
        buts_31_45_sur_5_derniers: 3,
        matches_scored_first_half: 17,
        pct_retour_si_encaisse: 60,
        pct_victoire_domicile: 65,
        dist_buts: { '0-15': 6, '16-30': 9, '31-45': 14, '46-60': 10, '61-75': 13, '76-90': 11 },
      },
      {
        id: 103,
        name: 'Bayer Leverkusen',
        matches_played: 26,
        matches_played_n1: 34,
        goals_scored_min_31_to_45: 19,       // 73%
        goals_scored_min_31_to_45_n1: 20,
        buts_31_45_sur_5_derniers: 4,
        matches_scored_first_half: 18,       // 69%
        pct_retour_si_encaisse: 68,
        pct_victoire_domicile: 78,
        dist_buts: { '0-15': 7, '16-30': 11, '31-45': 19, '46-60': 13, '61-75': 16, '76-90': 14 },
      },
      {
        id: 104,
        name: 'RB Leipzig',
        matches_played: 26,
        matches_played_n1: 34,
        goals_scored_min_31_to_45: 13,
        goals_scored_min_31_to_45_n1: 14,
        buts_31_45_sur_5_derniers: 3,
        matches_scored_first_half: 15,
        pct_retour_si_encaisse: 55,
        pct_victoire_domicile: 60,
        dist_buts: { '0-15': 5, '16-30': 8, '31-45': 13, '46-60': 9, '61-75': 12, '76-90': 10 },
      },
    ],
    'premier-league': [
      {
        id: 201,
        name: 'Brentford',
        matches_played: 28,
        matches_played_n1: 38,
        goals_scored_min_31_to_45: 19,       // 68%
        goals_scored_min_31_to_45_n1: 18,
        buts_31_45_sur_5_derniers: 3,
        matches_scored_first_half: 18,       // 64%
        pct_retour_si_encaisse: 58,
        pct_victoire_domicile: 58,
        dist_buts: { '0-15': 7, '16-30': 10, '31-45': 19, '46-60': 11, '61-75': 14, '76-90': 12 },
      },
      {
        id: 202,
        name: 'Arsenal',
        matches_played: 28,
        matches_played_n1: 38,
        goals_scored_min_31_to_45: 14,
        goals_scored_min_31_to_45_n1: 15,
        buts_31_45_sur_5_derniers: 3,
        matches_scored_first_half: 17,
        pct_retour_si_encaisse: 50,
        pct_victoire_domicile: 68,
        dist_buts: { '0-15': 6, '16-30': 9, '31-45': 14, '46-60': 10, '61-75': 12, '76-90': 11 },
      },
      {
        id: 203,
        name: 'Wolverhampton',
        matches_played: 28,
        matches_played_n1: 38,
        goals_scored_min_31_to_45: 22,       // 78%
        goals_scored_min_31_to_45_n1: 21,
        buts_31_45_sur_5_derniers: 4,
        matches_scored_first_half: 20,       // 71%
        pct_retour_si_encaisse: 62,
        pct_victoire_domicile: 55,
        dist_buts: { '0-15': 8, '16-30': 11, '31-45': 22, '46-60': 13, '61-75': 15, '76-90': 12 },
      },
      {
        id: 204,
        name: 'Chelsea',
        matches_played: 28,
        matches_played_n1: 38,
        goals_scored_min_31_to_45: 15,
        goals_scored_min_31_to_45_n1: 16,
        buts_31_45_sur_5_derniers: 3,
        matches_scored_first_half: 16,
        pct_retour_si_encaisse: 55,
        pct_victoire_domicile: 65,
        dist_buts: { '0-15': 6, '16-30': 9, '31-45': 15, '46-60': 11, '61-75': 13, '76-90': 12 },
      },
    ],
    'ligue-1': [
      {
        id: 301,
        name: 'RC Lens',
        matches_played: 27,
        matches_played_n1: 38,
        goals_scored_min_31_to_45: 19,       // 70%
        goals_scored_min_31_to_45_n1: 18,
        buts_31_45_sur_5_derniers: 3,
        matches_scored_first_half: 15,       // 56%
        pct_retour_si_encaisse: 56,
        pct_victoire_domicile: 60,
        dist_buts: { '0-15': 6, '16-30': 9, '31-45': 19, '46-60': 10, '61-75': 13, '76-90': 11 },
      },
      {
        id: 302,
        name: 'PSG',
        matches_played: 27,
        matches_played_n1: 38,
        goals_scored_min_31_to_45: 16,
        goals_scored_min_31_to_45_n1: 18,
        buts_31_45_sur_5_derniers: 3,
        matches_scored_first_half: 18,
        pct_retour_si_encaisse: 45,
        pct_victoire_domicile: 80,
        dist_buts: { '0-15': 7, '16-30': 10, '31-45': 16, '46-60': 12, '61-75': 15, '76-90': 14 },
      },
    ],
  },

  // ---- H2H ----
  h2h: {
    '101_102': [
      { date: '2025-11-02', homeGoals: 3, awayGoals: 1, homeGoals_HT: 2, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
      { date: '2025-04-06', homeGoals: 2, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
      { date: '2024-11-03', homeGoals: 4, awayGoals: 0, homeGoals_HT: 2, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
      { date: '2024-04-01', homeGoals: 0, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'Bayern Munich' },
      { date: '2023-11-05', homeGoals: 3, awayGoals: 1, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
    ],
    '102_101': [
      { date: '2025-11-02', homeGoals: 3, awayGoals: 1, homeGoals_HT: 2, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
      { date: '2025-04-06', homeGoals: 2, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
      { date: '2024-11-03', homeGoals: 4, awayGoals: 0, homeGoals_HT: 2, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
      { date: '2024-04-01', homeGoals: 0, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'Bayern Munich' },
      { date: '2023-11-05', homeGoals: 3, awayGoals: 1, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayern Munich' },
    ],
    '103_104': [
      { date: '2025-10-20', homeGoals: 2, awayGoals: 1, homeGoals_HT: 1, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
      { date: '2025-03-15', homeGoals: 3, awayGoals: 2, homeGoals_HT: 2, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
      { date: '2024-10-22', homeGoals: 1, awayGoals: 1, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
      { date: '2024-03-10', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Bayer Leverkusen' },
      { date: '2023-11-12', homeGoals: 2, awayGoals: 0, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
    ],
    '104_103': [
      { date: '2025-10-20', homeGoals: 2, awayGoals: 1, homeGoals_HT: 1, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
      { date: '2025-03-15', homeGoals: 3, awayGoals: 2, homeGoals_HT: 2, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
      { date: '2024-10-22', homeGoals: 1, awayGoals: 1, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
      { date: '2024-03-10', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Bayer Leverkusen' },
      { date: '2023-11-12', homeGoals: 2, awayGoals: 0, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Bayer Leverkusen' },
    ],
    '201_202': [
      { date: '2025-10-05', homeGoals: 2, awayGoals: 3, homeGoals_HT: 1, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Brentford' },
      { date: '2025-02-22', homeGoals: 1, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Brentford' },
      { date: '2024-09-28', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Brentford' },
      { date: '2024-02-11', homeGoals: 2, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Brentford' },
      { date: '2023-09-24', homeGoals: 1, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Brentford' },
    ],
    '202_201': [
      { date: '2025-10-05', homeGoals: 2, awayGoals: 3, homeGoals_HT: 1, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Brentford' },
      { date: '2025-02-22', homeGoals: 1, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true, equipeNom: 'Brentford' },
      { date: '2024-09-28', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Brentford' },
      { date: '2024-02-11', homeGoals: 2, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Brentford' },
      { date: '2023-09-24', homeGoals: 1, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: true, equipeNom: 'Brentford' },
    ],
    '203_204': [
      // Wolverhampton vs Chelsea : 1/5 but en 1MT → warning orange
      { date: '2025-10-19', homeGoals: 0, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
      { date: '2025-04-05', homeGoals: 1, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true,  equipeNom: 'Wolverhampton' },
      { date: '2024-10-15', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
      { date: '2024-03-22', homeGoals: 2, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
      { date: '2023-10-08', homeGoals: 1, awayGoals: 3, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
    ],
    '204_203': [
      { date: '2025-10-19', homeGoals: 0, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
      { date: '2025-04-05', homeGoals: 1, awayGoals: 2, homeGoals_HT: 1, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: true,  equipeNom: 'Wolverhampton' },
      { date: '2024-10-15', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
      { date: '2024-03-22', homeGoals: 2, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
      { date: '2023-10-08', homeGoals: 1, awayGoals: 3, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'Wolverhampton' },
    ],
    '301_302': [
      // RC Lens vs PSG : 0/4 but en 1MT → EXCLU
      { date: '2025-09-28', homeGoals: 0, awayGoals: 3, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
      { date: '2025-03-08', homeGoals: 1, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
      { date: '2024-10-20', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
      { date: '2024-01-15', homeGoals: 1, awayGoals: 3, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
    ],
    '302_301': [
      { date: '2025-09-28', homeGoals: 0, awayGoals: 3, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
      { date: '2025-03-08', homeGoals: 1, awayGoals: 2, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
      { date: '2024-10-20', homeGoals: 0, awayGoals: 1, homeGoals_HT: 0, awayGoals_HT: 0, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
      { date: '2024-01-15', homeGoals: 1, awayGoals: 3, homeGoals_HT: 0, awayGoals_HT: 1, equipe_ciblee_but_avant_45min: false, equipeNom: 'RC Lens' },
    ],
  },

  // ---- LIGUES DISPONIBLES ----
  leagues: [
    { id: 82,  name: 'Bundesliga',         country: 'Allemagne', flag: '🇩🇪' },
    { id: 8,   name: 'Premier League',      country: 'Angleterre',flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 168, name: 'Ligue 1',             country: 'France',    flag: '🇫🇷' },
    { id: 302, name: 'Eredivisie',          country: 'Pays-Bas',  flag: '🇳🇱' },
    { id: 9,   name: 'Championship',        country: 'Angleterre',flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 203, name: 'Süper Lig',           country: 'Turquie',   flag: '🇹🇷' },
    { id: 87,  name: 'La Liga',             country: 'Espagne',   flag: '🇪🇸' },
    { id: 384, name: 'Serie A',             country: 'Italie',    flag: '🇮🇹' },
  ],

  leagueMatches: {},
  matchDetails: {},
};

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

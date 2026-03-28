/* ================================================
   doubleChance.js — Analyse Double Chance basée H2H
   Évalue le potentiel DC d'un match à partir des
   confrontations directes passées uniquement.
   ================================================ */

/**
 * Analyse DC d'un match à partir de ses H2H.
 * @param {Array} h2hMatches - matchs H2H bruts de l'API (league-matches filtrés)
 * @param {number} homeId - ID équipe domicile du match à venir
 * @param {number} awayId - ID équipe extérieur du match à venir
 * @returns {object} analyse DC complète
 */
export function analyserDC(h2hMatches, homeId, awayId) {
  if (!h2hMatches || h2hMatches.length === 0) {
    return { hasData: false, nbH2H: 0 };
  }

  const total = h2hMatches.length;

  // Classifier chaque H2H du point de vue de homeId et awayId
  const results = h2hMatches.map(m => {
    const isHomeTeamA = m.homeID === homeId;
    const goalsHome = m.homeGoalCount ?? 0;
    const goalsAway = m.awayGoalCount ?? 0;
    const htHome = m.ht_goals_team_a ?? 0;
    const htAway = m.ht_goals_team_b ?? 0;

    // Buts de "notre" équipe dom et ext dans ce H2H
    const teamAGoals = isHomeTeamA ? goalsHome : goalsAway;
    const teamBGoals = isHomeTeamA ? goalsAway : goalsHome;
    const teamAGoalsHT = isHomeTeamA ? htHome : htAway;
    const teamBGoalsHT = isHomeTeamA ? htAway : htHome;

    // Résultat FT pour chaque équipe
    const teamAResult = teamAGoals > teamBGoals ? 'W' : teamAGoals === teamBGoals ? 'D' : 'L';
    const teamBResult = teamBGoals > teamAGoals ? 'W' : teamBGoals === teamAGoals ? 'D' : 'L';

    // Résultat HT
    const htResultA = teamAGoalsHT > teamBGoalsHT ? 'W' : teamAGoalsHT === teamBGoalsHT ? 'D' : 'L';
    const htResultB = teamBGoalsHT > teamAGoalsHT ? 'W' : teamBGoalsHT === teamAGoalsHT ? 'D' : 'L';

    // HT ≠ FT ?
    const htFtChanged = (htResultA !== teamAResult);

    // Comeback : perdait à la MT mais ne perd pas au FT
    const comebackA = htResultA === 'L' && teamAResult !== 'L';
    const comebackB = htResultB === 'L' && teamBResult !== 'L';

    // Menait à la MT mais ne gagne pas au FT (blown lead)
    const blownA = htResultA === 'W' && teamAResult !== 'W';
    const blownB = htResultB === 'W' && teamBResult !== 'W';

    return {
      date: m.date_unix ? new Date(m.date_unix * 1000) : null,
      homeName: m.home_name,
      awayName: m.away_name,
      scoreFT: `${goalsHome}-${goalsAway}`,
      scoreHT: `${htHome}-${htAway}`,
      totalGoals: goalsHome + goalsAway,
      teamAResult, teamBResult,
      htResultA, htResultB,
      htFtChanged,
      comebackA, comebackB,
      blownA, blownB,
      teamAGoals, teamBGoals,
      teamAGoalsHT, teamBGoalsHT,
      // Cotes DC si disponibles
      oddsDC_1x: m.odds_doublechance_1x || null,
      oddsDC_x2: m.odds_doublechance_x2 || null,
      isHomeTeamA,
    };
  });

  // --- Stats agrégées équipe A (homeId = domicile du match à venir) ---
  const teamAWins = results.filter(r => r.teamAResult === 'W').length;
  const teamADraws = results.filter(r => r.teamAResult === 'D').length;
  const teamALosses = results.filter(r => r.teamAResult === 'L').length;
  const teamANonDefeat = teamAWins + teamADraws;
  const teamANonDefeatPct = Math.round((teamANonDefeat / total) * 100);

  // --- Stats agrégées équipe B (awayId = extérieur du match à venir) ---
  const teamBWins = results.filter(r => r.teamBResult === 'W').length;
  const teamBDraws = results.filter(r => r.teamBResult === 'D').length;
  const teamBLosses = results.filter(r => r.teamBResult === 'L').length;
  const teamBNonDefeat = teamBWins + teamBDraws;
  const teamBNonDefeatPct = Math.round((teamBNonDefeat / total) * 100);

  // --- Comebacks H2H ---
  const matchesWithHTTrailA = results.filter(r => r.htResultA === 'L').length;
  const comebacksA = results.filter(r => r.comebackA).length;
  const comebackRateA = matchesWithHTTrailA > 0 ? Math.round((comebacksA / matchesWithHTTrailA) * 100) : null;

  const matchesWithHTTrailB = results.filter(r => r.htResultB === 'L').length;
  const comebacksB = results.filter(r => r.comebackB).length;
  const comebackRateB = matchesWithHTTrailB > 0 ? Math.round((comebacksB / matchesWithHTTrailB) * 100) : null;

  // --- HT ≠ FT ---
  const htFtChanges = results.filter(r => r.htFtChanged).length;
  const htFtChangePct = Math.round((htFtChanges / total) * 100);

  // --- Buts ---
  const avgGoals = +(results.reduce((s, r) => s + r.totalGoals, 0) / total).toFixed(1);
  const avgGoalsA = +(results.reduce((s, r) => s + r.teamAGoals, 0) / total).toFixed(1);
  const avgGoalsB = +(results.reduce((s, r) => s + r.teamBGoals, 0) / total).toFixed(1);

  // --- Clean sheets H2H ---
  const csA = results.filter(r => r.teamBGoals === 0).length; // A garde sa cage inviolée
  const csB = results.filter(r => r.teamAGoals === 0).length; // B garde sa cage inviolée
  const csPctA = Math.round((csA / total) * 100);
  const csPctB = Math.round((csB / total) * 100);

  // --- Séquences récentes (3 derniers H2H) ---
  const recent3 = results.slice(-3);
  const recentFormA = recent3.map(r => r.teamAResult).join('');
  const recentFormB = recent3.map(r => r.teamBResult).join('');

  // --- % défaite ---
  const defeatPctA = Math.round((teamALosses / total) * 100);
  const defeatPctB = Math.round((teamBLosses / total) * 100);

  // --- Signal DC ---
  // Fort = défaite ≤ 20% (donc ne perd presque jamais dans les H2H)
  // Moyen = défaite ≤ 35%
  const signalA = defeatPctA <= 20 ? 'fort' : defeatPctA <= 35 ? 'moyen' : 'faible';
  const signalB = defeatPctB <= 20 ? 'fort' : defeatPctB <= 35 ? 'moyen' : 'faible';

  // Meilleur côté DC
  const bestSide = teamANonDefeatPct > teamBNonDefeatPct ? 'home' :
                   teamBNonDefeatPct > teamANonDefeatPct ? 'away' : 'equal';

  return {
    hasData: true,
    nbH2H: total,
    results, // détail de chaque H2H

    // Équipe A (dom du match à venir)
    teamA: {
      wins: teamAWins,
      draws: teamADraws,
      losses: teamALosses,
      nonDefeatPct: teamANonDefeatPct,
      defeatPct: defeatPctA,
      comebackRate: comebackRateA,
      comebacksCount: comebacksA,
      comebacksFrom: matchesWithHTTrailA,
      avgGoals: avgGoalsA,
      cleanSheets: csA,
      cleanSheetPct: csPctA,
      recentForm: recentFormA,
      signal: signalA,
    },

    // Équipe B (ext du match à venir)
    teamB: {
      wins: teamBWins,
      draws: teamBDraws,
      losses: teamBLosses,
      nonDefeatPct: teamBNonDefeatPct,
      defeatPct: defeatPctB,
      comebackRate: comebackRateB,
      comebacksCount: comebacksB,
      comebacksFrom: matchesWithHTTrailB,
      avgGoals: avgGoalsB,
      cleanSheets: csB,
      cleanSheetPct: csPctB,
      recentForm: recentFormB,
      signal: signalB,
    },

    // Stats globales H2H
    htFtChangePct,
    avgGoals,
    bestSide,
  };
}

/**
 * Formatte un résultat W/D/L en emoji
 */
export function resultIcon(r) {
  if (r === 'W') return '✅';
  if (r === 'D') return '🟰';
  if (r === 'L') return '❌';
  return '—';
}

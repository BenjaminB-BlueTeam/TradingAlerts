/**
 * calibrate-threshold.js
 *
 * Analyse les alertes terminées pour proposer des seuils optimaux.
 * Usage : node scripts/calibrate-threshold.js
 *
 * Nécessite VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY en env,
 * ou les valeurs sont lues depuis le code source en fallback.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou VITE_*) en variables d\'environnement.');
  console.error('Exemple : SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/calibrate-threshold.js');
  process.exit(1);
}

async function fetchAlerts() {
  const url = `${SUPABASE_URL}/rest/v1/alerts?status=in.(validated,lost)&select=signal_type,fhg_pct,dc_defeat_pct,confidence,status&order=kickoff_unix.desc`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    console.error(`Supabase error: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return await res.json();
}

/**
 * Intervalle de confiance de Wilson à 95%
 * https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
 */
function wilsonCI(successes, total) {
  if (total === 0) return { lower: 0, upper: 0 };
  const z = 1.96; // 95%
  const p = successes / total;
  const denom = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
  return {
    lower: Math.max(0, Math.round((center - margin) * 100)),
    upper: Math.min(100, Math.round((center + margin) * 100)),
  };
}

function analyzeBuckets(alerts, scoreField, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(60)}`);

  if (alerts.length < 5) {
    console.log(`  ⚠ Seulement ${alerts.length} alertes terminées — échantillon insuffisant.`);
    console.log(`  Revenir quand au moins 20 alertes sont disponibles.\n`);
    return;
  }

  const buckets = [
    { min: 0, max: 60, label: '< 60' },
    { min: 60, max: 65, label: '60-64' },
    { min: 65, max: 70, label: '65-69' },
    { min: 70, max: 75, label: '70-74' },
    { min: 75, max: 80, label: '75-79' },
    { min: 80, max: 85, label: '80-84' },
    { min: 85, max: 90, label: '85-89' },
    { min: 90, max: 101, label: '90+' },
  ];

  console.log(`\n  ${'Score'.padEnd(8)} ${'n'.padStart(5)} ${'win%'.padStart(6)} ${'IC95'.padStart(12)}`);
  console.log(`  ${'-'.repeat(35)}`);

  let bestFort = null;
  let bestMoyen = null;

  for (const bucket of buckets) {
    const inBucket = alerts.filter(a => {
      const score = a[scoreField];
      if (score == null) return false;
      return score >= bucket.min && score < bucket.max;
    });

    if (inBucket.length === 0) continue;

    const wins = inBucket.filter(a => a.status === 'validated').length;
    const winPct = Math.round((wins / inBucket.length) * 100);
    const ci = wilsonCI(wins, inBucket.length);

    console.log(`  ${bucket.label.padEnd(8)} ${String(inBucket.length).padStart(5)} ${(winPct + '%').padStart(6)} [${ci.lower}-${ci.upper}]`.padStart(12));

    // Seuil fort : borne inf IC95 >= 70%
    if (ci.lower >= 70 && !bestFort) {
      bestFort = bucket.min;
    }
    // Seuil moyen : borne inf IC95 >= 55%
    if (ci.lower >= 55 && !bestMoyen) {
      bestMoyen = bucket.min;
    }
  }

  console.log();

  // Résumé global
  const totalWins = alerts.filter(a => a.status === 'validated').length;
  const globalPct = Math.round((totalWins / alerts.length) * 100);
  const globalCI = wilsonCI(totalWins, alerts.length);
  console.log(`  Global : ${totalWins}/${alerts.length} = ${globalPct}% [IC95: ${globalCI.lower}-${globalCI.upper}%]`);

  // Recommandations
  console.log();
  if (bestFort) {
    console.log(`  → Seuil FORT recommandé : >= ${bestFort}% (borne inf IC95 >= 70%)`);
  } else {
    console.log(`  → Seuil FORT : pas assez de données pour recommander (aucun bucket avec IC95 inf >= 70%)`);
  }
  if (bestMoyen) {
    console.log(`  → Seuil MOYEN recommandé : >= ${bestMoyen}% (borne inf IC95 >= 55%)`);
  } else {
    console.log(`  → Seuil MOYEN : pas assez de données pour recommander`);
  }

  // Seuils actuels
  console.log(`  → Seuils actuels : fort >= 80%, moyen >= 70%`);
  console.log();
}

async function main() {
  console.log('Chargement des alertes terminées depuis Supabase...');
  const alerts = await fetchAlerts();
  console.log(`${alerts.length} alertes terminées trouvées.`);

  if (alerts.length === 0) {
    console.log('Aucune alerte terminée. Rien à analyser.');
    return;
  }

  // Par confiance
  const fort = alerts.filter(a => a.confidence === 'fort');
  const moyen = alerts.filter(a => a.confidence === 'moyen');
  console.log(`  dont ${fort.length} fort, ${moyen.length} moyen`);
  if (fort.length > 0) {
    const fortWins = fort.filter(a => a.status === 'validated').length;
    console.log(`  Fort : ${fortWins}/${fort.length} = ${Math.round(fortWins / fort.length * 100)}%`);
  }
  if (moyen.length > 0) {
    const moyenWins = moyen.filter(a => a.status === 'validated').length;
    console.log(`  Moyen : ${moyenWins}/${moyen.length} = ${Math.round(moyenWins / moyen.length * 100)}%`);
  }

  // FHG
  const fhg = alerts.filter(a => a.signal_type === 'FHG' || a.signal_type === 'FHG+DC');
  analyzeBuckets(fhg, 'fhg_pct', `FHG (${fhg.length} alertes)`);

  // DC
  const dc = alerts.filter(a => a.signal_type === 'DC' || a.signal_type === 'FHG+DC');
  analyzeBuckets(dc, 'dc_defeat_pct', `DC — par % défaite (${dc.length} alertes, plus bas = mieux)`);

  // FHG+DC combo
  const combo = alerts.filter(a => a.signal_type === 'FHG+DC');
  if (combo.length > 0) {
    const comboWins = combo.filter(a => a.status === 'validated').length;
    console.log(`\n  FHG+DC combo : ${comboWins}/${combo.length} = ${Math.round(comboWins / combo.length * 100)}%`);
  }
}

main().catch(e => {
  console.error('Erreur:', e.message);
  process.exit(1);
});

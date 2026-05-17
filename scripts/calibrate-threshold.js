/**
 * calibrate-threshold.js — streak v2
 *
 * ⚠️  OBSOLÈTE après le rebrand FHG → LG1 (2026-05-08).
 *     Le script référence encore les anciens signal_type LG1_DOM / LG1_EXT
 *     qui n'existent plus dans la nouvelle nomenclature (LG1_A/B/A+B/C/D).
 *     À réécrire avant la prochaine campagne de calibration (cf roadmap CLAUDE.md).
 *
 * Analyse les alertes terminées et produit :
 *   1. Tableau par signal_type
 *   2. Tableau par confiance
 *   3. Cross-tab signal_type × confiance
 *   4. Recommandations sur les seuils de streak
 *
 * Usage : node scripts/calibrate-threshold.js
 *
 * Env requis : VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *   (ou SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou VITE_*) en variables d\'environnement.');
  console.error('Ex : SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/calibrate-threshold.js');
  process.exit(1);
}

// Seuils actuels (v2)
const STREAK_FORT        = 3;   // streak consécutif → fort
const STREAK_MOYEN       = 2;   // streak consécutif → moyen
const CONFIRM_MIN_RATE   = 0.60;// taux confirmation requis
const CONFIRM_MIN_SAMPLE = 3;   // min matchs dans fenêtre confirmation

async function fetchAlerts() {
  // Récupère toutes les alertes terminées (inclut v1 + v2 pour comparaison)
  const url = `${SUPABASE_URL}/rest/v1/alerts`
    + `?status=in.(validated,lost)`
    + `&select=signal_type,lg1_pct,confidence,status,algo_version`
    + `&order=kickoff_unix.desc`;

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

// Wilson score interval (95%)
function wilsonCI(k, n) {
  if (n === 0) return { lower: 0, upper: 0, lower_pct: 0, upper_pct: 0 };
  const z = 1.96;
  const p = k / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return {
    lower: Math.max(0, Math.round((center - margin) * 100)),
    upper: Math.min(100, Math.round((center + margin) * 100)),
  };
}

function stats(alerts) {
  const n = alerts.length;
  if (n === 0) return null;
  const wins = alerts.filter(a => a.status === 'validated').length;
  const pct = Math.round(wins / n * 100);
  const ci = wilsonCI(wins, n);
  return { n, wins, pct, ci };
}

function printRow(label, s, width = 20) {
  if (!s) {
    console.log(`  ${label.padEnd(width)} ${'—'.padStart(5)}`);
    return;
  }
  const ci = `[${s.ci.lower}-${s.ci.upper}]`;
  console.log(
    `  ${label.padEnd(width)} ${String(s.n).padStart(5)} ${(s.pct + '%').padStart(6)}  ${ci.padStart(12)}`
  );
}

function header(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  ${''.padEnd(20)} ${'n'.padStart(5)} ${'win%'.padStart(6)}  ${'IC95 [lo-hi]'.padStart(12)}`);
  console.log(`  ${'-'.repeat(48)}`);
}

function recommend(s, label) {
  if (!s || s.n < 5) {
    console.log(`  ⚠ ${label} : échantillon insuffisant (${s ? s.n : 0} alertes — min 5)`);
    return;
  }
  if (s.ci.lower >= 70) {
    console.log(`  ✓ ${label} : solide (borne inf IC95 >= 70%)`);
  } else if (s.ci.lower >= 55) {
    console.log(`  ~ ${label} : acceptable (borne inf IC95 >= 55%)`);
  } else {
    console.log(`  ✗ ${label} : insuffisant (borne inf IC95 < 55%) — envisager de relever le seuil`);
  }
}

async function main() {
  console.log('\nCalibrateur de seuils — streak v2');
  console.log('Chargement des alertes terminées depuis Supabase...\n');

  const all = await fetchAlerts();
  console.log(`${all.length} alertes terminées au total.`);

  // Séparer v1 vs v2
  const v2 = all.filter(a => a.algo_version === 'lg1_v2');
  const v1 = all.filter(a => a.algo_version !== 'lg1_v2');

  console.log(`  v1 (ancien algo) : ${v1.length}`);
  console.log(`  v2 (streak)      : ${v2.length}`);

  if (v2.length === 0) {
    console.log('\n⚠ Aucune alerte v2 terminée. Exécutez le cron generate-alerts.js et attendez des résultats.');
    if (v1.length > 0) {
      console.log('\nAnalyse v1 pour comparaison de référence :');
      const sv1 = stats(v1);
      console.log(`  Global v1 : ${sv1.wins}/${sv1.n} = ${sv1.pct}% [IC95: ${sv1.ci.lower}-${sv1.ci.upper}%]`);
    }
    return;
  }

  // ── 1. Par signal_type ──────────────────────────────────────
  header(`Par signal_type  (v2, n=${v2.length})`);

  const sigTypes = ['LG1_DOM', 'LG1_EXT'];
  const sigStats = {};
  for (const sig of sigTypes) {
    sigStats[sig] = stats(v2.filter(a => a.signal_type === sig));
    printRow(sig, sigStats[sig]);
  }
  const lg1All = v2.filter(a => ['LG1_DOM', 'LG1_EXT'].includes(a.signal_type));
  printRow('LG1 (tous)', stats(lg1All));
  printRow('Global v2', stats(v2));

  // ── 2. Par confiance ────────────────────────────────────────
  header(`Par confiance  (v2 LG1, n=${lg1All.length})`);

  const confLevels = ['fort', 'fort', 'moyen'];
  const confStats = {};
  for (const conf of confLevels) {
    confStats[conf] = stats(lg1All.filter(a => a.confidence === conf));
    printRow(conf, confStats[conf]);
  }

  // ── 3. Cross-tab signal_type × confiance ────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Cross-tab signal_type × confiance`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  ${''.padEnd(12)} ${'fort'.padStart(13)} ${'fort'.padStart(13)} ${'moyen'.padStart(13)}`);
  console.log(`  ${'-'.repeat(54)}`);

  for (const sig of ['LG1_DOM', 'LG1_EXT']) {
    const row = v2.filter(a => a.signal_type === sig);
    const cells = confLevels.map(conf => {
      const s = stats(row.filter(a => a.confidence === conf));
      if (!s) return '    —    ';
      return `${s.pct}%(${s.n})`.padStart(13);
    });
    console.log(`  ${sig.padEnd(12)} ${cells.join('')}`);
  }

  // ── 4. Recommandations ──────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Recommandations (seuils actuels: FORT=${STREAK_FORT}, MOYEN=${STREAK_MOYEN}, CONFIRM=${Math.round(CONFIRM_MIN_RATE * 100)}%)`);
  console.log(`${'='.repeat(60)}\n`);

  recommend(confStats['fort'], 'fort');
  recommend(confStats['fort'],        'fort        ');
  recommend(confStats['moyen'],       'moyen       ');

  console.log();

  // Comparaison LG1_DOM vs LG1_EXT
  const sDom = sigStats['LG1_DOM'];
  const sExt = sigStats['LG1_EXT'];
  if (sDom && sDom.n >= 5 && sExt && sExt.n >= 5) {
    const diff = sDom.pct - sExt.pct;
    if (Math.abs(diff) >= 10) {
      const better = diff > 0 ? 'LG1_DOM' : 'LG1_EXT';
      const worse  = diff > 0 ? 'LG1_EXT' : 'LG1_DOM';
      console.log(`  ⚡ ${better} surperforme ${worse} de ${Math.abs(diff)}% — envisager de relever le seuil pour ${worse}.`);
    } else {
      console.log(`  ~ LG1_DOM et LG1_EXT ont des performances similaires (écart ${Math.abs(diff)}%).`);
    }
  }

  // fort vs standalone
  const sDouble     = stats(lg1All.filter(a => a.confidence === 'fort'));
  const sStandalone = stats(lg1All.filter(a => a.confidence !== 'fort'));
  if (sDouble && sDouble.n >= 5 && sStandalone && sStandalone.n >= 5) {
    const diff = sDouble.pct - sStandalone.pct;
    console.log(`  ${diff >= 5 ? '✓' : '~'} fort : ${sDouble.pct}% vs autres : ${sStandalone.pct}% (écart ${diff > 0 ? '+' : ''}${diff}%)`);
    if (diff < 0) {
      console.log(`    → fort est moins performant. Vérifier les critères A+B.`);
    }
  }

  console.log(`\n  Seuils actuels : STREAK_FORT=${STREAK_FORT}, STREAK_MOYEN=${STREAK_MOYEN}, CONFIRM_MIN_RATE=${CONFIRM_MIN_RATE}, CONFIRM_MIN_SAMPLE=${CONFIRM_MIN_SAMPLE}`);
  console.log(`  Pour modifier : netlify/functions/lib/lg1.cjs + src/lib/core/lg1.js\n`);
}

main().catch(e => {
  console.error('Erreur:', e.message);
  process.exit(1);
});

/* ================================================
   h2h.js — Analyse Head-to-Head et filtre Clean Sheet
   FHG Tracker
   ================================================ */

export function analyserH2H(h2h = [], equipeNom = '', minH2H = 3) {
  const nb = h2h.length;

  if (nb === 0) {
    return {
      statut:       'insuffisant',
      couleur:      'gris',
      butsEnPremiereMT: 0,
      nbH2H:        0,
      message:      'Aucun H2H disponible',
      exclu:        false,
    };
  }

  if (nb < minH2H) {
    return {
      statut:           'insuffisant',
      couleur:          'gris',
      butsEnPremiereMT: h2h.filter(m => m.equipe_ciblee_but_avant_45min).length,
      nbH2H:            nb,
      message:          `H2H insuffisant (${nb}/${minH2H} requis) — aucune pénalité`,
      exclu:            false,
    };
  }

  const butsEnPremiereMT = h2h.filter(m => m.equipe_ciblee_but_avant_45min === true).length;

  if (butsEnPremiereMT === 0) {
    return {
      statut:           'exclusion',
      couleur:          'rouge',
      butsEnPremiereMT: 0,
      nbH2H:            nb,
      message:          `Clean Sheet H2H : 0 but en 1MT sur ${nb} confrontation${nb > 1 ? 's' : ''} contre cet adversaire. La récurrence prime sur tout.`,
      exclu:            true,
    };
  }

  if (butsEnPremiereMT === 1) {
    return {
      statut:           'defavorable',
      couleur:          'orange',
      butsEnPremiereMT: 1,
      nbH2H:            nb,
      message:          `1 but en 1MT sur ${nb} confrontations — warning orange (pénalité -${8} pts)`,
      exclu:            false,
    };
  }

  return {
    statut:           'favorable',
    couleur:          'vert',
    butsEnPremiereMT,
    nbH2H:            nb,
    message:          `${butsEnPremiereMT}/${nb} confrontations avec but en 1MT — H2H FAVORABLE`,
    exclu:            false,
  };
}

export function formaterH2HTimeline(h2h = [], equipeNom = '') {
  return h2h.slice(-5).map(m => ({
    date:   formatDate(m.date),
    score:  `${m.homeGoals}-${m.awayGoals}`,
    htScore:`MT: ${m.homeGoals_HT}-${m.awayGoals_HT}`,
    butMT:  m.equipe_ciblee_but_avant_45min === true,
    goals:  m.goals || [],
    total:  (m.homeGoals || 0) + (m.awayGoals || 0),
    raw:    m,
  }));
}

export function getBadgeH2H(h2hResult) {
  if (!h2hResult) return { icon: '?', classe: 'badge--h2h-gris', label: 'H2H ?' };
  switch (h2hResult.couleur) {
    case 'vert':    return { icon: '✓', classe: 'badge--h2h-vert',   label: `H2H ✓ (${h2hResult.butsEnPremiereMT}/${h2hResult.nbH2H})` };
    case 'orange':  return { icon: '⚠', classe: 'badge--h2h-orange', label: `H2H ⚠ (${h2hResult.butsEnPremiereMT}/${h2hResult.nbH2H})` };
    case 'rouge':   return { icon: '✗', classe: 'badge--exclu',      label: `H2H ✗ (0/${h2hResult.nbH2H})` };
    default:        return { icon: '?', classe: 'badge--h2h-gris',   label: `H2H ? (${h2hResult.nbH2H})` };
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch (e) {
    console.warn('h2h: formatDate invalide', dateStr, e);
    return dateStr;
  }
}

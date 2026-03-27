/**
 * h2h.js — Gestion du filtre Clean Sheet H2H
 * Logique de vérification et d'affichage des confrontations directes
 */

/**
 * Évaluer le statut H2H pour un match
 * @param {Array} h2hList - liste des confrontations directes formatées
 * @param {number} minH2H - minimum de H2H pour appliquer le filtre
 * @returns {Object} statut H2H
 */
export function evaluerH2H(h2hList = [], minH2H = 3) {
  if (!h2hList || h2hList.length < minH2H) {
    return {
      statut: 'insuffisant',
      butsEnMT: 0,
      totalH2H: h2hList?.length ?? 0,
      label: 'H2H insuffisant',
      badgeClass: 'badge-gray',
      color: 'gray',
    };
  }

  const butsEnMT = h2hList.filter(m => m.equipe_ciblee_but_avant_45min === true).length;
  const totalH2H = h2hList.length;

  if (butsEnMT === 0) {
    return {
      statut: 'rouge',
      butsEnMT: 0,
      totalH2H,
      label: 'EXCLU — Clean Sheet H2H',
      badgeClass: 'badge-danger',
      color: 'rouge',
      raisonExclusion: `Clean Sheet H2H : 0 but en 1MT sur ${totalH2H} confrontation${totalH2H > 1 ? 's' : ''} contre cet adversaire.`,
    };
  }

  if (butsEnMT === 1) {
    return {
      statut: 'orange',
      butsEnMT: 1,
      totalH2H,
      label: 'H2H défavorable',
      badgeClass: 'badge-orange',
      color: 'orange',
    };
  }

  return {
    statut: 'vert',
    butsEnMT,
    totalH2H,
    label: 'H2H favorable',
    badgeClass: 'badge-green',
    color: 'vert',
  };
}

/**
 * Formatter les données H2H pour l'affichage dans la timeline
 * @param {Array} h2hList
 * @param {string} teamName
 * @returns {Object} données formatées pour l'UI
 */
export function formatterH2H(h2hList = [], teamName = 'L\'équipe') {
  const statut = evaluerH2H(h2hList);

  const items = h2hList.map(m => ({
    date: m.date || '',
    score: m.score || '?-?',
    htScore: m.htScore || '',
    butEnMT: m.equipe_ciblee_but_avant_45min,
    icone: m.equipe_ciblee_but_avant_45min ? '✓' : '✗',
    classeIcone: m.equipe_ciblee_but_avant_45min ? 'yes' : 'no',
  }));

  const resume = `${statut.butsEnMT}/${statut.totalH2H} confrontation${statut.totalH2H > 1 ? 's' : ''} avec but en 1MT`;

  let badgeTexte, badgeClass;
  if (statut.statut === 'vert') {
    badgeTexte = 'H2H FAVORABLE';
    badgeClass = 'badge-green';
  } else if (statut.statut === 'orange') {
    badgeTexte = 'H2H DÉFAVORABLE';
    badgeClass = 'badge-orange';
  } else if (statut.statut === 'rouge') {
    badgeTexte = 'H2H EXCLU';
    badgeClass = 'badge-danger';
  } else {
    badgeTexte = 'H2H INSUFFISANT';
    badgeClass = 'badge-gray';
  }

  return {
    statut,
    items,
    resume,
    badgeTexte,
    badgeClass,
    teamName,
  };
}

/**
 * Render HTML de la timeline H2H
 * @param {Object} h2hFormatted - résultat de formatterH2H
 */
export function renderH2HTimeline(h2hFormatted) {
  const { items, resume, badgeTexte, badgeClass, statut } = h2hFormatted;

  if (!items.length) {
    return `
      <div class="h2h-timeline">
        <div class="text-muted" style="font-size:12px;">
          Aucune donnée H2H disponible
        </div>
      </div>
    `;
  }

  const itemsHtml = items.map(item => `
    <div class="h2h-item">
      <span class="h2h-date">${item.date}</span>
      <span class="h2h-score">${item.score}</span>
      ${item.htScore ? `<span class="text-muted" style="font-size:11px;">(MT: ${item.htScore})</span>` : ''}
      <span class="h2h-result ${item.classeIcone}">${item.icone}</span>
    </div>
  `).join('');

  const raisonHtml = statut.statut === 'rouge'
    ? `<div class="warning-box red mt-8">${statut.raisonExclusion}</div>`
    : '';

  return `
    <div class="h2h-timeline">
      ${itemsHtml}
      <div class="h2h-summary">
        <span>${resume}</span>
        <span class="badge ${badgeClass}">${badgeTexte}</span>
      </div>
      ${raisonHtml}
    </div>
  `;
}

/**
 * Icône H2H pour les tableaux compacts
 * @param {string} statut - 'vert'|'orange'|'insuffisant'|'rouge'
 */
export function getH2HIcone(statut) {
  switch (statut) {
    case 'vert':     return { icon: '✓', class: 'text-green', title: 'H2H favorable' };
    case 'orange':   return { icon: '⚠', class: 'text-orange', title: 'H2H défavorable' };
    case 'insuffisant': return { icon: '?', class: 'text-muted', title: 'H2H insuffisant' };
    case 'rouge':    return { icon: '✗', class: 'text-danger', title: 'EXCLU' };
    default:         return { icon: '?', class: 'text-muted', title: 'H2H inconnu' };
  }
}

/* ================================================
   tradeStats.js — Trade statistics calculation (pure computation)
   FHG Tracker
   ================================================ */

import { get } from 'svelte/store';
import { trades } from './appStore.js';

export function calcStatsTradesGlobal() {
  const list = get(trades).filter(t => t.resultat !== 'non_joue');
  if (list.length === 0) return null;

  const gagnes = list.filter(t => t.resultat === 'gagne').length;
  const total  = list.length;
  const tauxGlobal = Math.round((gagnes / total) * 100);

  const avec1MT = list.filter(t => t.badge1MT);
  const sans1MT = list.filter(t => !t.badge1MT);
  const taux1MT = avec1MT.length > 0
    ? Math.round((avec1MT.filter(t => t.resultat === 'gagne').length / avec1MT.length) * 100)
    : null;
  const tauxSans1MT = sans1MT.length > 0
    ? Math.round((sans1MT.filter(t => t.resultat === 'gagne').length / sans1MT.length) * 100)
    : null;

  const h2hVert   = list.filter(t => t.h2h === 'favorable');
  const h2hOrange = list.filter(t => t.h2h === 'defavorable');
  const h2hGris   = list.filter(t => t.h2h === 'insuffisant');
  const tauxH2HVert   = h2hVert.length   > 0 ? Math.round((h2hVert.filter(t => t.resultat === 'gagne').length   / h2hVert.length)   * 100) : null;
  const tauxH2HOrange = h2hOrange.length > 0 ? Math.round((h2hOrange.filter(t => t.resultat === 'gagne').length / h2hOrange.length) * 100) : null;
  const tauxH2HGris   = h2hGris.length   > 0 ? Math.round((h2hGris.filter(t => t.resultat === 'gagne').length   / h2hGris.length)   * 100) : null;

  const coteMoy = list.filter(t => t.cote).length > 0
    ? (list.reduce((s, t) => s + (parseFloat(t.cote) || 0), 0) / list.filter(t => t.cote).length).toFixed(2)
    : null;
  const roi = coteMoy
    ? Math.round((tauxGlobal / 100 * parseFloat(coteMoy) - 1) * 100)
    : null;

  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  list.forEach(t => {
    if (t.resultat === 'gagne') {
      curWin++; curLoss = 0;
      if (curWin > maxWin) maxWin = curWin;
    } else {
      curLoss++; curWin = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    }
  });

  return {
    total, gagnes, tauxGlobal,
    taux1MT, tauxSans1MT,
    tauxH2HVert, tauxH2HOrange, tauxH2HGris,
    coteMoy, roi,
    maxWin, maxLoss,
    sufficientData: total >= 20,
  };
}

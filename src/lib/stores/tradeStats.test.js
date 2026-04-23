import { describe, it, expect } from 'vitest';
import { computeTradeStats } from './tradeStats.js';

// Helpers
const gagne    = (overrides = {}) => ({ resultat: 'gagne',   badge1MT: false, h2h: 'insuffisant', cote: null, ...overrides });
const perdu    = (overrides = {}) => ({ resultat: 'perdu',   badge1MT: false, h2h: 'insuffisant', cote: null, ...overrides });

describe('computeTradeStats', () => {
  it('retourne null si liste vide', () => {
    expect(computeTradeStats([])).toBeNull();
  });

  it('taux global correct — 3 gagnés sur 4', () => {
    const list = [gagne(), gagne(), gagne(), perdu()];
    const s = computeTradeStats(list);
    expect(s.total).toBe(4);
    expect(s.gagnes).toBe(3);
    expect(s.tauxGlobal).toBe(75);
  });

  it('100% si tout gagné', () => {
    const s = computeTradeStats([gagne(), gagne()]);
    expect(s.tauxGlobal).toBe(100);
  });

  it('0% si tout perdu', () => {
    const s = computeTradeStats([perdu(), perdu()]);
    expect(s.tauxGlobal).toBe(0);
  });

  // --- badge1MT ---
  it('taux1MT null si aucun trade avec badge1MT', () => {
    const s = computeTradeStats([gagne(), perdu()]);
    expect(s.taux1MT).toBeNull();
  });

  it('taux1MT 50% si 1/2 avec badge1MT', () => {
    const list = [
      gagne({ badge1MT: true }),
      perdu({ badge1MT: true }),
    ];
    const s = computeTradeStats(list);
    expect(s.taux1MT).toBe(50);
  });

  it('tauxSans1MT correct', () => {
    const list = [
      gagne({ badge1MT: false }),
      gagne({ badge1MT: false }),
      perdu({ badge1MT: false }),
    ];
    const s = computeTradeStats(list);
    expect(s.tauxSans1MT).toBe(67);
  });

  // --- H2H ---
  it('tauxH2HVert null si aucun trade favorable', () => {
    const s = computeTradeStats([gagne(), perdu()]);
    expect(s.tauxH2HVert).toBeNull();
  });

  it('tauxH2HVert 100% si tous favorables gagnés', () => {
    const list = [gagne({ h2h: 'favorable' }), gagne({ h2h: 'favorable' })];
    const s = computeTradeStats(list);
    expect(s.tauxH2HVert).toBe(100);
  });

  it('tauxH2HOrange et tauxH2HGris corrects ensemble', () => {
    const list = [
      perdu({ h2h: 'defavorable' }),
      gagne({ h2h: 'defavorable' }),
      gagne({ h2h: 'insuffisant' }),
      perdu({ h2h: 'insuffisant' }),
      perdu({ h2h: 'insuffisant' }),
    ];
    const s = computeTradeStats(list);
    expect(s.tauxH2HOrange).toBe(50);
    expect(s.tauxH2HGris).toBe(33);
  });

  // --- Cote / ROI ---
  it('coteMoy null si aucune cote renseignée', () => {
    const s = computeTradeStats([gagne(), perdu()]);
    expect(s.coteMoy).toBeNull();
    expect(s.roi).toBeNull();
  });

  it('coteMoy et roi corrects', () => {
    // 2 gagnés sur 2, cote moyenne 2.0 → roi = 100%*(2.0) - 100% = 100%
    const list = [
      gagne({ cote: 2.0 }),
      gagne({ cote: 2.0 }),
    ];
    const s = computeTradeStats(list);
    expect(parseFloat(s.coteMoy)).toBe(2.0);
    expect(s.roi).toBe(100); // 100% * 2.0 - 1 = 1 → *100 = 100
  });

  it('roi négatif si taux trop bas', () => {
    const list = [
      perdu({ cote: 2.0 }),
      perdu({ cote: 2.0 }),
    ];
    const s = computeTradeStats(list);
    expect(s.roi).toBe(-100); // 0% * 2.0 - 1 = -1 → *100 = -100
  });

  // --- Séries ---
  it('maxWin et maxLoss corrects', () => {
    const list = [gagne(), gagne(), gagne(), perdu(), perdu(), gagne()];
    const s = computeTradeStats(list);
    expect(s.maxWin).toBe(3);
    expect(s.maxLoss).toBe(2);
  });

  it('maxWin 1 si série de 1', () => {
    const s = computeTradeStats([gagne(), perdu(), gagne(), perdu()]);
    expect(s.maxWin).toBe(1);
    expect(s.maxLoss).toBe(1);
  });

  // --- sufficientData ---
  it('sufficientData false si < 20 trades', () => {
    const s = computeTradeStats([gagne()]);
    expect(s.sufficientData).toBe(false);
  });

  it('sufficientData true si >= 20 trades', () => {
    const list = Array.from({ length: 20 }, () => gagne());
    const s = computeTradeStats(list);
    expect(s.sufficientData).toBe(true);
  });
});

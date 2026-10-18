import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bareme, indemniteKilometrique, creerNote, ajouterDepense, remboursementsNote } from '../src/frais/index.js';

test('critère 7 : exemple du client, 5 CV, 4 000 km déjà remboursés et 120 km donnent 76,32 €', () => {
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 4000, kilometres: 120 }), 7632);
});

test('critère 8 : passage de tranche, 5 CV, 4 900 km déjà remboursés et 200 km donnent barème(5 100) − barème(4 900) = 99,30 €', () => {
  assert.equal(bareme(2026, 5, 5100), 3215700);
  assert.equal(bareme(2026, 5, 4900), 3116400);
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 4900, kilometres: 200 }), 9930);
});

test('critère 8 : bornes des tranches, 5 000 km restent en tranche 1, 20 000 km en tranche 2, 20 001 km passent en tranche 3', () => {
  assert.equal(bareme(2026, 5, 5000), 5000 * 636);
  assert.equal(bareme(2026, 5, 5001), 5001 * 357 + 1395000);
  assert.equal(bareme(2026, 5, 20000), 20000 * 357 + 1395000);
  assert.equal(bareme(2026, 5, 20001), 20001 * 427);
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 4880, kilometres: 120 }), 7632);
  // 20 000 → 20 100 km : 20 100 × 0,427 − (20 000 × 0,357 + 1 395) = 8 582,70 − 8 535,00 = 47,70 €.
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 20000, kilometres: 100 }), 4770);
});

test('critère 8 : chaque puissance suit sa ligne du barème du client', () => {
  const attendu = { 3: [529, 316, 1065000, 370], 4: [606, 340, 1330000, 407], 5: [636, 357, 1395000, 427],
    6: [665, 374, 1457000, 447], 7: [697, 394, 1515000, 470] };
  for (const [puissance, [taux1, taux2, fixe2, taux3]] of Object.entries(attendu)) {
    assert.equal(bareme(2025, Number(puissance), 1000), 1000 * taux1);
    assert.equal(bareme(2025, Number(puissance), 10000), 10000 * taux2 + fixe2);
    assert.equal(bareme(2025, Number(puissance), 30000), 30000 * taux3);
  }
});

test('une puissance de 9 CV suit la ligne « 7 CV et plus » ; 2 CV est refusée', () => {
  assert.equal(bareme(2026, 9, 10000), bareme(2026, 7, 10000));
  assert.throws(() => bareme(2026, 2, 100), { name: 'RangeError', message: /puissance/ });
});

test('critère 9 : le barème de 2025 et celui de 2026 s\'appliquent ; 2024 et 2027 sont refusées', () => {
  for (const annee of [2025, 2026]) assert.equal(indemniteKilometrique({ annee, puissance: 5, cumulAvant: 4000, kilometres: 120 }), 7632);
  for (const annee of [2024, 2027]) {
    assert.throws(() => indemniteKilometrique({ annee, puissance: 5, cumulAvant: 0, kilometres: 120 }), { name: 'RangeError', message: /2025 et 2026/ });
  }
});

test('critère 9 : dans une note, l\'année du barème est celle de la date de la dépense', () => {
  const note = ajouterDepense(creerNote({ salarie: 'S1', mois: '2025-12' }),
    { date: '2025-12-31', nature: 'indemnites-kilometriques', kilometres: 120, puissance: 5 });
  assert.equal(remboursementsNote(note, { kilometrageDejaRembourse: 4000 })[0].montantRemboursableCentimes, 7632);
});

test('critère 15 : arrondi commercial de l\'indemnité, 3 CV et 5 km donnent 2,645 € soit 2,65 €', () => {
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 3, cumulAvant: 0, kilometres: 5 }), 265);
  // 4 CV et 1 km : 0,606 € donne 0,61 € ; 3 CV et 1 km : 0,529 € donne 0,53 €.
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 4, cumulAvant: 0, kilometres: 1 }), 61);
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 3, cumulAvant: 0, kilometres: 1 }), 53);
});

test('le cumul avance dans la note par ordre de date, puis d\'ordre de saisie', () => {
  let note = creerNote({ salarie: 'S1', mois: '2026-11' });
  note = ajouterDepense(note, { date: '2026-11-20', nature: 'indemnites-kilometriques', kilometres: 200, puissance: 5 });
  note = ajouterDepense(note, { date: '2026-11-05', nature: 'indemnites-kilometriques', kilometres: 100, puissance: 5 });
  note = ajouterDepense(note, { date: '2026-11-05', nature: 'repas', montantTtcCentimes: 1850 });
  note = ajouterDepense(note, { date: '2026-11-05', nature: 'indemnites-kilometriques', kilometres: 50, puissance: 5 });
  const montants = remboursementsNote(note, { kilometrageDejaRembourse: 4800 }).map((r) => r.montantRemboursableCentimes);
  // 05/11 (saisie 2) : 4 800 → 4 900 km = 63,60 € ; 05/11 (saisie 4) : 4 900 → 4 950 km = 31,80 € ;
  // 20/11 : 4 950 → 5 150 km = (5 150 × 0,357 + 1 395) − 4 950 × 0,636 = 3 233,55 − 3 148,20 = 85,35 €.
  assert.deepEqual(montants, [8535, 6360, 1850, 3180]);
});

test('le kilométrage déjà remboursé est exigé quand la note contient des indemnités, et doit être un entier positif ou nul', () => {
  const note = ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }),
    { date: '2026-11-05', nature: 'indemnites-kilometriques', kilometres: 100, puissance: 5 });
  assert.throws(() => remboursementsNote(note), { name: 'RangeError', message: /déjà remboursé/ });
  assert.throws(() => remboursementsNote(note, { kilometrageDejaRembourse: -1 }), RangeError);
  assert.throws(() => indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 1.5, kilometres: 10 }), RangeError);
  assert.equal(remboursementsNote(note, { kilometrageDejaRembourse: 0 })[0].montantRemboursableCentimes, 6360);
});

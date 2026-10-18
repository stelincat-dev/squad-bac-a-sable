import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerNote, ajouterDepense, NATURES, TAUX_TVA } from '../src/frais/index.js';

const NOTE = creerNote({ salarie: 'S1', mois: '2026-11' });
const REPAS = { date: '2026-11-10', nature: 'repas', montantTtcCentimes: 1850 };
const IK = { date: '2026-11-10', nature: 'indemnites-kilometriques', kilometres: 120, puissance: 5 };

test('critère 1 : une note se crée pour un salarié et un mois, avec une liste de dépenses vide', () => {
  assert.deepEqual(NOTE, { salarie: 'S1', mois: '2026-11', depenses: [] });
});

test('critère 1 : une dépense sans taux de TVA ni justificatif est acceptée', () => {
  const note = ajouterDepense(NOTE, REPAS);
  assert.deepEqual(note.depenses, [{ date: '2026-11-10', nature: 'repas', aParis: false, montantTtcCentimes: 1850 }]);
});

test('critère 1 : une dépense garde tous ses champs (TVA, « à Paris », justificatif, nuits)', () => {
  const hotel = { date: '2026-11-12', nature: 'hotel', montantTtcCentimes: 18000, tauxTva: 10, aParis: true, justificatif: 'J-42', nuits: 1 };
  assert.deepEqual(ajouterDepense(NOTE, hotel).depenses, [hotel]);
  assert.equal(ajouterDepense(NOTE, { ...hotel, nuits: undefined }).depenses[0].nuits, 1);
});

test('critère 1 : les sept natures prévues sont acceptées', () => {
  assert.deepEqual(NATURES, ['repas', 'hotel', 'transport', 'indemnites-kilometriques', 'autre', 'peage', 'parking']);
  let note = NOTE;
  for (const nature of ['repas', 'hotel', 'transport', 'autre']) note = ajouterDepense(note, { ...REPAS, nature });
  for (const nature of ['peage', 'parking']) note = ajouterDepense(note, { date: REPAS.date, nature, montantTtcCentimes: 1850 });
  note = ajouterDepense(note, IK);
  assert.equal(note.depenses.length, 7);
});

test('critère 1 : une note sans salarié ou avec un mois invalide est refusée', () => {
  assert.throws(() => creerNote({ salarie: '', mois: '2026-11' }), RangeError);
  assert.throws(() => creerNote({ mois: '2026-11' }), RangeError);
  for (const mois of ['2026-13', '2026-00', '2026-1', '11-2026', undefined]) {
    assert.throws(() => creerNote({ salarie: 'S1', mois }), RangeError);
  }
});

test('critère 2 : une nature inconnue est refusée et le message la nomme', () => {
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, nature: 'taxi' }), { name: 'RangeError', message: /« taxi »/ });
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, nature: undefined }), RangeError);
});

test('critère 3 : une dépense du 1er décembre dans une note de novembre est refusée, le message le dit', () => {
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, date: '2026-12-01' }), { name: 'RangeError', message: /hors du mois de la note/ });
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, date: '2026-10-31' }), { name: 'RangeError', message: /hors du mois de la note/ });
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, date: '2025-11-10' }), { name: 'RangeError', message: /hors du mois de la note/ });
});

test('critère 3 : une dépense du premier ou du dernier jour du mois de la note est acceptée', () => {
  const note = ajouterDepense(ajouterDepense(NOTE, { ...REPAS, date: '2026-11-01' }), { ...REPAS, date: '2026-11-30' });
  assert.equal(note.depenses.length, 2);
});

test('critère 3 : une date inexistante ou mal formée est refusée', () => {
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, date: '2026-11-31' }), { name: 'RangeError', message: /n'existe pas/ });
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, date: '10/11/2026' }), { name: 'RangeError', message: /AAAA-MM-JJ/ });
});

test('critère 4 : une dépense de même date, même nature et même montant est refusée comme doublon, la première reste', () => {
  const note = ajouterDepense(NOTE, REPAS);
  assert.throws(() => ajouterDepense(note, { ...REPAS, justificatif: 'J-2' }), { name: 'RangeError', message: /Doublon/ });
  assert.deepEqual(note.depenses, [{ ...REPAS, aParis: false }]);
});

test('critère 5 : une indemnité kilométrique de même date et mêmes kilomètres est refusée comme doublon', () => {
  const note = ajouterDepense(NOTE, IK);
  assert.throws(() => ajouterDepense(note, IK), { name: 'RangeError', message: /Doublon/ });
  assert.throws(() => ajouterDepense(note, { ...IK, puissance: 7 }), { name: 'RangeError', message: /Doublon/ });
  assert.equal(note.depenses.length, 1);
});

test('critère 6 : même date et même nature avec des montants différents, les deux dépenses sont acceptées', () => {
  const note = ajouterDepense(ajouterDepense(NOTE, REPAS), { ...REPAS, montantTtcCentimes: 1851 });
  assert.equal(note.depenses.length, 2);
});

test('critère 6 : deux indemnités kilométriques de même date et de kilométrages différents sont acceptées', () => {
  const note = ajouterDepense(ajouterDepense(NOTE, IK), { ...IK, kilometres: 121 });
  assert.equal(note.depenses.length, 2);
});

test('même date et même montant mais natures différentes : les deux dépenses sont acceptées', () => {
  const note = ajouterDepense(ajouterDepense(NOTE, REPAS), { ...REPAS, nature: 'transport' });
  assert.equal(note.depenses.length, 2);
});

test('un montant nul, négatif, décimal ou absent est refusé', () => {
  for (const montantTtcCentimes of [0, -100, 18.5, '1850', undefined]) {
    assert.throws(() => ajouterDepense(NOTE, { ...REPAS, montantTtcCentimes }), { name: 'RangeError', message: /montant TTC/ });
  }
});

test('un nombre de kilomètres nul, négatif ou décimal est refusé', () => {
  for (const kilometres of [0, -5, 12.5, undefined]) {
    assert.throws(() => ajouterDepense(NOTE, { ...IK, kilometres }), { name: 'RangeError', message: /kilomètres/ });
  }
});

test('un taux de TVA hors de 5,5, 10 et 20 est refusé ; ces trois taux sont acceptés', () => {
  assert.deepEqual(TAUX_TVA, [5.5, 10, 20]);
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, tauxTva: 7 }), { name: 'RangeError', message: /TVA/ });
  for (const tauxTva of TAUX_TVA) assert.equal(ajouterDepense(NOTE, { ...REPAS, tauxTva }).depenses[0].tauxTva, tauxTva);
});

test('une indemnité kilométrique accompagnée d\'un montant est refusée : le montant est calculé', () => {
  assert.throws(() => ajouterDepense(NOTE, { ...IK, montantTtcCentimes: 7632 }), { name: 'RangeError', message: /kilomètres/ });
});

test('critère 9 : une indemnité kilométrique datée hors de 2025-2026 est refusée', () => {
  for (const mois of ['2024-11', '2027-01']) {
    const note = creerNote({ salarie: 'S1', mois });
    assert.throws(() => ajouterDepense(note, { ...IK, date: `${mois}-10` }), { name: 'RangeError', message: /2025 et 2026/ });
    assert.equal(ajouterDepense(note, { ...REPAS, date: `${mois}-10` }).depenses.length, 1);
  }
  for (const mois of ['2025-03', '2026-03']) {
    assert.equal(ajouterDepense(creerNote({ salarie: 'S1', mois }), { ...IK, date: `${mois}-10` }).depenses.length, 1);
  }
});

test('une puissance de véhicule inférieure à 3 CV, décimale ou absente est refusée', () => {
  for (const puissance of [2, 0, 4.5, undefined]) {
    assert.throws(() => ajouterDepense(NOTE, { ...IK, puissance }), { name: 'RangeError', message: /puissance/ });
  }
});

test('un nombre de nuits d\'hôtel nul, négatif ou décimal est refusé', () => {
  const hotel = { date: '2026-11-12', nature: 'hotel', montantTtcCentimes: 18000 };
  for (const nuits of [0, -1, 1.5]) {
    assert.throws(() => ajouterDepense(NOTE, { ...hotel, nuits }), { name: 'RangeError', message: /nuits/ });
  }
});

test('un champ propre à une autre nature est refusé (nuits sur un repas, kilomètres sur un transport)', () => {
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, nuits: 2 }), { name: 'RangeError', message: /nuits/ });
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, nature: 'transport', kilometres: 10 }), { name: 'RangeError', message: /kilometres/ });
});

test('l\'indicateur « à Paris » et le justificatif invalides sont refusés', () => {
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, aParis: 'oui' }), { name: 'RangeError', message: /Paris/ });
  assert.throws(() => ajouterDepense(NOTE, { ...REPAS, justificatif: '' }), { name: 'RangeError', message: /justificatif/ });
});

test('une note ou une dépense qui n\'est pas un objet est refusée', () => {
  assert.throws(() => ajouterDepense(null, REPAS), RangeError);
  assert.throws(() => ajouterDepense({ salarie: 'S1', mois: '2026-11' }, REPAS), RangeError);
  assert.throws(() => ajouterDepense(NOTE, null), RangeError);
});

test('ajouterDepense ne modifie ni la note ni la dépense reçues', () => {
  const note = ajouterDepense(NOTE, REPAS);
  const avantNote = structuredClone(note);
  const depense = { date: '2026-11-12', nature: 'hotel', montantTtcCentimes: 18000 };
  const avantDepense = structuredClone(depense);
  const resultat = ajouterDepense(note, depense);
  assert.deepEqual(note, avantNote);
  assert.deepEqual(depense, avantDepense);
  assert.notEqual(resultat, note);
  assert.equal(resultat.depenses.length, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creerNote, ajouterDepense, remboursementsNote, totalRemboursableNote, tvaRecuperableNote, tvaRecuperableDepense, verifierTauxTva,
} from '../src/frais/index.js';

// Exemple du client : deux repas à Paris (TVA 10 %) et 120 km en 5 CV, en novembre 2026.
function noteDuClient() {
  let note = creerNote({ salarie: 'S1', mois: '2026-11' });
  note = ajouterDepense(note, { date: '2026-11-03', nature: 'repas', montantTtcCentimes: 1850, tauxTva: 10, aParis: true });
  note = ajouterDepense(note, { date: '2026-11-04', nature: 'repas', montantTtcCentimes: 3400, tauxTva: 10, aParis: true });
  note = ajouterDepense(note, { date: '2026-11-05', nature: 'indemnites-kilometriques', kilometres: 120, puissance: 5 });
  return remboursementsNote(note, { kilometrageDejaRembourse: 4000 });
}

const ligne = (nature, montantTtcCentimes, montantRemboursableCentimes, tauxTva) => ({ nature, montantTtcCentimes, montantRemboursableCentimes, tauxTva });

test('critère 1 : l\'exemple du client (repas 18,50 € et 34,00 € à Paris, 120 km en 5 CV) donne un total remboursable de 124,82 €', () => {
  const depenses = noteDuClient();
  assert.deepEqual(depenses.map((d) => d.montantRemboursableCentimes), [1850, 3000, 7632]);
  assert.equal(totalRemboursableNote(depenses), 12482);
});

test('critère 2 : le total remboursable est la somme des montants de ligne déjà arrondis, sans nouvel arrondi', () => {
  const depenses = [
    { nature: 'indemnites-kilometriques', montantRemboursableCentimes: 7632 },
    { nature: 'indemnites-kilometriques', montantRemboursableCentimes: 1 },
    ligne('transport', 999, 999),
  ];
  assert.equal(totalRemboursableNote(depenses), 7632 + 1 + 999);
  const depensesClient = noteDuClient();
  assert.equal(totalRemboursableNote(depensesClient), depensesClient.reduce((s, d) => s + d.montantRemboursableCentimes, 0));
});

test('critère 3 : une ligne non plafonnée de repas, d\'hôtel ou de transport a une TVA récupérable au taux saisi, arrondie au centime', () => {
  assert.equal(tvaRecuperableDepense(ligne('repas', 1850, 1850, 10)), 168); // 18,50 × 10 / 110 = 1,6818…
  assert.equal(tvaRecuperableDepense(ligne('transport', 10550, 10550, 5.5)), 550); // 105,50 × 5,5 / 105,5 = 5,50
  assert.equal(tvaRecuperableDepense(ligne('transport', 1000, 1000, 5.5)), 52); // 10,00 × 5,5 / 105,5 = 0,5213…
  assert.equal(tvaRecuperableDepense(ligne('hotel', 12000, 12000, 20)), 2000); // 120,00 × 20 / 120 = 20,00
  assert.equal(tvaRecuperableDepense(ligne('hotel', 1000, 1000, 20)), 167); // 10,00 × 20 / 120 = 1,6666…
  assert.equal(tvaRecuperableDepense(ligne('repas', 1850, 1850)), 0, 'une ligne sans taux n\'a pas de TVA récupérable');
});

test('critère 4 : la TVA d\'un repas plafonné est proportionnelle à la part remboursée', () => {
  // TVA du justificatif : 34,00 × 10 / 110 = 3,09 € ; part remboursée 30,00 / 34,00 → 3,09 × 30 / 34 = 2,7264… → 2,73 €.
  assert.equal(tvaRecuperableDepense(ligne('repas', 3400, 3400, 10)), 309);
  assert.equal(tvaRecuperableDepense(ligne('repas', 3400, 3000, 10)), 273);
  assert.ok(tvaRecuperableDepense(ligne('repas', 3400, 3000, 10)) < 309);
  assert.equal(tvaRecuperableDepense(noteDuClient()[1]), 273);
  // Hôtel plafonné : TVA 180,00 × 10 / 110 = 16,36 € ; × 120 / 180 = 10,9066… → 10,91 €.
  assert.equal(tvaRecuperableDepense(ligne('hotel', 18000, 12000, 10)), 1091);
});

test('critère 5 : une ligne d\'indemnités kilométriques a une TVA récupérable de 0,00 €, même avec un taux saisi', () => {
  assert.equal(tvaRecuperableDepense(noteDuClient()[2]), 0);
  assert.equal(tvaRecuperableDepense({ nature: 'indemnites-kilometriques', montantRemboursableCentimes: 7632, tauxTva: 20 }), 0);
});

test('critère 6 : une ligne de nature « autre » a une TVA récupérable de 0,00 €, quel que soit le montant', () => {
  for (const montant of [1, 1850, 100000]) {
    assert.equal(tvaRecuperableDepense(ligne('autre', montant, montant)), 0);
    assert.equal(tvaRecuperableDepense(ligne('autre', montant, montant, 20)), 0);
  }
});

test('critère 7 : un taux de TVA autre que 5,5 %, 10 % ou 20 % est refusé, et la ligne n\'entre dans aucun calcul', () => {
  const message = /5,5 %, 10 % ou 20 %/;
  for (const taux of [7, 19.6, 0]) {
    assert.throws(() => verifierTauxTva(taux), { name: 'RangeError', message });
    for (const nature of ['repas', 'hotel', 'transport']) {
      const fausse = ligne(nature, 1000, 1000, taux);
      assert.throws(() => tvaRecuperableDepense(fausse), { name: 'RangeError', message });
      assert.throws(() => totalRemboursableNote([...noteDuClient(), fausse]), { name: 'RangeError', message });
      assert.throws(() => tvaRecuperableNote([...noteDuClient(), fausse]), { name: 'RangeError', message });
      // À la saisie, la note refuse déjà la dépense.
      assert.throws(
        () => ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }), { date: '2026-11-03', nature, montantTtcCentimes: 1000, tauxTva: taux }),
        { name: 'RangeError', message: /taux de TVA/ },
      );
    }
  }
  for (const taux of [5.5, 10, 20, undefined]) assert.doesNotThrow(() => verifierTauxTva(taux));
});

test('critère 8 : la TVA récupérable de la note est la somme des TVA de ligne, sans les indemnités kilométriques', () => {
  const depenses = noteDuClient();
  assert.equal(tvaRecuperableNote(depenses), 168 + 273);
  assert.equal(tvaRecuperableNote(depenses), 441);
  assert.equal(tvaRecuperableNote(depenses.slice(0, 2)), 441);
});

test('une note vide a un total remboursable et une TVA récupérable de 0,00 €', () => {
  assert.equal(totalRemboursableNote([]), 0);
  assert.equal(tvaRecuperableNote([]), 0);
});

test('les erreurs d\'appel lèvent une RangeError en français', () => {
  for (const pasUnTableau of [undefined, null, {}, 'repas']) {
    assert.throws(() => totalRemboursableNote(pasUnTableau), { name: 'RangeError', message: /tableau/ });
    assert.throws(() => tvaRecuperableNote(pasUnTableau), { name: 'RangeError', message: /tableau/ });
  }
  assert.throws(() => tvaRecuperableDepense(null), { name: 'RangeError', message: /objet/ });
  assert.throws(() => tvaRecuperableDepense(ligne('cadeau', 1000, 1000)), { name: 'RangeError', message: /cadeau/ });
  assert.throws(() => tvaRecuperableDepense(ligne('repas', 1000, -1, 10)), { name: 'RangeError', message: /remboursable/ });
  assert.throws(() => tvaRecuperableDepense(ligne('repas', 1000, 10.5, 10)), { name: 'RangeError', message: /remboursable/ });
  assert.throws(() => tvaRecuperableDepense(ligne('repas', 1000, undefined, 10)), { name: 'RangeError', message: /remboursable/ });
  assert.throws(() => tvaRecuperableDepense(ligne('repas', 0, 0, 10)), { name: 'RangeError', message: /TTC/ });
  assert.throws(() => tvaRecuperableDepense(ligne('repas', 1000, 1001, 10)), { name: 'RangeError', message: /dépasser/ });
  assert.throws(() => totalRemboursableNote([ligne('repas', 1000, 1001, 10)]), { name: 'RangeError', message: /dépasser/ });
});

test('les calculs ne modifient pas les dépenses reçues', () => {
  const depenses = noteDuClient();
  const copie = structuredClone(depenses);
  totalRemboursableNote(depenses);
  tvaRecuperableNote(depenses);
  depenses.forEach(tvaRecuperableDepense);
  assert.deepEqual(depenses, copie);
});

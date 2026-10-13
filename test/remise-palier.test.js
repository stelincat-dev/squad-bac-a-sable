import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALIERS_REMISE, pourcentageRemisePalier, montantRemiseParPalier } from '../src/facture.js';

// [montant HT en centimes, pourcentage attendu, montant remisé attendu en centimes]
const CAS = [
  ['critère 1 : 999,99 €', 99999, 0, 99999],
  ['critère 2 : 1 000,00 €', 100000, 5, 95000],
  ['critère 3 : 4 999,99 €', 499999, 5, 474999],
  ['critère 4 : 5 000,00 €', 500000, 10, 450000],
  ['critère 5 : 7 500,00 €', 750000, 10, 675000],
  ['critère 6 : 9 999,99 €', 999999, 10, 899999],
  ['critère 7 : 10 000,00 €', 1000000, 15, 850000],
  ['critère 8 : 12 000,00 €', 1200000, 15, 1020000],
  ['montant nul : 0 €', 0, 0, 0],
];

for (const [nom, montant, pourcentage, remise] of CAS) {
  test(`${nom} : remise de ${pourcentage} %`, () => {
    assert.equal(pourcentageRemisePalier(montant), pourcentage);
  });
  test(`${nom} : montant remisé de ${remise} centimes`, () => {
    assert.equal(montantRemiseParPalier(montant), remise);
  });
}

test('le seuil est inclus dans son palier et le centime juste en dessous reste dans le palier inférieur', () => {
  assert.equal(pourcentageRemisePalier(99999), 0);
  assert.equal(pourcentageRemisePalier(100000), 5);
  assert.equal(pourcentageRemisePalier(499999), 5);
  assert.equal(pourcentageRemisePalier(500000), 10);
  assert.equal(pourcentageRemisePalier(999999), 10);
  assert.equal(pourcentageRemisePalier(1000000), 15);
});

test('la remise s\'applique au montant entier et le résultat est arrondi une seule fois au centime', () => {
  assert.equal(montantRemiseParPalier(499999), Math.round(499999 * 95 / 100));
  assert.equal(montantRemiseParPalier(999999), Math.round(999999 * 90 / 100));
});

for (const [nom, fonction] of [['pourcentageRemisePalier', pourcentageRemisePalier], ['montantRemiseParPalier', montantRemiseParPalier]]) {
  test(`${nom} refuse un montant négatif avec un message explicite (critère 9)`, () => {
    for (const montant of [-1, -100000]) {
      assert.throws(() => fonction(montant), (erreur) => {
        assert.ok(erreur instanceof RangeError);
        assert.match(erreur.message, /montant HT ne peut pas être négatif/);
        return true;
      });
    }
  });

  test(`${nom} refuse un montant non entier ou non numérique avec un message explicite`, () => {
    for (const montant of [NaN, Infinity, -Infinity, 100.5, '100000', null, undefined]) {
      assert.throws(() => fonction(montant), (erreur) => {
        assert.ok(erreur instanceof RangeError);
        assert.match(erreur.message, /nombre entier de centimes/);
        return true;
      });
    }
  });
}

test('les paliers sont définis à un seul endroit : une autre table change le résultat des deux fonctions (critère 10)', () => {
  const autres = [
    { seuilCentimes: 0, pourcentage: 0 },
    { seuilCentimes: 1000, pourcentage: 50 },
  ];
  assert.equal(pourcentageRemisePalier(2000), 0);
  assert.equal(pourcentageRemisePalier(2000, autres), 50);
  assert.equal(montantRemiseParPalier(2000), 2000);
  assert.equal(montantRemiseParPalier(2000, autres), 1000);
});

test('la table des paliers par défaut est figée', () => {
  assert.ok(Object.isFrozen(PALIERS_REMISE));
  assert.ok(PALIERS_REMISE.every((palier) => Object.isFrozen(palier)));
  assert.throws(() => PALIERS_REMISE.push({ seuilCentimes: 1, pourcentage: 99 }), TypeError);
  assert.throws(() => { PALIERS_REMISE[1].pourcentage = 99; }, TypeError);
  assert.equal(pourcentageRemisePalier(100000), 5);
});

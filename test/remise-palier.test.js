import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerRemise, PALIERS_REMISE, pourcentageRemisePalier, montantRemiseParPalier } from '../src/facture.js';

// [libellé, montant HT en centimes, pourcentage attendu, montant remisé attendu en centimes]
const CAS = [
  ['critère 1 : 999,99 € HT', 99999, 0, 99999],
  ['critère 2 : 1 000,00 € HT (seuil inclus)', 100000, 5, 95000],
  ['critère 3 : 4 999,99 € HT', 499999, 5, 474999],
  ['critère 4 : 5 000,00 € HT (seuil inclus)', 500000, 10, 450000],
  ['critère 5 : 7 500,00 € HT', 750000, 10, 675000],
  ['critère 6 : 9 999,99 € HT', 999999, 10, 899999],
  ['critère 7 : 10 000,00 € HT (seuil inclus)', 1000000, 15, 850000],
  ['critère 8 : 12 000,00 € HT', 1200000, 15, 1020000],
  ['montant nul : 0 € HT, sans remise', 0, 0, 0],
];

for (const [nom, montant, pourcentage, remise] of CAS) {
  test(`${nom} : le pourcentage de remise est ${pourcentage} %`, () => {
    assert.equal(pourcentageRemisePalier(montant), pourcentage);
  });
  test(`${nom} : le montant remisé est ${remise} centimes`, () => {
    assert.equal(montantRemiseParPalier(montant), remise);
  });
}

for (const [nom, fonction] of [['pourcentageRemisePalier', pourcentageRemisePalier], ['montantRemiseParPalier', montantRemiseParPalier]]) {
  test(`critère 9 : ${nom} refuse un montant négatif avec un message clair`, () => {
    for (const montant of [-1, -100000]) {
      assert.throws(() => fonction(montant), (erreur) => {
        assert.ok(erreur instanceof RangeError);
        assert.match(erreur.message, /montant HT ne peut pas être négatif/);
        return true;
      });
    }
  });

  test(`${nom} refuse un montant qui n'est pas un entier de centimes`, () => {
    for (const montant of [NaN, Infinity, -Infinity, 100.5, '100000', null, undefined]) {
      assert.throws(() => fonction(montant), (erreur) => {
        assert.ok(erreur instanceof RangeError);
        assert.match(erreur.message, /nombre entier de centimes/);
        return true;
      });
    }
  });
}

test('critère 10 : une autre définition des paliers change le résultat des deux fonctions', () => {
  const autres = [
    { seuilCentimes: 0, pourcentage: 0 },
    { seuilCentimes: 1000, pourcentage: 50 },
  ];
  assert.equal(pourcentageRemisePalier(2000), 0);
  assert.equal(pourcentageRemisePalier(2000, autres), 50);
  assert.equal(montantRemiseParPalier(2000), 2000);
  assert.equal(montantRemiseParPalier(2000, autres), 1000);
});

test('critère 10 : les paliers par défaut sont figés et sont ceux du besoin', () => {
  assert.ok(Object.isFrozen(PALIERS_REMISE));
  assert.ok(PALIERS_REMISE.every((palier) => Object.isFrozen(palier)));
  assert.deepEqual(
    PALIERS_REMISE.map((p) => [p.seuilCentimes, p.pourcentage]),
    [[0, 0], [100000, 5], [500000, 10], [1000000, 15]],
  );
});

test('critère 11 : le résultat tombe sur un demi-centime, arrondi une seule fois comme la remise existante', () => {
  // [montant HT, pourcentage du palier, montant remisé exact en centimes, montant remisé arrondi attendu]
  const demiCentimes = [
    [100010, 5, 95009.5, 95010],
    [500005, 10, 450004.5, 450005],
    [1000010, 15, 850008.5, 850009],
  ];
  for (const [montant, pourcentage, exact, attendu] of demiCentimes) {
    assert.equal(montant * (100 - pourcentage) / 100, exact);
    assert.equal(pourcentageRemisePalier(montant), pourcentage);
    assert.equal(montantRemiseParPalier(montant), attendu);
    assert.equal(montantRemiseParPalier(montant), appliquerRemise(montant, pourcentage));
  }
});

test('critère 11 : près d\'un demi-centime, même résultat que la remise existante', () => {
  const montants = [100001, 100002, 100009, 100011, 499999, 500001, 500004, 500006, 999999, 1000009, 1000011, 1234567];
  for (const montant of montants) {
    const pourcentage = pourcentageRemisePalier(montant);
    assert.equal(montantRemiseParPalier(montant), appliquerRemise(montant, pourcentage));
  }
});

test('critère 12 : les fonctions existantes gardent leur comportement', () => {
  assert.equal(appliquerRemise(1000, 10), 900);
  assert.throws(() => appliquerRemise(1000, 120), RangeError);
});

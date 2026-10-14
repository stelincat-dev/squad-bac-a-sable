import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALIERS_REMISE, pourcentageRemisePalier, montantRemiseParPalier } from '../src/facture.js';

// Critères 1 à 8 et 13 : chaque palier et les six bornes, valeurs attendues écrites en dur.
const CAS = [
  { critere: 1, montant: 99999, pourcentage: 0, remise: 99999 },
  { critere: 2, montant: 100000, pourcentage: 5, remise: 95000 },
  { critere: 3, montant: 499999, pourcentage: 5, remise: 474999 },
  { critere: 4, montant: 500000, pourcentage: 10, remise: 450000 },
  { critere: 5, montant: 750000, pourcentage: 10, remise: 675000 },
  { critere: 6, montant: 999999, pourcentage: 10, remise: 899999 },
  { critere: 7, montant: 1000000, pourcentage: 15, remise: 850000 },
  { critere: 8, montant: 1200000, pourcentage: 15, remise: 1020000 },
];

for (const { critere, montant, pourcentage, remise } of CAS) {
  test(`critère ${critere} : ${montant} centimes HT donnent ${pourcentage} % de remise`, () => {
    assert.equal(pourcentageRemisePalier(montant), pourcentage);
  });
  test(`critère ${critere} : ${montant} centimes HT remisés donnent ${remise} centimes`, () => {
    assert.equal(montantRemiseParPalier(montant), remise);
  });
}

test('critère 11 : la remise s\'applique au montant entier et non par tranche', () => {
  assert.equal(montantRemiseParPalier(1200000), 1020000);
  assert.equal(pourcentageRemisePalier(1200000), 15);
});

test('un montant de 0 centime est accepté : 0 % et 0 centime', () => {
  assert.equal(pourcentageRemisePalier(0), 0);
  assert.equal(montantRemiseParPalier(0), 0);
});

test('l\'arrondi au centime se fait une seule fois, un demi-centime exact est arrondi au-dessus', () => {
  assert.equal(montantRemiseParPalier(100010), 95010); // 95 009,5
  assert.equal(montantRemiseParPalier(500005), 450005); // 450 004,5
});

for (const [nom, valeur] of [['−1 centime', -1], ['−100 000 centimes', -100000]]) {
  test(`critère 9 : le montant négatif ${nom} est refusé par pourcentageRemisePalier`, () => {
    let resultat;
    assert.throws(() => { resultat = pourcentageRemisePalier(valeur); }, { name: 'RangeError', message: /positif ou nul/ });
    assert.equal(resultat, undefined);
  });
  test(`critère 9 : le montant négatif ${nom} est refusé par montantRemiseParPalier`, () => {
    let resultat;
    assert.throws(() => { resultat = montantRemiseParPalier(valeur); }, { name: 'RangeError', message: /positif ou nul/ });
    assert.equal(resultat, undefined);
  });
}

for (const [nom, valeur] of [['décimal', 1.5], ['NaN', NaN], ['Infinity', Infinity], ['chaîne', '100000'], ['null', null], ['undefined', undefined]]) {
  test(`un montant invalide (${nom}) est refusé par les deux fonctions`, () => {
    assert.throws(() => pourcentageRemisePalier(valeur), { name: 'RangeError', message: /nombre entier de centimes/ });
    assert.throws(() => montantRemiseParPalier(valeur), { name: 'RangeError', message: /nombre entier de centimes/ });
  });
}

test('critère 10 : une autre table de paliers change le résultat des deux fonctions', () => {
  const autres = [
    { seuilCentimes: 0, pourcentage: 0 },
    { seuilCentimes: 200000, pourcentage: 7 },
  ];
  assert.equal(pourcentageRemisePalier(150000, autres), 0);
  assert.equal(pourcentageRemisePalier(200000, autres), 7);
  assert.equal(montantRemiseParPalier(200000, autres), 186000);
  assert.equal(pourcentageRemisePalier(1000000, autres), 7);
});

test('critère 10 : la table des paliers est unique, figée et triée par seuil croissant', () => {
  assert.ok(Object.isFrozen(PALIERS_REMISE));
  assert.ok(PALIERS_REMISE.every((p) => Object.isFrozen(p)));
  const seuils = PALIERS_REMISE.map((p) => p.seuilCentimes);
  assert.deepEqual(seuils, [...seuils].sort((a, b) => a - b));
  assert.deepEqual(seuils, [0, 100000, 500000, 1000000]);
});

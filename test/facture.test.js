import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalHt, appliquerRemise, totalTtc } from '../src/facture.js';

test('le total hors taxes additionne les lignes', () => {
  assert.equal(totalHt([{ quantite: 2, prixUnitaireCentimes: 1250 }, { quantite: 1, prixUnitaireCentimes: 499 }]), 2999);
});

test('une remise hors bornes est refusée', () => {
  assert.throws(() => appliquerRemise(1000, 120), RangeError);
});

test('la TVA par défaut est de 20 %', () => {
  assert.equal(totalTtc(1000), 1200);
});

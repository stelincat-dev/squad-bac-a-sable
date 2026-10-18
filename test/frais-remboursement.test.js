import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { arrondirCentime, montantRemboursable, remboursementsNote, creerNote, ajouterDepense, PLAFONDS } from '../src/frais/index.js';

const repas = (montantTtcCentimes, aParis) => ({ date: '2026-11-10', nature: 'repas', montantTtcCentimes, aParis });
const hotel = (montantTtcCentimes, aParis, nuits) => ({ date: '2026-11-10', nature: 'hotel', montantTtcCentimes, aParis, nuits });

test('critère 10 : un repas de 34,00 € à Paris est remboursé 30,00 €, et la note reste valable', () => {
  assert.equal(montantRemboursable(repas(3400, true)), 3000);
  const note = ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }), repas(3400, true));
  assert.deepEqual(remboursementsNote(note), [{ ...repas(3400, true), montantRemboursableCentimes: 3000 }]);
});

test('critère 11 : un repas de 18,50 € hors Paris est remboursé 18,50 €', () => {
  assert.equal(montantRemboursable(repas(1850, false)), 1850);
  assert.equal(montantRemboursable({ nature: 'repas', montantTtcCentimes: 1850 }), 1850);
});

test('critère 12 : un repas pile au plafond est remboursé en entier (25,00 € hors Paris, 30,00 € à Paris)', () => {
  assert.equal(montantRemboursable(repas(2500, false)), 2500);
  assert.equal(montantRemboursable(repas(3000, true)), 3000);
  assert.equal(montantRemboursable(repas(2501, false)), 2500);
  assert.equal(montantRemboursable(repas(3001, true)), 3000);
});

test('critère 13 : une nuit d\'hôtel de 180,00 € est remboursée 120,00 € hors Paris et 150,00 € à Paris', () => {
  assert.equal(montantRemboursable(hotel(18000, false)), 12000);
  assert.equal(montantRemboursable(hotel(18000, true)), 15000);
  assert.equal(montantRemboursable(hotel(11000, false)), 11000);
});

test('critère 13 : le plafond de l\'hôtel s\'applique par nuit', () => {
  assert.equal(montantRemboursable(hotel(30000, false, 2)), 24000);
  assert.equal(montantRemboursable(hotel(30000, true, 2)), 30000);
  assert.throws(() => montantRemboursable(hotel(30000, false, 0)), { name: 'RangeError', message: /nuits/ });
});

test('critère 14 : le transport et la nature « autre » sont remboursés pour tout leur montant TTC, sans plafond', () => {
  for (const nature of ['transport', 'autre']) {
    assert.equal(montantRemboursable({ date: '2026-11-10', nature, montantTtcCentimes: 99999 }), 99999);
    assert.equal(montantRemboursable({ date: '2026-11-10', nature, montantTtcCentimes: 99999, aParis: true }), 99999);
  }
});

test('critère 15 : arrondi commercial au centime, 0,005 € devient 0,01 € et 0,004 € devient 0,00 €', () => {
  assert.equal(arrondirCentime(5), 1);
  assert.equal(arrondirCentime(4), 0);
  assert.equal(arrondirCentime(2645), 265);
  assert.equal(arrondirCentime(3116400), 311640);
  for (const valeur of [-5, 1.5, '5']) assert.throws(() => arrondirCentime(valeur), RangeError);
});

test('les plafonds sont ceux du client, en centimes', () => {
  assert.deepEqual(PLAFONDS, { repas: { horsParis: 2500, paris: 3000 }, hotel: { horsParis: 12000, paris: 15000 } });
});

test('montantRemboursable refuse une indemnité kilométrique, une nature inconnue et un montant invalide', () => {
  assert.throws(() => montantRemboursable({ nature: 'indemnites-kilometriques', kilometres: 10 }), { name: 'RangeError', message: /remboursementsNote/ });
  assert.throws(() => montantRemboursable({ nature: 'taxi', montantTtcCentimes: 100 }), { name: 'RangeError', message: /« taxi »/ });
  assert.throws(() => montantRemboursable(repas(0, false)), RangeError);
  assert.throws(() => remboursementsNote(null), RangeError);
});

test('exemple du client : repas de 18,50 € et de 34,00 € à Paris et 120 km en 5 CV donnent 18,50 €, 30,00 € et 76,32 €', () => {
  let note = creerNote({ salarie: 'S1', mois: '2026-11' });
  note = ajouterDepense(note, { ...repas(1850, true), tauxTva: 10 });
  note = ajouterDepense(note, { ...repas(3400, true), tauxTva: 10 });
  note = ajouterDepense(note, { date: '2026-11-10', nature: 'indemnites-kilometriques', kilometres: 120, puissance: 5 });
  const avant = structuredClone(note);
  const resultat = remboursementsNote(note, { kilometrageDejaRembourse: 4000 });
  assert.deepEqual(resultat.map((r) => r.montantRemboursableCentimes), [1850, 3000, 7632]);
  assert.deepEqual(note, avant);
});

test('les résultats ne dépendent pas de la date du système', () => {
  const calculer = () => {
    const note = ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }),
      { date: '2026-11-10', nature: 'indemnites-kilometriques', kilometres: 200, puissance: 5 });
    return remboursementsNote(note, { kilometrageDejaRembourse: 4900 });
  };
  const reference = calculer();
  for (const maintenant of [0, Date.UTC(2099, 11, 31, 23, 59)]) {
    mock.timers.enable({ apis: ['Date'], now: maintenant });
    try {
      assert.deepEqual(calculer(), reference);
    } finally {
      mock.timers.reset();
    }
  }
});

test('le module de frais ne lit pas l\'horloge, n\'écrit rien et ne garde aucun état', () => {
  const dossier = new URL('../src/frais/', import.meta.url);
  for (const fichier of readdirSync(dossier)) {
    const source = readFileSync(new URL(fichier, dossier), 'utf8');
    assert.doesNotMatch(source, /Date\.now|new Date\(\)|performance\.now/, fichier);
    assert.doesNotMatch(source, /\brequire\(|console\.|from 'node:/, fichier);
    assert.doesNotMatch(source, /^(let|var)\s/m, fichier);
  }
});

test('le README décrit le contrat du module de frais', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const attendu of ['src/frais/', 'creerNote({ salarie, mois })', 'ajouterDepense(note, depense)',
    'remboursementsNote(note, { kilometrageDejaRembourse })', 'montantTtcCentimes', '`indemnites-kilometriques`', 'RangeError']) {
    assert.ok(readme.includes(attendu), `le README doit mentionner ${attendu}`);
  }
});

test('critère 16 : aucune dépendance externe dans le package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

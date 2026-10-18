import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  creerNote, ajouterDepense, montantRemboursable, remboursementsNote, bareme, indemniteKilometrique,
  totalRemboursableNote, tvaRecuperableDepense, MONTANT_MAX_CENTIMES, KILOMETRES_MAX_TRAJET, KILOMETRAGE_ANNUEL_MAX, NUITS_MAX,
} from '../src/frais/index.js';
import { verifierMontant, verifierKilometres } from '../src/frais/validation.js';

// Notes construites à la main, comme une note relue en base ou reçue d'une API.
const noteMain = (...depenses) => ({ salarie: 'S1', mois: '2026-11', depenses });
const REPAS = { date: '2026-11-10', nature: 'repas', montantTtcCentimes: 2800 };
const IK = { date: '2026-11-10', nature: 'indemnites-kilometriques', kilometres: 120, puissance: 5 };
const DEUX_PUISSANCE_53 = 2 ** 53;

function messageDe(appel) {
  try {
    appel();
  } catch (erreur) {
    return erreur;
  }
  assert.fail('une RangeError était attendue');
}

function figerEnProfondeur(objet) {
  for (const valeur of Object.values(objet)) if (valeur !== null && typeof valeur === 'object') figerEnProfondeur(valeur);
  return Object.freeze(objet);
}

// R1 : revérification des dépenses au moment du calcul

test('critère 1 : remboursementsNote refuse un repas de 28,00 € avec aParis "false" (chaîne) au lieu de rendre 30,00 €', () => {
  const note = noteMain({ ...REPAS, aParis: 'false' });
  const erreur = messageDe(() => remboursementsNote(note));
  assert.equal(erreur.name, 'RangeError');
  assert.match(erreur.message, /Paris.*vrai ou faux/);
});

test('critère 2 : montantRemboursable refuse aParis "false", "non", 1 et null', () => {
  for (const aParis of ['false', 'non', 1, null]) {
    assert.throws(() => montantRemboursable({ ...REPAS, aParis }), { name: 'RangeError', message: /« à Paris » doit être vrai ou faux/ }, String(aParis));
  }
});

test('critère 3 : avec aParis booléen, le repas de 28,00 € donne 25,00 € hors Paris et 28,00 € à Paris ; sans aParis, il reste hors Paris', () => {
  assert.equal(montantRemboursable({ ...REPAS, aParis: false }), 2500);
  assert.equal(montantRemboursable({ ...REPAS, aParis: true }), 2800);
  assert.equal(montantRemboursable(REPAS), 2500);
  assert.equal(remboursementsNote(noteMain({ ...REPAS, aParis: false }))[0].montantRemboursableCentimes, 2500);
  assert.equal(remboursementsNote(noteMain({ ...REPAS, aParis: true }))[0].montantRemboursableCentimes, 2800);
  assert.equal(remboursementsNote(noteMain(REPAS))[0].montantRemboursableCentimes, 2500);
});

test('critère 4 : remboursementsNote refuse une dépense hors du mois de la note et accepte le 1er et le 30 du mois', () => {
  for (const date of ['2026-12-01', '2026-10-31']) {
    assert.throws(() => remboursementsNote(noteMain({ ...REPAS, date })), { name: 'RangeError', message: /hors du mois de la note/ }, date);
  }
  const lignes = remboursementsNote(noteMain({ ...REPAS, date: '2026-11-01' }, { ...REPAS, date: '2026-11-30' }));
  assert.deepEqual(lignes.map((l) => l.montantRemboursableCentimes), [2500, 2500]);
});

test('critère 5 : remboursementsNote refuse un taux de TVA de 7 % et accepte une dépense sans taux ou à 5,5, 10 et 20 %', () => {
  assert.throws(() => remboursementsNote(noteMain({ ...REPAS, tauxTva: 7 })), { name: 'RangeError', message: /taux de TVA/ });
  const depenses = [undefined, 5.5, 10, 20].map((tauxTva, i) => ({ ...REPAS, montantTtcCentimes: 1000 + i, tauxTva }));
  assert.equal(remboursementsNote(noteMain(...depenses)).length, 4);
});

test('critère 6 : remboursementsNote refuse deux dépenses identiques et deux indemnités du même jour avec les mêmes kilomètres', () => {
  assert.throws(() => remboursementsNote(noteMain(REPAS, { ...REPAS })), { name: 'RangeError', message: /Doublon refusé/ });
  assert.throws(() => remboursementsNote(noteMain(IK, { ...IK, puissance: 7 }), { kilometrageDejaRembourse: 0 }),
    { name: 'RangeError', message: /Doublon refusé.*120 km/ });
  assert.equal(remboursementsNote(noteMain(IK, { ...IK, kilometres: 121 }), { kilometrageDejaRembourse: 0 }).length, 2);
});

test('critère 7 : remboursementsNote refuse, avec le message de ajouterDepense, nature inconnue, montant invalide, montant sur une indemnité et champ d\'une autre nature', () => {
  const cas = [
    { ...REPAS, nature: 'taxi' },
    { ...REPAS, montantTtcCentimes: 0 },
    { ...REPAS, montantTtcCentimes: -100 },
    { ...REPAS, montantTtcCentimes: 18.5 },
    { ...IK, montantTtcCentimes: 1000 },
    { ...REPAS, nuits: 2 },
    { ...REPAS, nature: 'transport', kilometres: 10 },
  ];
  for (const depense of cas) {
    const attendu = messageDe(() => ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }), depense));
    assert.equal(attendu.name, 'RangeError');
    assert.throws(() => remboursementsNote(noteMain(depense), { kilometrageDejaRembourse: 0 }), { name: 'RangeError', message: attendu.message });
  }
});

test('critère 8 : non-régression, l\'exemple du client donne [18,50 €, 30,00 €, 76,32 €] et 124,82 €, et le passage de tranche 99,30 €', () => {
  let note = creerNote({ salarie: 'S1', mois: '2026-11' });
  note = ajouterDepense(note, { date: '2026-11-03', nature: 'repas', montantTtcCentimes: 1850, tauxTva: 10, aParis: true });
  note = ajouterDepense(note, { date: '2026-11-04', nature: 'repas', montantTtcCentimes: 3400, tauxTva: 10, aParis: true });
  note = ajouterDepense(note, { date: '2026-11-05', nature: 'indemnites-kilometriques', kilometres: 120, puissance: 5 });
  const lignes = remboursementsNote(note, { kilometrageDejaRembourse: 4000 });
  assert.deepEqual(lignes.map((l) => l.montantRemboursableCentimes), [1850, 3000, 7632]);
  assert.equal(totalRemboursableNote(lignes), 12482);
  assert.deepEqual(remboursementsNote(structuredClone(note), { kilometrageDejaRembourse: 4000 }), lignes);

  const tranche = ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }), { ...IK, kilometres: 200 });
  assert.equal(remboursementsNote(tranche, { kilometrageDejaRembourse: 4900 })[0].montantRemboursableCentimes, 9930);
});

test('remboursementsNote et montantRemboursable ne modifient pas une note figée en profondeur', () => {
  const note = figerEnProfondeur(noteMain({ ...REPAS, aParis: true }, { ...IK }, { date: '2026-11-11', nature: 'hotel', montantTtcCentimes: 30000, nuits: 2 }));
  const avant = structuredClone(note);
  assert.deepEqual(remboursementsNote(note, { kilometrageDejaRembourse: 4000 }).map((l) => l.montantRemboursableCentimes), [2800, 7632, 24000]);
  assert.equal(montantRemboursable(note.depenses[0]), 2800);
  assert.deepEqual(note, avant);
});

// R2 : bornes des entiers, chacune avec la borne acceptée et la borne + 1 refusée (critère 14)

test('les bornes sont celles du client : 10 000,00 €, 2 000 km par trajet, 100 000 km par an et 31 nuits', () => {
  assert.equal(MONTANT_MAX_CENTIMES, 1000000);
  assert.equal(KILOMETRES_MAX_TRAJET, 2000);
  assert.equal(KILOMETRAGE_ANNUEL_MAX, 100000);
  assert.equal(NUITS_MAX, 31);
});

test('critères 9 et 14 : verifierMontant refuse 1e20, 2^53 et 1 000 001 centimes, et accepte 1 000 000 centimes', () => {
  for (const montant of [1e20, DEUX_PUISSANCE_53, 1000001]) {
    assert.throws(() => verifierMontant(montant), { name: 'RangeError', message: /montant TTC/ }, String(montant));
  }
  assert.throws(() => verifierMontant(1000001), { name: 'RangeError', message: /10 000,00 €/ });
  assert.doesNotThrow(() => verifierMontant(1000000));
});

test('critères 9 et 14 : ajouterDepense, montantRemboursable et remboursementsNote appliquent la borne de montant', () => {
  const transport = (montantTtcCentimes) => ({ date: '2026-11-10', nature: 'transport', montantTtcCentimes });
  for (const montant of [1e20, DEUX_PUISSANCE_53, 1000001]) {
    assert.throws(() => ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }), transport(montant)), RangeError);
    assert.throws(() => montantRemboursable(transport(montant)), RangeError);
    assert.throws(() => remboursementsNote(noteMain(transport(montant))), { name: 'RangeError', message: /montant TTC/ });
  }
  assert.equal(remboursementsNote(noteMain(transport(1000000)))[0].montantRemboursableCentimes, 1000000);
});

test('critères 10 et 14 : verifierKilometres refuse 1e20, 2^53 et 2 001 km, et accepte 2 000 km', () => {
  for (const km of [1e20, DEUX_PUISSANCE_53, 2001]) {
    assert.throws(() => verifierKilometres(km), { name: 'RangeError', message: /kilomètres/ }, String(km));
  }
  assert.throws(() => verifierKilometres(2001), { name: 'RangeError', message: /2 000 km/ });
  assert.doesNotThrow(() => verifierKilometres(2000));
  assert.throws(() => remboursementsNote(noteMain({ ...IK, kilometres: 2001 }), { kilometrageDejaRembourse: 0 }), RangeError);
  assert.equal(remboursementsNote(noteMain({ ...IK, kilometres: 2000 }), { kilometrageDejaRembourse: 0 }).length, 1);
});

test('critères 11 et 14 : bareme refuse 1e20 et plus de 100 000 km, et accepte 100 000 km', () => {
  for (const d of [1e20, DEUX_PUISSANCE_53, 100001]) {
    assert.throws(() => bareme(2026, 5, d), { name: 'RangeError', message: /kilométrage de l'année/ }, String(d));
  }
  assert.throws(() => bareme(2026, 5, 100001), { name: 'RangeError', message: /100 000 km/ });
  assert.equal(bareme(2026, 5, 100000), 100000 * 427);
});

test('critères 11 et 14 : indemniteKilometrique refuse un cumul de 1e20 ou au-delà de 100 000 km, au lieu de rendre un résultat faux', () => {
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 99990, kilometres: 10 }), 427);
  assert.throws(() => indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 99990, kilometres: 11 }), { name: 'RangeError', message: /100 000 km/ });
  for (const cumulAvant of [1e20, DEUX_PUISSANCE_53, 100001]) {
    assert.throws(() => indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant, kilometres: 10 }), { name: 'RangeError', message: /déjà remboursé/ }, String(cumulAvant));
  }
  assert.throws(() => indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 0, kilometres: 1e20 }), RangeError);
});

test('critères 12 et 14 : remboursementsNote refuse un kilométrage déjà remboursé de 1e20, 2^53 ou 100 001 km, et un cumul au-delà de 100 000 km', () => {
  const note = noteMain(IK);
  for (const kilometrageDejaRembourse of [1e20, DEUX_PUISSANCE_53, 100001]) {
    assert.throws(() => remboursementsNote(note, { kilometrageDejaRembourse }), { name: 'RangeError', message: /déjà remboursé/ }, String(kilometrageDejaRembourse));
  }
  assert.throws(() => remboursementsNote(note, { kilometrageDejaRembourse: 100001 }), { name: 'RangeError', message: /déjà remboursé.*100 000 km/ });
  // Borne acceptée : 99 880 km déjà remboursés + 120 km font un cumul de 100 000 km pile.
  assert.equal(remboursementsNote(note, { kilometrageDejaRembourse: 99880 })[0].montantRemboursableCentimes, 120 * 427 / 10);
  assert.throws(() => remboursementsNote(note, { kilometrageDejaRembourse: 99881 }), { name: 'RangeError', message: /100 000 km/ });
});

test('critères 12 et 14 : remboursementsNote refuse un hôtel de 1e20 ou 32 nuits, et accepte 31 nuits', () => {
  const hotel = (nuits) => ({ date: '2026-11-10', nature: 'hotel', montantTtcCentimes: 400000, nuits });
  for (const nuits of [1e20, DEUX_PUISSANCE_53, 32]) {
    assert.throws(() => remboursementsNote(noteMain(hotel(nuits))), { name: 'RangeError', message: /nuits/ }, String(nuits));
  }
  assert.throws(() => remboursementsNote(noteMain(hotel(32))), { name: 'RangeError', message: /limité à 31/ });
  assert.equal(remboursementsNote(noteMain(hotel(31)))[0].montantRemboursableCentimes, 31 * 12000);
});

test('revue : un hôtel construit à la main avec nuits null compte une nuit, comme dans ajouterDepense, et ne vaut jamais 0', () => {
  const hotel = { date: '2026-11-10', nature: 'hotel', montantTtcCentimes: 40000, nuits: null };
  const hotelParis = { ...hotel, date: '2026-11-11', aParis: true };
  assert.equal(montantRemboursable(hotel), 12000);
  assert.equal(montantRemboursable(hotelParis), 15000);
  const lignes = remboursementsNote(noteMain(hotel, hotelParis));
  assert.deepEqual(lignes.map((l) => l.montantRemboursableCentimes), [12000, 15000]);
  assert.equal(lignes[0].nuits, null, 'la ligne rendue garde la dépense reçue');
  assert.equal(ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }), hotel).depenses[0].nuits, 1);
});

// Arrondi demi supérieur de a ÷ b en BigInt (a ≥ 0, b > 0), la règle de Math.round sur des positifs.
const arrondiBigInt = (a, b) => (2n * a + b) / (2n * b);

test('critère 13 : la TVA d\'une dépense de 10 000,00 € à 20 %, plafonnée ou non, est exacte et aucun calcul ne dépasse MAX_SAFE_INTEGER', () => {
  const hotel = { date: '2026-11-10', nature: 'hotel', montantTtcCentimes: MONTANT_MAX_CENTIMES, nuits: 31, aParis: true, tauxTva: 20 };
  const transport = { date: '2026-11-11', nature: 'transport', montantTtcCentimes: MONTANT_MAX_CENTIMES, tauxTva: 20 };
  const [ligneHotel, ligneTransport] = remboursementsNote(noteMain(hotel, transport));
  assert.equal(ligneHotel.montantRemboursableCentimes, 465000);
  assert.equal(ligneTransport.montantRemboursableCentimes, 1000000);

  const tvaJustificatif = arrondiBigInt(BigInt(MONTANT_MAX_CENTIMES) * 200n, 1200n);
  assert.equal(tvaRecuperableDepense(ligneTransport), Number(tvaJustificatif));
  assert.equal(tvaRecuperableDepense(ligneHotel), Number(arrondiBigInt(tvaJustificatif * 465000n, BigInt(MONTANT_MAX_CENTIMES))));
  assert.equal(tvaRecuperableDepense(ligneHotel), 77500);

  assert.ok(MONTANT_MAX_CENTIMES * 200 <= Number.MAX_SAFE_INTEGER);
  assert.ok(tvaJustificatif * BigInt(MONTANT_MAX_CENTIMES) <= BigInt(Number.MAX_SAFE_INTEGER));
});

// Commun

test('critère 15 : chaque refus de borne est une RangeError au message en français', () => {
  const refus = [
    () => verifierMontant(1000001),
    () => verifierKilometres(2001),
    () => bareme(2026, 5, 100001),
    () => remboursementsNote(noteMain({ ...REPAS, nature: 'hotel', nuits: 32 })),
    () => remboursementsNote(noteMain(IK), { kilometrageDejaRembourse: 100001 }),
    () => montantRemboursable({ ...REPAS, aParis: 'false' }),
  ];
  for (const appel of refus) {
    const erreur = messageDe(appel);
    assert.ok(erreur instanceof RangeError);
    assert.match(erreur.message, /(est limité|doit être)/);
  }
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('critère 16 : le README indique la revérification au calcul et les bornes avec leur valeur', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const section = readme.slice(readme.indexOf('## Contrat du module de frais (`src/frais/`)'));
  for (const attendu of ['revérifi', '10 000,00 €', '2 000 km', '100 000 km', '31 nuits',
    'MONTANT_MAX_CENTIMES', 'KILOMETRES_MAX_TRAJET', 'KILOMETRAGE_ANNUEL_MAX', 'NUITS_MAX']) {
    assert.ok(section.includes(attendu), `la section du module de frais doit mentionner ${attendu}`);
  }
});

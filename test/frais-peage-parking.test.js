import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creerNote, ajouterDepense, montantRemboursable, remboursementsNote, indemniteKilometrique,
  totalRemboursableNote, tvaRecuperableNote, tvaRecuperableDepense, transitionNote, justificatifsManquants,
  NATURES, TAUX_TVA_PEAGE,
} from '../src/frais/index.js';

const NOTE = creerNote({ salarie: 'S1', mois: '2026-11' });
const PEAGE = { date: '2026-11-05', nature: 'peage', montantTtcCentimes: 1240 };
const PARKING = { date: '2026-11-05', nature: 'parking', montantTtcCentimes: 900 };
const IK = { date: '2026-11-05', nature: 'indemnites-kilometriques', kilometres: 120, puissance: 5 };
const MESSAGE_PEAGE = 'Le taux de TVA d\'un péage est de 20 % : saisissez 20 % ou laissez le taux vide.';
const ligne = (nature, montantTtcCentimes, tauxTva) => ({ nature, montantTtcCentimes, montantRemboursableCentimes: montantTtcCentimes, tauxTva });

const SALARIE = { id: 'S1', role: 'salarie' };
const MANAGER = { id: 'M1', role: 'manager' };
const COMPTA = { id: 'C1', role: 'comptabilite' };
const JOUR = '2026-12-01';
const soumettre = (note, total) => transitionNote({
  note, action: 'soumettre', acteur: SALARIE, managerAuteur: 'M1', totalRemboursableCentimes: total, aujourdhui: JOUR,
});

// Note témoin d'avant la livraison : deux repas à Paris (TVA 10 %) et 120 km en 5 CV.
function noteTemoin() {
  let note = NOTE;
  note = ajouterDepense(note, { date: '2026-11-03', nature: 'repas', montantTtcCentimes: 1850, tauxTva: 10, aParis: true });
  note = ajouterDepense(note, { date: '2026-11-04', nature: 'repas', montantTtcCentimes: 3400, tauxTva: 10, aParis: true });
  return ajouterDepense(note, IK);
}

// Non-régression

test('critère 1 : 120 km en 5 CV après 4 000 km valent 76,32 €, avec ou sans péage avant ou après l\'indemnité', () => {
  const ikSeule = remboursementsNote(ajouterDepense(NOTE, IK), { kilometrageDejaRembourse: 4000 });
  assert.equal(ikSeule[0].montantRemboursableCentimes, 7632);
  const peageAvantSaisi = ajouterDepense(ajouterDepense(NOTE, PEAGE), IK);
  const peageApresSaisi = ajouterDepense(ajouterDepense(NOTE, IK), PEAGE);
  const peageDateAvant = ajouterDepense(ajouterDepense(NOTE, IK), { ...PEAGE, date: '2026-11-02' });
  const peageDateApres = ajouterDepense(ajouterDepense(NOTE, IK), { ...PEAGE, date: '2026-11-20' });
  for (const note of [peageAvantSaisi, peageApresSaisi, peageDateAvant, peageDateApres]) {
    const lignes = remboursementsNote(note, { kilometrageDejaRembourse: 4000 });
    assert.equal(lignes.find((l) => l.nature === 'indemnites-kilometriques').montantRemboursableCentimes, 7632);
    assert.equal(lignes.find((l) => l.nature === 'peage').montantRemboursableCentimes, 1240);
  }
});

test('critère 2 : 200 km en 5 CV après 4 900 km valent toujours 99,30 €', () => {
  assert.equal(indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 4900, kilometres: 200 }), 9930);
});

test('critère 3 : la note témoin sans péage ni parking garde 124,82 € de total et 4,41 € de TVA', () => {
  const lignes = remboursementsNote(noteTemoin(), { kilometrageDejaRembourse: 4000 });
  assert.equal(totalRemboursableNote(lignes), 12482);
  assert.equal(tvaRecuperableNote(lignes), 441);
});

test('critère 4 : une dépense « transport » est acceptée et calculée comme avant, taux libre parmi les taux admis', () => {
  const note = ajouterDepense(NOTE, { ...PEAGE, nature: 'transport', tauxTva: 10, aParis: true });
  assert.deepEqual(note.depenses, [{ date: '2026-11-05', nature: 'transport', aParis: true, tauxTva: 10, montantTtcCentimes: 1240 }]);
  assert.equal(montantRemboursable(note.depenses[0]), 1240);
  assert.equal(tvaRecuperableDepense(ligne('transport', 1240, 10)), 113);
  assert.equal(tvaRecuperableDepense(ligne('transport', 1240)), 0);
});

// Natures

test('critère 5 : la liste des natures contient exactement sept valeurs, dont « peage » et « parking »', () => {
  assert.deepEqual(NATURES, ['repas', 'hotel', 'transport', 'indemnites-kilometriques', 'autre', 'peage', 'parking']);
  assert.ok(Object.isFrozen(NATURES));
});

test('critère 6 : une nature inconnue ou accentuée est refusée, avec un message qui cite les sept natures', () => {
  for (const nature of ['taxi', 'péage']) {
    assert.throws(() => ajouterDepense(NOTE, { ...PEAGE, nature }), (e) => e instanceof RangeError
      && e.message.includes(`« ${nature} »`) && NATURES.every((n) => e.message.includes(n)));
  }
});

// Remboursement

test('critère 7 : un péage de 12,40 € est accepté et remboursé 12,40 €', () => {
  const note = ajouterDepense(NOTE, PEAGE);
  assert.deepEqual(note.depenses, [{ date: '2026-11-05', nature: 'peage', montantTtcCentimes: 1240 }]);
  assert.equal(montantRemboursable(note.depenses[0]), 1240);
});

test('critère 8 : un parking de 9,00 € est accepté et remboursé 9,00 €', () => {
  const note = ajouterDepense(NOTE, PARKING);
  assert.deepEqual(note.depenses, [{ date: '2026-11-05', nature: 'parking', montantTtcCentimes: 900 }]);
  assert.equal(montantRemboursable(note.depenses[0]), 900);
});

test('critère 9 : péage et parking n\'ont pas de plafond (250,00 € remboursés 250,00 €)', () => {
  for (const nature of ['peage', 'parking']) {
    const note = ajouterDepense(NOTE, { date: '2026-11-05', nature, montantTtcCentimes: 25000 });
    assert.equal(montantRemboursable(note.depenses[0]), 25000);
    assert.equal(remboursementsNote(note)[0].montantRemboursableCentimes, 25000);
  }
});

test('critère 10 : une note avec un seul péage, sans indemnité kilométrique, a un total de 12,40 €', () => {
  const lignes = remboursementsNote(ajouterDepense(NOTE, PEAGE));
  assert.equal(totalRemboursableNote(lignes), 1240);
});

test('critère 11 : 120 km en 5 CV (4 000 km déjà remboursés) et un péage de 12,40 € font un total de 88,72 €', () => {
  const lignes = remboursementsNote(ajouterDepense(ajouterDepense(NOTE, IK), PEAGE), { kilometrageDejaRembourse: 4000 });
  assert.equal(totalRemboursableNote(lignes), 8872);
});

// TVA

test('critère 12 : un péage de 12,40 € saisi à 20 % a une TVA récupérable de 2,07 €', () => {
  assert.equal(TAUX_TVA_PEAGE, 20);
  const lignes = remboursementsNote(ajouterDepense(NOTE, { ...PEAGE, tauxTva: 20 }));
  assert.equal(lignes[0].tauxTva, 20);
  assert.equal(tvaRecuperableDepense(lignes[0]), 207);
});

test('critère 13 : un péage de 12,40 € sans taux a une TVA calculée à 20 %, soit 2,07 € et non 0,00 €', () => {
  const lignes = remboursementsNote(ajouterDepense(NOTE, PEAGE));
  assert.equal(lignes[0].tauxTva, undefined);
  assert.equal(tvaRecuperableDepense(lignes[0]), 207);
  assert.equal(tvaRecuperableNote(lignes), 207);
});

test('critère 14 : un péage à 5,5 % ou 10 % est refusé avec le message du client et n\'est pas ajouté ; 7 % est refusé aussi', () => {
  const note = ajouterDepense(NOTE, PARKING);
  for (const tauxTva of [5.5, 10]) {
    assert.throws(() => ajouterDepense(note, { ...PEAGE, tauxTva }), { name: 'RangeError', message: MESSAGE_PEAGE });
  }
  assert.throws(() => ajouterDepense(note, { ...PEAGE, tauxTva: 7 }), { name: 'RangeError', message: /taux de TVA/ });
  assert.equal(note.depenses.length, 1);
});

test('critère 14 : une ligne de péage à 10 % fabriquée à la main fait refuser les calculs de TVA et de total', () => {
  const lignes = [ligne('peage', 1240, 10)];
  assert.throws(() => tvaRecuperableDepense(lignes[0]), { name: 'RangeError', message: MESSAGE_PEAGE });
  assert.throws(() => totalRemboursableNote(lignes), { name: 'RangeError', message: MESSAGE_PEAGE });
  assert.throws(() => tvaRecuperableNote(lignes), { name: 'RangeError', message: MESSAGE_PEAGE });
});

test('critère 15 : un parking de 9,00 € a une TVA de 0,82 € à 10 %, 0,47 € à 5,5 % et 1,50 € à 20 %', () => {
  for (const [tauxTva, tva] of [[10, 82], [5.5, 47], [20, 150]]) {
    const lignes = remboursementsNote(ajouterDepense(NOTE, { ...PARKING, tauxTva }));
    assert.equal(tvaRecuperableDepense(lignes[0]), tva);
  }
});

test('critère 16 : un parking de 9,00 € sans taux est accepté avec une TVA de 0,00 €', () => {
  const lignes = remboursementsNote(ajouterDepense(NOTE, PARKING));
  assert.equal(tvaRecuperableDepense(lignes[0]), 0);
});

test('critère 17 : un parking à 7 % est refusé avec le message qui cite les taux admis', () => {
  assert.throws(() => ajouterDepense(NOTE, { ...PARKING, tauxTva: 7 }), { name: 'RangeError', message: /5,5, 10 ou 20/ });
  assert.throws(() => tvaRecuperableDepense(ligne('parking', 900, 7)), { name: 'RangeError', message: /5,5 %, 10 % ou 20 %/ });
});

test('critère 18 : la note du critère 11 a une TVA récupérable de 2,07 €, l\'indemnité comptant pour 0,00 €', () => {
  const lignes = remboursementsNote(ajouterDepense(ajouterDepense(NOTE, IK), PEAGE), { kilometrageDejaRembourse: 4000 });
  assert.equal(tvaRecuperableDepense(lignes[0]), 0);
  assert.equal(tvaRecuperableNote(lignes), 207);
});

// Contrôles de saisie

test('critère 19 : un péage ou un parking à 0,00 €, négatif, fractionnaire ou sans montant est refusé', () => {
  for (const depense of [PEAGE, PARKING]) {
    for (const montantTtcCentimes of [0, -100, 18.5, undefined]) {
      assert.throws(() => ajouterDepense(NOTE, { ...depense, montantTtcCentimes }), { name: 'RangeError', message: /montant TTC/ });
    }
  }
});

test('critère 20 : un péage ou un parking hors du mois est refusé ; le premier et le dernier jour du mois sont acceptés', () => {
  for (const depense of [PEAGE, PARKING]) {
    for (const date of ['2026-12-01', '2026-10-31']) {
      assert.throws(() => ajouterDepense(NOTE, { ...depense, date }), { name: 'RangeError', message: /hors du mois/ });
    }
    for (const date of ['2026-11-01', '2026-11-30']) {
      assert.equal(ajouterDepense(NOTE, { ...depense, date }).depenses[0].date, date);
    }
  }
});

test('critère 21 : un péage ou un parking avec « à Paris », « nuits », « kilomètres » ou « puissance » est refusé', () => {
  for (const depense of [PEAGE, PARKING]) {
    for (const [champ, valeur] of [['aParis', true], ['aParis', false], ['nuits', 1], ['kilometres', 10], ['puissance', 5]]) {
      assert.throws(() => ajouterDepense(NOTE, { ...depense, [champ]: valeur }),
        { name: 'RangeError', message: `Le champ « ${champ} » n'est pas accepté pour une dépense de nature « ${depense.nature} ».` });
    }
  }
});

test('critère 21 : la dépense reçue n\'est pas modifiée par l\'ajout d\'un péage', () => {
  const recue = Object.freeze({ ...PEAGE, tauxTva: 20, justificatif: 'J-42' });
  const note = ajouterDepense(NOTE, recue);
  assert.deepEqual(recue, { ...PEAGE, tauxTva: 20, justificatif: 'J-42' });
  assert.deepEqual(note.depenses[0], { ...PEAGE, tauxTva: 20, justificatif: 'J-42' });
  assert.deepEqual(NOTE.depenses, []);
});

// Doublons

test('critère 22 : un deuxième péage ou parking de même date et même montant est refusé, le premier reste', () => {
  for (const depense of [PEAGE, PARKING]) {
    const note = ajouterDepense(NOTE, depense);
    assert.throws(() => ajouterDepense(note, { ...depense }), { name: 'RangeError', message: /Doublon/ });
    assert.deepEqual(note.depenses, [depense]);
  }
});

test('critère 23 : deux péages du même jour à 12,40 € et 8,10 € sont acceptés tous les deux', () => {
  const note = ajouterDepense(ajouterDepense(NOTE, PEAGE), { ...PEAGE, montantTtcCentimes: 810 });
  assert.deepEqual(note.depenses.map((d) => d.montantTtcCentimes), [1240, 810]);
});

test('critère 24 : un péage et un parking, ou un péage et un transport, du même jour et du même montant sont acceptés', () => {
  for (const nature of ['parking', 'transport']) {
    const note = ajouterDepense(ajouterDepense(NOTE, PEAGE), { ...PEAGE, nature });
    assert.deepEqual(note.depenses.map((d) => d.nature), ['peage', nature]);
  }
});

// Justificatif (circuit de validation)

test('critère 25 : une note en brouillon avec un péage ou un parking de 50,00 € sans justificatif ne peut pas être soumise', () => {
  for (const nature of ['peage', 'parking']) {
    const note = ajouterDepense(NOTE, { date: '2026-11-05', nature, montantTtcCentimes: 5000 });
    assert.deepEqual(justificatifsManquants(note.depenses), [1]);
    const r = soumettre(note, 5000);
    assert.equal(r.ok, false);
    assert.deepEqual(r.motifs.map((m) => m.code), ['justificatif-manquant']);
  }
});

test('critère 26 : un péage de 50,00 € avec justificatif, ou de 49,99 € sans, n\'empêche pas la soumission', () => {
  const avecJustificatif = ajouterDepense(NOTE, { ...PEAGE, montantTtcCentimes: 5000, justificatif: 'J-42' });
  const sousLeSeuil = ajouterDepense(NOTE, { ...PEAGE, montantTtcCentimes: 4999 });
  for (const [note, total] of [[avecJustificatif, 5000], [sousLeSeuil, 4999]]) {
    assert.deepEqual(justificatifsManquants(note.depenses), []);
    const r = soumettre(note, total);
    assert.equal(r.ok, true, JSON.stringify(r.motifs));
    assert.equal(r.note.etat, 'soumise');
  }
});

// Notes déjà avancées dans le circuit

test('critère 27 : une note témoin soumise puis payée garde son total, sa TVA et son état', () => {
  const soumise = soumettre(noteTemoin(), 12482).note;
  const etapes = [['valider', MANAGER], ['controler', COMPTA], ['payer', COMPTA, { datePaiement: JOUR }]];
  const payee = etapes.reduce((note, [action, acteur, plus = {}]) => {
    const r = transitionNote({ note, action, acteur, managerAuteur: 'M1', totalRemboursableCentimes: 12482, aujourdhui: JOUR, ...plus });
    assert.equal(r.ok, true, JSON.stringify(r.motifs));
    return r.note;
  }, soumise);
  for (const [note, etat] of [[soumise, 'soumise'], [payee, 'payee']]) {
    const lignes = remboursementsNote(note, { kilometrageDejaRembourse: 4000 });
    assert.equal(totalRemboursableNote(lignes), 12482);
    assert.equal(tvaRecuperableNote(lignes), 441);
    assert.equal(note.etat, etat);
    assert.equal(note.totalRemboursableCentimes, 12482);
    // Rejouer une action avec le total recalculé ne signale pas de total modifié.
    const r = transitionNote({ note, action: 'payer', acteur: COMPTA, managerAuteur: 'M1', totalRemboursableCentimes: 12482, datePaiement: JOUR, aujourdhui: JOUR });
    assert.ok(r.ok || !r.motifs.some((m) => m.code === 'total-modifie'));
  }
});

test('critère 28 : un péage et un parking s\'ajoutent à une note en brouillon, qui se soumet ensuite normalement', () => {
  const brouillon = ajouterDepense(ajouterDepense(noteTemoin(), PEAGE), PARKING);
  const lignes = remboursementsNote(brouillon, { kilometrageDejaRembourse: 4000 });
  assert.equal(totalRemboursableNote(lignes), 12482 + 1240 + 900);
  const r = soumettre(brouillon, totalRemboursableNote(lignes));
  assert.equal(r.ok, true, JSON.stringify(r.motifs));
  assert.equal(r.note.etat, 'soumise');
});

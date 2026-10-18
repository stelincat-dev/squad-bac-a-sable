import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  creerNote, ajouterDepense, transitionNote, justificatifsManquants,
  ETATS_NOTE, ROLES, ACTIONS_NOTE, SEUIL_DF_CENTIMES, SEUIL_JUSTIFICATIF_CENTIMES,
} from '../src/frais/index.js';

const AUTEUR = { id: 'S1', role: 'salarie' };
const AUTRE_SALARIE = { id: 'S2', role: 'salarie' };
const MANAGER = { id: 'M1', role: 'manager' };
const AUTRE_MANAGER = { id: 'M2', role: 'manager' };
const DF = { id: 'DF1', role: 'directeur-financier' };
const COMPTA = { id: 'C1', role: 'comptabilite' };
const JOUR = '2026-12-01';

const REPAS = { date: '2026-11-10', nature: 'repas', montantTtcCentimes: 1850 };
const NOTE = ajouterDepense(creerNote({ salarie: 'S1', mois: '2026-11' }), REPAS);

// Appel avec les valeurs par défaut du parcours nominal.
function agir(note, action, acteur, autres = {}) {
  return transitionNote({ note, action, acteur, managerAuteur: 'M1', totalRemboursableCentimes: 20000, aujourdhui: JOUR, ...autres });
}

// Enchaîne les étapes, chacune devant réussir, et rend la note finale.
function parcours(note, etapes, autres = {}) {
  return etapes.reduce((n, [action, acteur, plus = {}]) => {
    const r = agir(n, action, acteur, { ...autres, ...plus });
    assert.equal(r.ok, true, `${action} par ${acteur.id} : ${JSON.stringify(r.motifs)}`);
    return r.note;
  }, note);
}

function codes(resultat) {
  assert.equal(resultat.ok, false);
  return resultat.motifs.map((m) => m.code).sort();
}

const avec = (etat, total = 20000, plus = {}) => ({ ...NOTE, etat, dateSoumission: '2026-11-30', historique: [], ...plus, _total: total });
const appel = (note, action, acteur, autres = {}) => {
  const { _total, ...propre } = note;
  return agir(propre, action, acteur, { totalRemboursableCentimes: _total ?? 20000, ...autres });
};

function figer(objet) {
  if (objet && typeof objet === 'object') {
    Object.values(objet).forEach(figer);
    Object.freeze(objet);
  }
  return objet;
}

test('les constantes du circuit sont exportées et figées', () => {
  assert.deepEqual(ETATS_NOTE, ['brouillon', 'soumise', 'validee-manager', 'validee-df', 'controlee', 'payee']);
  assert.deepEqual(ROLES, ['salarie', 'manager', 'directeur-financier', 'comptabilite']);
  assert.deepEqual(ACTIONS_NOTE, ['soumettre', 'valider', 'refuser', 'controler', 'payer']);
  assert.equal(SEUIL_DF_CENTIMES, 150000);
  assert.equal(SEUIL_JUSTIFICATIF_CENTIMES, 5000);
  assert.ok(Object.isFrozen(ETATS_NOTE) && Object.isFrozen(ROLES) && Object.isFrozen(ACTIONS_NOTE));
});

test('critère 1 : une note en brouillon soumise par son auteur avec le rôle salarié passe à « soumise »', () => {
  const r = agir(NOTE, 'soumettre', AUTEUR);
  assert.equal(r.ok, true);
  assert.equal(r.note.etat, 'soumise');
  assert.equal(r.note.dateSoumission, JOUR);
  assert.deepEqual(r.note.historique, [{ action: 'soumettre', par: 'S1', role: 'salarie', de: 'brouillon', vers: 'soumise', date: JOUR }]);
  assert.equal(agir({ ...NOTE, etat: 'brouillon' }, 'soumettre', AUTEUR).note.etat, 'soumise');
});

test('critère 2 : une soumission par une autre personne que l\'auteur est refusée, la note reste en brouillon', () => {
  const note = figer({ ...NOTE, etat: 'brouillon' });
  assert.deepEqual(codes(agir(note, 'soumettre', AUTRE_SALARIE)), ['non-autorise']);
  assert.deepEqual(codes(agir(note, 'soumettre', MANAGER)), ['non-autorise']);
  assert.deepEqual(codes(agir(note, 'soumettre', { id: 'S1', role: 'manager' })), ['non-autorise']);
  assert.equal(note.etat, 'brouillon');
});

test('critère 3 : une note soumise validée par le manager rattaché passe à « validée par le manager »', () => {
  const r = appel(avec('soumise'), 'valider', MANAGER);
  assert.equal(r.ok, true);
  assert.equal(r.note.etat, 'validee-manager');
  assert.deepEqual(r.note.historique.at(-1), { action: 'valider', par: 'M1', role: 'manager', de: 'soumise', vers: 'validee-manager', date: JOUR });
});

test('critère 4 : une validation par un manager non rattaché ou par un acteur sans le rôle manager est refusée, l\'état ne change pas', () => {
  const note = figer(avec('soumise'));
  assert.deepEqual(codes(appel(note, 'valider', AUTRE_MANAGER)), ['non-autorise']);
  assert.deepEqual(codes(appel(note, 'valider', { id: 'M1', role: 'salarie' })), ['non-autorise']);
  assert.deepEqual(codes(appel(note, 'valider', COMPTA)), ['non-autorise']);
  assert.deepEqual(codes(appel(note, 'valider', DF)), ['non-autorise']);
  assert.equal(note.etat, 'soumise');
});

test('critère 5 : une note de 1 500,01 € validée par le manager passe par le directeur financier ; un contrôle anticipé est refusé', () => {
  const note = figer(avec('validee-manager', 150001));
  assert.deepEqual(codes(appel(note, 'controler', COMPTA)), ['transition-interdite']);
  const r = appel(note, 'valider', DF);
  assert.equal(r.ok, true);
  assert.equal(r.note.etat, 'validee-df');
  assert.equal(note.etat, 'validee-manager');
});

test('critère 6 : une note de 1 500,00 € ou de 200 € validée par le manager va directement à la comptabilité ; le directeur financier ne peut pas la valider', () => {
  for (const total of [150000, 20000]) {
    const note = figer(avec('validee-manager', total));
    assert.deepEqual(codes(appel(note, 'valider', DF)), ['transition-interdite'], `total ${total}`);
    const r = appel(note, 'controler', COMPTA);
    assert.equal(r.ok, true);
    assert.equal(r.note.etat, 'controlee');
  }
});

test('critère 7 : la comptabilité contrôle une note à l\'étape attendue, qui passe à « contrôlée par la comptabilité »', () => {
  assert.equal(appel(avec('validee-manager', 150000), 'controler', COMPTA).note.etat, 'controlee');
  const r = appel(avec('validee-df', 150001), 'controler', COMPTA);
  assert.equal(r.note.etat, 'controlee');
  assert.deepEqual(r.note.historique.at(-1), { action: 'controler', par: 'C1', role: 'comptabilite', de: 'validee-df', vers: 'controlee', date: JOUR });
});

test('critère 8 : la comptabilité enregistre le paiement avec une date, la note passe à « payée » avec sa date de paiement', () => {
  const r = appel(avec('controlee'), 'payer', COMPTA, { datePaiement: '2026-12-01' });
  assert.equal(r.ok, true);
  assert.equal(r.note.etat, 'payee');
  assert.equal(r.note.datePaiement, '2026-12-01');
});

test('critères 1 à 8 : parcours complet d\'une note de 200 € sans le directeur financier', () => {
  const finale = parcours(NOTE, [
    ['soumettre', AUTEUR], ['valider', MANAGER], ['controler', COMPTA], ['payer', COMPTA, { datePaiement: JOUR }],
  ]);
  assert.equal(finale.etat, 'payee');
  assert.deepEqual(finale.historique.map((e) => e.vers), ['soumise', 'validee-manager', 'controlee', 'payee']);
});

test('critères 1 à 8 : parcours complet d\'une note de 1 500,01 € par le directeur financier', () => {
  const finale = parcours(NOTE, [
    ['soumettre', AUTEUR], ['valider', MANAGER], ['valider', DF], ['controler', COMPTA], ['payer', COMPTA, { datePaiement: JOUR }],
  ], { totalRemboursableCentimes: 150001 });
  assert.deepEqual(finale.historique.map((e) => e.vers), ['soumise', 'validee-manager', 'validee-df', 'controlee', 'payee']);
});

test('critère 9 : une transition qui saute une étape est refusée et l\'état ne change pas', () => {
  assert.deepEqual(codes(appel(avec('soumise'), 'controler', COMPTA)), ['transition-interdite']);
  assert.deepEqual(codes(appel(avec('brouillon'), 'valider', MANAGER)), ['transition-interdite']);
  assert.deepEqual(codes(appel(avec('validee-manager'), 'payer', COMPTA, { datePaiement: JOUR })), ['transition-interdite']);
});

test('critère 9 : toutes les paires état × action hors du circuit rendent transition-interdite', () => {
  const permises = {
    brouillon: ['soumettre'],
    soumise: ['valider', 'refuser'],
    'validee-manager': ['valider', 'controler', 'refuser'],
    'validee-df': ['controler', 'refuser'],
    controlee: ['payer', 'refuser'],
    payee: [],
  };
  const acteurPour = { soumettre: AUTEUR, valider: MANAGER, refuser: MANAGER, controler: COMPTA, payer: COMPTA };
  for (const etat of ETATS_NOTE) {
    for (const action of ACTIONS_NOTE.filter((a) => !permises[etat].includes(a))) {
      const note = figer(avec(etat));
      const r = appel(note, action, acteurPour[action], { motif: 'Motif', datePaiement: JOUR });
      assert.ok(codes(r).includes('transition-interdite'), `${etat} × ${action}`);
      assert.equal(note.etat, etat);
    }
  }
});

test('critère 9 : une note payée est définitive, aucune action n\'est possible', () => {
  const note = avec('payee', 20000, { datePaiement: JOUR });
  for (const [action, acteur] of [['refuser', COMPTA], ['payer', COMPTA], ['controler', COMPTA], ['soumettre', AUTEUR]]) {
    assert.ok(codes(appel(note, action, acteur, { motif: 'Erreur', datePaiement: JOUR })).includes('transition-interdite'), action);
  }
});

test('critère 10 : une transition faite par un acteur qui n\'a pas le rôle prévu est refusée et l\'état ne change pas', () => {
  const soumise = figer(avec('soumise'));
  assert.deepEqual(codes(appel(soumise, 'valider', AUTEUR)), ['non-autorise']);
  const controlee = figer(avec('controlee'));
  assert.deepEqual(codes(appel(controlee, 'payer', MANAGER, { datePaiement: JOUR })), ['non-autorise']);
  assert.deepEqual(codes(appel(avec('validee-df', 150001), 'controler', DF)), ['non-autorise']);
  assert.deepEqual(codes(appel(avec('validee-manager', 150001), 'valider', MANAGER)), ['non-autorise']);
  assert.deepEqual(codes(appel(soumise, 'refuser', COMPTA, { motif: 'Non' })), ['non-autorise']);
  assert.deepEqual(codes(appel(avec('validee-manager', 150001), 'refuser', COMPTA, { motif: 'Non' })), ['non-autorise']);
  assert.deepEqual(codes(appel(avec('validee-manager', 150000), 'refuser', DF, { motif: 'Non' })), ['non-autorise']);
  assert.deepEqual(codes(appel(avec('validee-manager'), 'refuser', MANAGER, { motif: 'Non' })), ['non-autorise']);
  assert.deepEqual(codes(appel(soumise, 'refuser', AUTRE_MANAGER, { motif: 'Non' })), ['non-autorise']);
  assert.deepEqual(codes(appel(avec('brouillon'), 'payer', MANAGER, { datePaiement: JOUR })).sort(), ['non-autorise', 'transition-interdite']);
  assert.equal(soumise.etat, 'soumise');
  assert.equal(controlee.etat, 'controlee');
});

test('critère 11 : un refus sans motif, avec un motif vide ou fait d\'espaces est refusé, l\'état ne change pas', () => {
  const note = figer(avec('soumise'));
  for (const motif of [undefined, '', '   ', 42]) {
    assert.deepEqual(codes(appel(note, 'refuser', MANAGER, { motif })), ['motif-obligatoire'], String(motif));
  }
  assert.equal(note.etat, 'soumise');
});

test('critère 12 : un refus motivé par l\'acteur de l\'étape renvoie la note en brouillon et ajoute le motif à l\'historique avec l\'acteur et son rôle', () => {
  const cas = [
    [avec('soumise'), MANAGER],
    [avec('validee-manager', 150001), DF],
    [avec('validee-manager', 150000), COMPTA],
    [avec('validee-df', 150001), COMPTA],
    [avec('controlee'), COMPTA],
  ];
  for (const [note, acteur] of cas) {
    const r = appel(figer(note), 'refuser', acteur, { motif: 'Justificatif illisible' });
    assert.equal(r.ok, true, `${note.etat} par ${acteur.role}`);
    assert.equal(r.note.etat, 'brouillon');
    assert.deepEqual(r.note.historique.at(-1), {
      action: 'refuser', par: acteur.id, role: acteur.role, de: note.etat, vers: 'brouillon', motif: 'Justificatif illisible', date: JOUR,
    });
  }
});

test('critère 13 : après deux refus successifs, l\'historique contient les deux motifs dans l\'ordre', () => {
  const finale = parcours(NOTE, [
    ['soumettre', AUTEUR], ['refuser', MANAGER, { motif: 'Repas sans objet' }],
    ['soumettre', AUTEUR], ['valider', MANAGER], ['refuser', COMPTA, { motif: 'Mauvaise date' }],
  ]);
  const refus = finale.historique.filter((e) => e.action === 'refuser');
  assert.deepEqual(refus.map(({ motif, par, role }) => ({ motif, par, role })), [
    { motif: 'Repas sans objet', par: 'M1', role: 'manager' },
    { motif: 'Mauvaise date', par: 'C1', role: 'comptabilite' },
  ]);
});

test('critère 14 : une note refusée, corrigée puis soumise de nouveau passe à « soumise » et garde les motifs précédents', () => {
  const refusee = parcours(NOTE, [
    ['soumettre', AUTEUR], ['valider', MANAGER], ['valider', DF], ['refuser', COMPTA, { motif: 'Hôtel trop cher' }],
  ], { totalRemboursableCentimes: 150001 });
  const corrigee = ajouterDepense(refusee, { date: '2026-11-11', nature: 'transport', montantTtcCentimes: 1200 });
  const r = agir(corrigee, 'soumettre', AUTEUR, { aujourdhui: '2026-12-02', totalRemboursableCentimes: 150001 });
  assert.equal(r.ok, true);
  assert.equal(r.note.etat, 'soumise');
  assert.equal(r.note.dateSoumission, '2026-12-02');
  assert.deepEqual(r.note.historique.filter((e) => e.motif).map((e) => e.motif), ['Hôtel trop cher']);
  // Réponse 2 du client : la note repart de la validation du manager.
  assert.deepEqual(codes(agir(r.note, 'valider', DF, { totalRemboursableCentimes: 150001 })), ['non-autorise']);
  assert.deepEqual(codes(agir(r.note, 'controler', COMPTA, { totalRemboursableCentimes: 150001 })), ['transition-interdite']);
});

test('critère 15 : une dépense de 50,00 € ou de 120 € sans justificatif empêche la soumission, la note reste en brouillon', () => {
  for (const montantTtcCentimes of [5000, 12000]) {
    const note = figer(ajouterDepense(NOTE, { date: '2026-11-12', nature: 'hotel', montantTtcCentimes }));
    const r = agir(note, 'soumettre', AUTEUR);
    assert.deepEqual(codes(r), ['justificatif-manquant']);
    assert.match(r.motifs[0].message, /n° 2/);
    assert.equal(note.etat, undefined);
  }
  const vide = { ...NOTE, depenses: [{ ...REPAS, montantTtcCentimes: 5000, justificatif: '  ' }] };
  assert.deepEqual(codes(agir(vide, 'soumettre', AUTEUR)), ['justificatif-manquant']);
  const avecRef = ajouterDepense(NOTE, { date: '2026-11-12', nature: 'hotel', montantTtcCentimes: 12000, justificatif: 'J-1' });
  assert.equal(agir(avecRef, 'soumettre', AUTEUR).ok, true);
});

test('critère 16 : une dépense de 49,99 € sans justificatif n\'empêche pas la soumission', () => {
  const note = ajouterDepense(NOTE, { date: '2026-11-12', nature: 'autre', montantTtcCentimes: 4999 });
  assert.equal(agir(note, 'soumettre', AUTEUR).note.etat, 'soumise');
});

test('critère 17 : une indemnité kilométrique de 50 € ou plus sans justificatif n\'empêche pas la soumission', () => {
  const note = ajouterDepense(NOTE, { date: '2026-11-12', nature: 'indemnites-kilometriques', kilometres: 200, puissance: 5 });
  assert.deepEqual(justificatifsManquants(note.depenses), []);
  assert.equal(agir(note, 'soumettre', AUTEUR, { totalRemboursableCentimes: 14570 }).note.etat, 'soumise');
  const avecMontant = { ...NOTE, depenses: [{ nature: 'indemnites-kilometriques', montantTtcCentimes: 9930 }] };
  assert.equal(agir(avecMontant, 'soumettre', AUTEUR).ok, true);
});

test('réponse 5 : personne ne valide sa propre note, ni le manager ni le directeur financier', () => {
  const noteManager = { ...avec('soumise'), salarie: 'M1' };
  assert.deepEqual(codes(appel(noteManager, 'valider', MANAGER)), ['auto-validation']);
  const noteDf = { ...avec('validee-manager', 150001), salarie: 'DF1' };
  assert.deepEqual(codes(appel(noteDf, 'valider', DF)), ['auto-validation']);
});

test('réponse 6 : sans manager rattaché, la soumission est refusée', () => {
  for (const managerAuteur of [undefined, null]) {
    assert.deepEqual(codes(agir(NOTE, 'soumettre', AUTEUR, { managerAuteur })), ['manager-absent']);
  }
});

test('réponse 7 : la date de paiement ne peut être ni après le jour même ni avant la soumission', () => {
  const note = avec('controlee');
  assert.deepEqual(codes(appel(note, 'payer', COMPTA, { datePaiement: '2026-12-02' })), ['date-paiement-invalide']);
  assert.deepEqual(codes(appel(note, 'payer', COMPTA, { datePaiement: '2026-11-29' })), ['date-paiement-invalide']);
  assert.equal(appel(note, 'payer', COMPTA, { datePaiement: '2026-11-30' }).ok, true);
  assert.equal(appel(note, 'payer', COMPTA, { datePaiement: JOUR }).ok, true);
});

test('la note reçue, figée en profondeur, reste intacte et le résultat en est une copie', () => {
  const note = figer(structuredClone({ ...NOTE, etat: 'soumise', historique: [{ action: 'soumettre', par: 'S1' }] }));
  const r = agir(note, 'refuser', MANAGER, { motif: 'Non' });
  assert.notEqual(r.note, note);
  assert.notEqual(r.note.historique, note.historique);
  assert.notEqual(r.note.depenses, note.depenses);
  assert.equal(note.historique.length, 1);
  assert.equal(r.note.historique.length, 2);
});

test('le résultat ne dépend pas de la date du système', () => {
  const calculer = () => parcours(NOTE, [['soumettre', AUTEUR], ['valider', MANAGER], ['controler', COMPTA], ['payer', COMPTA, { datePaiement: JOUR }]]);
  const reference = calculer();
  for (const maintenant of [0, Date.UTC(2030, 5, 15), Date.UTC(2026, 11, 31, 23, 59)]) {
    mock.timers.enable({ apis: ['Date'], now: maintenant });
    try {
      assert.deepEqual(calculer(), reference);
    } finally {
      mock.timers.reset();
    }
  }
});

test('chaque motif de refus a un code et un message en français au vouvoiement', () => {
  const resultats = [
    agir({ ...NOTE, depenses: [{ ...REPAS, montantTtcCentimes: 6000 }] }, 'soumettre', AUTRE_SALARIE, { managerAuteur: undefined }),
    appel(avec('payee'), 'refuser', MANAGER, {}),
    appel({ ...avec('soumise'), salarie: 'M1' }, 'valider', MANAGER),
    appel(avec('controlee'), 'payer', COMPTA, { datePaiement: '2027-01-01' }),
  ];
  for (const r of resultats) {
    for (const { code, message } of r.motifs) {
      assert.match(code, /^[a-z-]+$/);
      assert.match(message, /\b(vous|votre|Vous|Indiquez|Ajoutez)\b|ne peut/, message);
    }
  }
});

test('les erreurs d\'appel lèvent une RangeError avec un message en français', () => {
  const base = { note: NOTE, action: 'soumettre', acteur: AUTEUR, managerAuteur: 'M1', totalRemboursableCentimes: 20000, aujourdhui: JOUR };
  const erreurs = [
    {},
    { ...base, action: 'approuver' },
    { ...base, note: null },
    { ...base, note: { ...NOTE, etat: 'archivee' } },
    { ...base, note: { ...NOTE, historique: 'x' } },
    { ...base, note: { ...NOTE, depenses: [{ nature: 'repas', montantTtcCentimes: 18.5 }] } },
    { ...base, acteur: { id: 'S1', role: 'stagiaire' } },
    { ...base, acteur: { role: 'salarie' } },
    { ...base, managerAuteur: '' },
    { ...base, totalRemboursableCentimes: 1500.5 },
    { ...base, totalRemboursableCentimes: undefined },
    { ...base, aujourdhui: '2026-02-30' },
    { ...base, aujourdhui: '01/12/2026' },
    { ...base, note: avec('controlee'), action: 'payer', acteur: COMPTA },
    { ...base, note: avec('controlee'), action: 'payer', acteur: COMPTA, datePaiement: '2026-13-01' },
  ];
  for (const appelErrone of erreurs) {
    assert.throws(() => transitionNote(appelErrone), RangeError, JSON.stringify(appelErrone));
  }
  assert.throws(() => transitionNote(), { name: 'RangeError', message: /L'action doit être/ });
});

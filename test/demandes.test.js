import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { joursFeries, joursOuvres, recevabilite, solde, changerEtat } from '../src/conges.js';

const jours = ({ debut, fin, site }) => joursOuvres({ debut, fin, site }).joursOuvres;
const codes = (resultat) => resultat.motifs.map((m) => m.code).sort();

const demande = (id, salarie, debut, fin, etat) => ({ id, salarie, debut, fin, site: 'national', etat });

// Jeu de données : S1 (site national, 25 jours acquis), demandes de mars 2026 sans jour férié.
const ACCEPTEE = demande('a1', 'S1', '2026-03-02', '2026-03-13', 'acceptee');   // 10 jours
const EN_ATTENTE = demande('a2', 'S1', '2026-03-16', '2026-03-18', 'en-attente'); // 3 jours
const REFUSEE = demande('a3', 'S1', '2026-03-23', '2026-03-24', 'refusee');      // 2 jours
const ANNULEE = demande('a4', 'S1', '2026-03-25', '2026-03-25', 'annulee');      // 1 jour
const AUTRES = [
  demande('b1', 'S2', '2026-03-02', '2026-03-20', 'acceptee'),
  demande('b2', 'S2', '2026-06-01', '2026-06-05', 'en-attente'),
];
const DEMANDES = [ACCEPTEE, EN_ATTENTE, REFUSEE, ANNULEE, ...AUTRES];

// Nouvelles demandes de juin 2026, sans jour férié ni chevauchement.
const DOUZE_JOURS = demande('n1', 'S1', '2026-06-01', '2026-06-16', 'en-attente');
const TREIZE_JOURS = demande('n1', 'S1', '2026-06-01', '2026-06-17', 'en-attente');

test('le jeu de données a les jours ouvrés attendus', () => {
  assert.equal(jours(ACCEPTEE), 10);
  assert.equal(jours(EN_ATTENTE), 3);
  assert.equal(jours(REFUSEE), 2);
  assert.equal(jours(ANNULEE), 1);
  assert.equal(jours(DOUZE_JOURS), 12);
  assert.equal(jours(TREIZE_JOURS), 13);
});

test('critère 1 : une demande qui dépasse le solde disponible d\'un jour est irrecevable pour solde insuffisant', () => {
  const resultat = recevabilite({ demande: TREIZE_JOURS, demandes: DEMANDES, joursAcquis: 25 });
  assert.equal(resultat.recevable, false);
  assert.deepEqual(codes(resultat), ['solde-insuffisant']);
});

test('critère 1 : une demande égale au solde disponible est recevable, sans clé motifs', () => {
  assert.deepEqual(recevabilite({ demande: DOUZE_JOURS, demandes: DEMANDES, joursAcquis: 25 }), { recevable: true });
});

test('une liste de demandes vide laisse tous les jours acquis disponibles', () => {
  assert.deepEqual(recevabilite({ demande: TREIZE_JOURS, demandes: [], joursAcquis: 13 }), { recevable: true });
  assert.deepEqual(codes(recevabilite({ demande: TREIZE_JOURS, demandes: [], joursAcquis: 12 })), ['solde-insuffisant']);
});

test('une demande de la liste qui porte le même id est ignorée, pour le solde comme pour le chevauchement', () => {
  const meme = { ...TREIZE_JOURS, etat: 'acceptee' };
  assert.deepEqual(recevabilite({ demande: TREIZE_JOURS, demandes: [meme], joursAcquis: 13 }), { recevable: true });
});

test('critère 2 : une fin avant le début rend le seul motif fin-avant-debut, sans exception', () => {
  const inversee = demande('n2', 'S1', '2025-12-26', '2025-12-22', 'en-attente');
  const chevauchee = demande('x', 'S1', '2025-12-20', '2025-12-31', 'acceptee');
  let resultat;
  assert.doesNotThrow(() => { resultat = recevabilite({ demande: inversee, demandes: [chevauchee], joursAcquis: 0 }); });
  assert.equal(resultat.recevable, false);
  assert.deepEqual(codes(resultat), ['fin-avant-debut']);
});

// Chevauchement d'un seul jour, dans les deux sens : la fin de l'une est le début de l'autre.
const PAR_LA_FIN = demande('n3', 'S1', '2026-02-27', '2026-03-02', 'en-attente');
const PAR_LE_DEBUT = demande('n4', 'S1', '2026-03-13', '2026-03-13', 'en-attente');

test('critère 3 : un seul jour partagé avec une demande acceptée ou en attente du salarié donne un chevauchement', () => {
  for (const etat of ['acceptee', 'en-attente']) {
    const autre = { ...ACCEPTEE, etat };
    for (const nouvelle of [PAR_LA_FIN, PAR_LE_DEBUT]) {
      const resultat = recevabilite({ demande: nouvelle, demandes: [autre], joursAcquis: 25 });
      assert.equal(resultat.recevable, false);
      assert.deepEqual(codes(resultat), ['chevauchement'], `${etat}, du ${nouvelle.debut} au ${nouvelle.fin}`);
    }
  }
});

test('critère 4 : pas de chevauchement avec une demande refusée, annulée ou d\'un autre salarié', () => {
  const autres = [{ ...ACCEPTEE, etat: 'refusee' }, { ...ACCEPTEE, etat: 'annulee' }, { ...ACCEPTEE, salarie: 'S2' }];
  for (const autre of autres) {
    for (const nouvelle of [PAR_LA_FIN, PAR_LE_DEBUT]) {
      assert.deepEqual(recevabilite({ demande: nouvelle, demandes: [autre], joursAcquis: 25 }), { recevable: true });
    }
  }
});

test('critère 5 : les demandes refusées ou annulées du salarié ne réduisent pas le solde disponible', () => {
  const refusees = [{ ...REFUSEE, debut: '2026-04-01', fin: '2026-04-30' }, { ...ANNULEE, debut: '2026-05-04', fin: '2026-05-29' }];
  assert.deepEqual(recevabilite({ demande: TREIZE_JOURS, demandes: refusees, joursAcquis: 13 }), { recevable: true });
  assert.deepEqual(recevabilite({ demande: DOUZE_JOURS, demandes: DEMANDES, joursAcquis: 25 }), { recevable: true });
});

test('critère 6 : une demande qui chevauche une demande acceptée et dépasse le solde rend les deux motifs', () => {
  const nouvelle = demande('n5', 'S1', '2026-03-13', '2026-03-31', 'en-attente');
  assert.ok(jours(nouvelle) > 12);
  const resultat = recevabilite({ demande: nouvelle, demandes: DEMANDES, joursAcquis: 25 });
  assert.equal(resultat.recevable, false);
  assert.deepEqual(codes(resultat), ['chevauchement', 'solde-insuffisant']);
});

// Tous les motifs que les trois fonctions peuvent rendre.
function tousLesMotifs() {
  const r = (d, demandes = DEMANDES) => recevabilite({ demande: d, demandes, joursAcquis: 25 }).motifs;
  const c = (d, action, par) => changerEtat({ demande: d, action, par, responsable: 'R1', aujourdhui: '2026-03-25' }).motifs;
  return [
    ...r(demande('n2', 'S1', '2025-12-26', '2025-12-22', 'en-attente')),
    ...r(demande('n5', 'S1', '2026-03-13', '2026-03-31', 'en-attente')),
    ...c(REFUSEE, 'accepter', 'S1'),
    ...c(REFUSEE, 'refuser', 'S1'),
    ...c(REFUSEE, 'annuler', 'S2'),
  ];
}

test('critère 7 : chaque motif a un code et un message en français non vide, au vouvoiement', () => {
  const motifs = tousLesMotifs();
  assert.deepEqual([...new Set(motifs.map((m) => m.code))].sort(),
    ['chevauchement', 'delai-depasse', 'fin-avant-debut', 'non-autorise', 'solde-insuffisant', 'transition-interdite']);
  for (const { code, message } of motifs) {
    assert.equal(typeof code, 'string');
    assert.ok(typeof message === 'string' && message.length > 0, code);
    assert.match(message, /\b(vous|votre|vos)\b/i, code);
  }
});

test('critère 8 : le solde vaut les jours acquis moins les jours acceptés, les jours en attente à part', () => {
  assert.deepEqual(solde({ salarie: 'S1', demandes: DEMANDES, joursAcquis: 25 }),
    { joursAcquis: 25, joursPris: 10, joursEnAttente: 3, solde: 15 });
});

test('critère 8 : les demandes des autres salariés ne sont pas comptées dans le solde', () => {
  assert.deepEqual(solde({ salarie: 'S1', demandes: [ACCEPTEE, EN_ATTENTE, REFUSEE], joursAcquis: 25 }),
    solde({ salarie: 'S1', demandes: DEMANDES, joursAcquis: 25 }));
  assert.deepEqual(solde({ salarie: 'S3', demandes: DEMANDES, joursAcquis: 25 }),
    { joursAcquis: 25, joursPris: 0, joursEnAttente: 0, solde: 25 });
});

test('un solde négatif n\'est pas ramené à zéro', () => {
  assert.equal(solde({ salarie: 'S1', demandes: DEMANDES, joursAcquis: 4 }).solde, -6);
});

const appel = (d, action, par, aujourdhui = '2026-03-01') =>
  changerEtat({ demande: d, action, par, responsable: 'R1', aujourdhui });

test('critère 9 : le responsable accepte ou refuse une demande en attente', () => {
  assert.deepEqual(appel(EN_ATTENTE, 'accepter', 'R1'), { ok: true, demande: { ...EN_ATTENTE, etat: 'acceptee' } });
  assert.deepEqual(appel(EN_ATTENTE, 'refuser', 'R1'), { ok: true, demande: { ...EN_ATTENTE, etat: 'refusee' } });
});

test('critère 10 : une autre personne que le responsable, salarié auteur compris, ne peut ni accepter ni refuser', () => {
  for (const par of ['S1', 'S2']) {
    for (const action of ['accepter', 'refuser']) {
      const resultat = appel(EN_ATTENTE, action, par);
      assert.equal(resultat.ok, false);
      assert.deepEqual(codes(resultat), ['non-autorise']);
    }
  }
});

test('critère 10 : une demande déjà acceptée ou refusée ne peut plus être acceptée', () => {
  for (const d of [ACCEPTEE, REFUSEE]) {
    const resultat = appel(d, 'accepter', 'R1');
    assert.equal(resultat.ok, false);
    assert.deepEqual(codes(resultat), ['transition-interdite']);
  }
});

test('critère 11 : le salarié annule sa demande acceptée ou en attente la veille du premier jour', () => {
  assert.deepEqual(appel(ACCEPTEE, 'annuler', 'S1', '2026-03-01'), { ok: true, demande: { ...ACCEPTEE, etat: 'annulee' } });
  assert.deepEqual(appel(EN_ATTENTE, 'annuler', 'S1', '2026-03-15'), { ok: true, demande: { ...EN_ATTENTE, etat: 'annulee' } });
});

test('critère 11 : la veille se calcule à cheval sur une année', () => {
  const nouvelAn = demande('c1', 'S1', '2026-01-01', '2026-01-02', 'acceptee');
  assert.equal(appel(nouvelAn, 'annuler', 'S1', '2025-12-31').ok, true);
  assert.deepEqual(codes(appel(nouvelAn, 'annuler', 'S1', '2026-01-01')), ['delai-depasse']);
});

test('critère 12 : l\'annulation le premier jour ou après dépasse le délai', () => {
  for (const aujourdhui of ['2026-03-02', '2026-03-03', '2026-04-01']) {
    const resultat = appel(ACCEPTEE, 'annuler', 'S1', aujourdhui);
    assert.equal(resultat.ok, false);
    assert.deepEqual(codes(resultat), ['delai-depasse'], aujourdhui);
  }
});

test('critère 12 : une autre personne que le salarié auteur ne peut pas annuler', () => {
  for (const par of ['S2', 'R1']) {
    const resultat = appel(ACCEPTEE, 'annuler', par, '2026-03-01');
    assert.equal(resultat.ok, false);
    assert.deepEqual(codes(resultat), ['non-autorise']);
  }
});

test('critère 13 : aucune action ne fait sortir une demande de l\'état refusée ou annulée', () => {
  for (const d of [REFUSEE, ANNULEE]) {
    for (const [action, par] of [['accepter', 'R1'], ['refuser', 'R1'], ['annuler', 'S1']]) {
      const resultat = appel(d, action, par, '2026-03-01');
      assert.equal(resultat.ok, false, `${d.etat}, ${action}`);
      assert.deepEqual(codes(resultat), ['transition-interdite']);
    }
  }
});

test('les motifs de changerEtat se cumulent', () => {
  assert.deepEqual(codes(appel(ANNULEE, 'annuler', 'S2', '2026-03-25')), ['delai-depasse', 'non-autorise', 'transition-interdite']);
});

function figer(objet) {
  for (const valeur of Object.values(objet)) if (valeur && typeof valeur === 'object') figer(valeur);
  return Object.freeze(objet);
}

test('critère 14 : les objets reçus par les trois fonctions restent intacts et changerEtat rend une copie', () => {
  const demandes = figer(structuredClone(DEMANDES));
  const nouvelle = figer(structuredClone(DOUZE_JOURS));
  const enAttente = figer(structuredClone(EN_ATTENTE));
  const avant = structuredClone({ demandes, nouvelle, enAttente });
  recevabilite({ demande: nouvelle, demandes, joursAcquis: 25 });
  solde({ salarie: 'S1', demandes, joursAcquis: 25 });
  const resultat = appel(enAttente, 'accepter', 'R1');
  assert.deepEqual({ demandes, nouvelle, enAttente }, avant);
  assert.notEqual(resultat.demande, enAttente);
  assert.equal(enAttente.etat, 'en-attente');
});

test('critère 15 : les résultats ne dépendent pas de la date du système', () => {
  const calculer = () => ({
    recevabilite: recevabilite({ demande: TREIZE_JOURS, demandes: DEMANDES, joursAcquis: 25 }),
    solde: solde({ salarie: 'S1', demandes: DEMANDES, joursAcquis: 25 }),
    avant: appel(ACCEPTEE, 'annuler', 'S1', '2026-03-01'),
    apres: appel(ACCEPTEE, 'annuler', 'S1', '2026-03-02'),
  });
  const reference = calculer();
  for (const maintenant of [0, Date.UTC(2026, 2, 5), Date.UTC(2099, 11, 31, 23, 59)]) {
    mock.timers.enable({ apis: ['Date'], now: maintenant });
    try {
      assert.deepEqual(calculer(), reference);
    } finally {
      mock.timers.reset();
    }
  }
});

test('critère 16 : le README décrit l\'ordre des libellés fusionnés : le jour fixe d\'abord, puis la fête mobile', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes('le jour fixe d\'abord, puis la fête mobile'));
  assert.ok(!readme.includes('dans l\'ordre chronologique de la liste'));
});

const MESSAGE_SANS_SITE = 'Le site est obligatoire : valeurs acceptées « national » ou « alsace-moselle ».';

test('critère 17 : un appel sans site lève une RangeError au message exact, sans « undefined »', () => {
  assert.ok(!MESSAGE_SANS_SITE.includes('undefined'));
  const attendu = { name: 'RangeError', message: MESSAGE_SANS_SITE };
  assert.throws(() => joursFeries(2026), attendu);
  assert.throws(() => joursOuvres({ debut: '2026-05-04', fin: '2026-05-04' }), attendu);
});

test('critère 18 : un site qui n\'est pas une chaîne lève une RangeError, pas une TypeError', () => {
  for (const site of [Symbol('x'), Object.create(null), 42, null, ['national']]) {
    assert.throws(() => joursFeries(2026, site), RangeError);
    assert.throws(() => joursOuvres({ debut: '2026-05-04', fin: '2026-05-04', site }), RangeError);
    assert.throws(() => recevabilite({ demande: { ...DOUZE_JOURS, site }, demandes: [], joursAcquis: 25 }), RangeError);
  }
});

test('un site inconnu, sous forme de chaîne, garde son message d\'erreur', () => {
  assert.throws(() => joursFeries(2026, 'paris'), { name: 'RangeError', message: /Le site « paris » est inconnu/ });
});

test('critère 19 : le README décrit le contrat de recevabilite, solde et changerEtat', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const attendu of ['recevabilite({ demande, demandes, joursAcquis })', 'solde({ salarie, demandes, joursAcquis })',
    'changerEtat({ demande, action, par, responsable, aujourdhui })', '{ id, salarie, debut, fin, site, etat }',
    '`en-attente`', '`acceptee`', '`refusee`', '`annulee`', '`accepter`', '`refuser`', '`annuler`',
    '{ recevable: true }', '{ recevable: false, motifs }', '{ joursAcquis, joursPris, joursEnAttente, solde }',
    '{ ok: true, demande }', '{ ok: false, motifs }', '`fin-avant-debut`', '`solde-insuffisant`', '`chevauchement`',
    '`non-autorise`', '`transition-interdite`', '`delai-depasse`']) {
    assert.ok(readme.includes(attendu), `le README doit mentionner ${attendu}`);
  }
});

test('les erreurs d\'appel des nouvelles fonctions lèvent une RangeError', () => {
  const base = { demande: DOUZE_JOURS, demandes: DEMANDES, joursAcquis: 25 };
  for (const joursAcquis of [-1, NaN, Infinity, '25', undefined]) {
    assert.throws(() => recevabilite({ ...base, joursAcquis }), RangeError);
    assert.throws(() => solde({ salarie: 'S1', demandes: DEMANDES, joursAcquis }), RangeError);
  }
  assert.throws(() => recevabilite({ ...base, demandes: undefined }), RangeError);
  assert.throws(() => recevabilite({ ...base, demande: null }), RangeError);
  assert.throws(() => recevabilite({ ...base, demande: { ...DOUZE_JOURS, etat: 'validee' } }), RangeError);
  assert.throws(() => recevabilite({ ...base, demande: { ...DOUZE_JOURS, debut: '2026-02-30' } }), RangeError);
  assert.throws(() => recevabilite({ ...base, demande: { ...DOUZE_JOURS, salarie: '' } }), RangeError);
  assert.throws(() => recevabilite(), RangeError);
  assert.throws(() => solde({ demandes: DEMANDES, joursAcquis: 25 }), RangeError);
  assert.throws(() => appel(EN_ATTENTE, 'valider', 'R1'), RangeError);
  assert.throws(() => appel(EN_ATTENTE, 'accepter', 'R1', '01/03/2026'), RangeError);
  assert.throws(() => changerEtat({ demande: EN_ATTENTE, action: 'accepter', par: 'R1', aujourdhui: '2026-03-01' }), RangeError);
  assert.throws(() => changerEtat(), RangeError);
});

test('le motif non-autorise de changerEtat a un libellé par action', () => {
  const attendus = {
    accepter: 'Vous n\'avez pas le droit d\'accepter cette demande.',
    refuser: 'Vous n\'avez pas le droit de refuser cette demande.',
    annuler: 'Vous n\'avez pas le droit d\'annuler cette demande.',
  };
  for (const [action, message] of Object.entries(attendus)) {
    const resultat = changerEtat({ demande: EN_ATTENTE, action, par: 'X', responsable: 'R1', aujourdhui: '2026-03-01' });
    assert.equal(resultat.motifs.find((m) => m.code === 'non-autorise').message, message, action);
  }
});

test('le message solde-insuffisant accorde « jour » au singulier en dessous de 2 et au pluriel au-delà', () => {
  const message = (nouvelle, joursAcquis) => recevabilite({ demande: nouvelle, demandes: [], joursAcquis })
    .motifs.find((m) => m.code === 'solde-insuffisant').message;
  const unJour = demande('n5', 'S1', '2026-06-01', '2026-06-01', 'en-attente');
  const deuxJours = demande('n6', 'S1', '2026-06-01', '2026-06-02', 'en-attente');
  assert.equal(message(unJour, 0), 'Votre demande compte 1 jour ouvré, mais il ne vous reste que 0 jour disponible.');
  assert.equal(message(deuxJours, 1), 'Votre demande compte 2 jours ouvrés, mais il ne vous reste que 1 jour disponible.');
  assert.equal(message(TREIZE_JOURS, 2), 'Votre demande compte 13 jours ouvrés, mais il ne vous reste que 2 jours disponibles.');
});

test('une demande de la liste dont la fin est avant le début est une erreur d\'appel, quel que soit son état ou son salarié', () => {
  for (const etat of ['en-attente', 'acceptee', 'refusee', 'annulee']) {
    for (const salarie of ['S1', 'S2']) {
      const inversee = demande('z', salarie, '2025-12-26', '2025-12-22', etat);
      assert.throws(() => recevabilite({ demande: DOUZE_JOURS, demandes: [inversee], joursAcquis: 25 }),
        (e) => e instanceof RangeError && /fin avant sa date de début/.test(e.message), `${etat}, ${salarie}`);
      assert.throws(() => solde({ salarie: 'S1', demandes: [inversee], joursAcquis: 25 }), RangeError, `${etat}, ${salarie}`);
    }
  }
});

test('une demande contrôlée sans id n\'ignore aucune demande de la liste, même sans id', () => {
  const { id, ...sansId } = TREIZE_JOURS;
  const autreSansId = { ...sansId, etat: 'acceptee' };
  assert.deepEqual(codes(recevabilite({ demande: sansId, demandes: [autreSansId], joursAcquis: 26 })), ['chevauchement']);
});

test('le README précise que la demande de même id n\'est ignorée que si la demande contrôlée a un id', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /seulement si `demande` a un `id`/);
  assert.match(readme, /Une demande de la liste dont la date de fin est avant la date de début est une erreur d'appel/);
});

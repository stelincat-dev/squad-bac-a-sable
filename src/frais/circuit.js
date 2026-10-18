// Circuit de validation d'une note de frais : soumission, validations, contrôle, paiement et refus motivé. Module pur, sans horloge ni état.

import { lireDate, verifierSalarie } from './validation.js';

/** États d'une note dans le circuit, dans l'ordre : brouillon, soumise, validée par le manager, par le directeur financier, contrôlée, payée. */
export const ETATS_NOTE = Object.freeze(['brouillon', 'soumise', 'validee-manager', 'validee-df', 'controlee', 'payee']);

/** Rôles des acteurs du circuit. */
export const ROLES = Object.freeze(['salarie', 'manager', 'directeur-financier', 'comptabilite']);

/** Actions acceptées par transitionNote. */
export const ACTIONS_NOTE = Object.freeze(['soumettre', 'valider', 'refuser', 'controler', 'payer']);

/** Seuil du directeur financier, en centimes : une note dont le total remboursable le dépasse strictement passe par lui. */
export const SEUIL_DF_CENTIMES = 150000;

/** Seuil du justificatif, en centimes : toute dépense de ce montant ou plus, hors indemnités kilométriques, doit avoir une référence. */
export const SEUIL_JUSTIFICATIF_CENTIMES = 5000;

const IK = 'indemnites-kilometriques';

// Rôles qui peuvent faire chaque action, à une étape ou à une autre du circuit.
const ROLES_PAR_ACTION = Object.freeze({
  soumettre: ['salarie'],
  valider: ['manager', 'directeur-financier'],
  refuser: ['manager', 'directeur-financier', 'comptabilite'],
  controler: ['comptabilite'],
  payer: ['comptabilite'],
});

const LIBELLE_ETAT = Object.freeze({
  brouillon: 'en brouillon',
  soumise: 'soumise',
  'validee-manager': 'validée par le manager',
  'validee-df': 'validée par le directeur financier',
  controlee: 'contrôlée par la comptabilité',
  payee: 'payée',
});

const LIBELLE_ACTION = Object.freeze({
  soumettre: 'de soumettre',
  valider: 'de valider',
  refuser: 'de refuser',
  controler: 'de contrôler',
  payer: 'd\'enregistrer le paiement de',
});

// Montant sûr : entier de centimes représentable exactement et strictement positif.
const estCentimesPositifs = (montant) => Number.isSafeInteger(montant) && montant > 0;

function verifierNoteCircuit(note) {
  if (note === null || typeof note !== 'object' || !Array.isArray(note.depenses)) {
    throw new RangeError('La note doit être un objet { salarie, depenses, etat, historique }.');
  }
  verifierSalarie(note.salarie);
  if (note.etat !== undefined && !ETATS_NOTE.includes(note.etat)) {
    throw new RangeError(`L'état de la note doit être l'un de : ${ETATS_NOTE.join(', ')}.`);
  }
  if (note.historique !== undefined && !Array.isArray(note.historique)) {
    throw new RangeError('L\'historique de la note doit être un tableau.');
  }
  if (note.dateSoumission !== undefined) lireDate(note.dateSoumission, 'soumission');
  if ((note.etat ?? 'brouillon') !== 'brouillon' && !estCentimesPositifs(note.totalRemboursableCentimes)) {
    throw new RangeError('Une note sortie du brouillon doit porter le total remboursable enregistré à sa soumission, en centimes entiers strictement positifs.');
  }
  for (const depense of note.depenses) {
    if (depense === null || typeof depense !== 'object') throw new RangeError('Chaque dépense de la note doit être un objet.');
    if (depense.nature !== IK && !estCentimesPositifs(depense.montantTtcCentimes)) {
      throw new RangeError('Le montant TTC de chaque dépense doit être un nombre entier de centimes strictement positif.');
    }
  }
}

function verifierActeur(acteur) {
  if (acteur === null || typeof acteur !== 'object' || typeof acteur.id !== 'string' || acteur.id === '') {
    throw new RangeError('L\'acteur doit être un objet { id, role }, avec un identifiant sous forme de chaîne non vide.');
  }
  if (!ROLES.includes(acteur.role)) {
    throw new RangeError(`Le rôle de l'acteur doit être l'un de : ${ROLES.join(', ')}.`);
  }
}

// Rôle attendu pour l'action à l'état de la note, ou null si l'action n'est pas possible à cet état.
function roleAttendu(action, etat, total) {
  const auDessus = total > SEUIL_DF_CENTIMES;
  switch (action) {
    case 'soumettre': return etat === 'brouillon' ? 'salarie' : null;
    case 'valider':
      if (etat === 'soumise') return 'manager';
      return etat === 'validee-manager' && auDessus ? 'directeur-financier' : null;
    case 'controler':
      return (etat === 'validee-manager' && !auDessus) || etat === 'validee-df' ? 'comptabilite' : null;
    case 'payer': return etat === 'controlee' ? 'comptabilite' : null;
    default: // refuser
      if (etat === 'soumise') return 'manager';
      if (etat === 'validee-manager') return auDessus ? 'directeur-financier' : 'comptabilite';
      return etat === 'validee-df' || etat === 'controlee' ? 'comptabilite' : null;
  }
}

const NOUVEL_ETAT = Object.freeze({
  soumettre: () => 'soumise',
  valider: (role) => (role === 'manager' ? 'validee-manager' : 'validee-df'),
  refuser: () => 'brouillon',
  controler: () => 'controlee',
  payer: () => 'payee',
});

/** Dépenses de la note, repérées par leur rang (à partir de 1), d'au moins 50 € hors indemnités kilométriques et sans référence de justificatif. */
export function justificatifsManquants(depenses) {
  if (!Array.isArray(depenses)) throw new RangeError('Les dépenses doivent être un tableau.');
  return depenses
    .map((d, index) => ({ d, rang: index + 1 }))
    .filter(({ d }) => d.nature !== IK && d.montantTtcCentimes >= SEUIL_JUSTIFICATIF_CENTIMES
      && (typeof d.justificatif !== 'string' || d.justificatif.trim() === ''))
    .map(({ rang }) => rang);
}

/** Fait avancer une note dans le circuit de validation : rend { ok: true, note } avec une copie de la note, ou { ok: false, motifs }. */
export function transitionNote({
  note, action, acteur, managerAuteur, totalRemboursableCentimes, motif, datePaiement, aujourdhui,
} = {}) {
  if (!ACTIONS_NOTE.includes(action)) {
    throw new RangeError(`L'action doit être l'une de : ${ACTIONS_NOTE.join(', ')}.`);
  }
  verifierNoteCircuit(note);
  verifierActeur(acteur);
  if (managerAuteur !== undefined && managerAuteur !== null && (typeof managerAuteur !== 'string' || managerAuteur === '')) {
    throw new RangeError('Le manager de l\'auteur doit être un identifiant sous forme de chaîne non vide, ou être absent.');
  }
  if (!estCentimesPositifs(totalRemboursableCentimes)) {
    throw new RangeError('Le total remboursable doit être un nombre entier de centimes strictement positif.');
  }
  lireDate(aujourdhui, 'du jour');
  if (action === 'payer') {
    if (datePaiement === undefined) throw new RangeError('La date de paiement est obligatoire pour enregistrer le paiement.');
    lireDate(datePaiement, 'paiement');
  }

  const etat = note.etat ?? 'brouillon';
  // Hors brouillon, le seuil se juge sur le total enregistré à la soumission, jamais sur celui de l'appel.
  const total = etat === 'brouillon' ? totalRemboursableCentimes : note.totalRemboursableCentimes;
  const attendu = roleAttendu(action, etat, total);
  const motifs = [];
  const nonAutorise = () => motifs.push({ code: 'non-autorise', message: `Vous n'avez pas le droit ${LIBELLE_ACTION[action]} cette note.` });

  if (totalRemboursableCentimes !== total) {
    motifs.push({
      code: 'total-modifie',
      message: `Vous ne pouvez pas faire cette action : le total remboursable transmis (${totalRemboursableCentimes} centimes) diffère de celui enregistré à la soumission (${total} centimes). Pour le changer, la note doit être refusée puis soumise de nouveau.`,
    });
  } else if (attendu === null) {
    motifs.push({ code: 'transition-interdite', message: `Vous ne pouvez pas faire cette action : la note est ${LIBELLE_ETAT[etat]}.` });
    if (!ROLES_PAR_ACTION[action].includes(acteur.role)) nonAutorise();
  } else if (acteur.role !== attendu) {
    nonAutorise();
  } else if (action === 'soumettre') {
    if (acteur.id !== note.salarie) nonAutorise();
    if (!managerAuteur) {
      motifs.push({ code: 'manager-absent', message: 'Vous ne pouvez pas soumettre cette note : aucun manager ne vous est rattaché.' });
    }
    const manquants = justificatifsManquants(note.depenses);
    if (manquants.length) {
      motifs.push({
        code: 'justificatif-manquant',
        message: `Ajoutez une référence de justificatif aux dépenses de 50 € ou plus (dépense${manquants.length > 1 ? 's' : ''} n° ${manquants.join(', ')}).`,
      });
    }
  } else if (action === 'valider' && acteur.id === note.salarie) {
    motifs.push({ code: 'auto-validation', message: 'Vous ne pouvez pas valider votre propre note : un autre valideur doit être désigné.' });
  } else if (attendu === 'manager' && acteur.id !== managerAuteur) {
    nonAutorise();
  }

  if (action === 'refuser' && (typeof motif !== 'string' || motif.trim() === '')) {
    motifs.push({ code: 'motif-obligatoire', message: 'Indiquez le motif de votre refus.' });
  }
  if (action === 'payer' && (datePaiement > aujourdhui || (note.dateSoumission !== undefined && datePaiement < note.dateSoumission))) {
    motifs.push({
      code: 'date-paiement-invalide',
      message: 'La date de paiement ne peut être ni dans le futur ni antérieure à la soumission de la note.',
    });
  }
  if (motifs.length) return { ok: false, motifs };

  const vers = NOUVEL_ETAT[action](acteur.role);
  const entree = { action, par: acteur.id, role: acteur.role, de: etat, vers, date: aujourdhui };
  if (action === 'refuser') entree.motif = motif.trim();
  const nouvelle = {
    ...note,
    depenses: note.depenses.map((d) => ({ ...d })),
    etat: vers,
    historique: [...(note.historique ?? []).map((e) => ({ ...e })), entree],
  };
  if (action === 'soumettre') {
    nouvelle.dateSoumission = aujourdhui;
    nouvelle.totalRemboursableCentimes = totalRemboursableCentimes;
  }
  if (action === 'refuser') delete nouvelle.totalRemboursableCentimes;
  if (action === 'payer') nouvelle.datePaiement = datePaiement;
  return { ok: true, note: nouvelle };
}

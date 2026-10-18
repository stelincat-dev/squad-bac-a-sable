// Note de frais d'un salarié pour un mois : création et ajout de dépenses contrôlées. Ne modifie jamais les objets reçus.

import { verifierAnneeBareme, verifierPuissance } from './bareme.js';
import {
  TAUX_TVA, lireDate, verifierKilometres, verifierMois, verifierMontant, verifierNature, verifierNuits, verifierSalarie,
  verifierTauxTvaPeage,
} from './validation.js';

const IK = 'indemnites-kilometriques';
// Natures sans lieu : le champ « à Paris » y est refusé et n'est pas gardé dans la copie.
const SANS_LIEU = Object.freeze(['peage', 'parking']);

/** Crée une note de frais vide { salarie, mois, depenses } pour un salarié et un mois « AAAA-MM ». */
export function creerNote({ salarie, mois } = {}) {
  verifierSalarie(salarie);
  verifierMois(mois);
  return { salarie, mois, depenses: [] };
}

// Les fonctions exportées ci-dessous servent aussi à remboursement.js ; elles ne sont pas exposées par index.js.

/** Vérifie la forme d'une note { salarie, mois, depenses } : salarié, mois et tableau de dépenses ; lève une RangeError sinon. */
export function verifierNote(note) {
  if (note === null || typeof note !== 'object' || !Array.isArray(note.depenses)) {
    throw new RangeError('La note doit être un objet { salarie, mois, depenses }, créé par creerNote.');
  }
  verifierSalarie(note.salarie);
  verifierMois(note.mois);
}

function refuserChamp(depense, champ, nature) {
  if (depense[champ] !== undefined) {
    throw new RangeError(`Le champ « ${champ} » n'est pas accepté pour une dépense de nature « ${nature} ».`);
  }
}

function verifierObjetDepense(depense) {
  if (depense === null || typeof depense !== 'object') {
    throw new RangeError('La dépense doit être un objet { date, nature, montantTtcCentimes, … }.');
  }
}

/** Contrôle les champs d'une dépense, hors date, et rend une copie sans date qui ne garde que les champs utiles à sa nature. */
export function verifierChampsDepense(depense) {
  verifierObjetDepense(depense);
  const { nature, montantTtcCentimes, tauxTva, aParis = false, justificatif, nuits, kilometres, puissance } = depense;
  verifierNature(nature);
  if (tauxTva !== undefined && !TAUX_TVA.includes(tauxTva)) {
    throw new RangeError('Le taux de TVA doit être 5,5, 10 ou 20 (en pourcentage), ou être absent.');
  }
  verifierTauxTvaPeage(nature, tauxTva);
  if (SANS_LIEU.includes(nature)) refuserChamp(depense, 'aParis', nature);
  if (typeof aParis !== 'boolean') throw new RangeError('L\'indicateur « à Paris » doit être vrai ou faux.');
  if (justificatif !== undefined && (typeof justificatif !== 'string' || justificatif === '')) {
    throw new RangeError('La référence de justificatif doit être une chaîne non vide, ou être absente.');
  }
  const copie = SANS_LIEU.includes(nature) ? { nature } : { nature, aParis };
  if (tauxTva !== undefined) copie.tauxTva = tauxTva;
  if (justificatif !== undefined) copie.justificatif = justificatif;
  if (nature === IK) {
    if (montantTtcCentimes !== undefined) {
      throw new RangeError('Une indemnité kilométrique ne se saisit pas en montant : indiquez les kilomètres, le montant est calculé.');
    }
    refuserChamp(depense, 'nuits', nature);
    verifierKilometres(kilometres);
    verifierPuissance(puissance);
    return { ...copie, kilometres, puissance };
  }
  refuserChamp(depense, 'kilometres', nature);
  refuserChamp(depense, 'puissance', nature);
  verifierMontant(montantTtcCentimes);
  copie.montantTtcCentimes = montantTtcCentimes;
  if (nature === 'hotel') {
    copie.nuits = nuits ?? 1;
    verifierNuits(copie.nuits);
  } else {
    refuserChamp(depense, 'nuits', nature);
  }
  return copie;
}

/** Contrôle une dépense, date dans le mois de la note comprise, et rend une copie qui ne garde que les champs utiles à sa nature. */
export function normaliserDepense(depense, mois) {
  verifierObjetDepense(depense);
  const { date, nature } = depense;
  verifierNature(nature);
  const { annee } = lireDate(date, 'la dépense');
  if (date.slice(0, 7) !== mois) {
    throw new RangeError(`La dépense du ${date} est hors du mois de la note (${mois}) : elle est refusée.`);
  }
  const champs = verifierChampsDepense(depense);
  if (nature === IK) verifierAnneeBareme(annee);
  return { date, ...champs };
}

function estDoublon(a, b) {
  if (a.date !== b.date || a.nature !== b.nature) return false;
  return a.nature === IK ? a.kilometres === b.kilometres : a.montantTtcCentimes === b.montantTtcCentimes;
}

/** Refuse par une RangeError une dépense normalisée qui double une des dépenses déjà présentes (même date, nature et montant, ou mêmes km). */
export function refuserDoublon(depenses, nouvelle) {
  if (depenses.some((existante) => estDoublon(existante, nouvelle))) {
    const quoi = nouvelle.nature === IK ? `${nouvelle.kilometres} km` : `${nouvelle.montantTtcCentimes} centimes`;
    throw new RangeError(`Doublon refusé : la note contient déjà une dépense « ${nouvelle.nature} » du ${nouvelle.date} pour ${quoi}.`);
  }
}

/** Ajoute une dépense contrôlée à la note et rend une nouvelle note ; refuse nature inconnue, date hors du mois et doublon. */
export function ajouterDepense(note, depense) {
  verifierNote(note);
  const nouvelle = normaliserDepense(depense, note.mois);
  refuserDoublon(note.depenses, nouvelle);
  return { ...note, depenses: [...note.depenses, nouvelle] };
}

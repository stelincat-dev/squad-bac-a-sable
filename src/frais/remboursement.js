// Montant remboursable de chaque dépense d'une note : plafonds des repas et de l'hôtel, barème kilométrique, arrondi au centime.
// Chaque dépense est revérifiée au calcul avec les contrôles de note.js : une note relue en base ou reçue d'une API ne contourne pas les plafonds.

import { indemniteKilometrique } from './bareme.js';
import { normaliserDepense, refuserDoublon, verifierChampsDepense, verifierNote } from './note.js';
import { lireDate, verifierKilometrageAnnuel, verifierNature } from './validation.js';

/** Plafonds en centimes : repas 25 € (30 € à Paris), hôtel 120 € la nuit (150 € à Paris). */
export const PLAFONDS = Object.freeze({
  repas: Object.freeze({ horsParis: 2500, paris: 3000 }),
  hotel: Object.freeze({ horsParis: 12000, paris: 15000 }),
});

/** Montant remboursable, en centimes, d'une dépense autre qu'une indemnité kilométrique, revérifiée hors date : plafonné pour le repas et l'hôtel (par nuit). */
export function montantRemboursable(depense) {
  if (depense === null || typeof depense !== 'object') throw new RangeError('La dépense doit être un objet.');
  const { nature, montantTtcCentimes, aParis = false, nuits = 1 } = depense;
  verifierNature(nature);
  if (nature === 'indemnites-kilometriques') {
    throw new RangeError('Une indemnité kilométrique se calcule avec le barème, sur l\'ensemble de la note : utilisez remboursementsNote.');
  }
  verifierChampsDepense(depense);
  if (nature === 'repas') return Math.min(montantTtcCentimes, PLAFONDS.repas[aParis ? 'paris' : 'horsParis']);
  if (nature === 'hotel') return Math.min(montantTtcCentimes, PLAFONDS.hotel[aParis ? 'paris' : 'horsParis'] * nuits);
  return montantTtcCentimes;
}

/** Montants remboursables des dépenses d'une note, revérifiées (champs, date dans le mois, doublons), dans l'ordre de la note ; le cumul kilométrique avance par date puis ordre de saisie. */
export function remboursementsNote(note, { kilometrageDejaRembourse } = {}) {
  verifierNote(note);
  const controlees = note.depenses.map((d) => normaliserDepense(d, note.mois));
  controlees.forEach((d, index) => refuserDoublon(controlees.slice(0, index), d));
  const montants = note.depenses.map((d) => (d.nature === 'indemnites-kilometriques' ? undefined : montantRemboursable(d)));
  const indemnites = note.depenses
    .map((depense, index) => ({ depense, index }))
    .filter(({ depense }) => depense.nature === 'indemnites-kilometriques')
    .sort((a, b) => (a.depense.date < b.depense.date ? -1 : a.depense.date > b.depense.date ? 1 : a.index - b.index));
  if (indemnites.length > 0 && (!Number.isInteger(kilometrageDejaRembourse) || kilometrageDejaRembourse < 0)) {
    throw new RangeError('Le kilométrage déjà remboursé dans l\'année doit être un entier positif ou nul quand la note contient des indemnités kilométriques.');
  }
  if (indemnites.length > 0) verifierKilometrageAnnuel(kilometrageDejaRembourse, 'Le kilométrage déjà remboursé dans l\'année');
  let cumul = kilometrageDejaRembourse;
  for (const { depense, index } of indemnites) {
    const { annee } = lireDate(depense.date, 'la dépense');
    montants[index] = indemniteKilometrique({ annee, puissance: depense.puissance, cumulAvant: cumul, kilometres: depense.kilometres });
    cumul += depense.kilometres;
  }
  return note.depenses.map((depense, index) => ({ ...depense, montantRemboursableCentimes: montants[index] }));
}

// Totaux d'une note de frais : total remboursable et TVA récupérable pour la comptabilité. Calculs en centimes entiers, sans état.

import { TAUX_TVA, TAUX_TVA_PEAGE, verifierMontant, verifierNature, verifierTauxTvaPeage } from './validation.js';

const SANS_TVA = Object.freeze(['indemnites-kilometriques', 'autre']);

/** Vérifie un taux de TVA : absent, ou 5,5, 10 ou 20 (en pourcentage) ; lève une RangeError sinon. */
export function verifierTauxTva(tauxTva) {
  if (tauxTva !== undefined && !TAUX_TVA.includes(tauxTva)) {
    throw new RangeError('Le taux de TVA doit être 5,5 %, 10 % ou 20 %, ou être absent : la dépense n\'est pas prise en compte.');
  }
}

// Contrôle une dépense de note, telle que rendue par remboursementsNote, avant tout calcul.
function verifierLigne(depense) {
  if (depense === null || typeof depense !== 'object') {
    throw new RangeError('La dépense doit être un objet { nature, montantTtcCentimes, montantRemboursableCentimes, … }, rendu par remboursementsNote.');
  }
  const { nature, montantTtcCentimes, montantRemboursableCentimes, tauxTva } = depense;
  verifierNature(nature);
  verifierTauxTva(tauxTva);
  verifierTauxTvaPeage(nature, tauxTva);
  if (!Number.isInteger(montantRemboursableCentimes) || montantRemboursableCentimes < 0) {
    throw new RangeError('Le montant remboursable doit être un nombre entier de centimes, positif ou nul.');
  }
  if (nature === 'indemnites-kilometriques') return;
  verifierMontant(montantTtcCentimes);
  if (montantRemboursableCentimes > montantTtcCentimes) {
    throw new RangeError('Le montant remboursable ne peut pas dépasser le montant TTC de la dépense.');
  }
}

function verifierLignes(depenses) {
  if (!Array.isArray(depenses)) {
    throw new RangeError('Les dépenses de la note doivent former un tableau, celui rendu par remboursementsNote.');
  }
  depenses.forEach(verifierLigne);
}

/** TVA récupérable d'une dépense, en centimes : TVA du justificatif au taux saisi (toujours 20 % pour un péage), au prorata de la part remboursée ; 0 sans taux, pour les indemnités kilométriques et « autre ». */
export function tvaRecuperableDepense(depense) {
  verifierLigne(depense);
  const { nature, montantTtcCentimes, montantRemboursableCentimes } = depense;
  const tauxTva = nature === 'peage' ? TAUX_TVA_PEAGE : depense.tauxTva;
  if (SANS_TVA.includes(nature) || tauxTva === undefined) return 0;
  const millieme = Math.round(tauxTva * 10);
  const tvaJustificatif = Math.round((montantTtcCentimes * millieme) / (1000 + millieme));
  if (montantRemboursableCentimes === montantTtcCentimes) return tvaJustificatif;
  return Math.round((tvaJustificatif * montantRemboursableCentimes) / montantTtcCentimes);
}

/** Total remboursable de la note, en centimes : somme des montants remboursables des dépenses, déjà arrondis, sans nouvel arrondi. */
export function totalRemboursableNote(depenses) {
  verifierLignes(depenses);
  return depenses.reduce((total, depense) => total + depense.montantRemboursableCentimes, 0);
}

/** TVA récupérable de la note, en centimes : somme des TVA récupérables de chaque dépense. */
export function tvaRecuperableNote(depenses) {
  verifierLignes(depenses);
  return depenses.reduce((total, depense) => total + tvaRecuperableDepense(depense), 0);
}

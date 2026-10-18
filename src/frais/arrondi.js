// Arrondi des montants du module de frais, calculé en entiers pour éviter les erreurs de virgule flottante.

/** Arrondi commercial au centime d'un montant en millièmes d'euro (entier positif ou nul) : la demie va au centime supérieur. */
export function arrondirCentime(milliemes) {
  if (!Number.isInteger(milliemes) || milliemes < 0) {
    throw new RangeError('Le montant à arrondir doit être un nombre entier de millièmes d\'euro, positif ou nul.');
  }
  return Math.round(milliemes / 10);
}

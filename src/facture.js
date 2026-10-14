// Calcul d'une facture : lignes, remise et TVA. Montants en centimes pour éviter les arrondis flottants.

/** Total hors taxes des lignes { quantite, prixUnitaireCentimes }. */
export function totalHt(lignes) {
  return lignes.reduce((total, l) => total + l.quantite * l.prixUnitaireCentimes, 0);
}

/** Remise en pourcentage (0 à 100), arrondie au centime. */
export function appliquerRemise(montantCentimes, pourcentage) {
  if (pourcentage < 0 || pourcentage > 100) throw new RangeError('La remise est comprise entre 0 et 100 %.');
  return Math.round(montantCentimes * (100 - pourcentage) / 100);
}

/** Montant TTC pour un taux de TVA en pourcentage, arrondi au centime. */
export function totalTtc(montantHtCentimes, tauxTva = 20) {
  return Math.round(montantHtCentimes * (100 + tauxTva) / 100);
}

/** Paliers de remise sur le HT avant remise, seuils en centimes (0 €, 1 000 €, 5 000 €, 10 000 €), triés par seuil croissant. */
export const PALIERS_REMISE = Object.freeze([
  Object.freeze({ seuilCentimes: 0, pourcentage: 0 }),
  Object.freeze({ seuilCentimes: 100000, pourcentage: 5 }),
  Object.freeze({ seuilCentimes: 500000, pourcentage: 10 }),
  Object.freeze({ seuilCentimes: 1000000, pourcentage: 15 }),
]);

function verifierMontantHt(montantHtCentimes) {
  if (typeof montantHtCentimes !== 'number' || !Number.isInteger(montantHtCentimes)) {
    throw new RangeError('Le montant HT doit être un nombre entier de centimes.');
  }
  if (montantHtCentimes < 0) throw new RangeError('Le montant HT doit être positif ou nul.');
}

/** Pourcentage de remise (entier, ex. 5) du palier dont le seuil, inclus, est le plus haut sans dépasser le montant HT. */
export function pourcentageRemisePalier(montantHtCentimes, paliers = PALIERS_REMISE) {
  verifierMontantHt(montantHtCentimes);
  let pourcentage = 0;
  for (const palier of paliers) {
    if (montantHtCentimes >= palier.seuilCentimes) pourcentage = palier.pourcentage;
  }
  return pourcentage;
}

/** Montant HT remisé du pourcentage de son palier, sur le montant entier, arrondi au centime. */
export function montantRemiseParPalier(montantHtCentimes, paliers = PALIERS_REMISE) {
  return appliquerRemise(montantHtCentimes, pourcentageRemisePalier(montantHtCentimes, paliers));
}

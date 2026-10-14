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

// Point d'entrée du module de frais : notes de frais, dépenses et montants remboursables. Module pur, sans horloge ni état.

export { NATURES, TAUX_TVA } from './validation.js';
export { BAREME_KILOMETRIQUE, ANNEES_BAREME, SEUILS_TRANCHES, bareme, indemniteKilometrique } from './bareme.js';
export { arrondirCentime } from './arrondi.js';
export { creerNote, ajouterDepense } from './note.js';
export { PLAFONDS, montantRemboursable, remboursementsNote } from './remboursement.js';

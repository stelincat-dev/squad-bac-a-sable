// Point d'entrée du module de frais : notes de frais, dépenses, montants remboursables, totaux de la note et circuit de validation. Module pur, sans horloge ni état.

export { NATURES, TAUX_TVA, TAUX_TVA_PEAGE } from './validation.js';
export { BAREME_KILOMETRIQUE, ANNEES_BAREME, SEUILS_TRANCHES, bareme, indemniteKilometrique } from './bareme.js';
export { arrondirCentime } from './arrondi.js';
export { creerNote, ajouterDepense } from './note.js';
export { PLAFONDS, montantRemboursable, remboursementsNote } from './remboursement.js';
export { verifierTauxTva, tvaRecuperableDepense, totalRemboursableNote, tvaRecuperableNote } from './totaux.js';
export {
  ETATS_NOTE, ROLES, ACTIONS_NOTE, SEUIL_DF_CENTIMES, SEUIL_JUSTIFICATIF_CENTIMES, justificatifsManquants, transitionNote,
} from './circuit.js';

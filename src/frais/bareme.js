// Barème kilométrique fiscal 2025-2026 des voitures, fourni par le client. Calculs en entiers : taux en millièmes d'euro par km, parts fixes en centimes.

import { arrondirCentime } from './arrondi.js';
import { verifierKilometrageAnnuel, verifierKilometres } from './validation.js';

const LIGNES_2025_2026 = Object.freeze([
  Object.freeze({ puissance: 3, taux1: 529, taux2: 316, fixe2: 106500, taux3: 370 }),
  Object.freeze({ puissance: 4, taux1: 606, taux2: 340, fixe2: 133000, taux3: 407 }),
  Object.freeze({ puissance: 5, taux1: 636, taux2: 357, fixe2: 139500, taux3: 427 }),
  Object.freeze({ puissance: 6, taux1: 665, taux2: 374, fixe2: 145700, taux3: 447 }),
  Object.freeze({ puissance: 7, taux1: 697, taux2: 394, fixe2: 151500, taux3: 470 }),
]);

/** Barème kilométrique par année : une ligne par puissance (3 à 7 CV, la dernière vaut pour 7 CV et plus). */
export const BAREME_KILOMETRIQUE = Object.freeze({ 2025: LIGNES_2025_2026, 2026: LIGNES_2025_2026 });

/** Années couvertes par le barème kilométrique. */
export const ANNEES_BAREME = Object.freeze([2025, 2026]);

/** Seuils des tranches du barème, en km de l'année : jusqu'à 5 000 km, puis jusqu'à 20 000 km, puis au-delà. */
export const SEUILS_TRANCHES = Object.freeze([5000, 20000]);

/** Vérifie que l'année est couverte par le barème (2025 ou 2026) ; lève une RangeError sinon. */
export function verifierAnneeBareme(annee) {
  if (!ANNEES_BAREME.includes(annee)) {
    throw new RangeError(`Le barème kilométrique ne couvre que les années ${ANNEES_BAREME.join(' et ')} : une indemnité de l'année ${Number.isInteger(annee) ? annee : 'reçue'} est refusée.`);
  }
}

/** Vérifie la puissance fiscale du véhicule : un entier de 3 CV ou plus ; lève une RangeError sinon. */
export function verifierPuissance(puissance) {
  if (!Number.isInteger(puissance) || puissance < 3) {
    throw new RangeError('La puissance du véhicule doit être un nombre entier de chevaux fiscaux, de 3 CV ou plus.');
  }
}

/** Valeur du barème, en millièmes d'euro, pour d km parcourus dans l'année (100 000 km au plus) avec un véhicule de cette puissance. */
export function bareme(annee, puissance, d) {
  verifierAnneeBareme(annee);
  verifierPuissance(puissance);
  verifierKilometrageAnnuel(d, 'Le kilométrage de l\'année');
  const ligne = BAREME_KILOMETRIQUE[annee][Math.min(puissance, 7) - 3];
  if (d <= SEUILS_TRANCHES[0]) return d * ligne.taux1;
  if (d <= SEUILS_TRANCHES[1]) return d * ligne.taux2 + ligne.fixe2 * 10;
  return d * ligne.taux3;
}

/** Indemnité kilométrique d'un trajet, en centimes : barème(cumul après) − barème(cumul avant), arrondie une seule fois au centime. */
export function indemniteKilometrique({ annee, puissance, cumulAvant, kilometres }) {
  verifierKilometres(kilometres);
  verifierKilometrageAnnuel(cumulAvant, 'Le kilométrage déjà remboursé dans l\'année');
  const milliemes = bareme(annee, puissance, cumulAvant + kilometres) - bareme(annee, puissance, cumulAvant);
  return arrondirCentime(milliemes);
}

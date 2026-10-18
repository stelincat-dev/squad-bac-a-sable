// Contrôles communs du module de frais : natures, taux de TVA, dates « AAAA-MM-JJ », mois « AAAA-MM » et salarié. Calculs en UTC, sans horloge ni état.

/** Natures de dépense acceptées : repas, hôtel, transport, indemnités kilométriques, autre, péage et parking. */
export const NATURES = Object.freeze(['repas', 'hotel', 'transport', 'indemnites-kilometriques', 'autre', 'peage', 'parking']);

/** Taux de TVA acceptés, en pourcentage : 5,5 %, 10 % et 20 %. */
export const TAUX_TVA = Object.freeze([5.5, 10, 20]);

/** Taux de TVA d'un péage, en pourcentage : seul taux admis, appliqué aussi quand aucun taux n'est saisi. */
export const TAUX_TVA_PEAGE = 20;

/** Vérifie qu'un péage porte le taux de 20 % ou aucun taux ; lève une RangeError sinon, sans effet sur les autres natures. */
export function verifierTauxTvaPeage(nature, tauxTva) {
  if (nature === 'peage' && tauxTva !== undefined && tauxTva !== TAUX_TVA_PEAGE) {
    throw new RangeError('Le taux de TVA d\'un péage est de 20 % : saisissez 20 % ou laissez le taux vide.');
  }
}

/** Lit une date « AAAA-MM-JJ » qui existe et rend { annee, mois, jour } ; lève une RangeError sinon. */
export function lireDate(texte, nom) {
  const m = typeof texte === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte) : null;
  if (!m) throw new RangeError(`La date de ${nom} doit être au format AAAA-MM-JJ.`);
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) {
    throw new RangeError(`La date de ${nom} « ${texte} » n'existe pas.`);
  }
  return { annee, mois, jour };
}

/** Vérifie un mois « AAAA-MM » (mois de 01 à 12) ; lève une RangeError sinon. */
export function verifierMois(texte) {
  const m = typeof texte === 'string' ? /^(\d{4})-(\d{2})$/.exec(texte) : null;
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
    throw new RangeError('Le mois de la note doit être au format AAAA-MM, avec un mois de 01 à 12.');
  }
}

/** Vérifie un identifiant de salarié : une chaîne non vide ; lève une RangeError sinon. */
export function verifierSalarie(salarie) {
  if (typeof salarie !== 'string' || salarie === '') {
    throw new RangeError('Le salarié de la note doit être un identifiant sous forme de chaîne non vide.');
  }
}

/** Vérifie une nature de dépense ; le message nomme la nature refusée quand c'est une chaîne. */
export function verifierNature(nature) {
  if (typeof nature !== 'string') {
    throw new RangeError(`La nature de la dépense doit être une chaîne : valeurs acceptées ${NATURES.join(', ')}.`);
  }
  if (!NATURES.includes(nature)) {
    throw new RangeError(`La nature de dépense « ${nature} » est inconnue : valeurs acceptées ${NATURES.join(', ')}.`);
  }
}

/** Vérifie un montant TTC : un nombre entier de centimes strictement positif. */
export function verifierMontant(montantTtcCentimes) {
  if (!Number.isInteger(montantTtcCentimes) || montantTtcCentimes <= 0) {
    throw new RangeError('Le montant TTC doit être un nombre entier de centimes strictement positif.');
  }
}

/** Vérifie un nombre de kilomètres : un entier strictement positif. */
export function verifierKilometres(kilometres) {
  if (!Number.isInteger(kilometres) || kilometres <= 0) {
    throw new RangeError('Le nombre de kilomètres doit être un entier strictement positif.');
  }
}

/** Vérifie un nombre de nuits d'hôtel : un entier supérieur ou égal à 1. */
export function verifierNuits(nuits) {
  if (!Number.isInteger(nuits) || nuits < 1) {
    throw new RangeError('Le nombre de nuits d\'hôtel doit être un entier supérieur ou égal à 1.');
  }
}

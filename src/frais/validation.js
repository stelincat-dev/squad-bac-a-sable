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

/** Montant TTC maximal d'une dépense, en centimes : 10 000,00 € (réponse 1 du client). */
export const MONTANT_MAX_CENTIMES = 1000000;

/** Kilomètres maximaux d'une indemnité kilométrique, pour un trajet : 2 000 km (réponse 2 du client). */
export const KILOMETRES_MAX_TRAJET = 2000;

/** Kilométrage annuel maximal, déjà remboursé ou cumulé après un trajet : 100 000 km (réponse 3 du client). */
export const KILOMETRAGE_ANNUEL_MAX = 100000;

/** Nombre maximal de nuits d'une dépense d'hôtel : 31 (réponse 4 du client). */
export const NUITS_MAX = 31;

/** Vérifie un montant TTC : un nombre entier de centimes strictement positif, de 10 000,00 € au plus. */
export function verifierMontant(montantTtcCentimes) {
  if (!Number.isSafeInteger(montantTtcCentimes) || montantTtcCentimes <= 0) {
    throw new RangeError('Le montant TTC doit être un nombre entier de centimes strictement positif.');
  }
  if (montantTtcCentimes > MONTANT_MAX_CENTIMES) {
    throw new RangeError('Le montant TTC d\'une dépense est limité à 10 000,00 € (1 000 000 centimes) : la dépense est refusée.');
  }
}

/** Vérifie un nombre de kilomètres d'un trajet : un entier strictement positif, de 2 000 km au plus. */
export function verifierKilometres(kilometres) {
  if (!Number.isSafeInteger(kilometres) || kilometres <= 0) {
    throw new RangeError('Le nombre de kilomètres doit être un entier strictement positif.');
  }
  if (kilometres > KILOMETRES_MAX_TRAJET) {
    throw new RangeError('Le nombre de kilomètres d\'une indemnité kilométrique est limité à 2 000 km par trajet.');
  }
}

/** Vérifie un kilométrage de l'année : un entier positif ou nul, de 100 000 km au plus ; le message commence par le libellé reçu. */
export function verifierKilometrageAnnuel(kilometrage, libelle) {
  if (!Number.isSafeInteger(kilometrage) || kilometrage < 0) {
    throw new RangeError(`${libelle} doit être un entier positif ou nul.`);
  }
  if (kilometrage > KILOMETRAGE_ANNUEL_MAX) {
    throw new RangeError(`${libelle} est limité à 100 000 km par an.`);
  }
}

/** Vérifie un nombre de nuits d'hôtel : un entier de 1 à 31. */
export function verifierNuits(nuits) {
  if (!Number.isSafeInteger(nuits) || nuits < 1) {
    throw new RangeError('Le nombre de nuits d\'hôtel doit être un entier supérieur ou égal à 1.');
  }
  if (nuits > NUITS_MAX) {
    throw new RangeError('Le nombre de nuits d\'hôtel d\'une dépense est limité à 31.');
  }
}

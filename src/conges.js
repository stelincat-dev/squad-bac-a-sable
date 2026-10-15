// Décompte des congés : jours fériés d'un site et jours ouvrés d'une demande. Dates « AAAA-MM-JJ », calculs en UTC, sans horloge ni état.

/** Sites acceptés : la France métropolitaine et l'Alsace-Moselle, qui a deux jours fériés de plus. */
export const SITES = Object.freeze(['national', 'alsace-moselle']);

const ANNEE_MIN = 2000;
const ANNEE_MAX = 2100;
const MS_PAR_JOUR = 86400000;

const FERIES_FIXES = Object.freeze([
  Object.freeze({ mois: 1, jour: 1, libelle: 'Jour de l\'an' }),
  Object.freeze({ mois: 5, jour: 1, libelle: 'Fête du Travail' }),
  Object.freeze({ mois: 5, jour: 8, libelle: 'Victoire 1945' }),
  Object.freeze({ mois: 7, jour: 14, libelle: 'Fête nationale' }),
  Object.freeze({ mois: 8, jour: 15, libelle: 'Assomption' }),
  Object.freeze({ mois: 11, jour: 1, libelle: 'Toussaint' }),
  Object.freeze({ mois: 11, jour: 11, libelle: 'Armistice 1918' }),
  Object.freeze({ mois: 12, jour: 25, libelle: 'Noël' }),
]);

function verifierSite(site) {
  if (!SITES.includes(site)) {
    throw new RangeError(`Le site « ${site} » est inconnu : valeurs acceptées « national » ou « alsace-moselle ».`);
  }
}

function verifierAnnee(annee) {
  if (!Number.isInteger(annee) || annee < ANNEE_MIN || annee > ANNEE_MAX) {
    throw new RangeError(`L'année doit être un entier compris entre ${ANNEE_MIN} et ${ANNEE_MAX}.`);
  }
}

// Lit une date « AAAA-MM-JJ » et rend son horodatage UTC à minuit, après avoir vérifié qu'elle existe.
function lireDate(texte, nom) {
  const m = typeof texte === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte) : null;
  if (!m) throw new RangeError(`La date de ${nom} doit être au format AAAA-MM-JJ.`);
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(annee, mois - 1, jour);
  const d = new Date(t);
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) {
    throw new RangeError(`La date de ${nom} « ${texte} » n'existe pas.`);
  }
  return t;
}

function formater(t) {
  return new Date(t).toISOString().slice(0, 10);
}

// Dimanche de Pâques, algorithme grégorien anonyme (Meeus/Jones/Butcher), en horodatage UTC.
function paques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(annee, mois - 1, jour);
}

/** Jours fériés d'une année (2000 à 2100) pour un site, en tableau d'objets { date, libelle } triés par date. */
export function joursFeries(annee, site) {
  verifierAnnee(annee);
  verifierSite(site);
  const p = paques(annee);
  const feries = FERIES_FIXES.map(({ mois, jour, libelle }) => ({ t: Date.UTC(annee, mois - 1, jour), libelle }));
  feries.push(
    { t: p + 1 * MS_PAR_JOUR, libelle: 'Lundi de Pâques' },
    { t: p + 39 * MS_PAR_JOUR, libelle: 'Ascension' },
    { t: p + 50 * MS_PAR_JOUR, libelle: 'Lundi de Pentecôte' },
  );
  if (site === 'alsace-moselle') {
    feries.push(
      { t: p - 2 * MS_PAR_JOUR, libelle: 'Vendredi saint' },
      { t: Date.UTC(annee, 11, 26), libelle: 'Saint Étienne' },
    );
  }
  return feries.sort((x, y) => x.t - y.t).map(({ t, libelle }) => ({ date: formater(t), libelle }));
}

/** Jours ouvrés d'une demande { debut, fin, site }, bornes comprises, hors week-ends et jours fériés du site : rend { joursOuvres }. */
export function joursOuvres({ debut, fin, site } = {}) {
  const tDebut = lireDate(debut, 'début');
  const tFin = lireDate(fin, 'fin');
  verifierSite(site);
  if (tFin < tDebut) throw new RangeError('La date de fin est avant la date de début.');
  const anneeDebut = new Date(tDebut).getUTCFullYear();
  const anneeFin = new Date(tFin).getUTCFullYear();
  const feries = new Set();
  for (let annee = anneeDebut; annee <= anneeFin; annee++) {
    for (const { date } of joursFeries(annee, site)) feries.add(date);
  }
  let n = 0;
  for (let t = tDebut; t <= tFin; t += MS_PAR_JOUR) {
    const jourSemaine = new Date(t).getUTCDay();
    if (jourSemaine !== 0 && jourSemaine !== 6 && !feries.has(formater(t))) n++;
  }
  return { joursOuvres: n };
}

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
  if (site === undefined) {
    throw new RangeError('Le site est obligatoire : valeurs acceptées « national » ou « alsace-moselle ».');
  }
  // Type contrôlé avant toute conversion : un Symbol ou un objet sans prototype lève une RangeError, pas une TypeError.
  if (typeof site !== 'string') {
    throw new RangeError('Le site doit être une chaîne de caractères : valeurs acceptées « national » ou « alsace-moselle ».');
  }
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

/** Jours fériés d'une année (2000 à 2100) pour un site, en tableau d'objets { date, libelle } triés par date, une seule entrée par date. */
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
      { t: Date.UTC(annee, 11, 26), libelle: 'Saint-Étienne' },
    );
  }
  // Tri stable : deux fêtes du même jour (ex. 2008-05-01) gardent l'ordre de la liste et sont fusionnées en une entrée.
  const resultat = [];
  for (const { t, libelle } of feries.sort((x, y) => x.t - y.t)) {
    const date = formater(t);
    const precedent = resultat[resultat.length - 1];
    if (precedent && precedent.date === date) precedent.libelle += ` et ${libelle}`;
    else resultat.push({ date, libelle });
  }
  return resultat;
}

/** Jours ouvrés d'une demande { debut, fin, site }, bornes comprises, hors week-ends et jours fériés du site : rend { joursOuvres }. */
export function joursOuvres(demande) {
  if (demande === null || typeof demande !== 'object') {
    throw new RangeError('La demande doit être un objet { debut, fin, site }.');
  }
  const { debut, fin, site } = demande;
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

/** États d'une demande de congé : en attente de décision, acceptée, refusée ou annulée (ces deux derniers sont définitifs). */
export const ETATS = Object.freeze(['en-attente', 'acceptee', 'refusee', 'annulee']);

/** Actions acceptées par changerEtat. */
export const ACTIONS = Object.freeze(['accepter', 'refuser', 'annuler']);

const ETATS_ACTIFS = Object.freeze(['en-attente', 'acceptee']);

function verifierPersonne(valeur, nom) {
  if (typeof valeur !== 'string' || valeur === '') {
    throw new RangeError(`${nom} doit être un identifiant sous forme de chaîne non vide.`);
  }
}

// Contrôle une demande { id, salarie, debut, fin, site, etat } ; l'ordre des dates n'est pas contrôlé ici.
function verifierDemande(demande) {
  if (demande === null || typeof demande !== 'object') {
    throw new RangeError('La demande doit être un objet { id, salarie, debut, fin, site, etat }.');
  }
  verifierPersonne(demande.salarie, 'Le salarié de la demande');
  lireDate(demande.debut, 'début');
  lireDate(demande.fin, 'fin');
  verifierSite(demande.site);
  if (!ETATS.includes(demande.etat)) {
    throw new RangeError('L\'état de la demande doit être « en-attente », « acceptee », « refusee » ou « annulee ».');
  }
}

function verifierDemandes(demandes) {
  if (!Array.isArray(demandes)) throw new RangeError('La liste des demandes doit être un tableau.');
  for (const d of demandes) verifierDemande(d);
}

function verifierJoursAcquis(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw new RangeError('Les jours acquis doivent être un nombre positif ou nul.');
  }
}

// Jours d'une demande : ses jours ouvrés sur son propre site.
function joursDemande({ debut, fin, site }) {
  return joursOuvres({ debut, fin, site }).joursOuvres;
}

// Deux intervalles de dates « AAAA-MM-JJ » déjà validées, bornes comprises, en dates calendaires.
function seChevauchent(a, b) {
  return a.debut <= b.fin && b.debut <= a.fin;
}

// Demandes acceptées ou en attente du salarié, sauf celle qui porte l'identifiant exclu.
function demandesActives(salarie, demandes, idExclu) {
  return demandes.filter((d) => d.salarie === salarie && ETATS_ACTIFS.includes(d.etat)
    && (idExclu === undefined || d.id !== idExclu));
}

function somme(demandes) {
  return demandes.reduce((total, d) => total + joursDemande(d), 0);
}

/** Recevabilité d'une demande au regard des dates, du solde disponible et des chevauchements : rend { recevable: true } ou { recevable: false, motifs }. */
export function recevabilite({ demande, demandes, joursAcquis } = {}) {
  verifierDemande(demande);
  verifierDemandes(demandes);
  verifierJoursAcquis(joursAcquis);
  if (demande.fin < demande.debut) {
    return {
      recevable: false,
      motifs: [{ code: 'fin-avant-debut', message: 'La date de fin de votre demande est antérieure à sa date de début.' }],
    };
  }
  const actives = demandesActives(demande.salarie, demandes, demande.id);
  const motifs = [];
  const autre = actives.find((d) => seChevauchent(d, demande));
  if (autre) {
    motifs.push({
      code: 'chevauchement',
      message: `Votre demande chevauche une autre de vos demandes, du ${autre.debut} au ${autre.fin}.`,
    });
  }
  const jours = joursDemande(demande);
  const disponible = joursAcquis - somme(actives);
  if (jours > disponible) {
    motifs.push({
      code: 'solde-insuffisant',
      message: `Votre demande compte ${jours} jours ouvrés, mais il ne vous reste que ${Math.max(disponible, 0)} jours disponibles.`,
    });
  }
  return motifs.length ? { recevable: false, motifs } : { recevable: true };
}

/** Solde d'un salarié : jours acquis moins jours acceptés, les jours en attente étant donnés à part ; rend { joursAcquis, joursPris, joursEnAttente, solde }. */
export function solde({ salarie, demandes, joursAcquis } = {}) {
  verifierPersonne(salarie, 'Le salarié');
  verifierDemandes(demandes);
  verifierJoursAcquis(joursAcquis);
  const siennes = demandes.filter((d) => d.salarie === salarie);
  const joursPris = somme(siennes.filter((d) => d.etat === 'acceptee'));
  const joursEnAttente = somme(siennes.filter((d) => d.etat === 'en-attente'));
  return { joursAcquis, joursPris, joursEnAttente, solde: joursAcquis - joursPris };
}

const NOUVEL_ETAT = Object.freeze({ accepter: 'acceptee', refuser: 'refusee', annuler: 'annulee' });
const LIBELLE_ETAT = Object.freeze({ 'en-attente': 'en attente', acceptee: 'acceptée', refusee: 'refusée', annulee: 'annulée' });

/** Changement d'état d'une demande (accepter, refuser par le responsable ; annuler par le salarié au plus tard la veille) : rend { ok: true, demande } avec une copie, ou { ok: false, motifs }. */
export function changerEtat({ demande, action, par, responsable, aujourdhui } = {}) {
  if (!ACTIONS.includes(action)) {
    throw new RangeError('L\'action doit être « accepter », « refuser » ou « annuler ».');
  }
  verifierDemande(demande);
  verifierPersonne(par, 'L\'auteur de l\'action');
  lireDate(aujourdhui, 'du jour');
  const motifs = [];
  if (action === 'annuler') {
    if (par !== demande.salarie) {
      motifs.push({ code: 'non-autorise', message: 'Vous n\'avez pas le droit d\'annuler cette demande : seul le salarié qui l\'a déposée le peut.' });
    }
    if (!ETATS_ACTIFS.includes(demande.etat)) {
      motifs.push({ code: 'transition-interdite', message: `Vous ne pouvez pas annuler cette demande : elle est déjà ${LIBELLE_ETAT[demande.etat]}.` });
    }
    if (aujourdhui >= demande.debut) {
      motifs.push({ code: 'delai-depasse', message: 'Vous ne pouvez plus annuler cette demande : l\'annulation doit intervenir au plus tard la veille du premier jour de congé.' });
    }
  } else {
    verifierPersonne(responsable, 'Le responsable');
    if (par !== responsable) {
      motifs.push({ code: 'non-autorise', message: `Vous n'avez pas le droit de ${action} cette demande : seul le responsable du salarié le peut.` });
    }
    if (demande.etat !== 'en-attente') {
      motifs.push({ code: 'transition-interdite', message: `Vous ne pouvez pas ${action} cette demande : elle est déjà ${LIBELLE_ETAT[demande.etat]}.` });
    }
  }
  return motifs.length ? { ok: false, motifs } : { ok: true, demande: { ...demande, etat: NOUVEL_ETAT[action] } };
}

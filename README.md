# squad-bac-a-sable

Dépôt d'essai de l'agent de code de Squad+ (issue stelincat-dev/squad_factory#9). L'agent y travaille sur une branche par ticket et ouvre une pull request ; le merge reste une décision humaine.

```bash
npm test
```

Idées de tickets d'essai : ajouter une fonction de remise par palier, refuser une quantité négative, arrondir la TVA ligne par ligne.

## Contrat du module de congés (`src/conges.js`)

Brique de calcul pure, appelée par l'intranet RH : elle ne lit jamais l'horloge du système, n'écrit aucun fichier, ne garde aucun état entre deux appels et n'affiche rien. Les mêmes entrées donnent toujours les mêmes résultats.

- **Dates** : chaînes `AAAA-MM-JJ` (ex. `2026-05-01`), en entrée comme en sortie. Les calculs se font en UTC, indépendamment du fuseau de la machine.
- **Sites** acceptés : `national` (jours fériés de France métropolitaine) et `alsace-moselle` (les mêmes, plus le Vendredi saint et le 26 décembre).
- **Années** : entiers de 2000 à 2100.

### `joursFeries(annee, site)`

- `annee` : entier de 2000 à 2100.
- `site` : `national` ou `alsace-moselle`.
- Rend un tableau d'objets `{ date, libelle }` triés par date croissante : `date` au format `AAAA-MM-JJ`, `libelle` texte non vide (ex. `Lundi de Pâques`). Fêtes mobiles calculées pour toute année de la plage (lundi de Pâques, Ascension, lundi de Pentecôte, et Vendredi saint en Alsace-Moselle). Une seule entrée par date : quand deux fêtes tombent le même jour, elles sont fusionnées en une entrée dont le libellé réunit les deux, le jour fixe d'abord, puis la fête mobile (ex. en 2008, `{ date: '2008-05-01', libelle: 'Fête du Travail et Ascension' }`). Sur le site `national`, 11 dates par an en général, moins quand deux fêtes tombent le même jour ; en `alsace-moselle`, 13 dates par an en général, moins quand deux fêtes tombent le même jour.

```js
import { joursFeries } from './src/conges.js';
joursFeries(2026, 'alsace-moselle');
// [{ date: '2026-01-01', libelle: "Jour de l'an" }, { date: '2026-04-03', libelle: 'Vendredi saint' }, …]
```

### `joursOuvres({ debut, fin, site })`

- `debut`, `fin` : dates `AAAA-MM-JJ`, bornes comprises (journées entières).
- `site` : `national` ou `alsace-moselle`.
- Rend un objet `{ joursOuvres }` : le nombre de jours consommés, hors samedis, dimanches et jours fériés du site. Un jour férié tombé un week-end n'est retiré qu'une fois. Une demande peut couvrir plusieurs années.

```js
import { joursOuvres } from './src/conges.js';
joursOuvres({ debut: '2025-12-22', fin: '2025-12-26', site: 'national' });       // { joursOuvres: 4 }
joursOuvres({ debut: '2025-12-22', fin: '2025-12-26', site: 'alsace-moselle' }); // { joursOuvres: 3 }
```

### Demandes de congé

Une demande est un objet `{ id, salarie, debut, fin, site, etat }` :

- `id` : identifiant de la demande, transmis par l'intranet ;
- `salarie` : identifiant du salarié auteur, chaîne non vide ;
- `debut`, `fin` : dates `AAAA-MM-JJ`, bornes comprises (journées entières) ;
- `site` : `national` ou `alsace-moselle` ; les jours d'une demande sont ses jours ouvrés sur ce site, calculés par `joursOuvres` ;
- `etat` : `en-attente`, `acceptee`, `refusee` ou `annulee`. Les états `refusee` et `annulee` sont définitifs.

Les trois fonctions suivantes ne modifient jamais les objets reçus et ne lisent jamais l'horloge : la date du jour est toujours transmise par l'appelant. Un refus métier rend un objet avec un tableau `motifs` de `{ code, message }` et ne lève jamais d'exception. Plusieurs motifs peuvent être rendus ensemble ; leur ordre n'est pas garanti. Les messages sont en français, au vouvoiement ; leur formulation est proposée et sera validée par la RH en recette, seuls les codes font partie du contrat.

### `recevabilite({ demande, demandes, joursAcquis })`

- `demande` : la demande à contrôler.
- `demandes` : tableau des demandes connues (tous salariés et tous états confondus). Une demande de la liste dont la date de fin est avant la date de début est une erreur d'appel (`RangeError`), quel que soit son état ou son salarié.
- `joursAcquis` : nombre de jours acquis par le salarié, nombre positif ou nul.
- Rend `{ recevable: true }` (sans clé `motifs`) ou `{ recevable: false, motifs }`, avec les codes :
  - `fin-avant-debut` : la date de fin est avant la date de début. Ce motif est alors le seul rendu ;
  - `solde-insuffisant` : les jours de la demande dépassent le solde disponible, c'est-à-dire les jours acquis moins les jours des demandes `acceptee` et `en-attente` du même salarié. Une demande égale au solde disponible est recevable ;
  - `chevauchement` : la demande partage au moins une date calendaire avec une demande `acceptee` ou `en-attente` du même salarié.
- Les demandes `refusee` ou `annulee`, celles des autres salariés et, seulement si `demande` a un `id`, celle de la liste qui porte le même `id` ne comptent ni pour le solde ni pour le chevauchement. Une demande contrôlée sans `id` n'en ignore aucune.

### `solde({ salarie, demandes, joursAcquis })`

- `salarie` : identifiant du salarié ; `demandes` et `joursAcquis` comme pour `recevabilite`.
- Rend `{ joursAcquis, joursPris, joursEnAttente, solde }` : `joursPris` est la somme des jours des demandes `acceptee` du salarié, `joursEnAttente` celle de ses demandes `en-attente`, et `solde` vaut `joursAcquis - joursPris` (il peut être négatif). Les demandes `refusee`, `annulee` et celles des autres salariés sont ignorées.

```js
import { solde } from './src/conges.js';
solde({ salarie: 'S1', demandes, joursAcquis: 25 }); // { joursAcquis: 25, joursPris: 10, joursEnAttente: 3, solde: 15 }
```

### `changerEtat({ demande, action, par, responsable, aujourdhui })`

- `demande` : la demande à faire évoluer.
- `action` : `accepter`, `refuser` ou `annuler`.
- `par` : identifiant de la personne qui agit ; `responsable` : identifiant du responsable du salarié, transmis par l'intranet (obligatoire pour `accepter` et `refuser`).
- `aujourdhui` : date du jour `AAAA-MM-JJ`.
- Rend `{ ok: true, demande }`, avec une copie de la demande dans son nouvel état (`acceptee`, `refusee` ou `annulee`), ou `{ ok: false, motifs }`, avec les codes :
  - `non-autorise` : `accepter` et `refuser` sont réservés au responsable (`par` égal à `responsable`), `annuler` au salarié auteur (`par` égal à `demande.salarie`) ;
  - `transition-interdite` : `accepter` et `refuser` ne sont possibles que depuis `en-attente`, `annuler` que depuis `en-attente` ou `acceptee` ;
  - `delai-depasse` : l'annulation n'est possible que jusqu'à la veille du premier jour (`aujourdhui` strictement avant `debut`).

```js
import { changerEtat } from './src/conges.js';
changerEtat({ demande, action: 'annuler', par: 'S1', responsable: 'R1', aujourdhui: '2026-03-01' });
// { ok: true, demande: { …demande, etat: 'annulee' } } si la demande commence le 2026-03-02
```

### Erreurs

Les erreurs d'appel lèvent une `RangeError` avec un message en français :

- demande absente ou qui n'est pas un objet (`joursOuvres()`, `joursOuvres(null)`) ;
- date qui n'est pas au format `AAAA-MM-JJ`, ou qui n'existe pas (ex. `2026-02-30`) ;
- site autre que `national` ou `alsace-moselle` ;
- année qui n'est pas un entier de 2000 à 2100 (y compris pour une date de demande hors de cette plage) ;
- date de fin avant la date de début, pour `joursOuvres` (pour la demande contrôlée par `recevabilite`, c'est un motif `fin-avant-debut`) ;
- demande de la liste `demandes` (pour `recevabilite` et `solde`) dont la date de fin est avant la date de début, quel que soit son état ou son salarié ;
- site absent (« Le site est obligatoire… ») ou qui n'est pas une chaîne de caractères ;
- pour les demandes : objet absent, salarié qui n'est pas une chaîne non vide, état inconnu, liste `demandes` qui n'est pas un tableau ;
- `joursAcquis` qui n'est pas un nombre fini positif ou nul ;
- action autre que `accepter`, `refuser` ou `annuler`, `par` ou `responsable` absent, date du jour invalide.

Les messages d'erreur ne reprennent jamais une valeur reçue qui n'est pas une chaîne.

Les constantes `SITES`, `ETATS` et `ACTIONS` sont aussi exportées : les listes figées des sites, des états et des actions acceptés.

## Contrat du module de frais (`src/frais/`)

Brique de calcul pure, comme le module de congés : elle ne lit jamais l'horloge du système, n'écrit rien, ne garde aucun état et ne modifie jamais les objets reçus. Point d'entrée : `src/frais/index.js`.

- **Montants** : en centimes entiers (`montantTtcCentimes: 1850` pour 18,50 €), en entrée comme en sortie. Chaque montant remboursable est arrondi au centime, arrondi commercial (la demie va au centime supérieur).
- **Dates** : chaînes `AAAA-MM-JJ`, lues en UTC ; **mois** de la note : `AAAA-MM`.
- **Natures** (`NATURES`) : `repas`, `hotel`, `transport`, `indemnites-kilometriques`, `autre`.
- **Taux de TVA** (`TAUX_TVA`) : 5,5, 10 ou 20, facultatif. Il est seulement enregistré, aucun calcul de TVA n'est fait ici.

### `creerNote({ salarie, mois })`

Rend une note vide `{ salarie, mois, depenses: [] }`. `salarie` : chaîne non vide.

### `ajouterDepense(note, depense)`

Rend une nouvelle note, avec la dépense contrôlée ajoutée à la fin de `depenses`. Champs d'une dépense :

- `date` : dans le mois de la note ; `nature` : une des cinq natures ;
- `montantTtcCentimes` : entier strictement positif, pour toutes les natures sauf `indemnites-kilometriques`, où il est interdit (le montant est calculé) ;
- `tauxTva` (facultatif), `aParis` (booléen, `false` par défaut), `justificatif` (référence, chaîne non vide, facultative) ;
- `nuits` : pour `hotel` seulement, entier ≥ 1, `1` par défaut ;
- `kilometres` (entier > 0) et `puissance` (chevaux fiscaux, entier ≥ 3) : pour `indemnites-kilometriques` seulement, datées de 2025 ou 2026.

Doublons refusés : même date, même nature et même montant ; pour les indemnités kilométriques, même date et mêmes kilomètres.

### `montantRemboursable(depense)`

Montant remboursable, en centimes, d'une dépense autre qu'une indemnité kilométrique : repas plafonné à 25 € (30 € si `aParis`), hôtel plafonné à 120 € par nuit (150 € si `aParis`), transport et autre sans plafond. Les plafonds sont exportés dans `PLAFONDS`.

### `remboursementsNote(note, { kilometrageDejaRembourse })`

Rend, dans l'ordre de la note, une copie de chaque dépense avec `montantRemboursableCentimes`. `kilometrageDejaRembourse` : kilomètres déjà remboursés dans l'année, entier ≥ 0, obligatoire si la note contient des indemnités kilométriques. Le cumul avance d'une indemnité à la suivante par ordre de date, puis d'ordre de saisie. Le total de la note n'est pas calculé ici.

### `indemniteKilometrique({ annee, puissance, cumulAvant, kilometres })` et `bareme(annee, puissance, d)`

`bareme` rend la valeur du barème fiscal 2025-2026 (`BAREME_KILOMETRIQUE`) pour `d` km dans l'année, en millièmes d'euro : `d × taux` jusqu'à 5 000 km, `d × taux + part fixe` de 5 001 à 20 000 km, `d × taux` au-delà ; 7 CV et plus partagent une ligne. `indemniteKilometrique` rend, en centimes, `bareme(cumulAvant + kilometres) − bareme(cumulAvant)`, arrondi une seule fois.

```js
import { indemniteKilometrique } from './src/frais/index.js';
indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 4000, kilometres: 120 }); // 7632 (76,32 €)
indemniteKilometrique({ annee: 2026, puissance: 5, cumulAvant: 4900, kilometres: 200 }); // 9930 (99,30 €)
```

### Erreurs

Tout refus lève une `RangeError` avec un message en français : nature inconnue (le message la nomme), date mal formée, inexistante ou hors du mois de la note, doublon, montant nul ou négatif, kilomètres nuls ou négatifs, taux de TVA hors de 5,5, 10 et 20, indemnité datée hors de 2025-2026, puissance inférieure à 3 CV, nombre de nuits invalide, montant saisi pour une indemnité kilométrique, champ propre à une autre nature, salarié ou mois de note invalide.

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
- Rend un tableau d'objets `{ date, libelle }` triés par date croissante : `date` au format `AAAA-MM-JJ`, `libelle` texte non vide (ex. `Lundi de Pâques`). Fêtes mobiles calculées pour toute année de la plage (lundi de Pâques, Ascension, lundi de Pentecôte, et Vendredi saint en Alsace-Moselle). 11 dates par an sur le site `national`, 13 en `alsace-moselle`.

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

### Erreurs

Les erreurs d'appel lèvent une `RangeError` avec un message en français :

- date qui n'est pas au format `AAAA-MM-JJ`, ou qui n'existe pas (ex. `2026-02-30`) ;
- site autre que `national` ou `alsace-moselle` ;
- année qui n'est pas un entier de 2000 à 2100 (y compris pour une date de demande hors de cette plage) ;
- date de fin avant la date de début.

La recevabilité métier d'une demande (solde, chevauchement…) ne relève pas de ce module à ce stade.

La constante `SITES` est aussi exportée : la liste figée des sites acceptés.

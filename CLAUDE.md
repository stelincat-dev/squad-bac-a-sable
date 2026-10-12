# squad-bac-a-sable · consignes pour l'agent de code

Petit calcul de factures (Node 22, modules ES, aucune dépendance). Dépôt d'essai de l'agent de code de Squad+.

## Règles

- Montants en centimes entiers, arrondis au centime avec `Math.round`, comme dans `src/facture.js`.
- Une fonction exportée par règle de calcul, avec un commentaire `/** … */` d'une ligne en français.
- Erreurs : `RangeError` avec un message en français, explicite.
- Ne pas ajouter de dépendance npm.
- Ne pas modifier le comportement des fonctions existantes ni leurs tests ; ajouter les nouveaux tests dans `test/`.
- Noms de tests en français, qui décrivent la règle.

## Commandes

```bash
npm test            # tests
npm run test:junit  # tests, et rapport JUnit dans junit.xml
```

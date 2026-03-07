# Administration (temporary reference)

> Guide rapide pour l’administrateur (rédaction complète à venir).

## Objectifs
- Configurer les utilisateurs, équipes et ton BO.
- Superviser les exercices, la banque d’injects, la timeline et les imports.
- Valider les JSON avant injection en production.

## API utiles
- `GET /api/inject-bank/schema` : renvoie le schéma Draft-07 de chaque item de la banque d’injects, utilisé par l’interface d’import ZIP/TEXT et tous les scripts de synchronisation.
- `GET /api/injects/schema/timeline` : renvoie le schéma Draft-07 des injects timeline (`allOf` sur le schéma banque + champs `timeline_type`, `time_offset`, `audiences`, etc.).

Ces deux documents sont versionnés dans le backend sous `backend/app/resources/schemas/inject-bank-item.schema.json` et `backend/app/resources/schemas/timeline-inject-item.schema.json`.

## Bonnes pratiques
1. Utiliser les schémas pour valider les exports JSON/CSV avant import manuel.
2. Pour créer de nouveaux injects via script, consommer `injects/schema/timeline` puis appeler `POST /injects` en ne respectant qu’un package JSON conforme : les imports sont maintenant en `rejet total` quand une ligne ne respecte pas la règle.
3. Pour maintenir la banque, privilégier `/inject-bank/schema` comme référence unique ; toute évolution de `schema` doit être synchronisée dans `ADMIN.md` et le code backend/ frontend.

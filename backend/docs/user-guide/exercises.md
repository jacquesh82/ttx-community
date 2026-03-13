# Exercices de crise

## Cycle de vie

Un exercice passe par plusieurs états :

```
DRAFT → READY → RUNNING → PAUSED → FINISHED
```

| État | Description |
|------|-------------|
| `DRAFT` | En cours de préparation |
| `READY` | Prêt à démarrer |
| `RUNNING` | En cours |
| `PAUSED` | Temporairement suspendu |
| `FINISHED` | Terminé |

## Vue animateur

L'animateur dispose d'un tableau de bord avec :

- **Contrôle de l'exercice** : démarrer, mettre en pause, terminer
- **Timeline** : visualisation Gantt des injects planifiés/envoyés
- **Gestion des équipes** : suivi des participants en temps réel
- **RETEX** : bilan post-exercice

## Vue observateur

L'observateur suit l'exercice en lecture seule. Il peut voir la timeline et les canaux simulés sans interagir.

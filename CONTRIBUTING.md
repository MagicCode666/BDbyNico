# Contribuer

## Workflow

- Aucun commit direct sur `main`.
- Une branche par sujet : `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Tout passe par une Pull Request, fusionnée en **squash** une fois la CI verte.

## Messages de commit

Format [Conventional Commits](https://www.conventionalcommits.org/fr/) :

```
feat: ajout de la grille de couvertures
fix: correction de la validation ISBN
docs: mise à jour du README
chore: mise à jour des dépendances
```

## Versions

[SemVer](https://semver.org/lang/fr/) : `MAJEUR.MINEUR.CORRECTIF`. Le changelog est généré à partir des messages de commit.

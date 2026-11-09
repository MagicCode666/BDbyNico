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

## Vérifier la sécurité de la base (RLS)

Après toute modification du schéma Supabase, lancer le script de vérification :

```
node scripts/rls-check.mjs
```

Il demande l'email et le mot de passe de **deux comptes de test confirmés** (saisie masquée, rien n'est enregistré), puis contrôle l'isolation des données entre utilisateurs, le catalogue partagé et le partage par jeton. Il lit les variables `VITE_SUPABASE_*` dans `.env.local`.

Il laisse dans le catalogue partagé une édition de test (ISBN `9789999999991`) et la série « Série de test RLS », qu'il faut supprimer à la main depuis l'éditeur SQL de Supabase.

## Versions

[SemVer](https://semver.org/lang/fr/) : `MAJEUR.MINEUR.CORRECTIF`. Le changelog est généré à partir des messages de commit.

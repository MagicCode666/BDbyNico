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

## Totaux de tomes des séries

Le total partagé d'une série (`series.total_volumes`) n'est écrit que par un job quotidien (`.github/workflows/series-sync.yml`, script `scripts/update-series-totals.mjs`), pas par les utilisateurs. Il interroge la BnF avec le nom exact de la série, écarte les tomes sans numéro et les éditions spéciales (collector, tirage, recueil…), et n'enregistre le total que si la BnF référence au moins la moitié des tomes. Le total ne diminue jamais tout seul.

- Le job utilise le secret GitHub `SUPABASE_SERVICE_ROLE_KEY` (à créer dans Settings > Secrets and variables > Actions). Sans lui, il se termine avec un avertissement.
- Tester une série sans toucher à la base : `node scripts/update-series-totals.mjs --name "Lucky Luke"`.
- Lancer le job à la main : onglet Actions, « Totaux des séries », « Run workflow ».
- Corriger une série à la main (SQL Editor de Supabase) : `update series set total_volumes = 24, total_source = 'manual' where name = 'Tintin';` — le job n'y touche plus. Pour repasser en automatique : `total_source = 'auto'`.
- Les corrections des utilisateurs sont personnelles (table `user_series_settings` : tomes ignorés, total personnel).

## Versions

[SemVer](https://semver.org/lang/fr/) : `MAJEUR.MINEUR.CORRECTIF`. Le changelog est généré à partir des messages de commit.

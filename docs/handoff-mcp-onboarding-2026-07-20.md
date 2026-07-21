# Handoff — MCP Onboarding — 20 juillet 2026

## Demande

Créer un serveur MCP connectable à Claude pour lire et mettre à jour les projets
Onboarding depuis le contexte Google Calendar, Gmail ou Slack.

Séparation métier impérative :

- rendez-vous Onboarding : Google Calendar ;
- formations : Acuity, flux distinct ;
- aucun Google OAuth dans D-EDGE Ops sans nouvel accord explicite de Pablo.

Exemple cible : après le rendez-vous Borneo, enregistrer que WhatsApp est en
pause jusqu’au 20 août, avec la décision, la raison, les actions et la source.

## État

Implémentation locale fonctionnelle, non commitée, non poussée, non déployée.
Migration `024` non appliquée sur Supabase. Serveur OAuth Supabase non activé.

Build production passé le 20 juillet 2026 :

```text
npm run build → succès, types et lint Next inclus
```

Smoke test MCP passé en local sur le port 3130 :

- métadonnées OAuth : `200` ;
- appel anonyme `/api/mcp` : `401` avec `WWW-Authenticate` ;
- `initialize` authentifié : `200`, protocole `2025-03-26` ;
- `tools/list` : quatre outils exposés ;
- `search_projects("Borneo")` : appel réel Supabase réussi ;
- deux projets Borneo trouvés, donc l’ambiguïté doit être levée par identifiant.

Le serveur local a été arrêté.

## Ce qui a été ajouté

### MCP et sécurité

- `app/api/mcp/route.ts`
- `app/.well-known/oauth-protected-resource/route.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/confirmation.ts`
- `lib/mcp/onboarding.ts`

Outils :

1. `search_projects`
2. `get_project_context`
3. `preview_meeting_outcome`
4. `record_meeting_outcome`

Écriture en deux temps obligatoire : aperçu signé, confirmation exacte dans les
15 minutes. Mutation atomique et idempotente. Rôles `admin` et `onboarder` en
écriture ; `support` et `commercial_readonly` en lecture.

### OAuth Supabase, sans Google OAuth

- `app/oauth/consent/page.tsx`
- `app/api/oauth/decision/route.ts`
- retour magic link préservé dans :
  - `app/login/page.tsx`
  - `app/api/auth/login/route.ts`
  - `app/auth/callback/route.ts`
- routes publiques MCP/consent ajoutées à `middleware.ts`.

Le callback refuse les redirections externes via validation du paramètre
`next`.

### Données et interface Onboarding

- `supabase/migrations/024_onboarding_mcp_actions.sql`
- copie identique : `database/migrations/024_onboarding_mcp_actions.sql`
- nouvelles tables : décisions, actions, événements Calendar, journal MCP ;
- RLS activé sans politique navigateur ; service role uniquement ;
- fonction SQL atomique `record_mcp_meeting_outcome` ;
- statut produit `on_hold`, raison et date de reprise ;
- affichage « En pause » dans le cockpit et le Gantt ;
- nouvel événement timeline `meeting_decision`.

Fichiers modifiés :

- `app/api/onboarding/projects/[id]/products/route.ts`
- `components/onboarding/ProjectWorkspace.tsx`
- `lib/onboarding/workspace.ts`
- `lib/onboarding/events.ts`
- `lib/onboarding/eventTypes.ts`

### Dépendances et configuration

Ajouts dans `package.json` et `package-lock.json` :

- `mcp-handler@1.1.0`
- `@modelcontextprotocol/sdk@1.26.0`
- `zod@4.4.3`

Variables documentées dans `.env.example` :

- `MCP_RESOURCE_URL`
- `MCP_CONFIRMATION_SECRET`
- `MCP_API_TOKEN` local uniquement
- `MCP_DEFAULT_USER_EMAIL` local uniquement

Guide d’usage et branchement déjà écrit : `docs/mcp-onboarding.md`.
Changelog complété dans `CHANGELOG.md`.

## À terminer

1. Relire le diff MCP et séparer les lignes déjà présentes dans le worktree.
   `middleware.ts` contient notamment une modification antérieure concernant
   `/api/webhooks/zoho-forms` : ne pas l’attribuer au MCP par erreur.
2. Vérifier la migration SQL avec Supabase CLI, puis appliquer `024` :

   ```bash
   supabase migration list --linked
   supabase db push --dry-run
   supabase db push
   ```

3. Terminer l’audit npm. `npm audit --omit=dev` a échoué dans le sandbox faute
   de réseau, puis la demande d’accès réseau a été interrompue. Ne pas lancer
   `npm audit fix --force`.
4. Activer le serveur OAuth 2.1 dans Supabase et définir le consentement :

   ```text
   https://dedge-ops-6zer.vercel.app/oauth/consent
   ```

5. Définir dans Vercel :

   ```text
   MCP_RESOURCE_URL=https://dedge-ops-6zer.vercel.app/api/mcp
   MCP_CONFIRMATION_SECRET=<secret aléatoire long>
   ```

   Ne pas définir les deux variables de token local en production.
6. Tester le vrai parcours OAuth avec un compte `onboarder`, puis un compte
   lecture seule.
7. Tester un aperçu puis une écriture sur un projet de test après migration.
   Vérifier note, décision, action, produit en pause, événement Calendar et
   idempotence.
8. Tester l’ambiguïté Borneo. Les deux IDs observés localement étaient :
   `31465000005214015` et `31465000004199168`.
9. Attention : les deux résultats Borneo indiquaient `whatsapp: false`.
   L’outil refuse une mise à jour produit non activé. Décider avec Pablo s’il
   faut conserver ce garde-fou ou autoriser une décision WhatsApp sans changer
   le statut produit.
10. Commit ciblé, push et déploiement seulement après ces vérifications.
11. Brancher Claude selon `docs/mcp-onboarding.md`, puis activer séparément les
    connecteurs natifs Google Calendar, Gmail et Slack.

## Worktree et interdits

Branche : `agent/use-rolling-three-months`.

Dernier commit local avant ces changements :

```text
5ce9ee3 Complete project changelog from Git history
```

Le worktree contient d’autres modifications appartenant à Pablo ou à des tâches
précédentes. Ne pas faire de commit global et ne pas nettoyer avec reset.
Inspecter `git status --short` et ajouter uniquement les fichiers validés.

Stash critique :

```text
stash@{0}: DO NOT COMMIT OR PUSH - Google OAuth awaiting Pablo approval
```

Ne pas appliquer, commiter ou pousser ce stash. Il contient l’ancien travail
Google OAuth explicitement refusé. Les changements magic-link/OAuth serveur MCP
actuels ne configurent aucun fournisseur Google.

Ne jamais reprendre de jeton ou secret visible dans un historique de commande.

## Documentation officielle utile

- Claude, connecteurs MCP distants :
  https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Claude, Google Workspace :
  https://support.claude.com/en/articles/10166901-use-google-workspace-connectors
- Vercel, serveur MCP Next.js :
  https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel
- Supabase OAuth Server :
  https://supabase.com/docs/guides/auth/oauth-server
- Supabase MCP authentication :
  https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- MCP Authorization :
  https://modelcontextprotocol.io/docs/tutorials/security/authorization


# Connecteur MCP Onboarding

## Objectif

Le serveur MCP permet à Claude de lire le contexte d’un projet Onboarding et de
proposer des mises à jour structurées à partir d’une conversation, d’un email,
d’un message Slack ou d’un rendez-vous Google Calendar.

Les formations Acuity restent volontairement un flux séparé. Cette première
version ne lit ni ne modifie Acuity.

## Outils exposés

- `search_projects` recherche un projet par hôtel, identifiant Zoho ou chargé
  de projet. En cas d’homonymie, Claude doit faire préciser l’identifiant.
- `get_project_context` restitue le cockpit, les produits, décisions, actions,
  événements et rendez-vous Calendar déjà liés.
- `preview_meeting_outcome` prépare un compte rendu sans écrire. Il peut
  contenir des décisions, actions, changements de statut produit et le lien
  vers l’événement Calendar.
- `record_meeting_outcome` applique exactement la prévisualisation confirmée.
  Le jeton expire après 15 minutes et une seconde exécution est idempotente.

Les comptes `admin` et `onboarder` ont lecture et écriture. `support` et
`commercial_readonly` restent en lecture seule. Un compte désactivé est refusé.

## Cas d’usage anticipés

### Avant un rendez-vous

- Préparer un brief : phase actuelle, derniers échanges, décisions ouvertes,
  actions en retard, blocages, ressources manquantes et produits concernés.
- Identifier les incohérences entre la prochaine action, le calendrier et les
  dates cibles.
- Retrouver le bon projet depuis le nom de l’hôtel ou les participants du
  rendez-vous, avec confirmation en cas d’ambiguïté.

### Pendant ou après un rendez-vous

- Ajouter une note datée et sa source.
- Transformer le compte rendu en décisions et tâches avec responsable et
  échéance.
- Passer un produit en cours, en attente, bloqué, en pause, live ou annulé.
- Pour une pause, enregistrer obligatoirement la raison et la date de reprise.
- Relier la note au rendez-vous Google Calendar, à ses horaires, participants et
  URL, sans confondre ce rendez-vous avec une formation Acuity.
- Exemple : « Suite au rendez-vous d’implémentation du 20 juillet avec Borneo,
  WhatsApp est mis en pause jusqu’au 20 août en attente de validation client. »

### Entre deux rendez-vous

- Exploiter un email Gmail ou un échange Slack comme source d’une décision, en
  conservant sa référence.
- Ajouter une action de relance, réaffecter son responsable ou documenter un
  blocage.
- Produire un résumé de passation pour un changement d’onboarder.
- Lister les décisions temporaires arrivant à échéance et les produits dont la
  reprise est proche.
- Préparer un point hebdomadaire : changements récents, actions ouvertes,
  retards et risques.

### Garde-fous

- Claude ne peut pas modifier un projet homonyme sans identifiant non ambigu.
- Un produit non activé dans le plan du projet ne peut pas être modifié.
- Toute écriture passe par une prévisualisation puis une confirmation explicite.
- La mutation est atomique : note, décisions, actions, produits et lien Calendar
  sont enregistrés ensemble ou pas du tout.
- Les écritures sont journalisées avec utilisateur, payload et clé
  d’idempotence. Les tables MCP sont protégées par RLS.

## Mise en service

### 1. Base de données

Appliquer la migration `024_onboarding_mcp_actions.sql`. Elle ajoute les pauses
produit, décisions, actions, événements Calendar et le journal MCP.

```bash
supabase db push
```

### 2. Variables de production

Définir dans Vercel :

```text
MCP_RESOURCE_URL=https://dedge-ops-6zer.vercel.app/api/mcp
MCP_CONFIRMATION_SECRET=<secret aléatoire long>
```

`MCP_API_TOKEN` et `MCP_DEFAULT_USER_EMAIL` servent seulement aux tests locaux
et ne doivent pas être définis en production.

### 3. Serveur OAuth Supabase

Dans Supabase, activer le serveur OAuth 2.1 et utiliser comme chemin de
consentement :

```text
https://dedge-ops-6zer.vercel.app/oauth/consent
```

Deux options sont possibles :

1. enregistrer manuellement le client Claude avec l’URL de callback fournie par
   Claude, puis saisir le client ID et le secret dans les réglages avancés du
   connecteur ;
2. activer temporairement l’enregistrement dynamique des clients, connecter
   Claude, puis contrôler les clients créés dans Supabase.

L’utilisateur s’authentifie avec le lien magique D-EDGE Ops existant. Aucun
Google OAuth n’est ajouté à l’application.

### 4. Ajouter le connecteur dans Claude

Dans Claude : **Personnaliser → Connecteurs → Ajouter un connecteur
personnalisé**, puis saisir :

```text
https://dedge-ops-6zer.vercel.app/api/mcp
```

Finaliser l’autorisation avec l’adresse email déjà autorisée dans D-EDGE Ops.
Pour les outils d’écriture, conserver la confirmation manuelle.

### 5. Relier les sources de contexte

Activer séparément les connecteurs natifs Google Calendar, Gmail et Slack dans
Claude. Ils servent à lire le contexte ; le connecteur D-EDGE Ops est le seul à
écrire dans le cockpit Onboarding.

Prompt de recette :

```text
Retrouve le projet Borneo. À partir de mon rendez-vous Google Calendar
d’aujourd’hui, prépare sans appliquer la note, les décisions, les actions et les
changements produit à enregistrer dans D-EDGE Ops. Montre-moi la prévisualisation
et attends ma confirmation.
```

Si plusieurs projets Borneo sont retournés, choisir explicitement l’identifiant
avant de continuer.

## Vérification technique

Le endpoint MCP utilise Streamable HTTP sur `/api/mcp`. Sans jeton, il répond
`401` avec l’URL de métadonnées OAuth. Avec un jeton valide, l’initialisation et
`tools/list` doivent exposer les quatre outils ci-dessus.


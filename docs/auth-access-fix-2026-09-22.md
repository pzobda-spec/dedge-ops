# Correction des accès au cockpit — 22 septembre 2026

La validation historique créait une identité Supabase Auth sans profil `public.users`.
Le middleware redirigeait ensuite `/login` vers `/dashboard` et inversement, et la
réinvitation échouait puisque l’identité Auth existait déjà.

Le profil de Winli a été créé avec son identifiant Auth existant, actif, rôle
`onboarder`, conformément à la confirmation administrateur. Aucun email n’a été
envoyé pendant cette réparation.

Le nouveau parcours collecte email `@d-edge.com`, nom complet et rôle souhaité.
L’administrateur peut ajuster le rôle, puis l’application réutilise/crée l’identité
Auth, crée le profil et approuve la demande atomiquement via `approve_app_access`.
L’envoi du lien vient après le commit. Une erreur d’envoi est visible et ne remet
pas en cause le compte ; l’utilisateur peut demander un nouveau lien sur `/login`.
Les anciennes approbations sans profil sont réparables avec « Finaliser le compte ».

Les API d’approbation et de lecture des demandes exigent désormais un admin actif.
La table des demandes et la fonction d’approbation sont réservées au service role.
Un rôle souhaité ne confère aucun accès. Une connexion ou une nouvelle invitation
ne réactive jamais un compte désactivé. Les callbacks PKCE et les liens avec fragment
de session sont pris en charge ; les profils absents arrivent sur `/forbidden`.

À traiter n’est pas filtré sur les projets de l’utilisateur : il est retiré des
Onboarders, ainsi que Paramètres (menu principal et menu du compte). Les routes
de pages et l’API weekly-exceptions appliquent les mêmes restrictions.

Validation : `npm test`, `npx tsc --noEmit`, `npm run lint`,
`supabase db query --linked --file tests/access-approval.sql` (fixtures annulées),
et navigateur avec une identité Auth temporaire, supprimée après les contrôles.

Le contrôle `supabase db advisors --linked --type security --level error` signale
encore des tables métier sans RLS (notamment clients, tickets, onboarding_projects).
Ces alertes préexistantes ne concernent pas les tables de droits corrigées et
nécessitent un chantier distinct avec revue des consommateurs et des politiques.

Références : [création Auth](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[liens email](https://supabase.com/docs/reference/javascript/auth-signinwithotp),
[sessions par fragment](https://supabase.com/docs/guides/auth/sessions/implicit-flow).

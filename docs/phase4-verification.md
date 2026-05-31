# Phase 4 Verification

## Checks

- [ ] Appliquer `database/migrations/005_user_settings_and_app_settings.sql` sur dev et prod.
- [ ] Vérifier que `user_settings` et `app_settings` existent.
- [ ] Vérifier que `app_settings.gemini_recap_gem_url` vaut `https://gemini.google.com/gem/f52d2af6eaca`.
- [ ] Aller sur `/settings/me`, saisir les liens Acuity 15/30/60 min, langue et signature, puis sauver.
- [ ] Vérifier en SQL: `SELECT * FROM user_settings WHERE user_email = 'pablo.zobda@loungeup.com';`.
- [ ] Aller sur `/onboarding/[id_test]`, onglet Vue d'ensemble.
- [ ] Vérifier que la section `Communications client` affiche les 5 boutons email.
- [ ] Cliquer `Email de lancement (J+0)`.
- [ ] Vérifier que la modale s'ouvre avec template pré-rempli.
- [ ] Saisir `Bertrand` dans prénom client et vérifier l'interpolation.
- [ ] Cliquer `Copier` et vérifier le presse-papier.
- [ ] Cliquer `Ouvrir dans Gmail` et vérifier le `mailto:`.
- [ ] Cliquer `Marquer comme envoyé`.
- [ ] Vérifier l'event: `SELECT * FROM onboarding_events WHERE event_type='email_launch_sent' ORDER BY created_at DESC LIMIT 1;`.
- [ ] Cliquer `Relance niveau 1`, saisir `le logo HD`, vérifier l'interpolation du livrable.
- [ ] Cliquer `Générer le récap`.
- [ ] Coller un transcript fictif.
- [ ] Cliquer `Copier le contexte` et vérifier le format.
- [ ] Cliquer `Ouvrir le Gem` et vérifier l'ouverture du Gem configuré.
- [ ] Vérifier l'event `recap_generated` dans la timeline.
- [ ] Configurer un appointment Acuity catégorie `Onboarding` pour un hôtel test.
- [ ] Vérifier que la section `Rendez-vous` affiche l'appointment.
- [ ] Cliquer `Kick-off`.
- [ ] Vérifier que le lien Acuity 30 min s'ouvre et que l'event `kickoff_scheduled` est créé.
- [ ] Tester `/api/cron/detect-acuity-events?secret=DEV` avec un appointment passé.
- [ ] Vérifier qu'un event `kickoff_completed` ou `implementation_completed` est créé.
- [ ] Relancer la même URL et vérifier l'absence de doublon.
- [ ] Sur `/settings`, modifier `gemini_recap_gem_url`.
- [ ] Vérifier que la modale Récap utilise la nouvelle URL.
- [ ] Non-régression: timeline Phase 2, résumé exécutif, sync Zoho.

## DoD

- [ ] Migration 005 appliquée sur dev et prod.
- [ ] Tables `user_settings` et `app_settings` opérationnelles.
- [ ] `/settings/me` fonctionnel.
- [ ] Templates emails FR et EN disponibles.
- [ ] 5 boutons emails fonctionnels avec création d'event explicite.
- [ ] `EmailComposer` permet copier et ouvrir Gmail.
- [ ] Bouton récap Gem fonctionnel avec URL configurable.
- [ ] 3 boutons Acuity fonctionnels.
- [ ] Section `Rendez-vous` affiche les appointments Acuity onboarding.
- [ ] Cron `detect-acuity-events` crée les events completed sans doublon.
- [ ] Page admin modifie les `app_settings`.
- [ ] Timeline affiche les metadata pertinentes.
- [ ] Aucun nouveau modèle IA ajouté.
- [ ] `npx tsc --noEmit` passe.
- [ ] `npm run lint` passe.
- [ ] `npm run build` passe.

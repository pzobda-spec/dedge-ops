# Phase 3 Verification

## Checks

- [ ] Appliquer `database/migrations/006_users_roles.sql` sur dev et prod.
- [ ] Vérifier que `users` existe avec les index `idx_users_email`, `idx_users_role`, `idx_users_active`.
- [ ] Vérifier que `pablo.zobda@loungeup.com` est présent avec `role='admin'` et `active=true`.
- [ ] Vérifier que les emails hardcodés migrés depuis `lib/auth/access.ts` existent en onboarder.
- [ ] Aller sur `/admin/users` en admin.
- [ ] Vérifier que la page s'affiche et que Pablo apparaît en admin.
- [ ] Inviter `thuy-tien.truong@loungeup.com`, nom `Thuy-Tien Truong`, rôle `onboarder`.
- [ ] Vérifier le toast de succès et la ligne `users` avec `active=false`.
- [ ] Vérifier que Supabase Auth envoie le magic link.
- [ ] Se connecter avec le magic link.
- [ ] Vérifier que `active=true` et `last_login_at` sont mis à jour.
- [ ] Vérifier que Thuy accède à `/onboarding` et `/tickets`.
- [ ] Vérifier que Thuy n'accède pas à `/admin/users` et est redirigée vers `/forbidden`.
- [ ] Modifier Thuy en `support`.
- [ ] Vérifier que la sidebar ne montre plus Onboarding et garde Tickets/Knowledge Base.
- [ ] Désactiver Thuy.
- [ ] Vérifier qu'elle ne peut plus accéder aux routes protégées.
- [ ] Réactiver Thuy en `onboarder`.
- [ ] En admin, tenter de modifier son propre rôle vers `onboarder`.
- [ ] Vérifier l'erreur `Vous ne pouvez pas vous rétrograder.`
- [ ] Vérifier le TopBar: initiales, email, badge rôle, dropdown `Mes paramètres` + `Déconnexion`.
- [ ] Non-régression Phase 1: sync Zoho.
- [ ] Non-régression Phase 2: timeline + résumé.
- [ ] Non-régression Phase 4: boutons emails + Gem + Acuity.

## DoD

- [ ] Migration 006 appliquée sur dev et prod.
- [ ] Table `users` peuplée avec Pablo admin + onboarders migrés.
- [ ] `lib/auth/roles.ts` opérationnel.
- [ ] Middleware contrôle l'accès par rôle.
- [ ] `/admin/users` fonctionnelle.
- [ ] `/api/admin/users/*` opérationnelles et admin only.
- [ ] `/api/auth/me` retourne le user courant.
- [ ] `useCurrentUser` disponible avec cache sessionStorage 5 min.
- [ ] Sidebar conditionnelle selon rôle.
- [ ] TopBar affiche avatar, email et badge rôle.
- [ ] Pablo ne peut pas se rétrograder.
- [ ] `/forbidden` créée.
- [ ] `lib/auth/access.ts` reste opérationnel en fallback.
- [ ] `npx tsc --noEmit` passe.
- [ ] `npm run lint` passe.
- [ ] `npm run build` passe.

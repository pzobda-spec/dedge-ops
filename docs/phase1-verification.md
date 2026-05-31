# Phase 1 verification - Project Timeline foundation

## Checks

- [ ] Execute `database/migrations/003_onboarding_timeline.sql` on Supabase prod and dev.
- [ ] Verify in Supabase dashboard that `onboarding_projects` has the new columns:
  `zoho_project_id`, `zoho_status`, `hotel_name`, `product`, `owner_email`, `last_synced_at`.
- [ ] Verify `onboarding_events` exists with indexes:
  `idx_onboarding_events_project`, `idx_onboarding_events_type`.
- [ ] Manual `POST /api/integrations/zoho/projects-sync` with admin session returns `{ synced, created, updated, status_changes }`.
- [ ] Verify at least 100 rows in `onboarding_projects`.
- [ ] Verify at least 100 `project_created` events in `onboarding_events`.
- [ ] Verify `zoho_project_id` values are unique.
- [ ] Run a second manual `POST /api/integrations/zoho/projects-sync`.
- [ ] Verify `created == 0`.
- [ ] Verify no duplicate `project_created` events.
- [ ] Modify one test project status in Zoho Projects.
- [ ] Run `POST /api/integrations/zoho/projects-sync`.
- [ ] Verify one `status_changed` event exists for that project.
- [ ] Verify `onboarding_projects.zoho_status` is updated.
- [ ] Navigate to `/onboarding/board` and click the info icon on one card.
- [ ] Verify redirect to internal `/onboarding/[id]`.
- [ ] Verify the detail page loads the matching Supabase project.
- [ ] Verify `Voir dans Zoho` opens Zoho in a new tab.
- [ ] Call `/api/cron/sync-onboarding` without a valid `CRON_SECRET`.
- [ ] Verify response is `401`.
- [ ] Call `/api/cron/sync-onboarding` with a valid `CRON_SECRET`.
- [ ] Verify sync executes and returns `{ synced, created, updated, status_changes }`.

## Definition of Done

- [ ] Migration SQL applied on dev and prod.
- [ ] `/api/integrations/zoho/projects-sync` returns a structured payload and is idempotent.
- [ ] `/api/cron/sync-onboarding` is protected by `CRON_SECRET`.
- [ ] `vercel.json` is updated and the cron is documented in `README.md`.
- [ ] `/onboarding/[id]` is accessible and loads Supabase data.
- [ ] Link from `/onboarding/board` works.
- [ ] `docs/phase1-verification.md` exists with these verification steps.
- [ ] No regression on `/onboarding`, `/onboarding/board`, `/onboarding/charge`.
- [ ] TypeScript checks and linters pass.

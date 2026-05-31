# Phase 2 verification - Timeline and action logging

## Checks

- [ ] Apply `database/migrations/004_executive_summary.sql` on Supabase dev and prod.
- [ ] Verify the two summary columns exist:
  ```sql
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'onboarding_projects'
    AND column_name IN ('executive_summary', 'executive_summary_generated_at');
  ```
- [ ] Insert 5 test events on one project:
  ```sql
  INSERT INTO onboarding_events (project_id, event_type, event_label, actor_email, occurred_at) VALUES
    ('PROJET_ID', 'email_launch_sent', 'Email de lancement envoyé', 'test@d-edge.com', NOW() - INTERVAL '5 days'),
    ('PROJET_ID', 'first_contact_call', 'Appel premier contact', 'test@d-edge.com', NOW() - INTERVAL '4 days'),
    ('PROJET_ID', 'kickoff_scheduled', 'Kick-off planifié', 'test@d-edge.com', NOW() - INTERVAL '3 days'),
    ('PROJET_ID', 'kickoff_completed', 'Kick-off réalisé', 'test@d-edge.com', NOW() - INTERVAL '2 days'),
    ('PROJET_ID', 'content_received', 'Contenu client reçu', 'test@d-edge.com', NOW() - INTERVAL '1 day');
  ```
- [ ] Load `/onboarding/PROJET_ID`, open the Timeline tab, and verify the 5 events are sorted by `occurred_at DESC`.
- [ ] Verify event icons and colors match `lib/onboarding/eventTypes.ts`.
- [ ] Verify relative French dates display.
- [ ] On Overview, verify `ProjectProgress` shows `50%` when `content_received` is the latest progress milestone.
- [ ] Add a manual note from the Timeline tab.
- [ ] Verify the `note_added` event appears at the top immediately.
- [ ] Verify `actor_email` equals the connected user's email.
- [ ] Verify in Supabase:
  ```sql
  SELECT *
  FROM onboarding_events
  WHERE event_type = 'note_added'
  ORDER BY created_at DESC
  LIMIT 1;
  ```
- [ ] Filter timeline by category `email`; verify only email events remain.
- [ ] Generate an executive summary.
- [ ] Verify loading state, then 3 French sentences are displayed.
- [ ] Verify `executive_summary` is stored:
  ```sql
  SELECT executive_summary
  FROM onboarding_projects
  WHERE id = 'PROJET_ID';
  ```
- [ ] Generate again within 24h without force; verify the API response has `cached: true`.
- [ ] Use regenerate; verify `force=true` triggers a fresh API call.
- [ ] Change a Zoho test project status from `in_progress` to `pending_client`, run sync, and verify one `status_changed` event with `metadata = { from: 'in_progress', to: 'pending_client' }`.
- [ ] Re-run sync within one minute and verify no duplicate transition event.
- [ ] Verify non-regression on `/onboarding`, `/onboarding/board`, `/onboarding/charge`, `/onboarding/[id]`.

## Definition of Done

- [ ] Migration 004 applied on dev and prod.
- [ ] `lib/onboarding/events.ts` created with working `logProjectEvent`.
- [ ] `lib/onboarding/eventTypes.ts` created with complete catalog.
- [ ] `GET /api/onboarding/projects/[id]/timeline` works.
- [ ] `POST /api/onboarding/projects/[id]/events` works with auth.
- [ ] `POST /api/ai/onboarding-summary` works with 24h cache.
- [ ] Timeline displays event types with icons and colors.
- [ ] Timeline category and date filters work.
- [ ] Add-note action works.
- [ ] `ProjectProgress` computes progress correctly.
- [ ] Executive summary generation works with cache.
- [ ] Sync logs `status_changed` without duplicate transition events within 24h.
- [ ] Temporary Phase 1 sync button is removed from `/onboarding`.
- [ ] No regression on onboarding pages.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.

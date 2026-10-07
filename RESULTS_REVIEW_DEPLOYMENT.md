# Results Review: production upgrade

This is an in-place update to the existing CyberType application. **The existing production database must run only `supabase/002_results_review.sql`. Do not rerun `001_cybertype.sql`.** No production database, Supabase credentials, remote repository, or Vercel deployment was modified during local implementation.

## Apply the new migration

Use a short coordinator-controlled rollout window. The migration locks the existing event row/table while changing the RPC contract, preserves runs and original scores, and defaults both review flags to false. It does not end or reset an active competition.

1. Open the Supabase dashboard for the **existing production project**.
2. Open **SQL Editor → New query**.
3. Open `supabase/002_results_review.sql` from this app folder. Copy its **entire contents**, starting with the comments and `begin;`, through `commit;`, into the query editor.
4. Run it as the project owner using **Run**. The file is one transaction: do not run fragments. It creates no replacement event and deletes no existing participant data. It also reloads the PostgREST schema cache.
5. Run this verification query in another editor query:

   ```sql
   select id, status, leaderboard_visible, results_finalized, results_version
   from public.cyber_event
   where id = 1;

   select count(*) as preserved_participants from public.cyber_runs;

   select has_table_privilege(
     'authenticated', 'public.cyber_score_adjustments', 'INSERT'
   ) as must_be_false;
   ```

   On the initial migration, `leaderboard_visible` and `results_finalized` are false. The status and participant count are preserved. `must_be_false` must be false. A project-owner query is privileged; use an anonymous/participant session to check public behavior rather than expecting the SQL Editor owner to be blocked by RLS.

6. Commit/push the modified application to your existing deployment repository, including all new files listed below and the updated package lock. Trigger a Vercel redeployment of the existing project. Root directory and build command remain unchanged: the folder containing `package.json`, with `npm run build`.
7. Reload coordinator, participant, and projector tabs after deployment to replace old JavaScript. Verify the locked screen in an incognito window, and sign in as the existing allowlisted coordinator to verify private Results Review.

**Migration first, deployment second.** The new API intentionally fails closed with a migration-required error if deployed against the old schema. Applying the migration first immediately stops the old RPC/direct public reads from leaking locked rows, though the old frontend will not have review controls until redeployed. Existing published/downloaded information cannot be recalled.

The SQL uses safe conditional column/table/index creation and replaceable policies/functions. Tests also apply it twice without data loss. Treat it as a normal new, once-applied migration in production; do not use reruns to reset an event. For a brand-new empty database only, run 001 followed by 002.

## Environment and deployment

- **New environment variables: none.** Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as already configured.
- **Vercel redeployment: required.** No Vercel project recreation, Auth provider changes, or new credentials are needed.
- **No service-role key was added.** Server requests still use the caller's Supabase Auth token and the existing public anon key.
- Existing Realtime publication/subscriptions for `cyber_board` and `cyber_event` remain. The adjustment table is intentionally not added to the publication; its private trigger updates the canonical board, while review flags/version update the event row.

## Exact event-day workflow

1. Sign in with the existing account in `cyber_admins`. Configure, register participants, and start/pause/resume as before. The audience board is locked, and personal scorecards show no rank.
2. Select **End event** and confirm. Attempts freeze; registration closes. Ending never reveals or finalizes results.
3. In **Event Control → Results Review**, inspect the private standings sorted by **final score**. Select **Review** for a participant to inspect untouched round metrics, base score, adjustments, final score, connection timestamp, suspension status, and adjustment history.
4. Select **Add Deduction** or **Add Grace Points**, or enter a custom signed whole number. Presets include −100, −50, +25, and +50. Choose a category, provide a reason (5–1000 characters), and confirm **Apply ±N points to alias?**. Each adjustment records the signed amount, authenticated admin UUID, reason, category, timestamp, and previous/new final score in the audit log.
5. Review the updated ordering and export CSV if needed. CSV includes final rank, alias, base, adjustment total, final score, accuracy, round scores, penalties, and adjustment reasons/admin/timestamps. There is no public CSV endpoint and no participant email in the file.
6. Select **Finalize Results** and confirm. Further adjustments and participant-status changes are blocked in the database. The public board remains locked.
7. Select **Reveal Leaderboard** and explicitly confirm the official release. The audience tab updates automatically, showing the same approved final scores and tie ordering as the private board.
8. **Hide Leaderboard** stops public reads while retaining finalization. To make corrections, select **Reopen Results** and confirm: this immediately hides the board and unlocks adjustments. Add an opposite adjustment to reverse an error; history is never silently edited. Finalize and reveal again after the correction.
9. When resetting for a new event, export first. **Reset event** requires confirmation and clears runs, board rows, and associated adjustments; it resets both review flags to false, while retaining all audit history.

Amount limit: nonzero integers from −100000 to +100000. Negative final totals are intentionally allowed: `final_score = base_score + SUM(adjustments)`, with no hidden zero clamp. The existing tie rule remains final score descending, then participant UUID ascending. This does not change any round's WPM, accuracy, combo, penalty, or scoring formula.

## Data and permission changes

- `cyber_event`: adds `leaderboard_visible`, `results_finalized`, and a monotonic `results_version`. A database constraint prevents visible results unless the event is ended and finalized.
- `cyber_score_adjustments`: append-only correction history, tied to the existing event and participant run. Only admins can read it. No public/authenticated direct writes are granted, including to allowlisted admins; writes must go through the checked RPC.
- `cyber_board.score` remains the original machine score. `base_score` is generated from it; `manual_adjustment` is maintained by a private aggregate trigger; `final_score` is generated as their sum. Public clients and admins cannot directly write these values.
- `cyber_standings()` is the canonical ordered query, deliberately **security invoker** so direct callers obey RLS. Its rank is never attached to a personal run or personal score summary.
- `cyber_board` RLS now permits reads only to allowlisted admins or after official reveal. While locked, both the direct table and the canonical function return zero rows to anonymous users/participants.
- `cyber_api` still settles and scores rounds using the original engine. It separately returns public `leaderboard` (empty while locked), admin-only `standings`, admin-only histories/participants/audit, and a rank-free `personal_score` for the current user. Every mutation independently checks `auth.uid()` and admin membership where required.
- Review actions lock the same event row as scoring. A results-version check rejects stale adjustment/finalize/reveal decisions after another coordinator changes results. Adjustment request UUIDs make retries idempotent: repeating an unchanged submitted request does not add points or audit records twice.
- Client identity changes immediately clear previously received private data. Older in-flight result versions cannot overwrite a newer hide/reopen/reset response. Public tables are hidden on detected connection failures; requests time out after eight seconds and polling retries recover automatically.

## Files changed

| Area                    | Files                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| New migration           | `supabase/002_results_review.sql`                                                              |
| Existing UI and styles  | `components/CyberType.tsx`, `app/globals.css`                                                  |
| New review/scorecard UI | `components/ResultsReview.tsx`, `components/Scorecards.tsx`                                    |
| Types, demo and CSV     | `lib/game.ts`, `lib/demo.ts`, new `lib/results-csv.ts`                                         |
| API migration guard     | `app/api/event/route.ts`                                                                       |
| Verification            | `tests/competition.test.ts`, new `tests/results-review.test.ts`, new `tests/review-ui.test.ts` |
| Lint tooling            | new `eslint.config.mjs`, `package.json`, `package-lock.json`                                   |
| Documentation           | `README.md`, `VERIFICATION.md`, this file                                                      |
| Browser evidence        | `screenshots/results-locked.png`, `screenshots/results-review.png`                             |

`supabase/001_cybertype.sql` is unchanged. Supabase client configuration, Auth architecture, original scoring engine SQL, signup/login, admin allowlist, and original Realtime table subscriptions are preserved.

## Security verification and remaining limits

The actual 001 + 002 migrations and PL/pgSQL run in embedded PostgreSQL (PGlite) under real `anon` and `authenticated` database roles with a mock `auth.uid()` identity. Tests cover existing-data preservation, RLS/direct RPC lockout, private helper denial, role escalation denial, original scoring and all three rounds, append-only/direct-write protections, required reasons/confirmation, forged admin identity, positive/negative/custom amounts, retry deduplication, stale-version rejection, negative totals, ties, finalization/reopening, hide/reveal, CSV escaping, and reset/audit retention. Component tests assert that personal scorecards never render rank and that non-admin snapshots cannot render Results Review.

**All 16 tests, typecheck, lint (zero warnings), and the production build pass.** npm reports zero known dependency vulnerabilities at this run. Local browser checks verified deduction/grace history, unchanged base scores, finalization while locked, a separate audience tab updating after reveal/hide, and refresh-safe personal scorecards without rank.

Hosted Supabase Auth and Realtime websocket delivery, the live production schema beyond the checked-in 001 migration, Vercel deployment, and concurrent real-event load still need your staging/deployment verification; no hosted credentials were supplied. The demo is client-side illustrative data, not a security boundary. Production security is enforced in PostgreSQL. Previously revealed/downloaded results cannot be made unknown by hiding them later. The existing single-event serialized scoring design and supervised-event anti-cheat limitations are unchanged. No automated malpractice detector has been added or claimed.

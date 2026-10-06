# CyberType / Tantra 26

A complete Next.js App Router + TypeScript competition app with an offline-credential-free demo and a Supabase production backend. The initial workspace was empty; no pre-existing application was replaced.

## Run locally

Requires Node.js 20.9+ (Node.js 22 LTS recommended) and npm.

```sh
cd outputs/cybertype
npm ci
npm run dev
```

Open http://localhost:3000. With both environment variables absent, the app runs in **clearly labeled demo mode**: playable three-round competition, sample leaderboard, local persistence, admin controls, scorecards, and CSV export. Demo admin is intentionally available only when no backend is configured. Demo data never enters production. Demo state is stored in this browser's localStorage. To replay, use **Explore demo admin → Reset event → Start / resume**. Reset asks for confirmation. Sample rivals are static illustrative results, not connected users.

## Production Supabase setup

1. Create a Supabase project. In **SQL Editor**, run `supabase/001_cybertype.sql` once. It creates the event, runs, public board, admin allowlist, append-only-for-clients audit table, RLS policies, server scoring functions, and Realtime publication membership. The migration is transactional when submitted as one query; do not rerun against an existing initialized database.
2. Under **Authentication → Providers**, enable email/password authentication. Keep email confirmation enabled; configure a production SMTP sender and appropriate authentication rate limits for your event's registrations.
3. In **Authentication → URL Configuration**, set Site URL to `http://localhost:3000` during local setup, then to your final HTTPS Vercel URL. Add the corresponding allowed redirect URL for each environment. Confirmation links return participants to the app; they then sign in with email/password.
4. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PROJECT_PUBLIC_ANON_KEY
   ```

   Use the public **anon** key from the project's API settings. These values are intentionally public. Do not use a service-role key. The application needs no service-role secret and never uses one to bypass user policies.

5. Restart the app. Register and verify your coordinator's email through the normal sign-up flow. In Supabase **Authentication → Users**, copy that user's UUID. Promote the verified account from the SQL Editor as the project owner:

   ```sql
   insert into public.cyber_admins(user_id)
   values ('REPLACE-WITH-VERIFIED-USER-UUID');
   ```

   There is no public admin registration or self-promotion API. To revoke admin access, delete that allowlist row in the SQL Editor. Do not put admin identity in editable user metadata.

6. Sign in as the coordinator. **Event control** appears after the next snapshot. Configure event details, prompts, durations, multipliers and penalties before starting. Production starts in **waiting**, with registration open.
7. Register a participant in a separate browser/session. Join with a **public alias** (not an email address). Open the leaderboard's **Audience display** for the projector; it does not require a login and contains no admin controls or emails.
8. Close registration when ready, then start the event. Joining remains possible while running only if the coordinator leaves registration open. Pausing freezes the shared competition clock for every participant. End freezes attempts and closes registration. Export CSV before a reset; reset deletes attempts and standings but retains the audit log.

The migration enables Realtime for `cyber_board` and `cyber_event`. Clients subscribe to those tables and also refresh on an approximately one-second interval, so dropped Realtime connections recover automatically.

## Exact Vercel deployment steps

1. Commit the application files to a Git repository; exclude `.env.local`, `node_modules`, and `.next` using the supplied `.gitignore`.
2. In Vercel, choose **Add New → Project**, import that repository, and select the **Next.js** framework preset.
3. Set **Root Directory** to the directory containing this app's `package.json`: `outputs/cybertype` if uploading this whole workspace, or leave it empty if this app folder is the repository root.
4. Choose Node.js **22.x**. Use `npm ci` for installation and `npm run build` for the build. Leave the output directory at the Next.js default.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Production and any Preview environments you intend to use. Public variables are embedded during build: redeploy after changes. Use a separate Supabase project for test/preview competitions to avoid modifying the live event.
6. Click **Deploy**. Update Supabase's Site URL and allowed redirect URLs to the resulting HTTPS domain. When adding a custom domain, update those settings again.
7. Verify sign-up/confirmation, participant join, admin sign-in, start/pause/resume, all three rounds, spectator updates and CSV download in two separate sessions before opening the event to participants.

No external project, account, credentials, or public deployment has been created by this deliverable. Supabase email delivery, hosted Auth, and deployed Realtime require your external configuration and a staging rehearsal.

## Published scoring and defaults

The rules page always displays the saved event configuration. Settings lock after the competition starts; reset is necessary to change them. Three rounds are mandatory and always in order. Completion or timeout saves a card and automatically starts a four-second countdown to the next round.

| Setting                                        | Initial default                                   |
| ---------------------------------------------- | ------------------------------------------------- |
| Speed Run / Terminal Rush / Hash Lock duration | 60 / 60 / 60 seconds                              |
| Points per correct character                   | 10                                                |
| WPM score weight                               | 5                                                 |
| Combo thresholds (rounds 2 and 3)              | 0, 10, 25, 50, 100 consecutive correct characters |
| Multipliers at thresholds                      | 1×, 1.25×, 1.5×, 2×, 3×                           |
| Hash Lock first mistake                        | −100 points                                       |
| Hash Lock second mistake                       | additional −250 points                            |
| Hash Lock third mistake                        | ends that round as eliminated                     |

- Only the correct next character advances the prompt cursor. A wrong character increments errors and attempts, resets combo/multiplier, and must be retried. Backspace does not remove a mistake. This removes the incentive to repeatedly erase and retype correct characters for points.
- `WPM = (correct characters / 5) / (max(elapsed seconds, 1) / 60)`.
- `accuracy = 100 × correct characters / attempted characters`; before the first attempt it is 100%.
- WPM and accuracy are rounded to two decimals.
- Each correct character adds `points × current multiplier` to **earned**. The character reaching a milestone uses the new multiplier. Round 1 always uses 1×.
- `round score = max(0, round((earned + speedWeight × WPM) × accuracy / 100 − penalties))`.
- Live WPM and score can decrease as time passes. Completed cards are frozen. A third Hash Lock mistake retains earned points after the first two penalties; it does not zero the previous rounds.
- Overall score is the sum of the three cards. Rank sorts score descending, then participant UUID ascending for deterministic ties. There is no unspecified qualifying cutoff. A blocked participant remains visible and marked; coordinator disputes use the published rule that judges' decisions are final.
- Default prompts are included in the migration and `lib/game.ts`. Prompts accept 10–2000 printable ASCII characters; Hash Lock requires hexadecimal. Durations accept 5–600 seconds. Milestone multipliers must start at 1 and increase; the second penalty must exceed the first. The four-second transition and three-strike rule are fixed competition mechanics.

## Security, persistence, and operational assumptions

- `/api/event` verifies a signed-in Supabase user for mutation requests and calls the database RPC with that user's token. The database independently checks identity and the admin allowlist; calling the RPC directly cannot bypass those checks.
- RLS and table grants allow participants to read only their own run. Only admins can read every run or the audit log. Anonymous users can read only event settings and the public leaderboard projection. Email/password data remains in Supabase Auth. Public aliases and random participant IDs appear in standings/CSV.
- Clients cannot directly insert/update scores, roles, event settings, audit rows or run state. Private helper functions have public execution revoked. All privileged functions use an empty search path and qualified object names.
- Scoring, errors, penalties, server time, transitions, and leaderboard updates happen transactionally inside PostgreSQL. The event row lock serializes event changes and input processing so pause/end cannot interleave with a scoring write. This is deliberately optimized for a single supervised lab event, not a large multi-tenant tournament. Load-test with your expected participant count before event day; the current snapshot/RPC processes active runs and returns the overall standings.
- Keystrokes are batched (maximum 50/request) with a per-round sequence number. Retried acknowledged batches do not count twice. The browser keeps unacknowledged production input in sessionStorage scoped to the signed-in user. Input is visually predicted but server responses remain authoritative. A network outage locks new input, retries saved input, and leaves the timer running. Received-after-deadline keystrokes cannot change a closed round.
- Refresh restores server-saved cards and pending production batches in the same browser tab. Closing the browser can lose unacknowledged input; completed cards persist in PostgreSQL. Background timers settle on the next API request, including spectator/admin polling, rather than needing a permanently running server or scheduled worker.
- Copy, paste, drop, text replacement, and multi-character input are blocked on the arena. Commands are ordinary inert text, never executed. Client-side restrictions cannot prove human typing or stop a custom API client; this is a supervised competition, not remote anti-cheat software. Use the provided event systems and coordinator supervision as specified in the rules.
- Participation is individual, as requested. Entry fee is **collected by coordinators**, not charged online. No payment processor was requested or configured. Date uses the provided October 7 label; Tantra 26 implies the 2026 event. The coordinator starts the event explicitly; no ambiguous timezone-based auto-start is imposed.
- UI supports narrow screens, keyboard navigation, visible focus, focused typing after countdown, reduced motion, and focus-trapped dialogs. Google Fonts provide optional typography; local font fallbacks remain usable if they cannot load.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests run the **actual migration and PL/pgSQL functions** in embedded PostgreSQL (PGlite) with mock Supabase Auth identity and real database roles. They cover SQL/demo scoring parity, combo resets, sudden-death thresholds, countdowns, timeouts, pause/resume, exact command symbols, replay protection, configuration validation, public/participant/admin isolation, direct-write denial, auditing, and complete three-round flow. PGlite does not test Supabase's hosted Auth, email delivery, Realtime websocket transport, or Vercel infrastructure.

Manual browser verification covers demo registration/countdown, individual keystroke scoring, refresh recovery, live admin monitoring, pause, and responsive desktop/mobile layouts. See `VERIFICATION.md` for the final run results.

## Source map

- `components/CyberType.tsx`: responsive participant/admin UI, auth, input queue, audience board, CSV.
- `app/api/event/route.ts`: authenticated RPC gateway.
- `supabase/001_cybertype.sql`: schema, seeded configuration, RLS, scoring, state transitions, audit.
- `lib/game.ts`: types, published defaults, demo scoring/prediction.
- `lib/demo.ts`: isolated local demo and seeded sample leaderboard.
- `tests/competition.test.ts`: engine and database integration/security tests.

Reference documentation: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).

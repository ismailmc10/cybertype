# Verification — October 6, 2026

## Automated checks

- `npm test`: **6 passed, 0 failed**. Tests execute the migration, RLS/grants, and actual PL/pgSQL scoring logic under PGlite PostgreSQL.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**, including static page generation and the dynamic API route.
- npm dependency audit during installation: **0 vulnerabilities reported**.

The database tests cover score parity between TypeScript and SQL, combo milestone/reset behavior, both penalties before elimination, exactly three rounds, timer/countdown transitions, pause/resume, exact command symbols, repeated input batches, invalid settings, admin confirmation, audit logging, unauthenticated mutations, participant row isolation, forbidden direct table writes and private helper access.

## Browser verification

Tested the running local app in the Codex browser:

- Joined as `test_runner`; four-second countdown automatically entered Speed Run.
- Typed individual characters and observed WPM, accuracy, progress and score update.
- Refreshed and returned to the arena; typed progress survived.
- Admin dashboard showed the participant, connection status and live metrics.
- Paused the event; the remaining time stayed at 35 seconds. Resumed successfully.
- Tried pasting; the app blocked it and displayed a message, without changing progress.
- Speed Run timed out and saved its scorecard; Terminal Rush began automatically.
- Reproduced the terminal prompt including quotes, wildcard, slash, hyphen, pipe, ampersands and underscore. Finished at 100% accuracy with a 59-character best combo and 2× multiplier.
- Hash Lock began automatically. First wrong character applied 100 points of penalty without elimination. Second applied a further 250. Third eliminated the participant from the round.
- Combined scorecard preserved all three cards and overall rank. Screenshot: `screenshots/scorecards.png`.
- Tested 390×844 mobile viewport: navigation and event/admin layouts adapted; no page-wide horizontal overflow. Restored the normal viewport afterward.

## External checks still required

No Supabase/Vercel project credentials were supplied. Hosted email confirmation, production login, actual Supabase websocket delivery, and Vercel deployment have not been exercised. Follow README setup and perform the two-session staging rehearsal before using the app for the live event. The local database tests validate policies and functions but do not substitute for hosted integration or concurrent-load testing.

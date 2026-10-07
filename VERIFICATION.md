# Verification — results review upgrade, October 7, 2026

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero warnings.
- `npm test`: 16 tests passed, zero failures.
- `npm run build`: passed; Next.js static frontend and dynamic API route generated successfully.
- Dependency audit after adding lint tooling: zero vulnerabilities reported.
- `git diff --check`: passed.

## Database and component tests

The tests execute the existing and new migration in PGlite PostgreSQL, rather than mocking the score/RLS implementation:

1. Existing SQL/demo scoring parity, combo reset, and input replay protection.
2. Round 3 first/second penalties and third-strike elimination; no sudden death in Round 1.
3. Exactly three automatic rounds, timers, countdowns and pause.
4. Participant/anonymous identity isolation and forbidden direct writes/private helper calls.
5. Configuration validation, destructive-action confirmation and event audit.
6. Complete server-side three-round competition including special command characters.
7. Migration preserves existing runs/base scores; a second application is safe.
8. Locked board rows and canonical standings are inaccessible to anon/participant table/function/RPC queries.
9. Participants cannot promote themselves, modify scores/audit, create adjustments, or reveal/finalize results.
10. End stays hidden; adjustments require an ended event, a valid nonzero signed integer, category, mandatory reason, and confirmation.
11. Deductions/grace/custom deltas update final totals and ordering, preserve originals, audit authenticated admin identity, and deduplicate retries.
12. Finalization/reveal require fresh review versions and confirmation; finalized results reject changes; tie order is consistent.
13. Hide/reopen remove read access; reopening allows corrections; negative totals and CSV escaping work.
14. Reset removes adjustments/attempts/standings, retains audit, resets visibility/finalization, and preserves the two original Realtime publications.
15. Personal scorecards render no rank, position, percentile or ahead-count before or after approval.
16. Locked display contains no table; Results Review renders nothing for a participant snapshot.

## Local browser checks

- Locked overview and audience screen contain no participant rankings or leaderboard scores.
- Completed personal scorecard shows personal/base/adjustment totals and round metrics without rank.
- Private Results Review is visible in demo admin, with separate base/adjustment/final columns.
- End confirms and does not reveal results.
- Applied −100 for a sample incident, then +25 for a sample organizer delay; confirmed each signed change with alias and reason. Base remained 3820; adjustment history recorded both; final became 3745.
- Finalize requires confirmation and keeps the audience locked.
- Revealing updates a separate audience tab automatically to the adjusted final scores. Audience markup contains no coordinator controls, reasons, or emails.
- Hiding requires confirmation and restores the locked audience screen.
- Demonstration uses existing local sample data only; no production scores were changed.

## Remaining external checks

No hosted credentials were supplied. Supabase Auth/email, hosted Realtime websocket delivery, production-schema drift from the checked-in 001 migration, real concurrent load, and the actual Vercel redeploy are not verified here. Apply 002 first, redeploy, then run the short two-session check in `RESULTS_REVIEW_DEPLOYMENT.md`.

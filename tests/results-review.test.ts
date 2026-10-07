import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Snapshot, Run, blank } from "../lib/game";
import { resultsCSV } from "../lib/results-csv";
const db = new PGlite();
const admin = "10000000-0000-0000-0000-000000000001",
  alpha = "20000000-0000-0000-0000-000000000001",
  beta = "20000000-0000-0000-0000-000000000002";
let beforeRuns: unknown, beforeBoard: unknown;
const migration = readFileSync("supabase/002_results_review.sql", "utf8");
async function as(id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id || "",
  ]);
  await db.exec(`set role ${role}`);
}
async function api(
  action = "snapshot",
  payload: Record<string, unknown> = {},
): Promise<Snapshot> {
  const r = await db.query<{ s: Snapshot }>(
    "select public.cyber_api($1,$2::jsonb) s",
    [action, JSON.stringify(payload)],
  );
  return r.rows[0].s;
}
async function command(name: string, extra: Record<string, unknown> = {}) {
  const s = await api();
  return api("admin", {
    command: name,
    confirm: "CONFIRM",
    results_version: s.event.results_version,
    ...extra,
  });
}
let nextRequest = 0;
function adjustment(delta: number, id = alpha) {
  return {
    id,
    delta,
    reason: "Verified coordinator incident record",
    category: delta < 0 ? "malpractice" : "grace",
    request_id: `30000000-0000-0000-0000-${String(++nextRequest).padStart(12, "0")}`,
  };
}
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`,
  );
  await db.exec(readFileSync("supabase/001_cybertype.sql", "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [
    admin,
    alpha,
    beta,
  ]);
  await db.query("insert into public.cyber_admins values($1)", [admin]);
  for (const [id, alias, score] of [
    [alpha, "CipherWolf", 860],
    [beta, "Beta", 800],
  ] as const) {
    const r: Run = {
      id,
      alias,
      round: 3,
      status: "complete",
      ready: 0,
      last_seen: new Date().toISOString(),
      cards: [
        { ...blank(1, 0), score, status: "completed" },
        { ...blank(2, 64), status: "completed" },
        { ...blank(3, 128), status: "completed" },
      ],
    };
    await db.query("insert into public.cyber_runs values($1,$2::jsonb)", [
      id,
      JSON.stringify(r),
    ]);
    await db.query("select public.cyber_publish($1,$2::jsonb)", [
      id,
      JSON.stringify(r),
    ]);
  }
  beforeRuns = (await db.query("select * from public.cyber_runs order by id"))
    .rows;
  beforeBoard = (
    await db.query("select id,score from public.cyber_board order by id")
  ).rows;
  await db.exec(migration);
});
after(async () => {
  await db.close();
});
test("migration preserves production runs/base scores and safely reruns without clearing data", async () => {
  assert.deepEqual(
    (await db.query("select * from public.cyber_runs order by id")).rows,
    beforeRuns,
  );
  assert.deepEqual(
    (await db.query("select id,score from public.cyber_board order by id"))
      .rows,
    beforeBoard,
  );
  await db.exec(migration);
  assert.deepEqual(
    (await db.query("select * from public.cyber_runs order by id")).rows,
    beforeRuns,
  );
  await as(admin);
  const s = await api();
  assert.equal(s.event.leaderboard_visible, false);
  assert.equal(s.event.results_finalized, false);
  assert.equal(s.standings.length, 2);
  assert.equal(s.standings[0].base_score, 860);
  assert.equal(s.standings[0].final_score, 860);
  assert.deepEqual(s.leaderboard, []);
});
test("anonymous and participant direct queries, canonical function, and RPC cannot expose locked rankings", async () => {
  for (const [id, role] of [
    [null, "anon"],
    [alpha, "authenticated"],
  ] as const) {
    await as(id, role);
    assert.deepEqual(
      (await db.query("select * from public.cyber_board")).rows,
      [],
    );
    assert.deepEqual(
      (await db.query("select * from public.cyber_standings()")).rows,
      [],
    );
    const s = await api();
    assert.deepEqual(s.leaderboard, []);
    assert.deepEqual(s.standings, []);
    assert.equal(s.admin, false);
    assert.equal(s.participants, null);
    assert.equal(s.adjustments, null);
    assert.equal(s.audit, null);
    assert.ok(!JSON.stringify(s).includes("Beta"));
    if (id) {
      assert.deepEqual(Object.keys(s.personal_score!).sort(), [
        "base_score",
        "final_score",
        "manual_adjustment",
      ]);
      assert.equal(s.personal_score?.base_score, 860);
      assert.equal(
        (await db.query("select * from public.cyber_runs")).rows.length,
        1,
      );
    } else assert.equal(s.run, null);
  }
});
test("participant cannot write scores/adjustments/audit, promote themselves or use private helper RPCs", async () => {
  await as(alpha);
  for (const sql of [
    "update public.cyber_board set score=99999",
    "update public.cyber_board set manual_adjustment=99999",
    "update public.cyber_event set leaderboard_visible=true",
    "insert into public.cyber_admins values(auth.uid())",
    "insert into public.cyber_score_adjustments(event_id,user_id,delta,reason,category,created_by,request_id) values(1,auth.uid(),25,'forged reason','grace',auth.uid(),'40000000-0000-0000-0000-000000000001')",
    "delete from public.cyber_score_adjustments",
    "update public.cyber_audit set action='forged'",
    "select public.cyber_publish(auth.uid(),'{}')",
    "select public.cyber_advance('{}','{}',0)",
  ]) {
    await assert.rejects(db.exec(sql), /permission denied/);
  }
  for (const name of ["adjust", "finalize", "reopen", "reveal", "hide"])
    await assert.rejects(
      command(name, { ...adjustment(25), created_by: admin }),
      /Admin access/,
    );
  assert.deepEqual(
    (await db.query("select * from public.cyber_score_adjustments")).rows,
    [],
  );
  await as(null, "anon");
  await assert.rejects(command("reveal"), /Authentication/);
  await assert.rejects(
    db.query("select * from public.cyber_runs"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select * from public.cyber_score_adjustments"),
    /permission denied/,
  );
});
test("end stays hidden; admin adjustments require sign, reason, confirmation, and ended review state", async () => {
  await as(admin);
  await assert.rejects(command("adjust", adjustment(-50)), /End the event/);
  await assert.rejects(command("finalize"), /End the event/);
  await assert.rejects(command("reveal"), /finalize/);
  await command("start");
  await command("pause");
  await command("start");
  const ended = await command("end");
  assert.equal(ended.event.status, "ended");
  assert.equal(ended.event.leaderboard_visible, false);
  assert.deepEqual(ended.leaderboard, []);
  for (const delta of [0, 1.5, 100001, -100001])
    await assert.rejects(command("adjust", adjustment(delta)));
  for (const reason of ["", "   ", "bad"])
    await assert.rejects(
      command("adjust", { ...adjustment(-50), reason }),
      /reason/,
    );
  await assert.rejects(
    command("adjust", { ...adjustment(-50), category: "invalid" }),
    /category/,
  );
  await assert.rejects(
    command("adjust", { ...adjustment(-50), confirm: null }),
    /Confirmation/,
  );
  await assert.rejects(
    command("adjust", { ...adjustment(-50), request_id: null }),
    /request ID/,
  );
  await assert.rejects(
    command("adjust", { ...adjustment(-50), results_version: -1 }),
    /Results changed/,
  );
});
test("deductions/grace/custom deltas preserve original score and idempotent history; final score determines rank", async () => {
  await as(admin);
  const deduction = adjustment(-100);
  const start = await api();
  const first = await command("adjust", { ...deduction, created_by: alpha });
  const a = first.standings.find((x) => x.id === alpha)!;
  assert.equal(a.base_score, 860);
  assert.equal(a.manual_adjustment, -100);
  assert.equal(a.final_score, 760);
  assert.equal(a.rank, 2);
  assert.equal(first.standings[0].id, beta);
  const record = first.adjustments![0];
  assert.equal(record.created_by, admin);
  assert.equal(record.reason, deduction.reason);
  assert.ok(record.created_at);
  const replay = await api("admin", {
    command: "adjust",
    ...deduction,
    confirm: "CONFIRM",
    results_version: start.event.results_version,
  });
  assert.equal(replay.adjustments!.length, 1);
  assert.equal(replay.event.results_version, first.event.results_version);
  await assert.rejects(
    command("adjust", { ...deduction, delta: -50 }),
    /already used/,
  );
  await command("adjust", adjustment(25));
  const s = await command("adjust", {
    ...adjustment(37),
    category: "technical_compensation",
  });
  assert.equal(s.standings[0].final_score, 822);
  assert.equal(s.standings[0].base_score, 860);
  assert.equal(s.standings[0].manual_adjustment, -38);
  await assert.rejects(
    db.exec("update public.cyber_score_adjustments set delta=500"),
    /permission denied/,
  );
  const aud = s.audit!.find(
    (x) => x.action === "adjust" && x.details?.delta === -100,
  )!;
  assert.equal(aud.actor, admin);
  assert.equal(aud.details?.previous_final_score, 860);
  assert.equal(aud.details?.final_score, 760);
  assert.equal(aud.details?.participant, alpha);
  await as(alpha);
  const own = await api("tick", { round: 3 });
  assert.equal(own.personal_score?.final_score, 822);
  assert.equal(own.run?.cards[0].score, 860);
  assert.deepEqual(own.standings, []);
  assert.deepEqual(own.leaderboard, []);
});
test("finalization/reveal require confirmation and fresh version; finalized results resist modifications", async () => {
  await as(admin);
  const old = await api();
  await command("adjust", adjustment(-22)); // exact tie with Beta
  const tied = await api();
  assert.equal(tied.standings[0].final_score, 800);
  assert.equal(tied.standings[0].id, alpha);
  assert.equal(tied.standings[1].id, beta);
  await assert.rejects(
    command("finalize", { results_version: old.event.results_version }),
    /Results changed/,
  );
  await assert.rejects(command("finalize", { confirm: false }), /Confirmation/);
  const s = await command("finalize");
  assert.equal(s.event.results_finalized, true);
  assert.equal(s.event.leaderboard_visible, false);
  await assert.rejects(command("adjust", adjustment(25)), /finalized/);
  await assert.rejects(
    command("block", { id: alpha, blocked: true }),
    /Reopen/,
  );
  await assert.rejects(command("reveal", { confirm: null }), /Confirmation/);
  await as(null, "anon");
  assert.deepEqual((await api()).leaderboard, []);
  assert.deepEqual(
    (await db.query("select * from public.cyber_standings()")).rows,
    [],
  );
  await as(admin);
  const reveal = await command("reveal");
  assert.equal(reveal.event.leaderboard_visible, true);
  assert.deepEqual(reveal.leaderboard, reveal.standings);
  await as(null, "anon");
  const publicResult = await api();
  assert.equal(publicResult.leaderboard.length, 2);
  assert.equal(publicResult.leaderboard[0].final_score, 800);
  assert.deepEqual(publicResult.standings, []);
  assert.equal(publicResult.audit, null);
  assert.equal(publicResult.adjustments, null);
  assert.ok(!JSON.stringify(publicResult).includes(deductionReason()));
  assert.equal(
    (await db.query("select * from public.cyber_standings()")).rows.length,
    2,
  );
  await as(alpha);
  const participant = await api();
  assert.equal(participant.personal_score?.final_score, 800);
  assert.ok(!("rank" in participant.personal_score!));
  assert.ok(!("rank" in participant.run!));
});
function deductionReason() {
  return "Verified coordinator incident record";
}
test("hide and reopen immediately remove direct access, allow corrections only after reopen, and persist after refresh", async () => {
  await as(admin);
  const hidden = await command("hide");
  assert.equal(hidden.event.leaderboard_visible, false);
  assert.equal(hidden.event.results_finalized, true);
  await as(null, "anon");
  assert.deepEqual(
    (await db.query("select * from public.cyber_board")).rows,
    [],
  );
  assert.deepEqual((await api()).leaderboard, []);
  await as(admin);
  await command("reveal");
  const reopened = await command("reopen");
  assert.equal(reopened.event.results_finalized, false);
  assert.equal(reopened.event.leaderboard_visible, false);
  await as(null, "anon");
  assert.deepEqual(
    (await db.query("select * from public.cyber_standings()")).rows,
    [],
  );
  await as(admin);
  const corrected = await command("adjust", {
    ...adjustment(-1000),
    category: "manual_correction",
  });
  assert.equal(
    corrected.standings.find((x) => x.id === alpha)!.final_score,
    -200,
  );
  assert.equal((await api()).event.results_finalized, false);
  const csv = resultsCSV(corrected);
  assert.ok(csv.includes('"Base score","Total adjustments","Final score"'));
  assert.ok(csv.includes(deductionReason()));
  assert.ok(csv.includes('"CipherWolf"'));
  assert.ok(!csv.includes("@"));
  const unsafe = {
    ...corrected,
    standings: corrected.standings.map((p) => ({ ...p, alias: "=FORMULA()" })),
    adjustments: corrected.adjustments?.map((a) => ({
      ...a,
      reason: 'A "quote", and a newline\nhere',
    })),
  };
  const encoded = resultsCSV(unsafe);
  assert.ok(encoded.includes("'="));
  assert.ok(encoded.includes('""quote""'));
  await as(alpha);
  assert.throws(
    () => resultsCSV({ ...corrected, admin: false }),
    /Admin access/,
  );
});
test("reset clears adjustments with attempts, keeps audit, locks public board and preserves Realtime publications", async () => {
  await as(admin);
  const previous = await api();
  const auditCount = (
    await db.query<{ n: number }>(
      "select count(*)::int n from public.cyber_audit",
    )
  ).rows[0].n;
  const reset = await command("reset");
  assert.equal(reset.event.status, "waiting");
  assert.equal(reset.event.results_finalized, false);
  assert.equal(reset.event.leaderboard_visible, false);
  assert.ok(reset.event.results_version > previous.event.results_version);
  assert.deepEqual(reset.standings, []);
  assert.deepEqual(reset.adjustments, []);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.cyber_audit",
      )
    ).rows[0].n,
    auditCount + 1,
  );
  const audit = reset.audit!.find((a) => a.action === "reset")!;
  assert.equal(audit.details?.cleared_runs, 2);
  assert.ok(Number(audit.details?.cleared_adjustments) > 0);
  await db.exec("reset role");
  const pubs = await db.query<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename",
  );
  assert.deepEqual(
    pubs.rows.map((p) => p.tablename),
    ["cyber_board", "cyber_event"],
  );
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { advance, defaults, Run, Event, blank, Snapshot } from "../lib/game";
const db = new PGlite();
const user = "00000000-0000-0000-0000-000000000001";
const admin = "00000000-0000-0000-0000-000000000002";
const other = "00000000-0000-0000-0000-000000000003";
async function identity(id: string | null) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id || "",
  ]);
}
async function api(action: string, payload: unknown = {}) {
  const res = await db.query<{ r: Snapshot }>(
    "select public.cyber_api($1,$2::jsonb) r",
    [action, JSON.stringify(payload)],
  );
  return res.rows[0].r;
}
before(async () => {
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; create publication supabase_realtime;`,
  );
  await db.exec(readFileSync("supabase/001_cybertype.sql", "utf8"));
  await db.exec(readFileSync("supabase/002_results_review.sql", "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [
    user,
    admin,
    other,
  ]);
  await db.query("insert into public.cyber_admins values($1)", [admin]);
});
after(async () => {
  await db.close();
});
test("scoring parity: SQL and demo, exact symbols, combo reset, idempotent batches", async () => {
  const settings = {
    ...defaults,
    prompts: ["a".repeat(120), "a".repeat(120), defaults.prompts[2]],
  };
  let run: Run = {
    id: user,
    alias: "Tester",
    round: 2,
    cards: [{ ...blank(1, 0), status: "completed" }, blank(2, 0)],
    status: "active",
    ready: 0,
    last_seen: "",
  };
  for (const [i, chars] of [
    ["a".repeat(50)],
    ["!"],
    ["a".repeat(50)],
  ].entries()) {
    const e: Event = {
      status: "running",
      registration: true,
      clock: 10 + i,
      settings,
    };
    const charsArray = chars.join("").split("");
    const js = advance(run, e, charsArray, i + 1);
    const sql = await db.query<{ r: Run }>(
      "select public.cyber_advance($1::jsonb,$2::jsonb,$3,$4::jsonb,$5) r",
      [
        JSON.stringify(run),
        JSON.stringify(settings),
        e.clock,
        JSON.stringify(charsArray),
        i + 1,
      ],
    );
    assert.deepEqual(sql.rows[0].r.cards, js.cards);
    run = js;
  }
  assert.equal(run.cards[1].errors, 1);
  assert.equal(run.cards[1].best, 50);
  assert.equal(run.cards[1].multiplier, 2);
  const replay = advance(
    run,
    { status: "running", registration: true, clock: 12, settings },
    ["a"],
    3,
  );
  assert.equal(replay.cards[1].pos, 100);
});
test("Hash Lock: first and second penalties, third mistake elimination; no sudden death in round 1", () => {
  let r: Run = {
    id: user,
    alias: "Tester",
    round: 3,
    cards: [blank(1, 0), blank(2, 0), blank(3, 0)],
    status: "active",
    ready: 0,
    last_seen: "",
  };
  const e: Event = {
    status: "running",
    registration: true,
    clock: 5,
    settings: defaults,
  };
  r = advance(r, e, ["z"], 1);
  assert.equal(r.cards[2].penalty, 100);
  assert.equal(r.status, "active");
  r = advance(r, e, ["z"], 2);
  assert.equal(r.cards[2].penalty, 350);
  assert.equal(r.status, "active");
  r = advance(r, e, ["z"], 3);
  assert.equal(r.cards[2].status, "eliminated");
  assert.equal(r.status, "complete");
  const first = advance(
    { ...r, round: 1, status: "active", cards: [blank(1, 0)] },
    e,
    ["z", "z", "z"],
    1,
  );
  assert.equal(first.cards[0].status, "active");
  assert.equal(first.cards[0].penalty, 0);
});
test("timeouts preserve scorecards, automatically advance exactly three rounds, and pauses freeze", () => {
  const e: Event = {
    status: "running",
    registration: true,
    clock: 60,
    settings: defaults,
  };
  let r: Run = {
    id: user,
    alias: "T",
    round: 1,
    cards: [blank(1, 0)],
    status: "active",
    ready: 0,
    last_seen: "",
  };
  r = advance(r, e);
  assert.equal(r.round, 2);
  assert.equal(r.cards[0].status, "timeout");
  assert.equal(r.status, "ready");
  r = advance(r, { ...e, clock: 63 });
  assert.equal(r.cards.length, 1);
  r = advance(r, { ...e, clock: 64 });
  assert.equal(r.cards.length, 2);
  assert.deepEqual(
    advance(r, { ...e, status: "paused", clock: 200 }, ["f"], 1),
    r,
  );
  r = advance(r, { ...e, clock: 124 });
  assert.equal(r.round, 3);
  r = advance(r, { ...e, clock: 188 });
  assert.equal(r.status, "complete");
  assert.equal(r.cards.length, 3);
});
test("database roles reject impersonation, public writes, helper calls, and admin operations", async () => {
  await identity(user);
  await db.exec("set role authenticated");
  await assert.rejects(api("admin", { command: "start" }), /Admin access/);
  await assert.rejects(
    db.exec("update public.cyber_event set status='running'"),
    /permission denied/,
  );
  await assert.rejects(
    db.exec("insert into public.cyber_admins values(auth.uid())"),
    /permission denied/,
  );
  await assert.rejects(
    db.exec("select public.cyber_advance('{}','{}',0)"),
    /permission denied/,
  );
  await api("join", { alias: "Tester" });
  await identity(other);
  await api("join", { alias: "Other" });
  const own = await db.query<{ id: string }>("select * from public.cyber_runs");
  assert.equal(own.rows.length, 1);
  assert.equal(own.rows[0].id, other);
  await identity(null);
  await db.exec("reset role;set role anon");
  const s = await api("snapshot");
  assert.equal(s.admin, false);
  assert.equal(s.run, null);
  assert.equal(s.participants, null);
  assert.equal(s.leaderboard.length, 0);
  assert.equal(s.standings.length, 0);
  await assert.rejects(api("join", { alias: "Anonymous" }), /Authentication/);
  await assert.rejects(
    db.exec("select * from public.cyber_runs"),
    /permission denied/,
  );
  await db.exec("reset role");
});
test("admin configuration validates defaults, confirms destructive actions, and logs state changes", async () => {
  await identity(admin);
  await db.exec("set role authenticated");
  await api("admin", { command: "configure", settings: defaults });
  await assert.rejects(
    api("admin", {
      command: "configure",
      settings: { ...defaults, penalties: [100, 50] },
    }),
    /Second penalty/,
  );
  await assert.rejects(
    api("admin", {
      command: "configure",
      settings: { ...defaults, prompts: ["short", "ok", "zzzzzzzzzz"] },
    }),
  );
  await assert.rejects(api("admin", { command: "reset" }), /Confirmation/);
  await api("admin", { command: "start" });
  await assert.rejects(
    api("admin", { command: "configure", settings: defaults }),
    /lock/,
  );
  const paused = await api("admin", { command: "pause" });
  assert.equal(paused.event.status, "paused");
  assert.ok(paused.audit!.some((x) => x.action === "start"));
  const end = await api("admin", { command: "end", confirm: "CONFIRM" });
  assert.equal(end.event.status, "ended");
  assert.equal(end.event.registration, false);
  const reset = await api("admin", { command: "reset", confirm: "CONFIRM" });
  assert.equal(reset.leaderboard.length, 0);
  assert.equal(reset.event.clock, 0);
  await db.exec("reset role");
});
test("server integration: exact command symbols, batch replay, per-user run, live pause and all three rounds", async () => {
  await identity(admin);
  await api("admin", { command: "reset", confirm: "CONFIRM" });
  const cfg = {
    ...defaults,
    prompts: [
      "abcdefghij",
      `echo "a_b" | sort && pwd /home -L`,
      "a".repeat(20),
    ],
  };
  await api("admin", { command: "configure", settings: cfg });
  await assert.rejects(
    api("admin", {
      command: "configure",
      settings: { ...cfg, durations: [null, 60, 60] },
    }),
  );
  await identity(user);
  await api("join", { alias: "End to end" });
  await identity(admin);
  await api("admin", { command: "start" });
  await db.exec(
    "update public.cyber_event set clock=5,active_since=clock_timestamp() where id=1",
  );
  await identity(user);
  let s = await api("tick", {
    round: 1,
    seq: 1,
    chars: cfg.prompts[0].split(""),
  });
  assert.equal(s.run!.round, 2);
  assert.equal(s.run!.cards[0].pos, 10);
  assert.equal(s.run!.cards[0].status, "completed");
  await db.exec(
    "update public.cyber_event set clock=10,active_since=clock_timestamp() where id=1",
  );
  s = await api("tick", { round: 2, seq: 1, chars: cfg.prompts[1].split("") });
  assert.equal(s.run!.round, 3);
  assert.equal(s.run!.cards[1].errors, 0);
  const saved = s.run!.cards[1].score;
  s = await api("tick", { round: 2, seq: 1, chars: cfg.prompts[1].split("") });
  assert.equal(s.run!.cards[1].score, saved);
  await db.exec(
    "update public.cyber_event set clock=15,active_since=clock_timestamp() where id=1",
  );
  s = await api("tick", { round: 3, seq: 1, chars: ["z"] });
  assert.equal(s.run!.cards[2].penalty, 100);
  assert.equal(s.run!.status, "active");
  await identity(admin);
  const paused = await api("admin", { command: "pause" });
  await identity(user);
  s = await api("tick", { round: 3, seq: 2, chars: ["z"] });
  assert.equal(s.run!.cards[2].errors, 1);
  assert.equal(s.event.clock, paused.event.clock);
  await identity(admin);
  await api("admin", { command: "start" });
  await identity(user);
  s = await api("tick", { round: 3, seq: 2, chars: ["z"] });
  assert.equal(s.run!.cards[2].errors, 2);
  assert.equal(s.run!.status, "active");
  s = await api("tick", { round: 3, seq: 3, chars: ["z"] });
  assert.equal(s.run!.cards[2].status, "eliminated");
  assert.equal(s.run!.cards.length, 3);
  assert.equal(s.run!.status, "complete");
  assert.equal(
    s.personal_score!.base_score,
    s.run!.cards.reduce((n, c) => n + c.score, 0),
  );
});

import {
  advance,
  defaults,
  entry,
  blank,
  ReviewEvent,
  Run,
  Snapshot,
  Adjustment,
  adjustmentCategories,
  Audit,
} from "./game";
type Demo = {
  event: ReviewEvent;
  run: Run | null;
  at: number;
  audit: Audit[];
  adjustments: Adjustment[];
};
const key = "cybertype-demo-v1";
const samples = [
  ["sample-1", "byte_runner", 3820, 84.2, 98.7],
  ["sample-2", "ctrl_alt_win", 3540, 78.6, 97.5],
  ["sample-3", "neon_ninja", 3215, 72.4, 96.2],
  ["sample-4", "pixel_pilot", 2860, 64.1, 95.8],
] as const;
function sampleRuns(): Run[] {
  return samples.map(([id, alias, score, wpm, accuracy]) => ({
    id,
    alias,
    round: 3,
    status: "complete",
    ready: 0,
    last_seen: "2026-01-01T00:00:00.000Z",
    cards: [
      { ...blank(1, 0), score, status: "completed", wpm, accuracy },
      { ...blank(2, 64), status: "completed", wpm, accuracy },
      { ...blank(3, 128), status: "completed", wpm, accuracy },
    ],
  }));
}
export function demoApi(
  action: string,
  payload: Record<string, unknown> = {},
  admin = false,
): Snapshot {
  let d: Demo;
  try {
    d = JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    d = null as unknown as Demo;
  }
  if (!d)
    d = {
      event: {
        status: "running",
        registration: true,
        clock: 0,
        settings: defaults,
        leaderboard_visible: false,
        results_finalized: false,
        results_version: 0,
      },
      run: null,
      at: Date.now(),
      audit: [],
      adjustments: [],
    };
  d.event.leaderboard_visible ??= false;
  d.event.results_finalized ??= false;
  d.event.results_version ??= 0;
  d.adjustments ??= [];
  if (d.event.status === "running") d.event.clock += (Date.now() - d.at) / 1000;
  d.at = Date.now();
  if (d.run) d.run = advance(d.run, d.event);
  if (action === "join") {
    if (!d.event.registration || d.event.status === "ended")
      throw Error("Registration is closed");
    if (!d.run)
      d.run = {
        id: "demo-you",
        alias: String(payload.alias || "You"),
        round: 1,
        cards: [],
        status: "ready",
        ready: d.event.clock + 4,
        last_seen: new Date().toISOString(),
      };
  }
  if (action === "tick" && d.run && payload.round === d.run.round) {
    d.run = advance(
      d.run,
      d.event,
      (payload.chars as string[]) || [],
      Number(payload.seq) || 0,
    );
    d.run.last_seen = new Date().toISOString();
  }
  if (action === "admin") {
    if (!admin) throw Error("Admin access required");
    const cmd = String(payload.command);
    let retry = false;
    if (
      [
        "end",
        "reset",
        "adjust",
        "finalize",
        "reopen",
        "reveal",
        "hide",
      ].includes(cmd) &&
      payload.confirm !== "CONFIRM"
    )
      throw Error("Confirmation required");
    if (cmd === "adjust") {
      const prior = d.adjustments.find(
        (a) => a.request_id === payload.request_id,
      );
      if (prior) {
        if (
          prior.user_id !== payload.id ||
          prior.delta !== payload.delta ||
          prior.reason !== String(payload.reason).trim() ||
          prior.category !== payload.category
        )
          throw Error("Request ID already used for different adjustment");
        retry = true;
      }
    }
    if (
      ["adjust", "finalize", "reopen", "reveal", "hide"].includes(cmd) &&
      !retry &&
      payload.results_version !== d.event.results_version
    )
      throw Error(
        "Results changed since your review. Refresh and review the latest standings before confirming.",
      );
    if (!retry)
      switch (cmd) {
        case "start":
          if (!["waiting", "paused"].includes(d.event.status))
            throw Error("Event cannot be started");
          d.event.status = "running";
          break;
        case "pause":
          if (d.event.status !== "running") throw Error("Event is not running");
          d.event.status = "paused";
          break;
        case "end":
          if (d.event.status === "ended") throw Error("Event is already ended");
          d.event.status = "ended";
          d.event.registration = false;
          d.event.leaderboard_visible = false;
          d.event.results_finalized = false;
          d.event.results_version++;
          if (d.run && d.run.status !== "complete") {
            const c = d.run.cards.at(-1);
            if (c?.status === "active") c.status = "ended";
            d.run.status = "ended";
          }
          break;
        case "reset":
          d.event = {
            ...d.event,
            status: "waiting",
            clock: 0,
            registration: true,
            leaderboard_visible: false,
            results_finalized: false,
            results_version: d.event.results_version + 1,
          };
          d.run = null;
          d.adjustments = [];
          break;
        case "configure":
          if (d.event.status !== "waiting")
            throw Error("Reset the demo before changing settings");
          d.event.settings = payload.settings as typeof defaults;
          break;
        case "registration":
          d.event.registration = !!payload.open;
          break;
        case "block":
          if (d.event.results_finalized)
            throw Error("Reopen results before changing participant status");
          if (d.run && d.run.id === payload.id)
            d.run.blocked = !!payload.blocked;
          d.event.results_version++;
          break;
        case "adjust": {
          if (d.event.status !== "ended")
            throw Error("End the event before applying score adjustments");
          if (d.event.results_finalized)
            throw Error(
              "Results are finalized. Reopen results before adjusting scores.",
            );
          const delta = Number(payload.delta),
            reason = String(payload.reason || "").trim();
          if (
            !Number.isInteger(delta) ||
            delta === 0 ||
            Math.abs(delta) > 100000
          )
            throw Error(
              "Adjustment must be nonzero and between -100000 and +100000",
            );
          if (reason.length < 5 || reason.length > 1000)
            throw Error("A reason of 5–1000 characters is required");
          if (
            !adjustmentCategories.includes(
              payload.category as Adjustment["category"],
            )
          )
            throw Error("Choose an adjustment category");
          if (!payload.request_id)
            throw Error("Adjustment request ID required");
          const participant = [...sampleRuns(), ...(d.run ? [d.run] : [])].find(
            (r) => r.id === payload.id,
          );
          if (!participant) throw Error("Participant not found");
          const previous =
            entry(participant).score +
            d.adjustments
              .filter((a) => a.user_id === payload.id)
              .reduce((v, a) => v + a.delta, 0);
          d.adjustments.unshift({
            id: Math.max(0, ...d.adjustments.map((a) => a.id)) + 1,
            event_id: 1,
            user_id: participant.id,
            delta,
            reason,
            category: payload.category as Adjustment["category"],
            created_by: "demo-coordinator",
            created_at: new Date().toISOString(),
            request_id: String(payload.request_id),
          });
          payload = {
            ...payload,
            participant: participant.id,
            created_by: "demo-coordinator",
            previous_final_score: previous,
            final_score: previous + delta,
          };
          d.event.results_version++;
          break;
        }
        case "finalize":
          if (d.event.status !== "ended")
            throw Error("End the event before finalizing results");
          if (d.event.results_finalized)
            throw Error("Results are already finalized");
          d.event.results_finalized = true;
          d.event.leaderboard_visible = false;
          d.event.results_version++;
          break;
        case "reopen":
          if (!d.event.results_finalized)
            throw Error("Results are not finalized");
          d.event.results_finalized = false;
          d.event.leaderboard_visible = false;
          d.event.results_version++;
          break;
        case "reveal":
          if (d.event.status !== "ended" || !d.event.results_finalized)
            throw Error("End the event and finalize results before revealing");
          d.event.leaderboard_visible = true;
          d.event.results_version++;
          break;
        case "hide":
          d.event.leaderboard_visible = false;
          d.event.results_version++;
          break;
        default:
          throw Error("Unknown admin command");
      }
    if (!retry)
      d.audit.unshift({
        action: cmd,
        actor: "demo-coordinator",
        details: payload,
        created_at: new Date().toISOString(),
      });
  }
  localStorage.setItem(key, JSON.stringify(d));
  const participants = [...sampleRuns(), ...(d.run ? [d.run] : [])];
  const standings = participants
    .map((r) => {
      const b = entry(r),
        adjust = d.adjustments
          .filter((a) => a.user_id === r.id)
          .reduce((v, a) => v + a.delta, 0);
      return {
        ...b,
        base_score: b.score,
        manual_adjustment: adjust,
        final_score: b.score + adjust,
      };
    })
    .sort((a, b) => b.final_score - a.final_score || a.id.localeCompare(b.id))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const own = standings.find((b) => b.id === d.run?.id);
  return {
    event: d.event,
    run: d.run,
    personal_score: own
      ? {
          base_score: own.base_score,
          manual_adjustment: own.manual_adjustment,
          final_score: own.final_score,
        }
      : null,
    leaderboard:
      d.event.leaderboard_visible &&
      d.event.results_finalized &&
      d.event.status === "ended"
        ? standings
        : [],
    standings: admin ? standings : [],
    admin,
    participants: admin ? participants : null,
    adjustments: admin ? d.adjustments : null,
    audit: admin ? d.audit : null,
  };
}

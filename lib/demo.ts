import { advance, defaults, entry, Event, Run, Snapshot } from "./game";
type Demo = {
  event: Event;
  run: Run | null;
  at: number;
  audit: { action: string; created_at: string }[];
};
const key = "cybertype-demo-v1";
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
      },
      run: null,
      at: Date.now(),
      audit: [],
    };
  if (d.event.status === "running") d.event.clock += (Date.now() - d.at) / 1000;
  d.at = Date.now();
  if (d.run) d.run = advance(d.run, d.event);
  if (action === "join") {
    if (!d.event.registration) throw Error("Registration is closed");
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
  if (action === "admin" && admin) {
    const cmd = payload.command;
    switch (cmd) {
      case "start":
        d.event.status = "running";
        break;
      case "pause":
        d.event.status = "paused";
        break;
      case "end":
        d.event.status = "ended";
        d.event.registration = false;
        if (d.run && d.run.status !== "complete") d.run.status = "ended";
        break;
      case "reset":
        d.event = {
          ...d.event,
          status: "waiting",
          clock: 0,
          registration: true,
        };
        d.run = null;
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
        if (d.run) d.run.blocked = !!payload.blocked;
        break;
    }
    d.audit.unshift({
      action: String(cmd),
      created_at: new Date().toISOString(),
    });
  }
  localStorage.setItem(key, JSON.stringify(d));
  const sample = [
    {
      id: "sample-1",
      alias: "byte_runner",
      score: 3820,
      round: 3,
      status: "complete",
      wpm: 84.2,
      accuracy: 98.7,
    },
    {
      id: "sample-2",
      alias: "ctrl_alt_win",
      score: 3540,
      round: 3,
      status: "complete",
      wpm: 78.6,
      accuracy: 97.5,
    },
    {
      id: "sample-3",
      alias: "neon_ninja",
      score: 3215,
      round: 3,
      status: "complete",
      wpm: 72.4,
      accuracy: 96.2,
    },
    {
      id: "sample-4",
      alias: "pixel_pilot",
      score: 2860,
      round: 3,
      status: "complete",
      wpm: 64.1,
      accuracy: 95.8,
    },
  ];
  const leaderboard = [...sample, ...(d.run ? [entry(d.run)] : [])].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  return {
    event: d.event,
    run: d.run,
    leaderboard,
    admin,
    participants: d.run ? [d.run] : [],
    audit: d.audit,
  };
}

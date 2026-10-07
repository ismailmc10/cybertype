export const roundNames = ["Speed Run", "Terminal Rush", "Hash Lock"];
export type Settings = {
  date: string;
  time: string;
  venue: string;
  department: string;
  type: string;
  fee: number;
  first: number;
  second: number;
  durations: number[];
  prompts: string[];
  multipliers: number[];
  points: number;
  speedWeight: number;
  penalties: number[];
};
export const defaults: Settings = {
  date: "October 7",
  time: "10:00 AM – 11:00 AM",
  venue: "Lab 9",
  department: "CC",
  type: "Individual",
  fee: 25,
  first: 1000,
  second: 500,
  durations: [60, 60, 60],
  prompts: [
    "Beyond the screen lies a world of possibilities. Every keystroke is a step forward, every challenge a chance to grow. Stay focused, find your rhythm, and let your fingers do the talking. The future belongs to those who dare to build it.",
    'find /home/user -name "*.log" | sort && echo "system_ready"',
    "a3f09c2e7b14d8650fca93e21b7d08465cfa19e28b073d54a2c86f091ebd3476",
  ],
  multipliers: [1, 1.25, 1.5, 2, 3],
  points: 10,
  speedWeight: 5,
  penalties: [100, 250],
};
export type Card = {
  round: number;
  pos: number;
  attempts: number;
  errors: number;
  combo: number;
  best: number;
  earned: number;
  penalty: number;
  score: number;
  wpm: number;
  accuracy: number;
  elapsed: number;
  status: string;
  started: number;
  seq: number;
  multiplier: number;
};
export type Run = {
  id: string;
  alias: string;
  round: number;
  cards: Card[];
  status: string;
  ready: number;
  last_seen: string;
  blocked?: boolean;
};
export type Event = {
  status: string;
  registration: boolean;
  clock: number;
  settings: Settings;
};
export type Entry = {
  id: string;
  alias: string;
  score: number;
  round: number;
  status: string;
  wpm: number;
  accuracy: number;
};
export type ReviewEvent = Event & {
  leaderboard_visible: boolean;
  results_finalized: boolean;
  results_version: number;
};
export type ScoreSummary = {
  base_score: number;
  manual_adjustment: number;
  final_score: number;
};
export type Standing = Entry & ScoreSummary & { rank: number };
export const adjustmentCategories = [
  "malpractice",
  "rule_violation",
  "grace",
  "sportsmanship",
  "technical_compensation",
  "manual_correction",
  "other",
] as const;
export type AdjustmentCategory = (typeof adjustmentCategories)[number];
export type Adjustment = {
  id: number;
  event_id: number;
  user_id: string;
  delta: number;
  reason: string;
  category: AdjustmentCategory;
  created_by: string;
  created_at: string;
  request_id: string;
};
export type Audit = {
  id?: number;
  actor?: string;
  action: string;
  details?: Record<string, unknown>;
  created_at: string;
};
export type Snapshot = {
  event: ReviewEvent;
  run: Run | null;
  leaderboard: Standing[];
  standings: Standing[];
  personal_score: ScoreSummary | null;
  adjustments?: Adjustment[] | null;
  admin: boolean;
  participants?: Run[] | null;
  audit?: Audit[] | null;
};
export function blank(round: number, now: number): Card {
  return {
    round,
    pos: 0,
    attempts: 0,
    errors: 0,
    combo: 0,
    best: 0,
    earned: 0,
    penalty: 0,
    score: 0,
    wpm: 0,
    accuracy: 100,
    elapsed: 0,
    status: "active",
    started: now,
    seq: 0,
    multiplier: 1,
  };
}
export function advance(
  run: Run,
  e: Event,
  chars: string[] = [],
  seq = 0,
): Run {
  const r = structuredClone(run),
    s = e.settings;
  if (
    r.blocked ||
    e.status !== "running" ||
    ["complete", "ended"].includes(r.status)
  )
    return r;
  if (r.status === "ready") {
    if (e.clock < r.ready) return r;
    r.status = "active";
    r.cards.push(blank(r.round, r.ready));
  }
  const c = r.cards[r.round - 1];
  c.elapsed = Math.min(
    s.durations[r.round - 1],
    Math.max(0, e.clock - c.started),
  );
  if (
    c.elapsed < s.durations[r.round - 1] &&
    seq === c.seq + 1 &&
    chars.length
  ) {
    for (const ch of chars) {
      if (c.status !== "active") break;
      c.attempts++;
      if (ch === s.prompts[r.round - 1][c.pos]) {
        c.pos++;
        c.combo++;
        c.best = Math.max(c.best, c.combo);
        c.multiplier =
          r.round === 1
            ? 1
            : s.multipliers[
                c.combo >= 100
                  ? 4
                  : c.combo >= 50
                    ? 3
                    : c.combo >= 25
                      ? 2
                      : c.combo >= 10
                        ? 1
                        : 0
              ];
        c.earned += s.points * c.multiplier;
      } else {
        c.errors++;
        c.combo = 0;
        c.multiplier = 1;
        if (r.round === 3) {
          c.penalty += s.penalties[c.errors - 1] || 0;
          if (c.errors >= 3) c.status = "eliminated";
        }
      }
      if (c.pos === s.prompts[r.round - 1].length) c.status = "completed";
    }
    c.seq = seq;
  }
  c.accuracy = c.attempts
    ? Math.round((c.pos / c.attempts) * 10000) / 100
    : 100;
  c.wpm = Math.round((c.pos / 5 / Math.max(c.elapsed, 1)) * 60 * 100) / 100;
  c.score = Math.max(
    0,
    Math.round(
      ((c.earned + s.speedWeight * c.wpm) * c.accuracy) / 100 - c.penalty,
    ),
  );
  if (c.elapsed >= s.durations[r.round - 1] && c.status === "active")
    c.status = "timeout";
  if (c.status !== "active") {
    if (r.round === 3) r.status = "complete";
    else {
      r.round++;
      r.status = "ready";
      r.ready = e.clock + 4;
    }
  }
  return r;
}
export function entry(r: Run): Entry {
  const c = r.cards.at(-1);
  return {
    id: r.id,
    alias: r.alias,
    score: r.cards.reduce((a, c) => a + c.score, 0),
    round: r.round,
    status: r.blocked ? "blocked" : r.status,
    wpm: c?.wpm || 0,
    accuracy: c?.accuracy ?? 100,
  };
}
export const rules = [
  "Type only the content displayed by the system.",
  "Copy/paste and external typing assistance are prohibited.",
  "Use the provided keyboard/system unless coordinators say otherwise.",
  "Speed and accuracy both contribute to scoring.",
  "Errors reduce accuracy, reset combos, and may trigger round-specific penalties.",
  "Do not interfere with another participant’s system.",
  "Linux commands and hashes are typed only, never executed.",
  "Qualification and rankings use the published scoring rules.",
  "Sudden Death penalties apply only in Round 3.",
  "Coordinators’/judges’ decisions are final in technical or scoring disputes.",
];

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Terminal,
  Keyboard,
  Hash,
  Trophy,
  Activity,
  Shield,
  LogOut,
  Radio,
  ChevronRight,
  Clock,
  MapPin,
  Calendar,
  Users,
  Zap,
  Check,
  Download,
  Search,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Maximize2,
  Command,
  Wifi,
  AlertTriangle,
} from "lucide-react";
import {
  advance,
  defaults,
  entry,
  roundNames,
  rules,
  Snapshot,
  Run,
  Settings,
} from "@/lib/game";
import { configured, supabase } from "@/lib/supabase";
import { demoApi } from "@/lib/demo";

type Tab = "overview" | "arena" | "leaderboard" | "rules" | "admin";
type Batch = { round: number; seq: number; chars: string[] };
const icons = [Keyboard, Terminal, Hash];
export default function CyberType() {
  const [tab, setTab] = useState<Tab>("overview"),
    [snap, setSnap] = useState<Snapshot | null>(null),
    [user, setUser] = useState<string | null>(null),
    [auth, setAuth] = useState(false),
    [signup, setSignup] = useState(false),
    [notice, setNotice] = useState(""),
    [demoAdmin, setDemoAdmin] = useState(false),
    [projector, setProjector] = useState(false),
    [online, setOnline] = useState(true),
    [queueVersion, setQueueVersion] = useState(0),
    [alias, setAlias] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Run | null>(null),
    [edit, setEdit] = useState<Settings | null>(null),
    [working, setWorking] = useState(false);
  const current = useRef<Snapshot | null>(null),
    busy = useRef(false),
    pending = useRef<string[]>([]),
    batch = useRef<Batch | null>(null),
    lastSync = useRef(0),
    retryAfter = useRef(0),
    typing = useRef<HTMLTextAreaElement>(null),
    authUser = useRef<string | null>(null),
    adminRef = useRef(false);
  adminRef.current = demoAdmin;
  const persist = () => {
    if (authUser.current)
      sessionStorage.setItem(
        "cybertype-pending-" + authUser.current,
        JSON.stringify({ batch: batch.current, pending: pending.current }),
      );
  };
  const accept = (s: Snapshot) => {
    current.current = s;
    setSnap(s);
    lastSync.current = Date.now();
  };
  const call = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (!configured) return demoApi(action, payload, adminRef.current);
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      const res = await fetch("/api/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Connection failed");
      return data as Snapshot;
    },
    [],
  );
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const s = await call("snapshot");
        if (live) accept(s);
      } catch (e) {
        if (live) setNotice(String(e));
      }
    };
    load();
    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id || null;
      authUser.current = id;
      setUser(session?.user.email || null);
      pending.current = [];
      batch.current = null;
      if (id) {
        try {
          const saved = JSON.parse(
            sessionStorage.getItem("cybertype-pending-" + id) || "null",
          );
          if (saved) {
            pending.current = saved.pending || [];
            batch.current = saved.batch;
          }
        } catch {}
      }
      setTimeout(load, 0);
    });
    const channel = supabase
      ?.channel("cybertype-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cyber_board" },
        () => {
          lastSync.current = Math.min(lastSync.current, Date.now() - 500);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cyber_event" },
        () => {
          lastSync.current = Math.min(lastSync.current, Date.now() - 500);
        },
      )
      .subscribe();
    return () => {
      live = false;
      sub?.data.subscription.unsubscribe();
      if (channel) supabase?.removeChannel(channel);
    };
  }, [call]);
  useEffect(() => {
    const timer = setInterval(async () => {
      if (busy.current || !current.current || Date.now() < retryAfter.current)
        return;
      const s = current.current,
        r = s.run;
      if (!batch.current && pending.current.length && r) {
        batch.current = {
          round: r.round,
          seq: (r.cards[r.round - 1]?.seq || 0) + 1,
          chars: pending.current.splice(0, 50),
        };
        persist();
      }
      if (
        (!batch.current || s.event.status !== "running") &&
        Date.now() - lastSync.current < 1000
      )
        return;
      busy.current = true;
      try {
        const b = batch.current;
        const next = await call(
          r ? "tick" : "snapshot",
          b ? { ...b } : { round: r?.round },
        );
        if (
          b &&
          (next.run?.round !== b.round ||
            (next.run?.cards[b.round - 1]?.seq || 0) >= b.seq ||
            next.event.status === "ended" ||
            next.run?.blocked)
        ) {
          batch.current = null;
          persist();
        }
        if (next.run?.round !== r?.round || next.run?.status !== "active") {
          pending.current = [];
          persist();
        }
        accept(next);
        setOnline(true);
        setQueueVersion((v) => v + 1);
      } catch {
        setOnline(false);
        lastSync.current = Date.now();
        retryAfter.current = Date.now() + 2000;
      } finally {
        busy.current = false;
      }
    }, 150);
    return () => clearInterval(timer);
  }, [call]);
  useEffect(() => {
    if (tab === "arena" && snap?.run?.status === "active")
      typing.current?.focus();
  }, [tab, snap?.run?.status, snap?.run?.round]);
  useEffect(() => {
    if (!auth && !selected && !edit) return;
    const before = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,textarea,[tabindex="0"]',
        ) || [],
      );
    focusables()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAuth(false);
        setSelected(null);
        setEdit(null);
      }
      if (e.key === "Tab") {
        const list = focusables(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      before?.focus();
    };
  }, [auth, !!selected, !!edit]);
  async function act(action: string, payload: Record<string, unknown> = {}) {
    if (busy.current) {
      setNotice("Syncing your last action. Try again in a moment.");
      return;
    }
    busy.current = true;
    setWorking(true);
    try {
      accept(await call(action, payload));
      setNotice("");
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  async function command(command: string, extra: Record<string, unknown> = {}) {
    if (
      ["end", "reset"].includes(command) &&
      !window.confirm(
        command === "reset"
          ? "Reset this event? All participant attempts and results will be removed. Export results first."
          : "End this event now? Active attempts will stop and registration will close.",
      )
    )
      return;
    return await act("admin", { command, ...extra, confirm: "CONFIRM" });
  }
  const s = snap?.event.settings || defaults;
  const raw = snap?.run;
  let run = raw;
  if (raw && snap?.event.status === "running" && raw.status === "active") {
    const c = raw.cards[raw.round - 1],
      queued = [
        ...(batch.current?.round === raw.round ? batch.current.chars : []),
        ...pending.current,
      ];
    if (queued.length) run = advance(raw, snap.event, queued, c.seq + 1);
  }
  void queueVersion;
  const card = run?.cards[(raw?.round || 1) - 1],
    board = snap?.leaderboard || [],
    rank = raw ? board.findIndex((x) => x.id === raw.id) + 1 : 0;
  const total = raw ? entry(raw).score : 0;
  function onChar(ch: string) {
    if (
      !raw ||
      raw.status !== "active" ||
      snap?.event.status !== "running" ||
      raw.blocked ||
      !online
    )
      return;
    if (pending.current.length >= 100) {
      setNotice("Waiting for the server to save your typing…");
      return;
    }
    pending.current.push(ch);
    persist();
    setQueueVersion((v) => v + 1);
  }
  function exportCSV() {
    const rows = [
      [
        "Rank",
        "Public alias",
        "Participant ID",
        "Round",
        "Status",
        "Score",
        "WPM",
        "Accuracy",
        "R1 score",
        "R2 score",
        "R3 score",
        "R3 penalties",
        "R3 errors",
      ],
      ...board.map((p, i) => {
        const r = snap?.participants?.find((r) => r.id === p.id);
        return [
          i + 1,
          p.alias,
          p.id,
          p.round,
          p.status,
          p.score,
          p.wpm,
          p.accuracy,
          ...[0, 1, 2].map((n) => r?.cards[n]?.score ?? ""),
          r?.cards[2]?.penalty ?? "",
          r?.cards[2]?.errors ?? "",
        ];
      }),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cybertype-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function showBoard() {
    setProjector(true);
    setTab("leaderboard");
  }
  if (!snap)
    return (
      <main className="loading">
        <Command size={40} />
        <h1>
          CYBER<span>TYPE</span>
        </h1>
        <p>{notice || "Connecting to the arena…"}</p>
        <button onClick={() => location.reload()}>Retry connection</button>
      </main>
    );
  return (
    <div className={projector ? "app projector" : "app"}>
      {!projector && (
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setTab("overview");
            }}
          >
            <span className="brand-icon">
              <Terminal size={23} />
            </span>
            CYBER<span>TYPE</span>
            <small>TANTRA 26 / {s.department} DEPARTMENT</small>
          </a>
          <div className="nav-label">COMPETITION</div>
          <nav>
            {(
              [
                ["overview", "Overview", Command],
                ["arena", "Typing arena", Keyboard],
                ["leaderboard", "Leaderboard", Trophy],
                ["rules", "Rules & scoring", Shield],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                className={tab === id ? "nav active" : "nav"}
                onClick={() => setTab(id)}
              >
                <Icon size={18} />
                {label}
                {id === "arena" && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="side-event">
            <span className="eyebrow">THE NEXT KEY IS YOURS.</span>
            <div className="key-art">
              <span>ctrl</span>
              <span>alt</span>
              <span className="glow-key">win ↗</span>
            </div>
            <p>
              Three rounds.
              <br />
              One keyboard. Your moment.
            </p>
          </div>
          <div className="sidebar-bottom">
            {(snap.admin || !configured) && (
              <button
                className={tab === "admin" ? "nav active" : "nav"}
                onClick={() => {
                  if (!configured) {
                    setDemoAdmin(true);
                    accept(demoApi("snapshot", {}, true));
                  }
                  setTab("admin");
                }}
              >
                <Settings2 size={18} />
                {configured ? "Event control" : "Explore demo admin"}
              </button>
            )}
            <div className="system">
              <span className="dot" />{" "}
              {online ? "Systems operational" : "Reconnecting…"}
              <small>CYBERTYPE v1.0</small>
            </div>
          </div>
        </aside>
      )}
      <div className="workspace">
        <header>
          <div className="breadcrumb">
            TANTRA 26 <ChevronRight size={13} />
            <span>
              {projector
                ? "Audience display"
                : tab === "arena"
                  ? "Typing arena"
                  : tab === "admin"
                    ? "Event control"
                    : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </span>
          </div>
          <div className="header-actions">
            <span
              className={
                "status " + (snap.event.status === "running" ? "live" : "")
              }
            >
              <span className="dot" />
              {snap.event.status === "running"
                ? "EVENT LIVE"
                : snap.event.status.toUpperCase()}
            </span>
            {!configured ? (
              <span className="demo-tag">DEMO MODE</span>
            ) : user ? (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  await supabase!.auth.signOut();
                  setTab("overview");
                }}
              >
                <LogOut size={18} />
              </button>
            ) : (
              <button onClick={() => setAuth(true)}>
                Sign in <ArrowUpRight size={14} />
              </button>
            )}
            {projector && (
              <button onClick={() => setProjector(false)}>Exit display</button>
            )}
          </div>
        </header>
        <main>
          {!configured && !projector && (
            <div className="demo-banner">
              <Radio size={15} />
              <span>
                Interactive demo · Results stay in this browser. Leaderboard
                rivals are sample data.
              </span>
              <span className="demo-right">NO ACCOUNT NEEDED</span>
            </div>
          )}
          {notice && (
            <div className="notice" role="alert">
              <AlertTriangle size={17} />
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {!online && (
            <div className="notice" role="status">
              Connection interrupted. Typing is locked while saved input
              retries. The server timer keeps running.
            </div>
          )}
          {tab === "overview" && (
            <>
              <section className="hero">
                <div className="hero-grid" />
                <div className="hero-content">
                  <div className="eyebrow">
                    <span className="tiny-line" /> TANTRA 26 PRESENTS
                  </div>
                  <h1>
                    Think fast.
                    <br />
                    Type <span>faster.</span>
                    <i>_</i>
                  </h1>
                  <p>
                    Speed meets precision. Take on three rounds of pure
                    <br className="desktop" /> typing adrenaline and claim your
                    place at the top.
                  </p>
                  <div className="hero-actions">
                    <button className="primary" onClick={() => setTab("arena")}>
                      {raw ? "Return to arena" : "Enter the arena"}
                      <ArrowUpRight size={18} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setTab("rules")}
                    >
                      How it works <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="hero-meta">
                    <span>
                      <Users size={14} /> {s.type} event
                    </span>
                    <span>
                      <Zap size={14} /> 3 rounds. All skill.
                    </span>
                  </div>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="floating-code code-top">
                    &gt; initialize_speed.exe
                    <br />
                    <span>system ready_</span>
                  </div>
                  <div className="giant-key">
                    <span className="key-symbol">↵</span>
                    <span className="key-label">ENTER</span>
                  </div>
                  <div className="floating-code code-bottom">
                    <span className="dot" /> YOUR NEXT LEVEL STARTS HERE
                  </div>
                  <span className="visual-cross cross-one">+</span>
                  <span className="visual-cross cross-two">+</span>
                </div>
              </section>
              <section className="event-strip">
                {[
                  [Calendar, "DATE", s.date],
                  [Clock, "TIME", s.time],
                  [MapPin, "VENUE", s.venue],
                  [Users, "ENTRY FEE", "₹" + s.fee],
                ].map(([Icon, label, value]) => {
                  const I = Icon as typeof Calendar;
                  return (
                    <div key={String(label)}>
                      <I size={19} />
                      <div>
                        <small>{String(label)}</small>
                        <strong>{String(value)}</strong>
                      </div>
                    </div>
                  );
                })}
              </section>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">THE CHALLENGE</span>
                  <h2>Three rounds. Zero shortcuts.</h2>
                </div>
                <span className="muted small">
                  Auto-advance. Stay in the zone.
                </span>
              </div>
              <section className="round-grid">
                {roundNames.map((name, i) => {
                  const Icon = icons[i];
                  return (
                    <article className={"round-card round-" + i} key={name}>
                      <div className="round-top">
                        <span className="round-icon">
                          <Icon size={24} />
                        </span>
                        <span className="mono muted">0{i + 1} / ROUND</span>
                      </div>
                      <h3>
                        {name}
                        <ArrowUpRight size={18} />
                      </h3>
                      <p>
                        {
                          [
                            "Find your flow. Race through an English passage with speed and precision.",
                            "Enter the command line. Match every symbol and build your combo streak.",
                            "Crack the sequence. Type hexadecimal strings under sudden-death pressure.",
                          ][i]
                        }
                      </p>
                      <div className="card-tags">
                        <span>{s.durations[i]} SECONDS</span>
                        <span>
                          {
                            ["SPEED + ACCURACY", "COMBO BOOST", "SUDDEN DEATH"][
                              i
                            ]
                          }
                        </span>
                      </div>
                    </article>
                  );
                })}
              </section>
              <section className="bottom-grid">
                <div className="prize-panel">
                  <div className="prize-title">
                    <Trophy size={23} />
                    <div>
                      <span className="eyebrow">THE STAKES</span>
                      <h2>Fast fingers. Real rewards.</h2>
                    </div>
                  </div>
                  <div className="prizes">
                    <div>
                      <span className="medal">01</span>
                      <div>
                        <small>FIRST PLACE</small>
                        <strong>₹{s.first.toLocaleString("en-IN")}</strong>
                      </div>
                    </div>
                    <div>
                      <span className="medal silver">02</span>
                      <div>
                        <small>SECOND PLACE</small>
                        <strong>₹{s.second.toLocaleString("en-IN")}</strong>
                      </div>
                    </div>
                  </div>
                  <p>Bring your focus. We’ll bring the competition.</p>
                </div>
                <div className="mini-board">
                  <div className="panel-title">
                    <h3>
                      <Activity size={18} /> On the leaderboard
                    </h3>
                    <button
                      className="text-button"
                      onClick={() => setTab("leaderboard")}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {board.slice(0, 3).map((p, i) => (
                    <div className="mini-row" key={p.id}>
                      <span className={"place p" + i}>0{i + 1}</span>
                      <span className="avatar">
                        {p.alias.slice(0, 2).toUpperCase()}
                      </span>
                      <strong>{p.alias}</strong>
                      <span className="mono">
                        {p.score.toLocaleString()} <small>pts</small>
                      </span>
                    </div>
                  ))}
                  {!board.length && (
                    <p className="muted">
                      The arena is waiting for its first competitor.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
          {tab === "arena" && (
            <>
              <PageTitle
                eyebrow="FOCUS MODE"
                title="Make every keystroke count."
                subtitle="Accuracy is your edge. Find your rhythm."
              />
              {!raw ? (
                <section className="join panel">
                  <div className="round-icon">
                    <Keyboard size={30} />
                  </div>
                  <h2>Your keyboard. Your moment.</h2>
                  <p>
                    Three rounds, played in order. Your public alias appears on
                    the leaderboard.
                  </p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (configured && !user) {
                        setAuth(true);
                        return;
                      }
                      await act("join", {
                        alias: alias.trim() || "demo_player",
                      });
                    }}
                  >
                    <label>
                      Public participant alias
                      <input
                        required
                        minLength={2}
                        maxLength={30}
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        placeholder="e.g. byte_runner"
                        autoComplete="nickname"
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={!snap.event.registration || working}
                    >
                      {snap.event.registration
                        ? "Join competition"
                        : "Registration closed"}
                      <ArrowRight size={18} />
                    </button>
                  </form>
                  <small>
                    Entry fee: ₹{s.fee} · Payment is collected by coordinators
                    at the venue.
                  </small>
                </section>
              ) : (
                <>
                  <div className="round-stepper">
                    {roundNames.map((name, i) => (
                      <div
                        className={
                          raw.round === i + 1
                            ? "current"
                            : raw.round > i + 1
                              ? "done"
                              : ""
                        }
                        key={name}
                      >
                        <span>
                          {raw.round > i + 1 ? (
                            <Check size={15} />
                          ) : (
                            String(i + 1).padStart(2, "0")
                          )}
                        </span>
                        {name}
                        <small>{s.durations[i]}s</small>
                      </div>
                    ))}
                  </div>
                  {raw.blocked ? (
                    <div className="panel empty">
                      <Shield />
                      <h2>Your entry is suspended.</h2>
                      <p>Contact an event coordinator.</p>
                    </div>
                  ) : ["complete", "ended"].includes(raw.status) ? (
                    <Scorecards run={raw} rank={rank} />
                  ) : snap.event.status !== "running" ? (
                    <div className="panel empty">
                      <Pause size={32} />
                      <h2>
                        {snap.event.status === "paused"
                          ? "Take a breath. Event paused."
                          : "The arena is getting ready."}
                      </h2>
                      <p>
                        Your progress is saved. You’ll continue automatically
                        when the coordinator starts the event.
                      </p>
                    </div>
                  ) : raw.status === "ready" ? (
                    <div className="panel countdown" aria-live="polite">
                      <span className="eyebrow">
                        NEXT UP / ROUND {raw.round}
                      </span>
                      <h2>{roundNames[raw.round - 1]}</h2>
                      <strong>
                        {Math.max(1, Math.ceil(raw.ready - snap.event.clock))}
                      </strong>
                      <p>Hands on the keyboard. You’re up next.</p>
                      {raw.cards.at(-1) && (
                        <span className="tag">
                          Previous round saved · {raw.cards.at(-1)?.score} pts
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="arena-metrics">
                        {[
                          ["WPM", card?.wpm.toFixed(1) || "0"],
                          ["ACCURACY", (card?.accuracy || 0) + "%"],
                          ["ERRORS", card?.errors || 0],
                          ["ROUND SCORE", card?.score || 0],
                          [
                            "TIME LEFT",
                            Math.max(
                              0,
                              Math.ceil(
                                s.durations[raw.round - 1] -
                                  (card?.elapsed || 0),
                              ),
                            ) + "s",
                          ],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <small>{label}</small>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                      <section className="typing-panel">
                        <div className="typing-header">
                          <span>
                            <span className="dot" /> ROUND 0{raw.round} /{" "}
                            {roundNames[raw.round - 1].toUpperCase()}
                          </span>
                          <span>
                            {Math.round(
                              ((card?.pos || 0) /
                                s.prompts[raw.round - 1].length) *
                                100,
                            )}
                            % COMPLETE
                          </span>
                        </div>
                        <div className="progress-track">
                          <div
                            style={{
                              width: `${((card?.pos || 0) / s.prompts[raw.round - 1].length) * 100}%`,
                            }}
                          />
                        </div>
                        <div
                          className={
                            "prompt " + (raw.round > 1 ? "code-prompt" : "")
                          }
                          aria-hidden="true"
                        >
                          {s.prompts[raw.round - 1].split("").map((ch, i) => (
                            <span
                              key={i}
                              className={
                                i < (card?.pos || 0)
                                  ? "typed"
                                  : i === (card?.pos || 0)
                                    ? "cursor"
                                    : ""
                              }
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                        <label className="typing-label" htmlFor="typing-input">
                          Type the highlighted character to continue. Mistakes
                          stay counted; retry that character.
                        </label>
                        <textarea
                          ref={typing}
                          id="typing-input"
                          aria-label={`Type this prompt: ${s.prompts[raw.round - 1]}`}
                          value=""
                          placeholder="Click here and start typing…"
                          autoCapitalize="off"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          disabled={!online}
                          onPaste={(e) => {
                            e.preventDefault();
                            setNotice(
                              "Copy/paste is disabled during the competition.",
                            );
                          }}
                          onDrop={(e) => e.preventDefault()}
                          onCopy={(e) => e.preventDefault()}
                          onChange={(e) => {
                            const text = e.target.value;
                            if (text.length === 1) onChar(text);
                            else if (text.length > 1)
                              setNotice(
                                "Type one character at a time. Text replacement and assisted input are disabled.",
                              );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Tab") return;
                            if (e.ctrlKey || e.metaKey) {
                              if (["v", "c", "x"].includes(e.key.toLowerCase()))
                                e.preventDefault();
                              return;
                            }
                            if (e.key === "Backspace" || e.key === "Enter")
                              e.preventDefault();
                          }}
                        />
                        <div className="typing-footer">
                          <span>
                            <Wifi size={13} />
                            {pending.current.length || batch.current
                              ? "Saving keystrokes…"
                              : "Progress saved"}
                          </span>
                          <span>ESCAPE THE NOISE. FIND YOUR FLOW.</span>
                        </div>
                      </section>
                      {raw.round > 1 && (
                        <div className="combo-panel">
                          <span>
                            <Zap size={21} /> COMBO{" "}
                            <strong>{card?.combo || 0}</strong>
                          </span>
                          <span>
                            BEST <strong>{card?.best || 0}</strong>
                          </span>
                          <span>
                            MULTIPLIER{" "}
                            <strong className="accent">
                              {card?.multiplier || 1}×
                            </strong>
                          </span>
                          <small>
                            10 → {s.multipliers[1]}× · 25 → {s.multipliers[2]}×
                            · 50 → {s.multipliers[3]}× · 100 →{" "}
                            {s.multipliers[4]}×
                          </small>
                        </div>
                      )}
                      {raw.round === 3 && (
                        <div className="death-panel">
                          <AlertTriangle size={18} />
                          <strong>SUDDEN DEATH</strong>
                          <span>
                            Strike 1: −{s.penalties[0]} pts · Strike 2: −
                            {s.penalties[1]} pts · Strike 3: elimination
                          </span>
                          <b>
                            {card?.errors || 0}/3 strikes · −
                            {card?.penalty || 0} pts
                          </b>
                        </div>
                      )}
                    </>
                  )}
                  {raw.cards.length > 0 &&
                    !["complete", "ended"].includes(raw.status) && (
                      <div className="saved-cards">
                        <h3>Your round scorecards</h3>
                        {raw.cards
                          .filter((c) => c.status !== "active")
                          .map((c) => (
                            <div key={c.round}>
                              <Check size={16} />
                              <strong>{roundNames[c.round - 1]}</strong>
                              <span>{c.status}</span>
                              <span>{c.wpm} WPM</span>
                              <span>{c.accuracy}% accuracy</span>
                              <b>{c.score} pts</b>
                            </div>
                          ))}
                        <p className="muted small">
                          Combined score: {total.toLocaleString()} pts · Overall
                          rank: #{rank || "—"}
                        </p>
                      </div>
                    )}
                </>
              )}
            </>
          )}
          {tab === "leaderboard" && (
            <>
              <PageTitle
                eyebrow="THE FAST LANE"
                title="Every keystroke earns its place."
                subtitle={
                  projector
                    ? "CyberType / Tantra 26 · Live overall standings"
                    : "Live standings across all three rounds. Public aliases only."
                }
              />
              <div className="board-toolbar">
                <span className="status live">
                  <span className="dot" /> LIVE STANDINGS
                </span>
                <span className="muted">{board.length} competitors</span>
                {!projector && (
                  <button onClick={showBoard}>
                    <Maximize2 size={16} /> Audience display
                  </button>
                )}
              </div>
              <div className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>RANK</th>
                      <th>PARTICIPANT</th>
                      <th>ROUND</th>
                      <th>WPM</th>
                      <th>ACCURACY</th>
                      <th>TOTAL SCORE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((p, i) => (
                      <tr key={p.id} className={p.id === raw?.id ? "you" : ""}>
                        <td>
                          <span className={"place p" + i}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </td>
                        <td>
                          <span className="avatar">
                            {p.alias.slice(0, 2).toUpperCase()}
                          </span>
                          <strong>{p.alias}</strong>
                          {p.id === raw?.id && (
                            <small className="you-tag">YOU</small>
                          )}
                        </td>
                        <td>0{p.round}</td>
                        <td className="mono">{p.wpm}</td>
                        <td>{p.accuracy}%</td>
                        <td className="accent mono">
                          {p.score.toLocaleString()} <small>pts</small>
                        </td>
                        <td>
                          <span className="tag">{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!board.length && (
                  <p className="empty">No entries yet. Be the first to join.</p>
                )}
              </div>
              <p className="muted small">
                Ranked by total score descending; ties use participant ID
                ascending. WPM and accuracy reflect the latest round.
                {!configured
                  ? " Demo competitors are fixed sample results."
                  : ""}
              </p>
            </>
          )}
          {tab === "rules" && (
            <>
              <PageTitle
                eyebrow="KNOW THE GAME"
                title="Precision has its rewards."
                subtitle="One fair playing field. The same prompts, timers, and scoring for everyone."
              />
              <div className="rules-grid">
                <section className="panel">
                  <h2>Rules of the arena</h2>
                  {rules.map((r, i) => (
                    <div className="rule" key={r}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <p>{r}</p>
                    </div>
                  ))}
                </section>
                <section className="panel scoring">
                  <h2>Scoring, decoded.</h2>
                  <p>
                    Correct characters advance the cursor. An incorrect
                    character counts as an error; retry the same position.
                    Backspace does not erase mistakes.
                  </p>
                  <code>WPM = (correct ÷ 5) ÷ elapsed minutes</code>
                  <code>Accuracy = correct ÷ attempts × 100</code>
                  <code>
                    Score = max(0, round((earned + {s.speedWeight} × WPM) ×
                    accuracy ÷ 100 − penalties))
                  </code>
                  <p>
                    Each correct character earns <b>{s.points} × multiplier</b>{" "}
                    points. Round 1 always uses 1×. Rounds 2 and 3 use{" "}
                    {s.multipliers.join("× / ")}× at streaks 0, 10, 25, 50, and
                    100. A mistake resets the streak.
                  </p>
                  <p>
                    Round 3: first mistake deducts <b>{s.penalties[0]}</b>;
                    second deducts a further <b>{s.penalties[1]}</b>; third ends
                    the round. Earned points remain, with penalties applied.
                  </p>
                  <p>
                    Each round lasts {s.durations.join(" / ")} seconds, or ends
                    when the prompt is completed. A four-second countdown
                    separates rounds. Combined score is the sum of all round
                    scores. Rankings break equal scores by participant ID. No
                    additional qualification cutoff is applied.
                  </p>
                  <p>
                    Elapsed time has a one-second minimum for WPM calculation.
                    Metrics are rounded to two decimals. The server clock is
                    authoritative; disconnects do not pause it. Event-wide
                    pauses stop all timers.
                  </p>
                  <div className="tag">
                    Scoring settings lock when competition starts.
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "admin" && (snap.admin || demoAdmin) && (
            <>
              <PageTitle
                eyebrow="MISSION CONTROL"
                title="Keep the competition moving."
                subtitle="Live participant monitoring, event controls, and results in one place."
              />
              <div className="admin-controls panel">
                <div>
                  <span className="eyebrow">EVENT STATE</span>
                  <h3>{snap.event.status.toUpperCase()}</h3>
                </div>
                <button
                  onClick={() =>
                    command(snap.event.status === "running" ? "pause" : "start")
                  }
                  disabled={working || snap.event.status === "ended"}
                >
                  {snap.event.status === "running" ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} />
                  )}{" "}
                  {snap.event.status === "running"
                    ? "Pause event"
                    : "Start / resume"}
                </button>
                <button
                  onClick={() =>
                    command("registration", { open: !snap.event.registration })
                  }
                >
                  {snap.event.registration ? "Close" : "Open"} registration
                </button>
                <button onClick={() => setEdit(structuredClone(s))}>
                  <Settings2 size={16} /> Configure
                </button>
                <button className="danger" onClick={() => command("end")}>
                  End event
                </button>
                <button
                  className="icon-button danger"
                  aria-label="Reset event"
                  onClick={() => command("reset")}
                >
                  <RotateCcw size={17} />
                </button>
              </div>
              <div className="admin-stats">
                {[
                  ["REGISTERED", snap.participants?.length || 0],
                  [
                    "ONLINE",
                    snap.participants?.filter(
                      (p) => Date.now() - Date.parse(p.last_seen) < 10000,
                    ).length || 0,
                  ],
                  [
                    "COMPLETED",
                    snap.participants?.filter((p) => p.status === "complete")
                      .length || 0,
                  ],
                  [
                    "ELIMINATED R3",
                    snap.participants?.filter(
                      (p) => p.cards[2]?.status === "eliminated",
                    ).length || 0,
                  ],
                ].map(([k, v]) => (
                  <div className="panel" key={k}>
                    <small>{k}</small>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <div className="board-toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search participants"
                    placeholder="Search alias or participant ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button onClick={exportCSV}>
                  <Download size={16} /> Export CSV
                </button>
              </div>
              <div className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "PARTICIPANT",
                        "CONNECTION",
                        "ROUND / STATE",
                        "PROGRESS / TIME",
                        "WPM / ACC.",
                        "ERROR / COMBO",
                        "SCORE / RANK",
                        "ACTIONS",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snap.participants
                      ?.filter((p) =>
                        (p.alias + p.id)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((p) => {
                        const c = p.cards.at(-1);
                        return (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.alias}</strong>
                              <small className="id">{p.id.slice(0, 8)}</small>
                            </td>
                            <td>
                              <span
                                className={
                                  "tag " +
                                  (Date.now() - Date.parse(p.last_seen) < 10000
                                    ? "accent"
                                    : "")
                                }
                              >
                                {Date.now() - Date.parse(p.last_seen) < 10000
                                  ? "Online"
                                  : "Offline"}
                              </span>
                            </td>
                            <td>
                              0{p.round}
                              <small className="id">
                                {p.blocked ? "Suspended" : p.status}
                              </small>
                            </td>
                            <td>
                              {Math.round(
                                ((c?.pos || 0) /
                                  s.prompts[(c?.round || 1) - 1].length) *
                                  100,
                              )}
                              %
                              <small className="id">
                                {c?.status === "active"
                                  ? Math.max(
                                      0,
                                      Math.ceil(
                                        s.durations[c.round - 1] - c.elapsed,
                                      ),
                                    ) + "s left"
                                  : c?.status || "Waiting"}
                              </small>
                            </td>
                            <td>
                              {c?.wpm || 0} / {c?.accuracy ?? 100}%
                            </td>
                            <td>
                              {c?.errors || 0} / {c?.combo || 0}
                              <small className="id">
                                {c?.multiplier || 1}× · best {c?.best || 0}
                                {p.round === 3
                                  ? ` · −${c?.penalty || 0} pts`
                                  : ""}
                              </small>
                            </td>
                            <td>
                              {entry(p).score}
                              <small className="id">
                                Rank #
                                {board.findIndex((x) => x.id === p.id) + 1}
                              </small>
                            </td>
                            <td>
                              <button onClick={() => setSelected(p)}>
                                Inspect
                              </button>
                              <button
                                className="text-button"
                                onClick={() =>
                                  command("block", {
                                    id: p.id,
                                    blocked: !p.blocked,
                                  })
                                }
                              >
                                {p.blocked ? "Restore" : "Suspend"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {!snap.participants?.length && (
                  <p className="empty">
                    No participants registered. Join through the typing arena to
                    explore monitoring.
                  </p>
                )}
              </div>
              <section className="panel audit">
                <h3>Event activity</h3>
                {snap.audit?.length ? (
                  snap.audit.map((a, i) => (
                    <div key={i}>
                      <span>{a.action}</span>
                      <time>{new Date(a.created_at).toLocaleString()}</time>
                    </div>
                  ))
                ) : (
                  <p className="muted">Admin actions will appear here.</p>
                )}
              </section>
            </>
          )}
          <footer>
            <span>
              CYBERTYPE <b>/</b> TANTRA 26
            </span>
            <span>BUILT FOR SPEED. DEFINED BY PRECISION.</span>
            <span>
              {s.department} DEPARTMENT <span className="dot" />
            </span>
          </footer>
        </main>
      </div>
      {auth && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <button
              className="close"
              onClick={() => setAuth(false)}
              aria-label="Close sign in"
            >
              ×
            </button>
            <span className="round-icon">
              <Shield size={25} />
            </span>
            <h2 id="auth-title">
              {signup ? "Join the competition." : "Welcome back."}
            </h2>
            <p>
              {signup
                ? "Create your participant account."
                : "Sign in to your participant or coordinator account."}
            </p>
            {notice && (
              <p className="notice" role="alert">
                {notice}
              </p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setWorking(true);
                const data = new FormData(e.currentTarget);
                const credentials = {
                  email: String(data.get("email")),
                  password: String(data.get("password")),
                };
                const result = signup
                  ? await supabase!.auth.signUp(credentials)
                  : await supabase!.auth.signInWithPassword(credentials);
                setWorking(false);
                if (result.error) setNotice(result.error.message);
                else {
                  setAuth(false);
                  setNotice(
                    signup
                      ? "Check your email to confirm your account, then sign in."
                      : "Signed in successfully.",
                  );
                }
              }}
            >
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete={signup ? "new-password" : "current-password"}
                />
              </label>
              <button className="primary" disabled={working}>
                {signup ? "Create participant account" : "Sign in"}
                <ArrowRight size={17} />
              </button>
            </form>
            <button className="text-button" onClick={() => setSignup(!signup)}>
              {signup
                ? "Already registered? Sign in"
                : "New here? Create a participant account"}
            </button>
          </section>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-label="Participant scorecards"
          >
            <button
              className="close"
              aria-label="Close scorecards"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <Scorecards
              run={
                snap.participants?.find((p) => p.id === selected.id) || selected
              }
              rank={board.findIndex((p) => p.id === selected.id) + 1}
            />
          </section>
        </div>
      )}
      {edit && (
        <div className="modal-backdrop">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="config-title"
          >
            <button
              className="close"
              aria-label="Close settings"
              onClick={() => setEdit(null)}
            >
              ×
            </button>
            <h2 id="config-title">Event configuration</h2>
            <p>
              Settings can be saved before the event starts. Resetting clears
              attempts; export results first.
            </p>
            {notice && (
              <p className="notice" role="alert">
                {notice}
              </p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await command("configure", { settings: edit }))
                  setEdit(null);
              }}
            >
              <div className="config-grid">
                {(
                  [
                    "date",
                    "time",
                    "venue",
                    "department",
                    "type",
                    "fee",
                    "first",
                    "second",
                    "points",
                    "speedWeight",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {(
                      {
                        fee: "Entry fee (₹)",
                        first: "First prize (₹)",
                        second: "Second prize (₹)",
                        points: "Points / character",
                        speedWeight: "WPM score weight",
                      } as Record<string, string>
                    )[k] || k}
                    <input
                      required
                      type={typeof edit[k] === "number" ? "number" : "text"}
                      min="0"
                      max={typeof edit[k] === "number" ? 100000 : undefined}
                      value={edit[k]}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          [k]:
                            typeof edit[k] === "number"
                              ? Number(e.target.value)
                              : e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              {roundNames.map((name, i) => (
                <div className="config-round" key={name}>
                  <h3>{name}</h3>
                  <label>
                    Duration (seconds)
                    <input
                      type="number"
                      required
                      min={5}
                      max={600}
                      value={edit.durations[i]}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          durations: edit.durations.map((v, n) =>
                            n === i ? Number(e.target.value) : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Exact prompt
                    <textarea
                      required
                      minLength={10}
                      maxLength={2000}
                      value={edit.prompts[i]}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          prompts: edit.prompts.map((v, n) =>
                            n === i ? e.target.value : v,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              <div className="config-grid">
                {edit.multipliers.map((v, i) => (
                  <label key={i}>
                    Multiplier at {[0, 10, 25, 50, 100][i]} streak
                    <input
                      required
                      type="number"
                      min={1}
                      max={10}
                      step="0.05"
                      value={v}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          multipliers: edit.multipliers.map((v, n) =>
                            n === i ? Number(e.target.value) : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                {edit.penalties.map((v, i) => (
                  <label key={i}>
                    Strike {i + 1} penalty
                    <input
                      type="number"
                      required
                      min={i === 1 ? edit.penalties[0] + 1 : 0}
                      max={100000}
                      value={v}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          penalties: edit.penalties.map((v, n) =>
                            n === i ? Number(e.target.value) : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="primary"
                disabled={working || snap.event.status !== "waiting"}
              >
                Save configuration
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
function Scorecards({ run, rank }: { run: Run; rank: number }) {
  return (
    <section className="scorecards">
      <span className="eyebrow">YOUR PERFORMANCE / {run.alias}</span>
      <h2>
        {run.status === "complete"
          ? "Run complete. Well played."
          : "Competition scorecards"}
      </h2>
      <div className="score-total panel">
        <Trophy size={36} />
        <div>
          <small>COMBINED SCORE</small>
          <strong>
            {entry(run).score.toLocaleString()} <span>pts</span>
          </strong>
        </div>
        <div>
          <small>OVERALL RANK</small>
          <strong>#{rank || "—"}</strong>
        </div>
      </div>
      <div className="round-grid">
        {roundNames.map((name, i) => {
          const c = run.cards[i];
          return (
            <div className="panel" key={name}>
              <span className="eyebrow">ROUND 0{i + 1}</span>
              <h3>{name}</h3>
              <span className="tag">{c?.status || "Not played"}</span>
              <dl>
                {[
                  ["Score", c?.score || 0],
                  ["WPM", c?.wpm || 0],
                  ["Accuracy", (c?.accuracy ?? 100) + "%"],
                  ["Errors", c?.errors || 0],
                  ["Time", (c?.elapsed.toFixed(1) || 0) + "s"],
                  ["Best combo", c?.best || 0],
                  ["Penalties", "−" + (c?.penalty || 0)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

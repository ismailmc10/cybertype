"use client";
import { useState } from "react";
import {
  LockKeyhole,
  ShieldCheck,
  Eye,
  EyeOff,
  Plus,
  Minus,
  FileCheck,
  RotateCcw,
} from "lucide-react";
import {
  Snapshot,
  Standing,
  Run,
  Adjustment,
  AdjustmentCategory,
  adjustmentCategories,
} from "@/lib/game";
import Scorecards from "./Scorecards";
export type ReviewCommand = (
  name: string,
  payload?: Record<string, unknown>,
) => Promise<boolean | undefined>;
export function LockedLeaderboard({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={"locked-leaderboard " + (compact ? "compact" : "panel")}
      role="status"
    >
      <span className="lock-orbit">
        <LockKeyhole size={compact ? 25 : 38} />
      </span>
      <span className="eyebrow">CYBERTYPE / OFFICIAL RESULTS</span>
      <h2>Leaderboard Locked</h2>
      <p>
        Results are under coordinator review.
        <br />
        Please wait for the official reveal.
      </p>
      {!compact && (
        <div className="review-wait">
          <span className="dot" /> This screen updates automatically when
          results are released.
        </div>
      )}
    </section>
  );
}
export default function ResultsReview({
  snap,
  working,
  onCommand,
  onReview,
  search,
}: {
  snap: Snapshot;
  working: boolean;
  onCommand: ReviewCommand;
  onReview: (id: string) => void;
  search: string;
}) {
  if (!snap.admin) return null;
  const e = snap.event;
  return (
    <section className="results-review">
      <div className="section-heading">
        <div>
          <span className="eyebrow">COORDINATOR ACCESS ONLY</span>
          <h2>Results Review</h2>
        </div>
        <span className="tag">
          <ShieldCheck size={12} /> Private standings
        </span>
      </div>
      <div className="review-controls panel">
        <div>
          <span className="eyebrow">APPROVAL</span>
          <h3>
            {e.results_finalized
              ? "Results Finalized"
              : "Results Not Finalized"}
          </h3>
          <p>
            {e.status === "ended"
              ? "Review each result before the official reveal."
              : "End the event to apply adjustments and finalize results."}
          </p>
          <button
            className={e.results_finalized ? "danger" : "primary"}
            disabled={working || e.status !== "ended"}
            onClick={() =>
              onCommand(e.results_finalized ? "reopen" : "finalize")
            }
          >
            {e.results_finalized ? (
              <RotateCcw size={16} />
            ) : (
              <FileCheck size={16} />
            )}{" "}
            {e.results_finalized ? "Reopen Results" : "Finalize Results"}
          </button>
        </div>
        <div>
          <span className="eyebrow">AUDIENCE LEADERBOARD</span>
          <h3 className={e.leaderboard_visible ? "accent" : ""}>
            {e.leaderboard_visible ? "VISIBLE TO AUDIENCE" : "LOCKED"}
          </h3>
          <p>
            {e.leaderboard_visible
              ? "Only these approved final scores are public."
              : "Participants and spectators cannot access standings."}
          </p>
          <button
            className={e.leaderboard_visible ? "danger" : "primary"}
            disabled={
              working ||
              (!e.leaderboard_visible &&
                (!e.results_finalized || e.status !== "ended"))
            }
            onClick={() => onCommand(e.leaderboard_visible ? "hide" : "reveal")}
          >
            {e.leaderboard_visible ? <EyeOff size={16} /> : <Eye size={16} />}{" "}
            {e.leaderboard_visible ? "Hide Leaderboard" : "Reveal Leaderboard"}
          </button>
        </div>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "RANK",
                "ALIAS",
                "BASE",
                "ADJUSTMENT",
                "FINAL",
                "ACCURACY",
                "ACTIONS",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snap.standings
              .filter((p) =>
                (p.alias + p.id).toLowerCase().includes(search.toLowerCase()),
              )
              .map((p) => (
                <tr key={p.id}>
                  <td className="mono">#{p.rank}</td>
                  <td>
                    <strong>{p.alias}</strong>
                  </td>
                  <td>{p.base_score.toLocaleString()}</td>
                  <td
                    className={p.manual_adjustment < 0 ? "deduction" : "accent"}
                  >
                    {signed(p.manual_adjustment)}
                  </td>
                  <td className="accent mono">
                    {p.final_score.toLocaleString()}
                  </td>
                  <td>{p.accuracy}%</td>
                  <td>
                    <button onClick={() => onReview(p.id)}>
                      Review <span className="sr-only">{p.alias}</span>
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!snap.standings.length && (
          <p className="empty">No participant results to review yet.</p>
        )}
      </div>
      <p className="muted small">
        Final = base + all approved adjustments. Ties keep the existing
        participant ID order. Original round scores are never overwritten.
      </p>
    </section>
  );
}
export const signed = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
export function ReviewDetails({
  standing,
  run,
  adjustments,
  snap,
  working,
  onCommand,
}: {
  standing: Standing;
  run: Run;
  adjustments: Adjustment[];
  snap: Snapshot;
  working: boolean;
  onCommand: ReviewCommand;
}) {
  const [delta, setDelta] = useState("-50"),
    [reason, setReason] = useState(""),
    [category, setCategory] = useState<AdjustmentCategory>("malpractice"),
    [requestId, setRequestId] = useState(""),
    [message, setMessage] = useState("");
  const editable =
    snap.event.status === "ended" && !snap.event.results_finalized;
  const change = () => {
    setRequestId("");
    setMessage("");
  };
  const choose = (value: string, kind: AdjustmentCategory) => {
    change();
    setDelta(value);
    setCategory(kind);
  };
  return (
    <div className="review-details">
      <div className="review-participant">
        <span className="eyebrow">PRIVATE RESULT REVIEW</span>
        <h2>{standing.alias}</h2>
        <p>
          Participant ID: <span className="mono">{run.id}</span>
          <br />
          Last connection: {new Date(run.last_seen).toLocaleString()} · Status:{" "}
          {run.blocked ? "Suspended" : run.status}
        </p>
        <div className="review-summary">
          <div>
            <small>RANK</small>
            <strong>#{standing.rank}</strong>
          </div>
          <div>
            <small>BASE</small>
            <strong>{standing.base_score}</strong>
          </div>
          <div>
            <small>ADJUSTMENTS</small>
            <strong
              className={
                standing.manual_adjustment < 0 ? "deduction" : "accent"
              }
            >
              {signed(standing.manual_adjustment)}
            </strong>
          </div>
          <div>
            <small>FINAL</small>
            <strong>{standing.final_score}</strong>
          </div>
        </div>
      </div>
      <section className="adjustment-section">
        <h3>Adjustment history</h3>
        {adjustments.length ? (
          <ol className="adjustment-history">
            {adjustments.map((a) => (
              <li key={a.id}>
                <div>
                  <strong className={a.delta < 0 ? "deduction" : "accent"}>
                    {signed(a.delta)} pts
                  </strong>
                  <span className="tag">{a.category.replaceAll("_", " ")}</span>
                </div>
                <p>{a.reason}</p>
                <small>
                  Admin {a.created_by} ·{" "}
                  <time>{new Date(a.created_at).toLocaleString()}</time>
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            No manual adjustments. The machine-generated score is unchanged.
          </p>
        )}
        <p className="muted small">
          History is append-only. To correct a mistake, add an opposite
          adjustment with an explanation.
        </p>
      </section>
      <section className="adjustment-section">
        <h3>Apply a justified adjustment</h3>
        {!editable && (
          <p className="notice">
            {snap.event.results_finalized
              ? "Results are finalized. Reopen results to make a correction."
              : "End the event before adjusting scores."}
          </p>
        )}
        <div className="adjustment-presets">
          <button
            type="button"
            className="danger"
            disabled={!editable || working}
            onClick={() => choose("-50", "malpractice")}
          >
            <Minus size={15} /> Add Deduction
          </button>
          <button
            type="button"
            className="primary"
            disabled={!editable || working}
            onClick={() => choose("25", "grace")}
          >
            <Plus size={15} /> Add Grace Points
          </button>
          {[-100, -50, 25, 50].map((n) => (
            <button
              type="button"
              key={n}
              disabled={!editable || working}
              onClick={() => choose(String(n), n < 0 ? "malpractice" : "grace")}
            >
              {signed(n)}
            </button>
          ))}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editable) return;
            const amount = Number(delta);
            if (
              !Number.isInteger(amount) ||
              amount === 0 ||
              Math.abs(amount) > 100000
            ) {
              setMessage(
                "Enter a nonzero whole number between -100000 and +100000.",
              );
              return;
            }
            const why = reason.trim();
            if (why.length < 5) {
              setMessage("Provide a reason with at least 5 characters.");
              return;
            }
            const id = requestId || crypto.randomUUID();
            setRequestId(id);
            setMessage("");
            const ok = await onCommand("adjust", {
              id: standing.id,
              alias: standing.alias,
              delta: amount,
              reason: why,
              category,
              request_id: id,
            });
            if (ok) {
              setReason("");
              setRequestId("");
              setMessage("Adjustment saved and recorded in the audit log.");
            } else
              setMessage(
                "Adjustment was not confirmed. Review the message below. If the connection failed, retrying this unchanged adjustment is safe.",
              );
          }}
        >
          <div className="config-grid">
            <label>
              Signed points (+ grace / − deduction)
              <input
                required
                inputMode="numeric"
                type="number"
                step={1}
                min={-100000}
                max={100000}
                disabled={!editable || working}
                value={delta}
                onChange={(e) => {
                  change();
                  setDelta(e.target.value);
                }}
              />
            </label>
            <label>
              Category
              <select
                value={category}
                disabled={!editable || working}
                onChange={(e) => {
                  change();
                  setCategory(e.target.value as AdjustmentCategory);
                }}
              >
                {adjustmentCategories.map((k) => (
                  <option key={k} value={k}>
                    {k.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Reason (required)
            <textarea
              required
              minLength={5}
              maxLength={1000}
              disabled={!editable || working}
              value={reason}
              onChange={(e) => {
                change();
                setReason(e.target.value);
              }}
              placeholder="Describe the incident or the reason for these points."
            />
          </label>
          <button
            type="submit"
            className={Number(delta) < 0 ? "danger" : "primary"}
            disabled={!editable || working}
          >
            {working
              ? "Saving…"
              : `Review & apply ${signed(Number(delta) || 0)} points`}
          </button>
          {message && <p role="status">{message}</p>}
        </form>
      </section>
      <Scorecards
        run={run}
        summary={standing}
        reviewed={snap.event.results_finalized}
      />
      <p className="muted small">
        Round points and penalties above are the untouched server calculation.
        Manual adjustments apply only to the combined score.
      </p>
    </div>
  );
}

import { Check, Shield } from "lucide-react";
import { Run, ScoreSummary, entry, roundNames } from "@/lib/game";
export default function Scorecards({
  run,
  summary,
  reviewed = false,
}: {
  run: Run;
  summary?: ScoreSummary | null;
  reviewed?: boolean;
}) {
  const base = entry(run).score;
  return (
    <section className="scorecards">
      <span className="eyebrow">PERSONAL PERFORMANCE / {run.alias}</span>
      <h2>
        {["complete", "ended"].includes(run.status)
          ? "Your submission has been recorded."
          : "Competition scorecards"}
      </h2>
      <p className="result-status">
        <Shield size={16} />
        {reviewed
          ? "Results approved by the coordinator."
          : "Results under coordinator review."}
      </p>
      <div className="score-total panel">
        <Check size={32} />
        <div>
          <small>{reviewed ? "APPROVED SCORE" : "PERSONAL SCORE"}</small>
          <strong>
            {(summary?.final_score ?? base).toLocaleString()} <span>pts</span>
          </strong>
        </div>
        <div>
          <small>BASE SCORE</small>
          <strong>{(summary?.base_score ?? base).toLocaleString()}</strong>
        </div>
        <div>
          <small>ADJUSTMENTS</small>
          <strong>
            {(summary?.manual_adjustment || 0) > 0 ? "+" : ""}
            {summary?.manual_adjustment || 0}
          </strong>
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
                  ["Calculated score", c?.score || 0],
                  ["Earned character points", c?.earned || 0],
                  ["WPM", c?.wpm || 0],
                  ["Accuracy", (c?.accuracy ?? 100) + "%"],
                  ["Errors", c?.errors || 0],
                  ["Time", (c?.elapsed.toFixed(1) || 0) + "s"],
                  ["Best combo", c?.best || 0],
                  ["Multiplier", (c?.multiplier || 1) + "×"],
                  ["Round penalties", "−" + (c?.penalty || 0)],
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

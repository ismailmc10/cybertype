import { Snapshot } from "./game";
export function resultsCSV(snap: Snapshot): string {
  if (!snap.admin) throw Error("Admin access required");
  const rows = [
    [
      "Final rank",
      "Public alias",
      "Participant ID",
      "Base score",
      "Total adjustments",
      "Final score",
      "Accuracy",
      "WPM",
      "Round",
      "Status",
      "Results finalized",
      "Leaderboard visible",
      "Adjustment summary",
      "R1 score",
      "R2 score",
      "R3 score",
      "R3 penalties",
      "R3 errors",
    ],
    ...snap.standings.map((p) => {
      const r = snap.participants?.find((r) => r.id === p.id);
      return [
        p.rank,
        p.alias,
        p.id,
        p.base_score,
        p.manual_adjustment,
        p.final_score,
        p.accuracy,
        p.wpm,
        p.round,
        p.status,
        snap.event.results_finalized,
        snap.event.leaderboard_visible,
        (snap.adjustments || [])
          .filter((a) => a.user_id === p.id)
          .map(
            (a) =>
              `${a.delta > 0 ? "+" : ""}${a.delta} | ${a.category} | ${a.reason} | Admin ${a.created_by} | ${a.created_at}`,
          )
          .join("; "),
        ...[0, 1, 2].map((n) => r?.cards[n]?.score ?? ""),
        r?.cards[2]?.penalty ?? "",
        r?.cards[2]?.errors ?? "",
      ];
    }),
  ];
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v)
              .replace(/^[\s]*[=+@-]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}

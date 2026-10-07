import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Scorecards from "../components/Scorecards";
import ResultsReview, { LockedLeaderboard } from "../components/ResultsReview";
import { blank, defaults, Run, Snapshot } from "../lib/game";
const run: Run = {
  id: "test",
  alias: "PersonalAlias",
  round: 3,
  cards: [{ ...blank(1, 0), score: 860, status: "completed" }],
  status: "complete",
  ready: 0,
  last_seen: "2026-01-01T00:00:00Z",
};
test("participant result component never renders rank, before or after official approval", () => {
  for (const reviewed of [false, true]) {
    const html = renderToStaticMarkup(
      React.createElement(Scorecards, {
        run,
        reviewed,
        summary: { base_score: 860, manual_adjustment: -100, final_score: 760 },
      }),
    );
    assert.ok(html.includes("760"));
    assert.ok(html.includes("860"));
    assert.ok(html.includes("-100"));
    assert.doesNotMatch(html, /rank|percentile|position|ahead/i);
  }
});
test("locked display contains review message without standings; admin review component rejects participant snapshots", () => {
  const html = renderToStaticMarkup(React.createElement(LockedLeaderboard));
  assert.ok(html.includes("Leaderboard Locked"));
  assert.ok(html.includes("Results are under coordinator review."));
  assert.doesNotMatch(html, /<table|<tbody|RANK|FINAL SCORE/);
  const s: Snapshot = {
    event: {
      status: "ended",
      registration: false,
      clock: 0,
      settings: defaults,
      leaderboard_visible: false,
      results_finalized: false,
      results_version: 0,
    },
    run,
    personal_score: null,
    leaderboard: [],
    standings: [],
    admin: false,
  };
  assert.equal(
    renderToStaticMarkup(
      React.createElement(ResultsReview, {
        snap: s,
        working: false,
        onCommand: async () => false,
        onReview: () => {},
        search: "",
      }),
    ),
    "",
  );
});

// Run: pnpm --filter @workspace/world-map exec tsx --test src/compare/compareModel.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildIndex, visitMatchesYear, overlayFor, computeStats, jaccard, DEFAULT_LAYERS, destKey,
} from "./compareModel";

const row = (category: string, destinationId: string, o: Partial<{ v: boolean; b: boolean; f: number; l: number; t: number }> = {}) => ({
  category, destinationId, isVisited: !!o.v, isBucket: !!o.b,
  firstVisitedYear: o.f ?? null, lastVisitedYear: o.l ?? null, timesVisited: o.t ?? null,
});

test("year filter includes all destinations known visited by the inclusive cutoff", () => {
  const idx = buildIndex([row("country", "250", { v: true, f: 2010, l: 2020 })]);
  const i = idx.get(destKey("country", "250"));
  assert.equal(visitMatchesYear(i, null), true);
  assert.equal(visitMatchesYear(i, 2010), true);
  assert.equal(visitMatchesYear(i, 2020), true);
  assert.equal(visitMatchesYear(i, 2015), true);
  assert.equal(visitMatchesYear(i, 2025), true);
  assert.equal(visitMatchesYear(i, 2009), false);
  const latestOnly = { visited: true, bucket: false, firstYear: null, lastYear: 2012, times: null };
  assert.equal(visitMatchesYear(latestOnly, 2011), false);
  assert.equal(visitMatchesYear(latestOnly, 2012), true);
  const undated = { ...latestOnly, lastYear: null };
  assert.equal(visitMatchesYear(undated, 2026), false);
  assert.equal(visitMatchesYear(undated, null), true);
  assert.equal(visitMatchesYear(undefined, 2026), false);
});

test("greenland normalises to denmark and ids are padded", () => {
  const idx = buildIndex([row("country", "304", { v: true }), row("us_state", "6", { v: true }), row("country", "36", { v: true })]);
  assert.ok(idx.has("country:208"));
  assert.ok(idx.has("us_state:06"));
  assert.ok(idx.has("country:036"));
});

test("overlay fills and bucket outlines", () => {
  const A = buildIndex([row("tcc", "France", { v: true }), row("tcc", "Japan", { b: true }), row("tcc", "Peru", { b: true })]);
  const B = buildIndex([row("tcc", "France", { v: true }), row("tcc", "Japan", { v: true }), row("tcc", "Peru", { b: true })]);
  const k = (n: string) => destKey("tcc", n);
  assert.equal(overlayFor(A.get(k("France")), B.get(k("France")), null, DEFAULT_LAYERS).fill, "both");
  const jp = overlayFor(A.get(k("Japan")), B.get(k("Japan")), null, DEFAULT_LAYERS);
  assert.equal(jp.fill, "b");
  assert.equal(jp.outline, "bVisitedOnABucket");
  assert.equal(overlayFor(A.get(k("Peru")), B.get(k("Peru")), null, DEFAULT_LAYERS).outline, "bucketBoth");
  assert.equal(overlayFor(A.get(k("Japan")), B.get(k("Japan")), null, { ...DEFAULT_LAYERS, bothOnly: true }).fill, "none");
  assert.equal(overlayFor(A.get(k("France")), B.get(k("France")), null, { ...DEFAULT_LAYERS, showB: false }).fill, "a");
});

test("stats: totals, overlap, jaccard, bucket hooks, regions, timeline", () => {
  const A = buildIndex([
    row("tcc", "France", { v: true, f: 2015, t: 3 }),
    row("tcc", "Japan", { b: true }),
    row("tcc", "Kenya", { v: true, f: 2019, l: 2022, t: 2 }),
  ]);
  const B = buildIndex([
    row("tcc", "France", { v: true, f: 2018 }),
    row("tcc", "Japan", { v: true, f: 2019 }),
  ]);
  const s = computeStats("tcc", A, B, null);
  assert.equal(s.totalA, 2);
  assert.equal(s.totalB, 2);
  assert.deepEqual(s.common.map(d => d.name), ["France"]);
  assert.deepEqual(s.onlyA.map(d => d.name), ["Kenya"]);
  assert.deepEqual(s.bVisitedOnABucket.map(d => d.name), ["Japan"]);
  assert.equal(s.visitsA, 5);
  assert.equal(s.visitsB, 2);
  assert.equal(Math.round(s.jaccard * 1000), 333);
  assert.equal(s.regions.length, 12);
  assert.equal(s.regions.find(r => r.region === "EUR")!.a, 1);
  assert.deepEqual(s.timeline.find(r => r.year === 2019), { year: 2019, a: 1, b: 1 });
  const y = computeStats("tcc", A, B, 2022);
  assert.equal(y.totalA, 2);
  assert.equal(y.totalB, 2);
  const early = computeStats("tcc", A, B, 2018);
  assert.equal(early.totalA, 1);
  assert.equal(early.totalB, 1);
  assert.equal(early.common.length, 1);
  assert.equal(early.bVisitedOnABucket.length, 0);
  assert.ok(early.timeline.every(r => r.year <= 2018));
});

test("jaccard edge cases", () => {
  assert.equal(jaccard(new Set(), new Set()), 0);
  assert.equal(jaccard(new Set(["a"]), new Set(["a"])), 1);
});

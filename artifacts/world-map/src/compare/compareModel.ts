// Pure comparison model — no React, no DOM, no network. Friend data flows in
// from the React Query cache and is never persisted.
import { COUNTRY_DATA, US_STATE_DATA, CA_PROVINCE_DATA } from "../countryData";
import { TCC_DATA, TCC_BY_NAME, TCC_REGIONS, type TccRegionKey } from "../tccData";

export type CompareMode = "world" | "tcc";
export type DestCategory = "country" | "us_state" | "ca_province" | "tcc";
export type SideStatus = "visited" | "bucket" | "none";

export interface DestRowLike {
  category: string;
  destinationId: string;
  isVisited: boolean;
  isBucket: boolean;
  firstVisitedYear?: number | null;
  lastVisitedYear?: number | null;
  timesVisited?: number | null;
}

export interface DestInfo {
  visited: boolean;
  bucket: boolean;
  firstYear: number | null;
  lastYear: number | null;
  times: number | null;
}

export type UserIndex = Map<string, DestInfo>;

export const destKey = (category: DestCategory, id: string) => `${category}:${id}`;

export function parseKey(key: string): { category: DestCategory; id: string } {
  const i = key.indexOf(":");
  return { category: key.slice(0, i) as DestCategory, id: key.slice(i + 1) };
}

function normId(category: string, id: string): string {
  if (category === "country") {
    const p = id.padStart(3, "0");
    return p === "304" ? "208" : p;
  }
  if (category === "us_state") return id.padStart(2, "0");
  return id;
}

export function buildIndex(rows: readonly DestRowLike[] | undefined): UserIndex {
  const idx: UserIndex = new Map();
  for (const r of rows ?? []) {
    if (!["country", "us_state", "ca_province", "tcc"].includes(r.category)) continue;
    const key = destKey(r.category as DestCategory, normId(r.category, r.destinationId));
    const prev = idx.get(key);
    const info: DestInfo = {
      visited: r.isVisited || !!prev?.visited,
      bucket: (r.isBucket || !!prev?.bucket) && !(r.isVisited || prev?.visited),
      firstYear: r.firstVisitedYear ?? prev?.firstYear ?? null,
      lastYear: r.lastVisitedYear ?? prev?.lastYear ?? null,
      times: r.timesVisited ?? prev?.times ?? null,
    };
    idx.set(key, info);
  }
  return idx;
}

/**
 * Cumulative cutoff: include destinations first known visited by year Y.
 * Fall back to the latest year when the first is unknown. Undated visits
 * appear only with the filter off. Null year = no filter.
 */
export function visitMatchesYear(info: DestInfo | undefined, year: number | null): boolean {
  if (!info || !info.visited) return false;
  if (year === null) return true;
  const earliest = newYear(info);
  return earliest !== null && earliest <= year;
}

export function sideStatus(info: DestInfo | undefined, year: number | null): SideStatus {
  if (visitMatchesYear(info, year)) return "visited";
  if (info?.bucket) return "bucket";
  return "none";
}

export type OverlayFill = "both" | "a" | "b" | "none";
export type OverlayOutline = "bucketBoth" | "bVisitedOnABucket" | "aVisitedOnBBucket" | null;

export interface LayerToggles {
  showA: boolean;
  showB: boolean;
  bothOnly: boolean;
  showBuckets: boolean;
}

export const DEFAULT_LAYERS: LayerToggles = { showA: true, showB: true, bothOnly: false, showBuckets: true };

export interface Overlay {
  fill: OverlayFill;
  outline: OverlayOutline;
  a: SideStatus;
  b: SideStatus;
}

export function overlayFor(
  a: DestInfo | undefined,
  b: DestInfo | undefined,
  year: number | null,
  layers: LayerToggles,
): Overlay {
  const sa = sideStatus(a, year);
  const sb = sideStatus(b, year);
  const va = sa === "visited" && layers.showA;
  const vb = sb === "visited" && layers.showB;
  let fill: OverlayFill = va && vb ? "both" : va ? "a" : vb ? "b" : "none";
  if (layers.bothOnly && fill !== "both") fill = "none";
  let outline: OverlayOutline = null;
  if (layers.showBuckets && !layers.bothOnly && layers.showA && layers.showB) {
    if (sa === "bucket" && sb === "bucket" && layers.showA && layers.showB) outline = "bucketBoth";
    else if (sb === "visited" && sa === "bucket" && layers.showB) outline = "bVisitedOnABucket";
    else if (sa === "visited" && sb === "bucket" && layers.showA) outline = "aVisitedOnBBucket";
  }
  return { fill, outline, a: sa, b: sb };
}

// ── Destination universe ────────────────────────────────────────────────────

export interface DestMeta {
  key: string;
  category: DestCategory;
  id: string;
  name: string;
  region?: TccRegionKey;
}

let worldCache: DestMeta[] | null = null;
let tccCache: DestMeta[] | null = null;

export function destinationsFor(mode: CompareMode): DestMeta[] {
  if (mode === "world") {
    if (!worldCache) {
      worldCache = [
        ...Object.entries(COUNTRY_DATA).map(([id, d]) => ({ key: destKey("country", id), category: "country" as const, id, name: d.name })),
        ...Object.entries(US_STATE_DATA).map(([id, d]) => ({ key: destKey("us_state", id), category: "us_state" as const, id, name: d.name })),
        ...Object.entries(CA_PROVINCE_DATA).map(([id, d]) => ({ key: destKey("ca_province", id), category: "ca_province" as const, id, name: d.name })),
      ];
    }
    return worldCache;
  }
  if (!tccCache) {
    tccCache = TCC_DATA.map(t => ({ key: destKey("tcc", t.name), category: "tcc" as const, id: t.name, name: t.name, region: t.region }));
  }
  return tccCache;
}

export function nameForKey(key: string): string {
  const { category, id } = parseKey(key);
  if (category === "country") return COUNTRY_DATA[id]?.name ?? `Country ${id}`;
  if (category === "us_state") return US_STATE_DATA[id]?.name ?? `State ${id}`;
  if (category === "ca_province") return CA_PROVINCE_DATA[id]?.name ?? id;
  return TCC_BY_NAME.get(id)?.name ?? id;
}

export function categoryLabel(c: DestCategory): string {
  return c === "country" ? "Country" : c === "us_state" ? "U.S. state" : c === "ca_province" ? "Canadian province" : "TCC destination";
}

// ── Statistics ──────────────────────────────────────────────────────────────

export interface TopEntry { key: string; name: string; times: number }
export interface RegionRow { region: TccRegionKey; name: string; a: number; b: number; total: number }
export interface TimelineRow { year: number; a: number; b: number }

export interface CompareStats {
  totalA: number;
  totalB: number;
  common: DestMeta[];
  onlyA: DestMeta[];
  onlyB: DestMeta[];
  visitsA: number;
  visitsB: number;
  topA: TopEntry[];
  topB: TopEntry[];
  regions: RegionRow[];
  timeline: TimelineRow[];
  bVisitedOnABucket: DestMeta[];
  aVisitedOnBBucket: DestMeta[];
  jaccard: number; // 0..1
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Year when a destination first became "new" for a user (first, else latest). */
export function newYear(info: DestInfo | undefined): number | null {
  if (!info?.visited) return null;
  return info.firstYear ?? info.lastYear ?? null;
}

export function computeStats(mode: CompareMode, A: UserIndex, B: UserIndex, year: number | null): CompareStats {
  const dests = destinationsFor(mode);
  const setA = new Set<string>();
  const setB = new Set<string>();
  const common: DestMeta[] = [], onlyA: DestMeta[] = [], onlyB: DestMeta[] = [];
  const bOnA: DestMeta[] = [], aOnB: DestMeta[] = [];
  let visitsA = 0, visitsB = 0;
  const topA: TopEntry[] = [], topB: TopEntry[] = [];
  const regionMap = new Map<TccRegionKey, RegionRow>();
  if (mode === "tcc") {
    (Object.keys(TCC_REGIONS) as TccRegionKey[]).forEach(r =>
      regionMap.set(r, { region: r, name: TCC_REGIONS[r].name, a: 0, b: 0, total: 0 }));
  }
  const tl = new Map<number, TimelineRow>();

  for (const d of dests) {
    const ia = A.get(d.key), ib = B.get(d.key);
    const va = visitMatchesYear(ia, year), vb = visitMatchesYear(ib, year);
    if (d.region) regionMap.get(d.region)!.total++;
    if (va) {
      setA.add(d.key);
      const t = ia!.times ?? 1;
      visitsA += t;
      topA.push({ key: d.key, name: d.name, times: t });
      if (d.region) regionMap.get(d.region)!.a++;
      const y = newYear(ia);
      if (y !== null) { const r = tl.get(y) ?? { year: y, a: 0, b: 0 }; r.a++; tl.set(y, r); }
    }
    if (vb) {
      setB.add(d.key);
      const t = ib!.times ?? 1;
      visitsB += t;
      topB.push({ key: d.key, name: d.name, times: t });
      if (d.region) regionMap.get(d.region)!.b++;
      const y = newYear(ib);
      if (y !== null) { const r = tl.get(y) ?? { year: y, a: 0, b: 0 }; r.b++; tl.set(y, r); }
    }
    if (va && vb) common.push(d);
    else if (va) onlyA.push(d);
    else if (vb) onlyB.push(d);
    if (vb && ia?.bucket) bOnA.push(d);
    if (va && ib?.bucket) aOnB.push(d);
  }

  const byTimes = (x: TopEntry, y: TopEntry) => y.times - x.times || x.name.localeCompare(y.name);
  const byName = (x: DestMeta, y: DestMeta) => x.name.localeCompare(y.name);
  return {
    totalA: setA.size,
    totalB: setB.size,
    common: common.sort(byName),
    onlyA: onlyA.sort(byName),
    onlyB: onlyB.sort(byName),
    visitsA,
    visitsB,
    topA: topA.sort(byTimes).slice(0, 5),
    topB: topB.sort(byTimes).slice(0, 5),
    regions: [...regionMap.values()],
    timeline: [...tl.values()].sort((x, y) => x.year - y.year),
    bVisitedOnABucket: bOnA.sort(byName),
    aVisitedOnBBucket: aOnB.sort(byName),
    jaccard: jaccard(setA, setB),
  };
}

/** Distinct recorded years (first or latest) across both users, newest first. */
export function recordedYears(A: UserIndex, B: UserIndex): number[] {
  const s = new Set<number>();
  for (const idx of [A, B]) for (const i of idx.values()) {
    if (!i.visited) continue;
    if (i.firstYear) s.add(i.firstYear);
    if (i.lastYear) s.add(i.lastYear);
  }
  return [...s].sort((a, b) => b - a);
}

export function formatYears(info: DestInfo | undefined): string {
  if (!info?.visited) return "—";
  const f = info.firstYear, l = info.lastYear;
  if (f && l && f !== l) return `${f} (first) · ${l} (latest)`;
  if (f || l) return String(f ?? l);
  return "Year not recorded";
}

export function formatTimes(info: DestInfo | undefined): string {
  if (!info?.visited) return "—";
  if (info.times == null) return "Not recorded";
  return info.times >= 10 ? "10+ visits" : `${info.times} visit${info.times === 1 ? "" : "s"}`;
}

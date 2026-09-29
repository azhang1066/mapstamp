import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  useListConnections, useCompareWithUser, getListConnectionsQueryKey, getCompareWithUserQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeftRight, BarChart3, ChevronLeft, ChevronRight, Download, Eye, EyeOff, Globe2, Info, Lock, RefreshCw, X,
} from "lucide-react";
import CompareMap, { COLOR_A, COLOR_B, BASE_FILL, BUCKET_BOTH_STROKE, BUCKET_HOOK_STROKE, PatternDefs, type HoverInfo } from "./CompareMap";
import {
  buildIndex, computeStats, overlayFor, nameForKey, parseKey, categoryLabel, recordedYears, formatYears, formatTimes,
  DEFAULT_LAYERS, type CompareMode, type LayerToggles, type SideStatus, type DestInfo,
} from "./compareModel";

const CompareStatsPanel = lazy(() => import("./CompareStatsPanel"));

const POLL_MS = 30_000;
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1950;

function errStatus(e: unknown): number | undefined {
  return typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : undefined;
}

function useIsDesktop() {
  const [d, setD] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const h = () => setD(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return d;
}

function StatusPill({ s }: { s: SideStatus }) {
  const map = { visited: ["Visited", "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"], bucket: ["Bucket list", "bg-yellow-400/10 text-yellow-200 border-yellow-400/30"], none: ["Not yet", "bg-slate-700/40 text-slate-400 border-slate-600/50"] } as const;
  const [label, cls] = map[s];
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#0a1220] text-slate-100 flex flex-col">{children}</div>;
}

function StateCard({ title, body, icon, action }: { title: string; body: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Shell>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center" data-testid="state-compare-message">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">{icon}</div>
          <h1 className="mt-4 text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{body}</p>
          <div className="mt-6 flex justify-center gap-2">
            {action}
            <a href={import.meta.env.BASE_URL} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm" data-testid="link-back-to-map">Back to my map</a>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function LoadingSkeleton() {
  return (
    <Shell>
      <div className="h-14 border-b border-slate-800 flex items-center px-4 gap-3" data-testid="status-compare-loading">
        <div className="h-4 w-40 rounded bg-slate-800 animate-pulse" />
        <div className="ml-auto h-8 w-24 rounded bg-slate-800 animate-pulse" />
      </div>
      <div className="flex-1 flex">
        <div className="flex-1 m-4 rounded-xl bg-slate-900/70 animate-pulse" />
        <div className="hidden lg:block w-[360px] m-4 ml-0 space-y-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-slate-900/70 animate-pulse" />)}
        </div>
      </div>
    </Shell>
  );
}

export default function CompareView({ username }: { username: string }) {
  const { user, isLoaded } = useUser();
  const uid = user?.id ?? null;
  const qc = useQueryClient();
  const patternPrefix = `cmp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // ── Account-scoped cache isolation: clear friend data on unmount / user change
  useEffect(() => {
    const scope = uid;
    return () => {
      qc.removeQueries({
        predicate: q => {
          const k = q.queryKey;
          const head = String(k[0] ?? "");
          if (head.startsWith("/api/compare/")) return true;
          return head === String(getListConnectionsQueryKey()[0]) && k.includes("compare-view") && k.includes(scope);
        },
      });
    };
  }, [uid, qc]);

  const connections = useListConnections({
    query: {
      queryKey: [...getListConnectionsQueryKey(), "compare-view", uid],
      enabled: !!uid,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: POLL_MS,
    },
  });

  const connection = useMemo(() => {
    const target = username.trim().toLowerCase();
    return connections.data?.accepted.find(c => c.status === "accepted" && (c.otherUser?.username ?? "").toLowerCase() === target) ?? null;
  }, [connections.data, username]);
  const otherId = connection?.otherUser?.userId ?? "";

  const compare = useCompareWithUser(otherId, {
    query: {
      queryKey: [...getCompareWithUserQueryKey(otherId), "viewer", uid],
      enabled: !!uid && !!otherId,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: POLL_MS,
      retry: (n, e) => { const s = errStatus(e); return s !== 403 && s !== 404 && s !== 401 && n < 2; },
    },
  });

  // ── Ephemeral view state
  const [mode, setMode] = useState<CompareMode>("world");
  const [swapped, setSwapped] = useState(false);
  const [layers, setLayers] = useState<LayerToggles>(DEFAULT_LAYERS);
  const [opMe, setOpMe] = useState(0.9);
  const [opFriend, setOpFriend] = useState(0.9);
  const [yearOn, setYearOn] = useState(false);
  const [yearVal, setYearVal] = useState(CURRENT_YEAR);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const year = yearOn ? yearVal : null;

  const data = compare.data;
  // Fail closed: data only usable if it belongs to this viewer & still-accepted connection
  const valid = !!data && !!connection && !compare.isError && !connections.isError
    && data.me.userId === uid && data.other.userId === otherId;

  const meIdx = useMemo(() => buildIndex(valid ? data!.me.destinations : []), [valid, data]);
  const friendIdx = useMemo(() => buildIndex(valid ? data!.other.destinations : []), [valid, data]);
  const meName = "You";
  const friendName = (valid && (data!.other.username || data!.other.displayName)) || connection?.otherUser?.username || username;
  const A = swapped ? friendIdx : meIdx;
  const B = swapped ? meIdx : friendIdx;
  const nameA = swapped ? friendName : meName;
  const nameB = swapped ? meName : friendName;
  const opacityA = swapped ? opFriend : opMe;
  const opacityB = swapped ? opMe : opFriend;
  const layerLabelA = swapped ? friendName : "Me";
  const layerLabelB = swapped ? "Me" : friendName;

  const overlayOf = useCallback((key: string) => overlayFor(A.get(key), B.get(key), year, layers), [A, B, year, layers]);
  const stats = useMemo(() => computeStats(mode, A, B, year), [mode, A, B, year]);
  const years = useMemo(() => recordedYears(meIdx, friendIdx), [meIdx, friendIdx]);

  useEffect(() => { setSelected(null); setHover(null); }, [mode]);

  const onSelect = useCallback((key: string) => {
    const { category } = parseKey(key);
    if ((category === "tcc") !== (mode === "tcc")) setMode(category === "tcc" ? "tcc" : "world");
    setSelected(key);
    setSheetOpen(false);
  }, [mode]);

  const download = async () => {
    if (!exportRef.current) return;
    setExporting(true); setExportErr(null);
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(exportRef.current, {
        pixelRatio: 2, backgroundColor: "#0a1220", cacheBust: true,
        filter: (n) => !(n instanceof HTMLElement && n.hasAttribute("data-html2image-ignore")),
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `compare-${(friendName || "friend").replace(/[^a-z0-9_-]/gi, "")}-${mode}${year ? `-${year}` : ""}.png`;
      a.click();
    } catch {
      setExportErr("Couldn't create the image. Try again.");
    } finally { setExporting(false); }
  };

  // ── Guard states
  if (!isLoaded || (uid && connections.isLoading)) return <LoadingSkeleton />;
  if (!uid) return <StateCard title="Sign in to compare maps" body="Comparisons are private and only available to signed-in travelers." icon={<Lock className="w-5 h-5" />} />;
  if (connections.isError) {
    return <StateCard title="Couldn't load your connections" body="Check your connection and try again." icon={<RefreshCw className="w-5 h-5" />}
      action={<button type="button" onClick={() => connections.refetch()} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm" data-testid="button-retry-connections">Retry</button>} />;
  }
  const cs = errStatus(compare.error);
  if (cs === 401) return <StateCard title="Sign in to compare maps" body="Your session has expired. Sign in again to view this comparison." icon={<Lock className="w-5 h-5" />} />;
  if (!connection || cs === 403 || cs === 404) {
    return <StateCard title="You need to be connected to compare maps" body={`Send @${username} a connection request. Once they accept, you can overlay your travels here.`} icon={<Lock className="w-5 h-5" />} />;
  }
  if (compare.isError && !valid) {
    return <StateCard title="Couldn't load the comparison" body="Something went wrong fetching travel data." icon={<RefreshCw className="w-5 h-5" />}
      action={<button type="button" onClick={() => compare.refetch()} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm" data-testid="button-retry-compare">Retry</button>} />;
  }
  if (!valid) return <LoadingSkeleton />;

  const hoverKey = hover?.key;
  const selA = selected ? A.get(selected) : undefined;
  const selB = selected ? B.get(selected) : undefined;

  const statsNode = (
    <Suspense fallback={<div className="space-y-3 py-4">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-lg bg-slate-800/60 animate-pulse" />)}</div>}>
      <CompareStatsPanel stats={stats} mode={mode} nameA={nameA} nameB={nameB} aIsMe={!swapped} year={year} onSelect={onSelect} />
    </Suspense>
  );

  const toggle = (k: keyof LayerToggles, label: string, testId: string) => (
    <button type="button" aria-pressed={layers[k]} onClick={() => setLayers(l => ({ ...l, [k]: !l[k] }))} data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors max-w-[11rem] ${layers[k] ? "bg-slate-800 border-slate-600 text-slate-100" : "bg-transparent border-slate-800 text-slate-500"}`}>
      {layers[k] ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}<span className="truncate">{label}</span>
    </button>
  );

  return (
    <Shell>
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-[#0c1626]/90 backdrop-blur px-3 sm:px-5 py-2.5 flex flex-wrap items-center gap-2">
        <a href={import.meta.env.BASE_URL} className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300" aria-label="Back to my map" data-testid="link-back">
          <ChevronLeft className="w-5 h-5" />
        </a>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Compare maps</p>
          <h1 className="text-base sm:text-lg font-semibold truncate" data-testid="text-compare-title">
            <span style={{ color: COLOR_A }}>{nameA}</span> <span className="text-slate-500">&amp;</span> <span style={{ color: COLOR_B }}>{nameB}</span>
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => {
            setSwapped(s => !s);
            setLayers(l => ({ ...l, showA: l.showB, showB: l.showA }));
          }} data-testid="button-swap" aria-label="Swap perspective"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs hover:bg-slate-800" title="Swap perspective">
            <ArrowLeftRight className="w-3.5 h-3.5" /><span className="hidden sm:inline">Swap</span>
          </button>
          <button type="button" onClick={download} disabled={exporting} data-testid="button-download" aria-label="Download image"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium disabled:opacity-60">
            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">{exporting ? "Preparing…" : "Download image"}</span>
          </button>
          {isDesktop && (
            <button type="button" onClick={() => setStatsOpen(o => !o)} aria-expanded={statsOpen} data-testid="button-toggle-stats"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs hover:bg-slate-800">
              <BarChart3 className="w-3.5 h-3.5" />{statsOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </header>
      {exportErr && <p role="alert" className="text-xs text-red-300 bg-red-950/40 px-4 py-1.5">{exportErr}</p>}

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 flex flex-col p-2 sm:p-4 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-300">Compare by</span>
            <div role="group" aria-label="Map mode" className="flex flex-1 sm:flex-none rounded-xl bg-slate-900 border border-slate-700 p-1">
              {(["world", "tcc"] as const).map(m => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`button-mode-${m}`}
                  className={`min-h-11 flex-1 px-5 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${mode === m ? "bg-sky-600 text-white shadow-sm" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                  {m === "world" ? "World Map" : "TCC"}
                </button>
              ))}
            </div>
          </div>
          {/* Controls */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Layers">
              {toggle("showA", layerLabelA, "toggle-layer-a")}
              {toggle("showB", layerLabelB, "toggle-layer-b")}
              {toggle("bothOnly", "Both only", "toggle-both-only")}
              {toggle("showBuckets", "Show bucket lists", "toggle-buckets")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[{ label: "Me", v: opMe, set: setOpMe, c: swapped ? COLOR_B : COLOR_A, id: "me" }, { label: friendName, v: opFriend, set: setOpFriend, c: swapped ? COLOR_A : COLOR_B, id: "friend" }].map(s => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.c }} />
                  <span className="truncate w-20 shrink-0">{s.label} opacity</span>
                  <input type="range" min={0.1} max={1} step={0.05} value={s.v} onChange={e => s.set(Number(e.target.value))}
                    className="flex-1 min-w-0 accent-sky-400" data-testid={`slider-opacity-${s.id}`} aria-label={`${s.label} layer opacity`} />
                  <span className="font-mono tabular-nums w-9 text-right">{Math.round(s.v * 100)}%</span>
                </label>
              ))}
            </div>
            {/* Year */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={yearOn} onChange={e => setYearOn(e.target.checked)} className="accent-sky-400" data-testid="checkbox-year-filter" />
                Filter by year
              </label>
              <button type="button" disabled={!yearOn || yearVal <= MIN_YEAR} onClick={() => setYearVal(y => y - 1)} className="w-6 h-6 rounded bg-slate-800 disabled:opacity-40" aria-label="Previous year" data-testid="button-year-prev">‹</button>
              <input type="range" min={MIN_YEAR} max={CURRENT_YEAR} value={yearVal} disabled={!yearOn} onChange={e => setYearVal(Number(e.target.value))}
                className="flex-1 min-w-[120px] accent-sky-400 disabled:opacity-40" aria-label="Selected year" data-testid="slider-year" />
              <button type="button" disabled={!yearOn || yearVal >= CURRENT_YEAR} onClick={() => setYearVal(y => y + 1)} className="w-6 h-6 rounded bg-slate-800 disabled:opacity-40" aria-label="Next year" data-testid="button-year-next">›</button>
              <span className={`font-mono tabular-nums text-sm w-12 ${yearOn ? "text-white" : "text-slate-600"}`} data-testid="text-selected-year">{yearVal}</span>
              {years.length > 0 && (
                <select value={years.includes(yearVal) ? yearVal : ""} onChange={e => { if (e.target.value) { setYearVal(Number(e.target.value)); setYearOn(true); } }}
                  className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs" aria-label="Jump to a recorded year" data-testid="select-recorded-year">
                  <option value="">Recorded years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
            <p className="text-[11px] text-slate-500 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              Only first and latest visit years are recorded. A year matches when it equals either one — years in between aren't inferred. Visit counts are lifetime totals for the destinations shown.</p>
          </div>

          {/* Export region: map + legend + usernames */}
          <div ref={exportRef} className="relative flex-1 min-h-[300px] rounded-xl overflow-hidden border border-slate-800 bg-[#0c1524] flex flex-col" data-testid="region-compare-export">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs border-b border-slate-800/80">
              <span className="min-w-0 break-all font-semibold"><span style={{ color: COLOR_A }}>{nameA}</span> vs <span style={{ color: COLOR_B }}>{nameB}</span></span>
              <span className="text-slate-500 inline-flex items-center gap-1"><Globe2 className="w-3.5 h-3.5" />{mode === "world" ? "World" : "Travelers' Century Club"}{year ? ` · ${year}` : ""}</span>
            </div>
            <div className="flex-1 min-h-[240px]">
              <CompareMap mode={mode} overlayOf={overlayOf} opacityA={opacityA} opacityB={opacityB} selectedKey={selected} onHover={setHover} onSelect={onSelect} patternPrefix={patternPrefix} />
            </div>
            <Legend nameA={nameA} nameB={nameB} opacityA={opacityA} opacityB={opacityB} prefix={`${patternPrefix}lg`} />
          </div>
        </main>

        {/* Desktop sidebar */}
        {isDesktop && (
          <AnimatePresence initial={false}>
            {statsOpen && (
              <motion.aside key="side" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="w-[380px] shrink-0 border-l border-slate-800 bg-[#0c1626] overflow-y-auto px-4 pb-6 max-h-[calc(100dvh-58px)]" aria-label="Comparison statistics">
                {statsNode}
              </motion.aside>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {!isDesktop && (
        <>
          <button type="button" onClick={() => setSheetOpen(true)} data-testid="button-open-stats"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-100 text-slate-900 text-sm font-semibold shadow-lg">
            <BarChart3 className="w-4 h-4" /> Stats · {stats.common.length} in common
          </button>
          <AnimatePresence>
            {sheetOpen && (
              <>
                <motion.div key="bd" className="fixed inset-0 z-40 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheetOpen(false)} />
                <motion.div key="sheet" role="dialog" aria-modal="true" aria-label="Comparison statistics"
                  initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 34 }}
                  drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_, i) => { if (i.offset.y > 120) setSheetOpen(false); }}
                  className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] rounded-t-2xl bg-[#0c1626] border-t border-slate-700 flex flex-col">
                  <div className="flex items-center justify-between px-4 pt-2 pb-1">
                    <div className="mx-auto w-10 h-1 rounded-full bg-slate-600" />
                  </div>
                  <div className="flex items-center justify-between px-4 pb-1">
                    <h2 className="text-sm font-semibold">Comparison</h2>
                    <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close statistics" className="p-1 rounded hover:bg-slate-800" data-testid="button-close-stats"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="overflow-y-auto px-4 pb-8">{statsNode}</div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Tooltip */}
      {hoverKey && hover && (
        <div role="tooltip" aria-live="polite" data-testid="tooltip-compare"
          className="fixed z-[70] pointer-events-none rounded-lg border border-slate-700 bg-[#0f1a2b]/95 px-3 py-2 text-xs shadow-xl w-[240px]"
          style={{ left: Math.min(hover.x + 14, window.innerWidth - 252), top: Math.min(hover.y + 14, window.innerHeight - 150) }}>
          <p className="font-semibold text-sm text-white mb-1.5">{nameForKey(hoverKey)}</p>
          {[{ n: nameA, i: A.get(hoverKey), c: COLOR_A }, { n: nameB, i: B.get(hoverKey), c: COLOR_B }].map((r, idx) => (
            <TooltipRow key={idx} name={r.n} info={r.i} color={r.c} year={year} />
          ))}
        </div>
      )}

      {/* Read-only details */}
      <AnimatePresence>
        {selected && (
          <motion.div key="details" role="dialog" aria-label={`${nameForKey(selected)} comparison details`} data-testid="panel-compare-details"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed z-[60] left-2 right-2 bottom-20 sm:left-auto sm:right-auto sm:bottom-6 sm:ml-6 lg:left-6 lg:w-[420px] rounded-2xl border border-slate-700 bg-[#0f1a2b]/97 shadow-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{categoryLabel(parseKey(selected).category)} · read-only</p>
                <h2 className="text-lg font-semibold" data-testid="text-details-name">{nameForKey(selected)}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close details" className="p-1 rounded hover:bg-slate-800" data-testid="button-close-details"><X className="w-4 h-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[{ n: nameA, i: selA, c: COLOR_A, id: "a" }, { n: nameB, i: selB, c: COLOR_B, id: "b" }].map(col => {
                const s: SideStatus = col.i?.visited ? "visited" : col.i?.bucket ? "bucket" : "none";
                return (
                  <div key={col.id} className="rounded-lg bg-slate-900/70 border border-slate-800 p-3" data-testid={`details-col-${col.id}`}>
                    <p className="text-xs font-semibold truncate flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: col.c }} />{col.n}</p>
                    <div className="mt-2"><StatusPill s={s} /></div>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <div><dt className="text-slate-500">First visit</dt><dd className="text-slate-200">{col.i?.visited ? col.i.firstYear ?? "Not recorded" : "—"}</dd></div>
                      <div><dt className="text-slate-500">Latest visit</dt><dd className="text-slate-200">{col.i?.visited ? col.i.lastYear ?? "Not recorded" : "—"}</dd></div>
                      <div><dt className="text-slate-500">Times visited</dt><dd className="text-slate-200">{formatTimes(col.i)}</dd></div>
                    </dl>
                  </div>
                );
              })}
            </div>
            {year !== null && <p className="mt-2 text-[11px] text-slate-500">Map shows {year} only; details show all recorded years.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function TooltipRow({ name, info, color, year }: { name: string; info: DestInfo | undefined; color: string; year: number | null }) {
  const s: SideStatus = info?.visited ? "visited" : info?.bucket ? "bucket" : "none";
  const outOfYear = s === "visited" && year !== null && info!.firstYear !== year && info!.lastYear !== year;
  return (
    <div className="py-1 border-t border-slate-800 first-of-type:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />{name}</span>
        <StatusPill s={s} />
      </div>
      {s === "visited" && (
        <p className="text-slate-400 mt-0.5">{formatYears(info)} · {formatTimes(info)}{outOfYear ? ` · not in ${year}` : ""}</p>
      )}
    </div>
  );
}

function Legend({ nameA, nameB, opacityA, opacityB, prefix }: { nameA: string; nameB: string; opacityA: number; opacityB: number; prefix: string }) {
  const sw = (fill: string, extra?: { stroke?: string; dash?: string }) => (
    <svg width="18" height="14" aria-hidden className="shrink-0">
      <PatternDefs prefix={prefix} opacityA={opacityA} opacityB={opacityB} />
      <rect x="1" y="1" width="16" height="12" rx="2" fill={fill} stroke={extra?.stroke ?? "#334155"} strokeWidth={extra?.stroke ? 1.6 : 1} strokeDasharray={extra?.dash} />
    </svg>
  );
  const items = [
    { el: sw(`url(#${prefix}-a)`), label: `Only ${nameA}` },
    { el: sw(`url(#${prefix}-b)`), label: `Only ${nameB}` },
    { el: sw(`url(#${prefix}-both)`), label: "Both visited" },
    { el: sw(BASE_FILL, { stroke: BUCKET_BOTH_STROKE, dash: "3 2" }), label: "Both on bucket list" },
    { el: sw(BASE_FILL, { stroke: BUCKET_HOOK_STROKE }), label: "Visited by one, on the other's bucket list" },
    { el: sw(BASE_FILL), label: "Neither" },
  ];
  return (
    <div className="px-3 py-2 border-t border-slate-800/80 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-300" data-testid="legend-compare">
      {items.map(i => <span key={i.label} className="inline-flex items-center gap-1.5">{i.el}{i.label}</span>)}
      <span className="inline-flex items-center gap-1.5 text-slate-500">Dots: left half {nameA}, right half {nameB}</span>
    </div>
  );
}

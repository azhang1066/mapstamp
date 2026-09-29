import { useState } from "react";
import type { ReactNode } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line,
} from "recharts";
import { ChevronRight } from "lucide-react";
import { COLOR_A, COLOR_B } from "./CompareMap";
import type { CompareStats, CompareMode, DestMeta, TopEntry } from "./compareModel";

export interface CompareStatsPanelProps {
  stats: CompareStats;
  mode: CompareMode;
  nameA: string;
  nameB: string;
  aIsMe: boolean;
  year: number | null;
  onSelect: (key: string) => void;
}

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section className="py-4 border-b border-slate-800/80 last:border-0" aria-labelledby={`stats-${id}`}>
      <h3 id={`stats-${id}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function DestList({ items, onSelect, testId, empty }: { items: DestMeta[]; onSelect: (k: string) => void; testId: string; empty: string }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return <p className="text-xs text-slate-500 italic">{empty}</p>;
  const shown = all ? items : items.slice(0, 8);
  return (
    <div>
      <ul className="space-y-0.5" data-testid={testId}>
        {shown.map(d => (
          <li key={d.key}>
            <button type="button" onClick={() => onSelect(d.key)} data-testid={`${testId}-item-${d.key}`}
              className="w-full flex items-center justify-between gap-2 text-left text-sm text-slate-200 px-2 py-1.5 rounded-md hover:bg-slate-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
              <span className="truncate">{d.name}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
      {items.length > 8 && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-1 text-xs text-sky-300 hover:underline px-2" data-testid={`${testId}-toggle`}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function TopList({ items, color, onSelect, testId }: { items: TopEntry[]; color: string; onSelect: (k: string) => void; testId: string }) {
  if (items.length === 0) return <p className="text-xs text-slate-500 italic">No visits yet</p>;
  const max = Math.max(...items.map(i => i.times));
  return (
    <ol className="space-y-1" data-testid={testId}>
      {items.map(i => (
        <li key={i.key}>
          <button type="button" onClick={() => onSelect(i.key)} className="w-full text-left group">
            <div className="flex justify-between text-xs text-slate-300 group-hover:text-white">
              <span className="truncate pr-2">{i.name}</span>
              <span className="font-mono tabular-nums">{i.times >= 10 ? "10+" : i.times}</span>
            </div>
            <div className="h-1 mt-0.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(i.times / max) * 100}%`, background: color }} />
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}

const tooltipStyle = { background: "#0f1a2b", border: "1px solid #334155", borderRadius: 8, fontSize: 12, color: "#e2e8f0" };

export default function CompareStatsPanel({ stats, mode, nameA, nameB, aIsMe, year, onSelect }: CompareStatsPanelProps) {
  const pct = Math.round(stats.jaccard * 1000) / 10;
  const me = aIsMe ? nameA : nameB;
  const friend = aIsMe ? nameB : nameA;
  const friendOnMyBucket = aIsMe ? stats.bVisitedOnABucket : stats.aVisitedOnBBucket;
  const meOnFriendBucket = aIsMe ? stats.aVisitedOnBBucket : stats.bVisitedOnABucket;
  const unit = mode === "tcc" ? "TCC destinations" : "places";

  return (
    <div className="text-slate-200" data-testid="panel-compare-stats">
      {/* Hook */}
      <div className="rounded-xl p-4 mt-1 bg-gradient-to-br from-[#1b2a3f] to-[#131d2c] border border-slate-700/70">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#F0E442]/90 font-semibold">Trip ideas</p>
        <p className="mt-1 text-lg leading-snug font-semibold" data-testid="text-bucket-hook">
          {friend} has been to <span className="text-[#F0E442] tabular-nums">{friendOnMyBucket.length}</span> {friendOnMyBucket.length === 1 ? "place" : "places"} on your bucket list
        </p>
        <div className="mt-2 -mx-2">
          <DestList items={friendOnMyBucket} onSelect={onSelect} testId="list-friend-on-my-bucket" empty="No overlap yet — add places to your bucket list to find trip ideas." />
        </div>
      </div>

      <Section title="Visited" id="totals">
        <div className="grid grid-cols-2 gap-3">
          {[{ n: nameA, v: stats.totalA, c: COLOR_A, id: "a" }, { n: nameB, v: stats.totalB, c: COLOR_B, id: "b" }].map(x => (
            <div key={x.id} className="rounded-lg bg-slate-900/60 border border-slate-800 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate"><span className="w-2 h-2 rounded-full" style={{ background: x.c }} />{x.n}</div>
              <div className="text-2xl font-semibold tabular-nums mt-1" data-testid={`text-total-${x.id}`}>{x.v}</div>
              <div className="text-[11px] text-slate-500">{unit}{year !== null ? ` through ${year}` : ""}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-900/60 border border-slate-800 p-3">
          <div className="relative w-12 h-12 shrink-0" aria-hidden>
            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="4" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F0E442" strokeWidth="4" strokeDasharray={`${pct} ${100 - pct}`} />
            </svg>
          </div>
          <div>
            <div className="text-sm"><span className="font-semibold tabular-nums" data-testid="text-similarity">{pct}%</span> similarity</div>
            <div className="text-[11px] text-slate-500">Jaccard index: shared ÷ combined visited</div>
          </div>
        </div>
      </Section>

      <Section title="Overlap" id="overlap">
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="rounded-md bg-slate-900/60 py-2"><div className="text-lg font-semibold tabular-nums" data-testid="text-common-count">{stats.common.length}</div><div className="text-[10px] text-slate-500">In common</div></div>
          <div className="rounded-md bg-slate-900/60 py-2"><div className="text-lg font-semibold tabular-nums" style={{ color: COLOR_A }} data-testid="text-only-a-count">{stats.onlyA.length}</div><div className="text-[10px] text-slate-500 truncate px-1">Only {nameA}</div></div>
          <div className="rounded-md bg-slate-900/60 py-2"><div className="text-lg font-semibold tabular-nums" style={{ color: COLOR_B }} data-testid="text-only-b-count">{stats.onlyB.length}</div><div className="text-[10px] text-slate-500 truncate px-1">Only {nameB}</div></div>
        </div>
        <p className="text-xs text-slate-400 mb-1">Both visited</p>
        <div className="-mx-2"><DestList items={stats.common} onSelect={onSelect} testId="list-common" empty="Nothing in common yet." /></div>
        <p className="text-xs text-slate-400 mt-3 mb-1">Only {nameA}</p>
        <div className="-mx-2"><DestList items={stats.onlyA} onSelect={onSelect} testId="list-only-a" empty="None." /></div>
        <p className="text-xs text-slate-400 mt-3 mb-1">Only {nameB}</p>
        <div className="-mx-2"><DestList items={stats.onlyB} onSelect={onSelect} testId="list-only-b" empty="None." /></div>
      </Section>

      <Section title="Visit counts" id="visits">
        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          <div><span className="text-slate-400 text-xs block truncate">{nameA}</span><span className="font-semibold tabular-nums" data-testid="text-visits-a">{stats.visitsA}</span> <span className="text-xs text-slate-500">total visits</span></div>
          <div><span className="text-slate-400 text-xs block truncate">{nameB}</span><span className="font-semibold tabular-nums" data-testid="text-visits-b">{stats.visitsB}</span> <span className="text-xs text-slate-500">total visits</span></div>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Lifetime visit totals for the destinations shown. These are minimums when a count is unrecorded (counted as 1) or marked 10+ (counted as 10).</p>
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-xs text-slate-400 mb-1.5 truncate">{nameA}'s most visited</p><TopList items={stats.topA} color={COLOR_A} onSelect={onSelect} testId="list-top-a" /></div>
          <div><p className="text-xs text-slate-400 mb-1.5 truncate">{nameB}'s most visited</p><TopList items={stats.topB} color={COLOR_B} onSelect={onSelect} testId="list-top-b" /></div>
        </div>
      </Section>

      {mode === "tcc" && (
        <Section title="TCC regions" id="regions">
          <div className="h-[340px] -ml-3" data-testid="chart-regions">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.regions} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid horizontal={false} stroke="#1e293b" />
                <XAxis type="number" allowDecimals={false} stroke="#64748b" fontSize={10} />
                <YAxis type="category" dataKey="name" width={110} stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1e293b66" }}
                  formatter={(v: number, k: string, p: { payload?: { total?: number } }) => [`${v} of ${p.payload?.total ?? 0}`, k]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="a" name={nameA} fill={COLOR_A} radius={[0, 3, 3, 0]} />
                <Bar dataKey="b" name={nameB} fill={COLOR_B} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="Travel timeline" id="timeline">
        {stats.timeline.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No visit years recorded yet.</p>
        ) : (
          <div className="h-[200px] -ml-4" data-testid="chart-timeline">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.timeline} margin={{ right: 8 }}>
                <CartesianGrid vertical={false} stroke="#1e293b" />
                <XAxis dataKey="year" stroke="#64748b" fontSize={10} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={10} width={32} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Year ${l}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="a" name={nameA} stroke={COLOR_A} strokeWidth={2} dot={{ r: 2.5 }} />
                <Line type="monotone" dataKey="b" name={nameB} stroke={COLOR_B} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-2">New destinations per year, using each place's first recorded visit year (or latest, if only that is known).</p>
      </Section>

      <Section title={`Your visits on ${friend}'s bucket list`} id="reverse-hook">
        <p className="text-sm mb-2"><span className="font-semibold tabular-nums" data-testid="text-reverse-hook">{meOnFriendBucket.length}</span> of the places you ({me}) have been are on {friend}'s bucket list.</p>
        <div className="-mx-2"><DestList items={meOnFriendBucket} onSelect={onSelect} testId="list-me-on-friend-bucket" empty={`None of your visits are on ${friend}'s list yet.`} /></div>
      </Section>
    </div>
  );
}

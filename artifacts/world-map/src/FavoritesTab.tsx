import { useState, useRef, useEffect, useCallback } from "react";
import { COUNTRY_DATA, CONTINENT_COLORS } from "./countryData";
import { TCC_DATA, TCC_REGIONS } from "./tccData";

export interface FavoriteEntry {
  type: "country" | "tcc";
  name: string;
}

const MAX_FAVORITES = 5;
const STORAGE_KEY = "wm_favorites";

function loadFavorites(): FavoriteEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    return arr
      .filter(
        (x): x is FavoriteEntry =>
          typeof x === "object" &&
          x !== null &&
          (x as FavoriteEntry).type === "country" ||
          (typeof x === "object" && x !== null && (x as FavoriteEntry).type === "tcc"),
      )
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

function saveFavorites(favs: FavoriteEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  } catch {}
}

// All country options (name + continent)
const COUNTRY_OPTIONS: { name: string; continent: string }[] = Object.values(COUNTRY_DATA)
  .filter((v) => v.regionType === "country")
  .map((v) => ({ name: v.name, continent: v.continent ?? "" }))
  .sort((a, b) => a.name.localeCompare(b.name));

// All TCC options
const TCC_OPTIONS: { name: string; region: string }[] = TCC_DATA.map((t) => ({
  name: t.name,
  region: t.region,
})).sort((a, b) => a.name.localeCompare(b.name));

function getColor(fav: FavoriteEntry): string {
  if (fav.type === "country") {
    const entry = COUNTRY_OPTIONS.find((c) => c.name === fav.name);
    return CONTINENT_COLORS[entry?.continent ?? ""] ?? "#475569";
  } else {
    const entry = TCC_OPTIONS.find((t) => t.name === fav.name);
    return TCC_REGIONS[entry?.region as keyof typeof TCC_REGIONS]?.color ?? "#475569";
  }
}

function getSubtitle(fav: FavoriteEntry): string {
  if (fav.type === "country") {
    const entry = COUNTRY_OPTIONS.find((c) => c.name === fav.name);
    return entry?.continent ?? "";
  } else {
    const entry = TCC_OPTIONS.find((t) => t.name === fav.name);
    return TCC_REGIONS[entry?.region as keyof typeof TCC_REGIONS]?.name ?? "";
  }
}

type SearchResult =
  | { type: "country"; name: string; continent: string }
  | { type: "tcc"; name: string; regionName: string; regionColor: string };

function buildResults(query: string, existing: FavoriteEntry[]): SearchResult[] {
  const q = query.toLowerCase().trim();
  const existingSet = new Set(existing.map((f) => `${f.type}:${f.name}`));

  const countries: SearchResult[] = COUNTRY_OPTIONS.filter(
    (c) =>
      !existingSet.has(`country:${c.name}`) &&
      (q === "" || c.name.toLowerCase().includes(q) || c.continent.toLowerCase().includes(q)),
  )
    .slice(0, 40)
    .map((c) => ({ type: "country", name: c.name, continent: c.continent }));

  const tccs: SearchResult[] = TCC_OPTIONS.filter(
    (t) =>
      !existingSet.has(`tcc:${t.name}`) &&
      (q === "" ||
        t.name.toLowerCase().includes(q) ||
        (TCC_REGIONS[t.region as keyof typeof TCC_REGIONS]?.name ?? "")
          .toLowerCase()
          .includes(q)),
  )
    .slice(0, 40)
    .map((t) => ({
      type: "tcc",
      name: t.name,
      regionName: TCC_REGIONS[t.region as keyof typeof TCC_REGIONS]?.name ?? t.region,
      regionColor: TCC_REGIONS[t.region as keyof typeof TCC_REGIONS]?.color ?? "#475569",
    }));

  // interleave: show countries first if they start with the query, else mix
  if (!q) return [...countries.slice(0, 20), ...tccs.slice(0, 20)];
  return [...countries, ...tccs];
}

interface SlotPickerProps {
  favorites: FavoriteEntry[];
  slotIndex: number;
  onSelect: (entry: FavoriteEntry) => void;
  onClose: () => void;
}

function SlotPicker({ favorites, onSelect, onClose }: SlotPickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = buildResults(query, favorites);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-2 w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search countries or TCC destinations…"
        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
      />
      <div className="overflow-y-auto max-h-64 rounded-lg border border-slate-700 divide-y divide-slate-700/50">
        {results.length === 0 && (
          <p className="text-slate-500 text-sm px-3 py-3">No results found</p>
        )}
        {results.map((r) => (
          <button
            key={`${r.type}:${r.name}`}
            onClick={() => { onSelect({ type: r.type, name: r.name }); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700/60 transition-colors"
          >
            <span
              className="shrink-0 w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor:
                  r.type === "country"
                    ? (CONTINENT_COLORS[(r as { type: "country"; name: string; continent: string }).continent] ?? "#475569")
                    : (r as { type: "tcc"; name: string; regionName: string; regionColor: string }).regionColor,
              }}
            />
            <span className="flex-1 min-w-0">
              <span className="text-sm text-white truncate block">{r.name}</span>
              <span className="text-xs text-slate-400">
                {r.type === "country"
                  ? (r as { type: "country"; name: string; continent: string }).continent
                  : (r as { type: "tcc"; name: string; regionName: string; regionColor: string }).regionName}
              </span>
            </span>
            {r.type === "tcc" && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                TCC
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FavoriteCardProps {
  index: number;
  entry: FavoriteEntry | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

function FavoriteCard({ index, entry, isEditing, onEdit, onRemove }: FavoriteCardProps) {
  const color = entry ? getColor(entry) : undefined;
  const subtitle = entry ? getSubtitle(entry) : undefined;

  if (!entry) {
    return (
      <button
        onClick={onEdit}
        className="group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 hover:border-orange-500/70 hover:bg-slate-800/60 transition-all duration-200"
        style={{ width: 108, height: 148 }}
        title={`Add favorite #${index + 1}`}
      >
        <span className="absolute top-2 left-2 w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 text-slate-400 text-[10px] font-bold">
          {index + 1}
        </span>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          className="text-slate-500 group-hover:text-orange-400 transition-colors"
        >
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="mt-1.5 text-[11px] text-slate-500 group-hover:text-orange-400 transition-colors">Add</span>
      </button>
    );
  }

  return (
    <div
      className="group relative rounded-xl overflow-hidden flex flex-col justify-end cursor-pointer"
      style={{ width: 108, height: 148, background: color }}
      onClick={onEdit}
      title={entry.name}
    >
      {/* gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* rank badge */}
      <span className="absolute top-2 left-2 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white text-[10px] font-bold z-10">
        {index + 1}
      </span>

      {/* TCC badge */}
      {entry.type === "tcc" && (
        <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white z-10 tracking-wide">
          TCC
        </span>
      )}

      {/* remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-7 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/70 text-slate-300 hover:text-white hover:bg-red-600/80 opacity-0 group-hover:opacity-100 transition-all z-10"
        title="Remove"
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {/* text */}
      <div className="relative z-10 p-2 pt-0">
        <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2 drop-shadow">
          {entry.name}
        </p>
        {subtitle && (
          <p className="text-white/60 text-[9px] mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default function FavoritesTab() {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(loadFavorites);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const save = useCallback((updated: FavoriteEntry[]) => {
    setFavorites(updated);
    saveFavorites(updated);
  }, []);

  const handleSelect = useCallback(
    (slotIndex: number, entry: FavoriteEntry) => {
      const next = [...favorites];
      next[slotIndex] = entry;
      save(next.slice(0, MAX_FAVORITES));
      setEditingSlot(null);
    },
    [favorites, save],
  );

  const handleRemove = useCallback(
    (slotIndex: number) => {
      const next = favorites.filter((_, i) => i !== slotIndex);
      save(next);
      setEditingSlot(null);
    },
    [favorites, save],
  );

  // Close picker on outside click
  useEffect(() => {
    if (editingSlot === null) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setEditingSlot(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editingSlot]);

  const slots = Array.from({ length: MAX_FAVORITES }, (_, i) => favorites[i] as FavoriteEntry | undefined);

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-0.5">Top 5 Destinations</h3>
        <p className="text-xs text-slate-500">
          Pick your favorite countries or TCC locations — shown on your stats card.
        </p>
      </div>

      {/* 5 cards */}
      <div className="flex gap-3 flex-wrap">
        {slots.map((entry, i) => (
          <FavoriteCard
            key={i}
            index={i}
            entry={entry}
            isEditing={editingSlot === i}
            onEdit={() => setEditingSlot(editingSlot === i ? null : i)}
            onRemove={() => handleRemove(i)}
          />
        ))}
      </div>

      {/* Slot picker */}
      {editingSlot !== null && (
        <div ref={pickerRef} className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {favorites[editingSlot] ? `Replace #${editingSlot + 1}` : `Add to slot #${editingSlot + 1}`}
          </p>
          <SlotPicker
            favorites={favorites}
            slotIndex={editingSlot}
            onSelect={(entry) => handleSelect(editingSlot, entry)}
            onClose={() => setEditingSlot(null)}
          />
        </div>
      )}
    </div>
  );
}

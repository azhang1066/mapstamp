import { memo, useState } from "react";
import type { KeyboardEvent, MouseEvent, FocusEvent } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import type { RsmGeography } from "react-simple-maps";
import { Plus, Minus, RotateCcw } from "lucide-react";
import { TCC_BY_GEO_ID, TCC_DATA, TCC_BY_NAME } from "../tccData";
import { COUNTRY_DATA, US_STATE_DATA, CA_PROVINCE_DATA } from "../countryData";
import {
  WORLD_URL, US_STATES_URL, CA_PROVINCES_URL, MICROSTATE_MARKERS, TCC_US_STATE_ENTRIES,
  WORLD_MODE_EXCLUDED_IDS, TCC_MODE_EXCLUDED_IDS, worldCountryKey, fipsKey, tccNameForFips, provinceName,
} from "../mapGeography";
import { destKey, type CompareMode, type Overlay } from "./compareModel";

export const COLOR_A = "#E69F00"; // Okabe-Ito orange
export const COLOR_B = "#56B4E9"; // Okabe-Ito sky blue
export const BASE_FILL = "#223043";
export const OCEAN = "#0c1524";
export const BUCKET_BOTH_STROKE = "#f5f0e6";
export const BUCKET_HOOK_STROKE = "#F0E442"; // Okabe-Ito yellow

export interface HoverInfo { key: string; x: number; y: number }

interface Props {
  mode: CompareMode;
  overlayOf: (key: string) => Overlay;
  opacityA: number;
  opacityB: number;
  selectedKey: string | null;
  onHover: (h: HoverInfo | null) => void;
  onSelect: (key: string) => void;
  patternPrefix: string;
}

/** SVG pattern defs — encode A / B / both with texture as well as hue. */
export function PatternDefs({ prefix, opacityA, opacityB }: { prefix: string; opacityA: number; opacityB: number }) {
  return (
    <defs>
      {/* A: solid orange */}
      <pattern id={`${prefix}-a`} patternUnits="userSpaceOnUse" width="6" height="6">
        <rect width="6" height="6" fill={BASE_FILL} />
        <rect width="6" height="6" fill={COLOR_A} opacity={opacityA} />
      </pattern>
      {/* B: sky blue with dot texture */}
      <pattern id={`${prefix}-b`} patternUnits="userSpaceOnUse" width="5" height="5">
        <rect width="5" height="5" fill={BASE_FILL} />
        <rect width="5" height="5" fill={COLOR_B} opacity={opacityB} />
        <circle cx="2.5" cy="2.5" r="0.9" fill="#0c1524" opacity={0.55 * opacityB} />
      </pattern>
      {/* Both: diagonal hatch A/B */}
      <pattern id={`${prefix}-both`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <rect width="6" height="6" fill={BASE_FILL} />
        <rect width="3" height="6" fill={COLOR_A} opacity={opacityA} />
        <rect x="3" width="3" height="6" fill={COLOR_B} opacity={opacityB} />
      </pattern>
    </defs>
  );
}

function styleFor(o: Overlay, prefix: string, selected: boolean) {
  const fill = o.fill === "none" ? BASE_FILL : `url(#${prefix}-${o.fill})`;
  let stroke = "#0c1524", strokeWidth = 0.4, strokeDasharray: string | undefined;
  if (o.outline === "bucketBoth") { stroke = BUCKET_BOTH_STROKE; strokeWidth = 1; strokeDasharray = "2 1.5"; }
  else if (o.outline) { stroke = BUCKET_HOOK_STROKE; strokeWidth = 1.2; }
  if (selected) { stroke = "#ffffff"; strokeWidth = 1.6; strokeDasharray = undefined; }
  return { fill, stroke, strokeWidth, strokeDasharray };
}

function describe(o: Overlay) {
  const s = (x: string) => (x === "visited" ? "visited" : x === "bucket" ? "bucket list" : "none");
  return `A ${s(o.a)}, B ${s(o.b)}`;
}

function CompareMapInner({ mode, overlayOf, opacityA, opacityB, selectedKey, onHover, onSelect, patternPrefix }: Props) {
  const [pos, setPos] = useState<{ coordinates: [number, number]; zoom: number }>({ coordinates: [0, 20], zoom: 1 });

  const handlers = (key: string) => ({
    onMouseEnter: (e: MouseEvent) => onHover({ key, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: MouseEvent) => onHover({ key, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => onHover(null),
    onFocus: (e: FocusEvent<SVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      onHover({ key, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    },
    onBlur: () => onHover(null),
    onClick: () => onSelect(key),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(key); } },
    tabIndex: 0,
    role: "button",
  });

  const geo = (g: RsmGeography, key: string, name: string) => {
    const o = overlayOf(key);
    const st = styleFor(o, patternPrefix, selectedKey === key);
    return (
      <Geography
        key={`${key}-${g.rsmKey}`}
        geography={g}
        {...handlers(key)}
        aria-label={`${name}: ${describe(o)}`}
        data-testid={`geo-${key}`}
        style={{
          default: { ...st, outline: "none" },
          hover: { ...st, stroke: "#ffffff", strokeWidth: 1, outline: "none", cursor: "pointer" },
          pressed: { ...st, outline: "none" },
        }}
      />
    );
  };

  const dot = (key: string, name: string, coords: [number, number]) => {
    const o = overlayOf(key);
    const r = 3.2 / Math.sqrt(pos.zoom);
    const aOn = o.fill === "a" || o.fill === "both";
    const bOn = o.fill === "b" || o.fill === "both";
    const ring = o.outline === "bucketBoth" ? BUCKET_BOTH_STROKE : o.outline ? BUCKET_HOOK_STROKE : selectedKey === key ? "#fff" : "#0c1524";
    return (
      <Marker key={key} coordinates={coords}>
        <g {...handlers(key)} aria-label={`${name}: ${describe(o)}`} data-testid={`marker-${key}`} style={{ cursor: "pointer", outline: "none" }}>
          <circle r={r * 1.9} fill="none" stroke={ring} strokeWidth={r * 0.45} strokeDasharray={o.outline === "bucketBoth" ? `${r * 0.6} ${r * 0.4}` : undefined} />
          {/* left half = A, right half = B (position encodes owner, grayscale-safe) */}
          <path d={`M0,${-r} A${r},${r} 0 0 0 0,${r} Z`} fill={aOn ? COLOR_A : BASE_FILL} fillOpacity={aOn ? opacityA : 1} />
          <path d={`M0,${-r} A${r},${r} 0 0 1 0,${r} Z`} fill={bOn ? COLOR_B : BASE_FILL} fillOpacity={bOn ? opacityB : 1} />
          <circle r={r} fill="none" stroke="#e2e8f0" strokeWidth={r * 0.18} />
          <line x1="0" x2="0" y1={-r} y2={r} stroke="#0c1524" strokeWidth={r * 0.15} />
        </g>
      </Marker>
    );
  };

  return (
    <div className="relative w-full h-full">
      <ComposableMap projectionConfig={{ scale: 150 }} style={{ width: "100%", height: "100%", background: OCEAN }}>
        <PatternDefs prefix={patternPrefix} opacityA={opacityA} opacityB={opacityB} />
        <ZoomableGroup center={pos.coordinates} zoom={pos.zoom} minZoom={1} maxZoom={12}
          onMoveEnd={(p: { coordinates: [number, number]; zoom: number }) => setPos(p)}>
          {mode === "world" ? (
            <>
              <Geographies geography={WORLD_URL}>
                {({ geographies }: { geographies: RsmGeography[] }) => geographies.map(g => {
                  const raw = String(g.id).padStart(3, "0");
                  if (WORLD_MODE_EXCLUDED_IDS.has(raw)) return null;
                  const id = worldCountryKey(raw);
                  if (!COUNTRY_DATA[id]) {
                    return <Geography key={g.rsmKey} geography={g} style={{ default: { fill: "#18222f", stroke: OCEAN, strokeWidth: 0.3, outline: "none" }, hover: { fill: "#18222f", outline: "none" }, pressed: { fill: "#18222f", outline: "none" } }} />;
                  }
                  return geo(g, destKey("country", id), COUNTRY_DATA[id].name);
                })}
              </Geographies>
              <Geographies geography={US_STATES_URL}>
                {({ geographies }: { geographies: RsmGeography[] }) => geographies.map(g => {
                  const f = fipsKey(g.id);
                  return geo(g, destKey("us_state", f), US_STATE_DATA[f]?.name ?? "U.S. state");
                })}
              </Geographies>
              <Geographies geography={CA_PROVINCES_URL}>
                {({ geographies }: { geographies: RsmGeography[] }) => geographies.map(g => {
                  const n = provinceName(g.properties as Record<string, unknown>);
                  return geo(g, destKey("ca_province", n), CA_PROVINCE_DATA[n]?.name ?? n);
                })}
              </Geographies>
              {MICROSTATE_MARKERS.map(m => dot(destKey("country", m.id), COUNTRY_DATA[m.id]?.name ?? m.id, m.coordinates))}
            </>
          ) : (
            <>
              <Geographies geography={WORLD_URL}>
                {({ geographies }: { geographies: RsmGeography[] }) => geographies.map(g => {
                  const raw = String(g.id).padStart(3, "0");
                  if (TCC_MODE_EXCLUDED_IDS.has(raw)) return null;
                  const entry = TCC_BY_GEO_ID.get(raw);
                  if (!entry) {
                    return <Geography key={g.rsmKey} geography={g} style={{ default: { fill: "#18222f", stroke: OCEAN, strokeWidth: 0.3, outline: "none" }, hover: { fill: "#18222f", outline: "none" }, pressed: { fill: "#18222f", outline: "none" } }} />;
                  }
                  return geo(g, destKey("tcc", entry.name), entry.name);
                })}
              </Geographies>
              <Geographies geography={US_STATES_URL}>
                {({ geographies }: { geographies: RsmGeography[] }) => geographies.map(g => {
                  const name = tccNameForFips(fipsKey(g.id));
                  if (!TCC_BY_NAME.has(name)) return null;
                  return geo(g, destKey("tcc", name), name);
                })}
              </Geographies>
              {TCC_DATA.filter(t => t.lng !== undefined && t.lat !== undefined && !TCC_US_STATE_ENTRIES.has(t.name))
                .map(t => dot(destKey("tcc", t.name), t.name, [t.lng!, t.lat!]))}
            </>
          )}
        </ZoomableGroup>
      </ComposableMap>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1" data-html2image-ignore>
        {[
          { label: "Zoom in", icon: <Plus className="w-4 h-4" />, fn: () => setPos(p => ({ ...p, zoom: Math.min(12, p.zoom * 1.6) })), id: "zoom-in" },
          { label: "Zoom out", icon: <Minus className="w-4 h-4" />, fn: () => setPos(p => ({ ...p, zoom: Math.max(1, p.zoom / 1.6) })), id: "zoom-out" },
          { label: "Reset view", icon: <RotateCcw className="w-4 h-4" />, fn: () => setPos({ coordinates: [0, 20], zoom: 1 }), id: "zoom-reset" },
        ].map(b => (
          <button key={b.id} type="button" onClick={b.fn} aria-label={b.label} data-testid={`button-${b.id}`}
            className="w-8 h-8 rounded-md bg-slate-900/85 border border-slate-700 text-slate-200 hover:bg-slate-800 flex items-center justify-center">
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(CompareMapInner);

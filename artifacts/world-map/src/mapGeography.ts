// Shared, read-only map geometry constants used by the main map (App.tsx)
// and the Compare view. Data tables live in countryData.ts / tccData.ts.

export const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
export const US_STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
export const CA_PROVINCES_URL = `${import.meta.env.BASE_URL}canada-provinces.geojson`;

// TCC entries rendered via the US States geo-layer instead of world polygons or marker dots.
export const TCC_US_STATE_ENTRIES = new Set([
  "United States (Contiguous)",
  "Alaska",
  "Hawaiian Islands",
]);

// FIPS -> TCC entry name for the state-level TCC layer (all others: Contiguous)
export const FIPS_TO_TCC_NAME: Record<string, string> = {
  "02": "Alaska",
  "15": "Hawaiian Islands",
};

// Countries too small to appear as polygons even at 50m resolution
export const MICROSTATE_MARKERS: { id: string; coordinates: [number, number] }[] = [
  { id: "336", coordinates: [12.4534, 41.9022] }, // Vatican City
  { id: "492", coordinates: [7.4333, 43.7333] }, // Monaco
  { id: "674", coordinates: [12.45, 43.9333] }, // San Marino
  { id: "438", coordinates: [9.5333, 47.1667] }, // Liechtenstein
  { id: "520", coordinates: [166.9315, -0.5228] }, // Nauru
  { id: "798", coordinates: [179.15, -8.5167] }, // Tuvalu
  { id: "462", coordinates: [73.2207, 3.2028] }, // Maldives
];

/** World-atlas ids drawn by the dedicated US-states / Canada-provinces layers in World mode. */
export const WORLD_MODE_EXCLUDED_IDS = new Set(["840", "124"]);
/** World-atlas ids excluded from the TCC polygon pass (US handled by the state layer). */
export const TCC_MODE_EXCLUDED_IDS = new Set(["840"]);

/** Normalise a world-atlas country id to the COUNTRY_DATA key (Greenland -> Denmark). */
export function worldCountryKey(geoId: string | number): string {
  const id = String(geoId).padStart(3, "0");
  return id === "304" ? "208" : id;
}

export function fipsKey(geoId: string | number): string {
  return String(geoId).padStart(2, "0");
}

export function tccNameForFips(fips: string): string {
  return FIPS_TO_TCC_NAME[fips] ?? "United States (Contiguous)";
}

export function provinceName(props: Record<string, unknown> | undefined): string {
  const p = props ?? {};
  return String(p.name || p.NAME_1 || p.NAME || "");
}

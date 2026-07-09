import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { AuthProps } from "./SyncGate";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import {
  TCC_DATA,
  TCC_REGIONS,
  TCC_BY_NAME,
  TCC_BY_GEO_ID,
  TCC_TOTAL,
  TCC_MEMBERSHIP_THRESHOLD,
  type TccEntry,
  type TccRegionKey,
} from "./tccData";
import { US_NATIONAL_PARKS, NP_TOTAL, type NationalParkInfo } from "./nationalParksData";

type MapMode = "world" | "tcc";

function useLocalStorageSet(key: string): [Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>] {
  const [value, setValue] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...value]));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

interface VisitDetails {
  timesVisited?: number;
  firstYear?: number;
  lastYear?: number;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS: number[] = Array.from({ length: CURRENT_YEAR - 1950 + 1 }, (_, i) => CURRENT_YEAR - i);

interface YearFilterState {
  enabled: boolean;
  mode: "range" | "snapshot";
  min: number;
  max: number;
  snapshot: number;
}

function detailYearRange(d: VisitDetails | undefined): { min?: number; max?: number } {
  if (!d) return {};
  const f = d.firstYear, l = d.lastYear;
  if (f && l) return { min: Math.min(f, l), max: Math.max(f, l) };
  if (f) return { min: f, max: f };
  if (l) return { min: l, max: l };
  return {};
}

function detailMatchesFilter(d: VisitDetails | undefined, f: YearFilterState): boolean {
  if (!f.enabled) return true;
  const { min, max } = detailYearRange(d);
  if (min === undefined || max === undefined) return true;
  if (f.mode === "snapshot") return min <= f.snapshot;
  return max >= f.min && min <= f.max;
}

function useLocalStorageRecord(key: string): [Record<string, VisitDetails>, (id: string, details: VisitDetails | null) => void] {
  const [value, setValue] = useState<Record<string, VisitDetails>>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as Record<string, VisitDetails>) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  const setEntry = useCallback((id: string, details: VisitDetails | null) => {
    setValue(prev => {
      const next = { ...prev };
      if (details === null) delete next[id];
      else next[id] = { ...prev[id], ...details };
      return next;
    });
  }, []);
  return [value, setEntry];
}

interface StadiumInfo {
  team: string;
  stadium: string;
  division: string;
  capacity: string;
  city: string;
  coordinates: [number, number];
}

const MLB_STADIUMS: StadiumInfo[] = [
  // AL East
  { team: "Baltimore Orioles", stadium: "Oriole Park at Camden Yards", division: "AL East", capacity: "45,971", city: "Baltimore, MD", coordinates: [-76.6217, 39.2838] },
  { team: "Boston Red Sox", stadium: "Fenway Park", division: "AL East", capacity: "37,755", city: "Boston, MA", coordinates: [-71.0972, 42.3467] },
  { team: "New York Yankees", stadium: "Yankee Stadium", division: "AL East", capacity: "46,537", city: "Bronx, NY", coordinates: [-73.9262, 40.8296] },
  { team: "Tampa Bay Rays", stadium: "Tropicana Field", division: "AL East", capacity: "25,025", city: "St. Petersburg, FL", coordinates: [-82.6534, 27.7682] },
  { team: "Toronto Blue Jays", stadium: "Rogers Centre", division: "AL East", capacity: "49,282", city: "Toronto, ON", coordinates: [-79.3894, 43.6414] },
  // AL Central
  { team: "Chicago White Sox", stadium: "Guaranteed Rate Field", division: "AL Central", capacity: "40,615", city: "Chicago, IL", coordinates: [-87.6339, 41.8300] },
  { team: "Cleveland Guardians", stadium: "Progressive Field", division: "AL Central", capacity: "34,830", city: "Cleveland, OH", coordinates: [-81.6852, 41.4962] },
  { team: "Detroit Tigers", stadium: "Comerica Park", division: "AL Central", capacity: "41,297", city: "Detroit, MI", coordinates: [-83.0485, 42.3390] },
  { team: "Kansas City Royals", stadium: "Kauffman Stadium", division: "AL Central", capacity: "37,903", city: "Kansas City, MO", coordinates: [-94.4803, 39.0518] },
  { team: "Minnesota Twins", stadium: "Target Field", division: "AL Central", capacity: "38,544", city: "Minneapolis, MN", coordinates: [-93.2781, 44.9817] },
  // AL West
  { team: "Houston Astros", stadium: "Minute Maid Park", division: "AL West", capacity: "41,168", city: "Houston, TX", coordinates: [-95.3555, 29.7573] },
  { team: "Los Angeles Angels", stadium: "Angel Stadium", division: "AL West", capacity: "45,517", city: "Anaheim, CA", coordinates: [-117.8827, 33.8003] },
  { team: "Oakland Athletics", stadium: "Sutter Health Park", division: "AL West", capacity: "14,014", city: "Sacramento, CA", coordinates: [-121.5083, 38.5733] },
  { team: "Seattle Mariners", stadium: "T-Mobile Park", division: "AL West", capacity: "47,943", city: "Seattle, WA", coordinates: [-122.3325, 47.5914] },
  { team: "Texas Rangers", stadium: "Globe Life Field", division: "AL West", capacity: "40,000", city: "Arlington, TX", coordinates: [-97.0845, 32.7473] },
  // NL East
  { team: "Atlanta Braves", stadium: "Truist Park", division: "NL East", capacity: "41,084", city: "Cumberland, GA", coordinates: [-84.4678, 33.8908] },
  { team: "Miami Marlins", stadium: "loanDepot park", division: "NL East", capacity: "36,742", city: "Miami, FL", coordinates: [-80.2197, 25.7781] },
  { team: "New York Mets", stadium: "Citi Field", division: "NL East", capacity: "41,922", city: "Queens, NY", coordinates: [-73.8458, 40.7571] },
  { team: "Philadelphia Phillies", stadium: "Citizens Bank Park", division: "NL East", capacity: "42,792", city: "Philadelphia, PA", coordinates: [-75.1665, 39.9061] },
  { team: "Washington Nationals", stadium: "Nationals Park", division: "NL East", capacity: "41,339", city: "Washington, DC", coordinates: [-77.0075, 38.8731] },
  // NL Central
  { team: "Chicago Cubs", stadium: "Wrigley Field", division: "NL Central", capacity: "41,649", city: "Chicago, IL", coordinates: [-87.6553, 41.9484] },
  { team: "Cincinnati Reds", stadium: "Great American Ball Park", division: "NL Central", capacity: "42,319", city: "Cincinnati, OH", coordinates: [-84.5066, 39.0975] },
  { team: "Milwaukee Brewers", stadium: "American Family Field", division: "NL Central", capacity: "41,900", city: "Milwaukee, WI", coordinates: [-87.9712, 43.0280] },
  { team: "Pittsburgh Pirates", stadium: "PNC Park", division: "NL Central", capacity: "38,362", city: "Pittsburgh, PA", coordinates: [-80.0057, 40.4469] },
  { team: "St. Louis Cardinals", stadium: "Busch Stadium", division: "NL Central", capacity: "44,383", city: "St. Louis, MO", coordinates: [-90.1928, 38.6226] },
  // NL West
  { team: "Arizona Diamondbacks", stadium: "Chase Field", division: "NL West", capacity: "48,686", city: "Phoenix, AZ", coordinates: [-112.0667, 33.4453] },
  { team: "Colorado Rockies", stadium: "Coors Field", division: "NL West", capacity: "50,144", city: "Denver, CO", coordinates: [-104.9942, 39.7559] },
  { team: "Los Angeles Dodgers", stadium: "Dodger Stadium", division: "NL West", capacity: "56,000", city: "Los Angeles, CA", coordinates: [-118.2400, 34.0739] },
  { team: "San Diego Padres", stadium: "Petco Park", division: "NL West", capacity: "42,524", city: "San Diego, CA", coordinates: [-117.1570, 32.7076] },
  { team: "San Francisco Giants", stadium: "Oracle Park", division: "NL West", capacity: "41,915", city: "San Francisco, CA", coordinates: [-122.3893, 37.7786] },
];

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

// TCC entries rendered via the US States geo-layer instead of world polygons or marker dots.
// These three must be excluded from the world-polygon pass (to avoid the full-USA multi-polygon
// swallowing Alaska & Hawaii) and from the marker-dot pass (the state shapes replace them).
const TCC_US_STATE_ENTRIES = new Set([
  "United States (Contiguous)",
  "Alaska",
  "Hawaiian Islands",
]);
// FIPS → TCC entry name for the state-level TCC layer
const FIPS_TO_TCC_NAME: Record<string, string> = {
  "02": "Alaska",
  "15": "Hawaiian Islands",
};
const US_STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const CA_PROVINCES_URL = `${import.meta.env.BASE_URL}canada-provinces.geojson`;

// Countries too small to appear as polygons even at 50m resolution — rendered as dot markers
const MICROSTATE_MARKERS: { id: string; coordinates: [number, number] }[] = [
  { id: "336", coordinates: [12.4534,  41.9022] }, // Vatican City
  { id: "492", coordinates: [7.4333,   43.7333] }, // Monaco
  { id: "674", coordinates: [12.4500,  43.9333] }, // San Marino
  { id: "438", coordinates: [9.5333,   47.1667] }, // Liechtenstein
  { id: "520", coordinates: [166.9315, -0.5228] }, // Nauru
  { id: "798", coordinates: [179.1500, -8.5167] }, // Tuvalu
  { id: "462", coordinates: [73.2207,  3.2028]  }, // Maldives
];

interface RegionInfo {
  name: string;
  regionType: "country" | "us-state" | "ca-province";
  capital: string;
  population: string;
  area: string;
  currency?: string;
  language?: string;
  continent?: string;
  joined?: string;
  nickname?: string;
  flag?: string;
}

type RegionRecord = Record<string, RegionInfo>;

const COUNTRY_DATA: RegionRecord = {
  "004": { name: "Afghanistan", regionType: "country", capital: "Kabul", population: "40.1M", area: "652,864 km²", continent: "Asia", currency: "Afghan Afghani", language: "Dari, Pashto" },
  "008": { name: "Albania", regionType: "country", capital: "Tirana", population: "2.8M", area: "28,748 km²", continent: "Europe", currency: "Albanian Lek", language: "Albanian" },
  "012": { name: "Algeria", regionType: "country", capital: "Algiers", population: "44.6M", area: "2,381,741 km²", continent: "Africa", currency: "Algerian Dinar", language: "Arabic, Tamazight" },
  "024": { name: "Angola", regionType: "country", capital: "Luanda", population: "34.5M", area: "1,246,700 km²", continent: "Africa", currency: "Kwanza", language: "Portuguese" },
  "032": { name: "Argentina", regionType: "country", capital: "Buenos Aires", population: "45.8M", area: "2,780,400 km²", continent: "South America", currency: "Argentine Peso", language: "Spanish" },
  "036": { name: "Australia", regionType: "country", capital: "Canberra", population: "26.1M", area: "7,692,024 km²", continent: "Oceania", currency: "Australian Dollar", language: "English" },
  "040": { name: "Austria", regionType: "country", capital: "Vienna", population: "9.1M", area: "83,871 km²", continent: "Europe", currency: "Euro", language: "German" },
  "050": { name: "Bangladesh", regionType: "country", capital: "Dhaka", population: "168.1M", area: "147,570 km²", continent: "Asia", currency: "Bangladeshi Taka", language: "Bengali" },
  "056": { name: "Belgium", regionType: "country", capital: "Brussels", population: "11.6M", area: "30,528 km²", continent: "Europe", currency: "Euro", language: "Dutch, French, German" },
  "064": { name: "Bhutan", regionType: "country", capital: "Thimphu", population: "0.8M", area: "38,394 km²", continent: "Asia", currency: "Bhutanese Ngultrum", language: "Dzongkha" },
  "068": { name: "Bolivia", regionType: "country", capital: "Sucre", population: "12.1M", area: "1,098,581 km²", continent: "South America", currency: "Bolivian Boliviano", language: "Spanish" },
  "076": { name: "Brazil", regionType: "country", capital: "Brasília", population: "215.3M", area: "8,515,767 km²", continent: "South America", currency: "Brazilian Real", language: "Portuguese" },
  "100": { name: "Bulgaria", regionType: "country", capital: "Sofia", population: "6.5M", area: "110,879 km²", continent: "Europe", currency: "Bulgarian Lev", language: "Bulgarian" },
  "116": { name: "Cambodia", regionType: "country", capital: "Phnom Penh", population: "16.7M", area: "181,035 km²", continent: "Asia", currency: "Cambodian Riel", language: "Khmer" },
  "120": { name: "Cameroon", regionType: "country", capital: "Yaoundé", population: "27.2M", area: "475,442 km²", continent: "Africa", currency: "Central African CFA Franc", language: "French, English" },
  "152": { name: "Chile", regionType: "country", capital: "Santiago", population: "19.5M", area: "756,102 km²", continent: "South America", currency: "Chilean Peso", language: "Spanish" },
  "156": { name: "China", regionType: "country", capital: "Beijing", population: "1.4B", area: "9,596,960 km²", continent: "Asia", currency: "Chinese Yuan", language: "Mandarin Chinese" },
  "170": { name: "Colombia", regionType: "country", capital: "Bogotá", population: "51.9M", area: "1,141,748 km²", continent: "South America", currency: "Colombian Peso", language: "Spanish" },
  "178": { name: "Republic of the Congo", regionType: "country", capital: "Brazzaville", population: "5.8M", area: "342,000 km²", continent: "Africa", currency: "Central African CFA Franc", language: "French" },
  "180": { name: "DR Congo", regionType: "country", capital: "Kinshasa", population: "99.0M", area: "2,344,858 km²", continent: "Africa", currency: "Congolese Franc", language: "French" },
  "188": { name: "Costa Rica", regionType: "country", capital: "San José", population: "5.2M", area: "51,100 km²", continent: "North America", currency: "Costa Rican Colón", language: "Spanish" },
  "191": { name: "Croatia", regionType: "country", capital: "Zagreb", population: "3.9M", area: "56,594 km²", continent: "Europe", currency: "Euro", language: "Croatian" },
  "203": { name: "Czech Republic", regionType: "country", capital: "Prague", population: "10.9M", area: "78,866 km²", continent: "Europe", currency: "Czech Koruna", language: "Czech" },
  "208": { name: "Denmark", regionType: "country", capital: "Copenhagen", population: "5.9M", area: "43,094 km²", continent: "Europe", currency: "Danish Krone", language: "Danish" },
  "214": { name: "Dominican Republic", regionType: "country", capital: "Santo Domingo", population: "11.1M", area: "48,671 km²", continent: "North America", currency: "Dominican Peso", language: "Spanish" },
  "218": { name: "Ecuador", regionType: "country", capital: "Quito", population: "18.0M", area: "283,561 km²", continent: "South America", currency: "US Dollar", language: "Spanish" },
  "818": { name: "Egypt", regionType: "country", capital: "Cairo", population: "102.3M", area: "1,002,450 km²", continent: "Africa", currency: "Egyptian Pound", language: "Arabic" },
  "231": { name: "Ethiopia", regionType: "country", capital: "Addis Ababa", population: "120.8M", area: "1,104,300 km²", continent: "Africa", currency: "Ethiopian Birr", language: "Amharic" },
  "246": { name: "Finland", regionType: "country", capital: "Helsinki", population: "5.5M", area: "338,435 km²", continent: "Europe", currency: "Euro", language: "Finnish, Swedish" },
  "250": { name: "France", regionType: "country", capital: "Paris", population: "67.8M", area: "551,695 km²", continent: "Europe", currency: "Euro", language: "French" },
  "276": { name: "Germany", regionType: "country", capital: "Berlin", population: "83.8M", area: "357,114 km²", continent: "Europe", currency: "Euro", language: "German" },
  "288": { name: "Ghana", regionType: "country", capital: "Accra", population: "32.8M", area: "238,533 km²", continent: "Africa", currency: "Ghanaian Cedi", language: "English" },
  "300": { name: "Greece", regionType: "country", capital: "Athens", population: "10.4M", area: "131,957 km²", continent: "Europe", currency: "Euro", language: "Greek" },
  "304": { name: "Greenland", regionType: "country", capital: "Nuuk", population: "0.06M", area: "2,166,086 km²", continent: "North America", currency: "Danish Krone", language: "Greenlandic, Danish" },
  "320": { name: "Guatemala", regionType: "country", capital: "Guatemala City", population: "17.8M", area: "108,889 km²", continent: "North America", currency: "Guatemalan Quetzal", language: "Spanish" },
  "348": { name: "Hungary", regionType: "country", capital: "Budapest", population: "9.7M", area: "93,028 km²", continent: "Europe", currency: "Hungarian Forint", language: "Hungarian" },
  "356": { name: "India", regionType: "country", capital: "New Delhi", population: "1.4B", area: "3,287,263 km²", continent: "Asia", currency: "Indian Rupee", language: "Hindi, English" },
  "360": { name: "Indonesia", regionType: "country", capital: "Jakarta", population: "273.8M", area: "1,904,569 km²", continent: "Asia", currency: "Indonesian Rupiah", language: "Indonesian" },
  "364": { name: "Iran", regionType: "country", capital: "Tehran", population: "85.9M", area: "1,648,195 km²", continent: "Asia", currency: "Iranian Rial", language: "Persian" },
  "368": { name: "Iraq", regionType: "country", capital: "Baghdad", population: "42.2M", area: "438,317 km²", continent: "Asia", currency: "Iraqi Dinar", language: "Arabic, Kurdish" },
  "372": { name: "Ireland", regionType: "country", capital: "Dublin", population: "5.1M", area: "70,273 km²", continent: "Europe", currency: "Euro", language: "English, Irish" },
  "376": { name: "Israel", regionType: "country", capital: "Jerusalem", population: "9.5M", area: "20,770 km²", continent: "Asia", currency: "Israeli New Shekel", language: "Hebrew, Arabic" },
  "380": { name: "Italy", regionType: "country", capital: "Rome", population: "60.0M", area: "301,340 km²", continent: "Europe", currency: "Euro", language: "Italian" },
  "392": { name: "Japan", regionType: "country", capital: "Tokyo", population: "125.7M", area: "377,975 km²", continent: "Asia", currency: "Japanese Yen", language: "Japanese" },
  "400": { name: "Jordan", regionType: "country", capital: "Amman", population: "10.3M", area: "89,342 km²", continent: "Asia", currency: "Jordanian Dinar", language: "Arabic" },
  "398": { name: "Kazakhstan", regionType: "country", capital: "Astana", population: "19.2M", area: "2,724,900 km²", continent: "Asia", currency: "Kazakhstani Tenge", language: "Kazakh, Russian" },
  "404": { name: "Kenya", regionType: "country", capital: "Nairobi", population: "54.0M", area: "580,367 km²", continent: "Africa", currency: "Kenyan Shilling", language: "Swahili, English" },
  "408": { name: "North Korea", regionType: "country", capital: "Pyongyang", population: "25.9M", area: "120,538 km²", continent: "Asia", currency: "North Korean Won", language: "Korean" },
  "410": { name: "South Korea", regionType: "country", capital: "Seoul", population: "51.7M", area: "100,210 km²", continent: "Asia", currency: "South Korean Won", language: "Korean" },
  "418": { name: "Laos", regionType: "country", capital: "Vientiane", population: "7.4M", area: "236,800 km²", continent: "Asia", currency: "Lao Kip", language: "Lao" },
  "434": { name: "Libya", regionType: "country", capital: "Tripoli", population: "7.0M", area: "1,759,541 km²", continent: "Africa", currency: "Libyan Dinar", language: "Arabic" },
  "484": { name: "Mexico", regionType: "country", capital: "Mexico City", population: "130.3M", area: "1,964,375 km²", continent: "North America", currency: "Mexican Peso", language: "Spanish" },
  "496": { name: "Mongolia", regionType: "country", capital: "Ulaanbaatar", population: "3.4M", area: "1,564,116 km²", continent: "Asia", currency: "Mongolian Tögrög", language: "Mongolian" },
  "504": { name: "Morocco", regionType: "country", capital: "Rabat", population: "37.5M", area: "446,550 km²", continent: "Africa", currency: "Moroccan Dirham", language: "Arabic, Tamazight" },
  "508": { name: "Mozambique", regionType: "country", capital: "Maputo", population: "32.8M", area: "801,590 km²", continent: "Africa", currency: "Mozambican Metical", language: "Portuguese" },
  "524": { name: "Nepal", regionType: "country", capital: "Kathmandu", population: "29.7M", area: "147,181 km²", continent: "Asia", currency: "Nepalese Rupee", language: "Nepali" },
  "528": { name: "Netherlands", regionType: "country", capital: "Amsterdam", population: "17.7M", area: "41,543 km²", continent: "Europe", currency: "Euro", language: "Dutch" },
  "554": { name: "New Zealand", regionType: "country", capital: "Wellington", population: "5.1M", area: "270,467 km²", continent: "Oceania", currency: "New Zealand Dollar", language: "English, Māori" },
  "562": { name: "Niger", regionType: "country", capital: "Niamey", population: "25.2M", area: "1,267,000 km²", continent: "Africa", currency: "West African CFA Franc", language: "French" },
  "566": { name: "Nigeria", regionType: "country", capital: "Abuja", population: "218.5M", area: "923,768 km²", continent: "Africa", currency: "Nigerian Naira", language: "English" },
  "578": { name: "Norway", regionType: "country", capital: "Oslo", population: "5.4M", area: "385,207 km²", continent: "Europe", currency: "Norwegian Krone", language: "Norwegian" },
  "586": { name: "Pakistan", regionType: "country", capital: "Islamabad", population: "231.4M", area: "881,913 km²", continent: "Asia", currency: "Pakistani Rupee", language: "Urdu, English" },
  "600": { name: "Paraguay", regionType: "country", capital: "Asunción", population: "7.4M", area: "406,752 km²", continent: "South America", currency: "Paraguayan Guaraní", language: "Spanish, Guaraní" },
  "604": { name: "Peru", regionType: "country", capital: "Lima", population: "33.4M", area: "1,285,216 km²", continent: "South America", currency: "Peruvian Sol", language: "Spanish" },
  "608": { name: "Philippines", regionType: "country", capital: "Manila", population: "114.1M", area: "300,000 km²", continent: "Asia", currency: "Philippine Peso", language: "Filipino, English" },
  "616": { name: "Poland", regionType: "country", capital: "Warsaw", population: "37.8M", area: "312,696 km²", continent: "Europe", currency: "Polish Złoty", language: "Polish" },
  "620": { name: "Portugal", regionType: "country", capital: "Lisbon", population: "10.3M", area: "92,212 km²", continent: "Europe", currency: "Euro", language: "Portuguese" },
  "642": { name: "Romania", regionType: "country", capital: "Bucharest", population: "19.0M", area: "238,397 km²", continent: "Europe", currency: "Romanian Leu", language: "Romanian" },
  "643": { name: "Russia", regionType: "country", capital: "Moscow", population: "145.5M", area: "17,098,242 km²", continent: "Europe/Asia", currency: "Russian Ruble", language: "Russian" },
  "682": { name: "Saudi Arabia", regionType: "country", capital: "Riyadh", population: "35.6M", area: "2,149,690 km²", continent: "Asia", currency: "Saudi Riyal", language: "Arabic" },
  "686": { name: "Senegal", regionType: "country", capital: "Dakar", population: "17.8M", area: "196,722 km²", continent: "Africa", currency: "West African CFA Franc", language: "French" },
  "706": { name: "Somalia", regionType: "country", capital: "Mogadishu", population: "17.1M", area: "637,657 km²", continent: "Africa", currency: "Somali Shilling", language: "Somali, Arabic" },
  "710": { name: "South Africa", regionType: "country", capital: "Pretoria", population: "60.0M", area: "1,221,037 km²", continent: "Africa", currency: "South African Rand", language: "11 official languages" },
  "724": { name: "Spain", regionType: "country", capital: "Madrid", population: "47.4M", area: "505,990 km²", continent: "Europe", currency: "Euro", language: "Spanish" },
  "729": { name: "Sudan", regionType: "country", capital: "Khartoum", population: "44.9M", area: "1,861,484 km²", continent: "Africa", currency: "Sudanese Pound", language: "Arabic, English" },
  "752": { name: "Sweden", regionType: "country", capital: "Stockholm", population: "10.5M", area: "450,295 km²", continent: "Europe", currency: "Swedish Krona", language: "Swedish" },
  "756": { name: "Switzerland", regionType: "country", capital: "Bern", population: "8.7M", area: "41,285 km²", continent: "Europe", currency: "Swiss Franc", language: "German, French, Italian, Romansh" },
  "760": { name: "Syria", regionType: "country", capital: "Damascus", population: "21.3M", area: "185,180 km²", continent: "Asia", currency: "Syrian Pound", language: "Arabic" },
  "762": { name: "Tajikistan", regionType: "country", capital: "Dushanbe", population: "10.0M", area: "143,100 km²", continent: "Asia", currency: "Tajikistani Somoni", language: "Tajik" },
  "834": { name: "Tanzania", regionType: "country", capital: "Dodoma", population: "63.7M", area: "945,087 km²", continent: "Africa", currency: "Tanzanian Shilling", language: "Swahili, English" },
  "764": { name: "Thailand", regionType: "country", capital: "Bangkok", population: "71.6M", area: "513,120 km²", continent: "Asia", currency: "Thai Baht", language: "Thai" },
  "788": { name: "Tunisia", regionType: "country", capital: "Tunis", population: "12.1M", area: "163,610 km²", continent: "Africa", currency: "Tunisian Dinar", language: "Arabic" },
  "792": { name: "Turkey", regionType: "country", capital: "Ankara", population: "84.7M", area: "783,562 km²", continent: "Asia/Europe", currency: "Turkish Lira", language: "Turkish" },
  "800": { name: "Uganda", regionType: "country", capital: "Kampala", population: "47.1M", area: "241,550 km²", continent: "Africa", currency: "Ugandan Shilling", language: "English, Swahili" },
  "804": { name: "Ukraine", regionType: "country", capital: "Kyiv", population: "44.0M", area: "603,550 km²", continent: "Europe", currency: "Ukrainian Hryvnia", language: "Ukrainian" },
  "784": { name: "United Arab Emirates", regionType: "country", capital: "Abu Dhabi", population: "10.0M", area: "83,600 km²", continent: "Asia", currency: "UAE Dirham", language: "Arabic" },
  "826": { name: "United Kingdom", regionType: "country", capital: "London", population: "67.1M", area: "242,495 km²", continent: "Europe", currency: "British Pound", language: "English" },
  "858": { name: "Uruguay", regionType: "country", capital: "Montevideo", population: "3.5M", area: "176,215 km²", continent: "South America", currency: "Uruguayan Peso", language: "Spanish" },
  "860": { name: "Uzbekistan", regionType: "country", capital: "Tashkent", population: "35.3M", area: "448,978 km²", continent: "Asia", currency: "Uzbekistani Som", language: "Uzbek" },
  "862": { name: "Venezuela", regionType: "country", capital: "Caracas", population: "28.7M", area: "912,050 km²", continent: "South America", currency: "Venezuelan Bolívar", language: "Spanish" },
  "704": { name: "Vietnam", regionType: "country", capital: "Hanoi", population: "97.3M", area: "331,212 km²", continent: "Asia", currency: "Vietnamese Dong", language: "Vietnamese" },
  "887": { name: "Yemen", regionType: "country", capital: "Sana'a", population: "33.7M", area: "527,968 km²", continent: "Asia", currency: "Yemeni Rial", language: "Arabic" },
  "894": { name: "Zambia", regionType: "country", capital: "Lusaka", population: "19.5M", area: "752,618 km²", continent: "Africa", currency: "Zambian Kwacha", language: "Zambian Kwacha" },
  "716": { name: "Zimbabwe", regionType: "country", capital: "Harare", population: "15.1M", area: "390,757 km²", continent: "Africa", currency: "Zimbabwe Gold", language: "English and 15 others" },

  // Additional Africa
  "204": { name: "Benin", regionType: "country", capital: "Porto-Novo", population: "13.0M", area: "112,622 km²", continent: "Africa", currency: "West African CFA Franc", language: "French" },
  "854": { name: "Burkina Faso", regionType: "country", capital: "Ouagadougou", population: "22.1M", area: "274,222 km²", continent: "Africa", currency: "West African CFA Franc", language: "French" },
  "108": { name: "Burundi", regionType: "country", capital: "Gitega", population: "12.6M", area: "27,834 km²", continent: "Africa", currency: "Burundian Franc", language: "Kirundi, French" },
  "072": { name: "Botswana", regionType: "country", capital: "Gaborone", population: "2.6M", area: "581,730 km²", continent: "Africa", currency: "Botswana Pula", language: "Setswana, English" },
  "132": { name: "Cabo Verde", regionType: "country", capital: "Praia", population: "0.6M", area: "4,033 km²", continent: "Africa", currency: "Cape Verdean Escudo", language: "Portuguese" },
  "140": { name: "Central African Republic", regionType: "country", capital: "Bangui", population: "5.5M", area: "622,984 km²", continent: "Africa", currency: "Central African CFA Franc", language: "French, Sango" },
  "148": { name: "Chad", regionType: "country", capital: "N'Djamena", population: "17.4M", area: "1,284,000 km²", continent: "Africa", currency: "Central African CFA Franc", language: "French, Arabic" },
  "174": { name: "Comoros", regionType: "country", capital: "Moroni", population: "0.9M", area: "1,861 km²", continent: "Africa", currency: "Comorian Franc", language: "Comorian, Arabic, French" },
  "384": { name: "Côte d'Ivoire", regionType: "country", capital: "Yamoussoukro", population: "27.5M", area: "322,463 km²", continent: "Africa", currency: "West African CFA Franc", language: "French" },
  "262": { name: "Djibouti", regionType: "country", capital: "Djibouti City", population: "1.0M", area: "23,200 km²", continent: "Africa", currency: "Djiboutian Franc", language: "French, Arabic" },
  "226": { name: "Equatorial Guinea", regionType: "country", capital: "Malabo", population: "1.5M", area: "28,051 km²", continent: "Africa", currency: "Central African CFA Franc", language: "Spanish, French, Portuguese" },
  "232": { name: "Eritrea", regionType: "country", capital: "Asmara", population: "3.5M", area: "117,600 km²", continent: "Africa", currency: "Eritrean Nakfa", language: "Tigrinya, Arabic, English" },
  "748": { name: "Eswatini", regionType: "country", capital: "Mbabane", population: "1.2M", area: "17,364 km²", continent: "Africa", currency: "Swazi Lilangeni", language: "Swati, English" },
  "266": { name: "Gabon", regionType: "country", capital: "Libreville", population: "2.3M", area: "267,668 km²", continent: "Africa", currency: "Central African CFA Franc", language: "French" },
  "270": { name: "Gambia", regionType: "country", capital: "Banjul", population: "2.6M", area: "11,295 km²", continent: "Africa", currency: "Gambian Dalasi", language: "English" },
  "324": { name: "Guinea", regionType: "country", capital: "Conakry", population: "13.5M", area: "245,857 km²", continent: "Africa", currency: "Guinean Franc", language: "French" },
  "624": { name: "Guinea-Bissau", regionType: "country", capital: "Bissau", population: "2.1M", area: "36,125 km²", continent: "Africa", currency: "West African CFA Franc", language: "Portuguese" },
  "426": { name: "Lesotho", regionType: "country", capital: "Maseru", population: "2.3M", area: "30,355 km²", continent: "Africa", currency: "Lesotho Loti", language: "Sesotho, English" },
  "430": { name: "Liberia", regionType: "country", capital: "Monrovia", population: "5.3M", area: "111,369 km²", continent: "Africa", currency: "Liberian Dollar", language: "English" },
  "450": { name: "Madagascar", regionType: "country", capital: "Antananarivo", population: "28.9M", area: "587,041 km²", continent: "Africa", currency: "Malagasy Ariary", language: "Malagasy, French" },
  "454": { name: "Malawi", regionType: "country", capital: "Lilongwe", population: "20.4M", area: "118,484 km²", continent: "Africa", currency: "Malawian Kwacha", language: "Chichewa, English" },
  "466": { name: "Mali", regionType: "country", capital: "Bamako", population: "22.4M", area: "1,240,192 km²", continent: "Africa", currency: "West African CFA Franc", language: "French" },
  "478": { name: "Mauritania", regionType: "country", capital: "Nouakchott", population: "4.7M", area: "1,030,700 km²", continent: "Africa", currency: "Mauritanian Ouguiya", language: "Arabic" },
  "480": { name: "Mauritius", regionType: "country", capital: "Port Louis", population: "1.3M", area: "2,040 km²", continent: "Africa", currency: "Mauritian Rupee", language: "English, French, Creole" },
  "516": { name: "Namibia", regionType: "country", capital: "Windhoek", population: "2.6M", area: "824,292 km²", continent: "Africa", currency: "Namibian Dollar", language: "English" },
  "646": { name: "Rwanda", regionType: "country", capital: "Kigali", population: "13.8M", area: "26,338 km²", continent: "Africa", currency: "Rwandan Franc", language: "Kinyarwanda, French, English" },
  "678": { name: "São Tomé and Príncipe", regionType: "country", capital: "São Tomé", population: "0.2M", area: "964 km²", continent: "Africa", currency: "São Tomé dobra", language: "Portuguese" },
  "690": { name: "Seychelles", regionType: "country", capital: "Victoria", population: "0.1M", area: "459 km²", continent: "Africa", currency: "Seychellois Rupee", language: "Seychellois Creole, English, French" },
  "694": { name: "Sierra Leone", regionType: "country", capital: "Freetown", population: "8.4M", area: "71,740 km²", continent: "Africa", currency: "Sierra Leonean Leone", language: "English" },
  "728": { name: "South Sudan", regionType: "country", capital: "Juba", population: "11.0M", area: "619,745 km²", continent: "Africa", currency: "South Sudanese Pound", language: "English" },
  "768": { name: "Togo", regionType: "country", capital: "Lomé", population: "8.6M", area: "56,785 km²", continent: "Africa", currency: "West African CFA Franc", language: "French" },

  // Additional Asia
  "158": { name: "Taiwan", regionType: "country", capital: "Taipei", population: "23.6M", area: "36,193 km²", continent: "Asia", currency: "New Taiwan Dollar", language: "Mandarin Chinese" },
  "051": { name: "Armenia", regionType: "country", capital: "Yerevan", population: "2.9M", area: "29,743 km²", continent: "Asia", currency: "Armenian Dram", language: "Armenian" },
  "031": { name: "Azerbaijan", regionType: "country", capital: "Baku", population: "10.2M", area: "86,600 km²", continent: "Asia", currency: "Azerbaijani Manat", language: "Azerbaijani" },
  "048": { name: "Bahrain", regionType: "country", capital: "Manama", population: "1.5M", area: "765 km²", continent: "Asia", currency: "Bahraini Dinar", language: "Arabic" },
  "096": { name: "Brunei", regionType: "country", capital: "Bandar Seri Begawan", population: "0.4M", area: "5,765 km²", continent: "Asia", currency: "Brunei Dollar", language: "Malay, English" },
  "196": { name: "Cyprus", regionType: "country", capital: "Nicosia", population: "1.2M", area: "9,251 km²", continent: "Europe", currency: "Euro", language: "Greek, Turkish" },
  "268": { name: "Georgia", regionType: "country", capital: "Tbilisi", population: "3.7M", area: "69,700 km²", continent: "Asia", currency: "Georgian Lari", language: "Georgian" },
  "414": { name: "Kuwait", regionType: "country", capital: "Kuwait City", population: "4.3M", area: "17,818 km²", continent: "Asia", currency: "Kuwaiti Dinar", language: "Arabic" },
  "417": { name: "Kyrgyzstan", regionType: "country", capital: "Bishkek", population: "6.8M", area: "199,951 km²", continent: "Asia", currency: "Kyrgyzstani Som", language: "Kyrgyz, Russian" },
  "422": { name: "Lebanon", regionType: "country", capital: "Beirut", population: "5.5M", area: "10,452 km²", continent: "Asia", currency: "Lebanese Pound", language: "Arabic" },
  "458": { name: "Malaysia", regionType: "country", capital: "Kuala Lumpur", population: "33.6M", area: "329,847 km²", continent: "Asia", currency: "Malaysian Ringgit", language: "Malay" },
  "104": { name: "Myanmar", regionType: "country", capital: "Naypyidaw", population: "54.4M", area: "676,578 km²", continent: "Asia", currency: "Myanmar Kyat", language: "Burmese" },
  "512": { name: "Oman", regionType: "country", capital: "Muscat", population: "4.5M", area: "309,500 km²", continent: "Asia", currency: "Omani Rial", language: "Arabic" },
  "634": { name: "Qatar", regionType: "country", capital: "Doha", population: "2.9M", area: "11,586 km²", continent: "Asia", currency: "Qatari Riyal", language: "Arabic" },
  "702": { name: "Singapore", regionType: "country", capital: "Singapore", population: "5.9M", area: "719 km²", continent: "Asia", currency: "Singapore Dollar", language: "English, Malay, Mandarin, Tamil" },
  "144": { name: "Sri Lanka", regionType: "country", capital: "Sri Jayawardenepura Kotte", population: "22.2M", area: "65,610 km²", continent: "Asia", currency: "Sri Lankan Rupee", language: "Sinhala, Tamil" },
  "626": { name: "Timor-Leste", regionType: "country", capital: "Dili", population: "1.4M", area: "14,919 km²", continent: "Asia", currency: "US Dollar", language: "Tetum, Portuguese" },
  "795": { name: "Turkmenistan", regionType: "country", capital: "Ashgabat", population: "6.1M", area: "488,100 km²", continent: "Asia", currency: "Turkmenistani Manat", language: "Turkmen" },

  // Additional Europe
  "020": { name: "Andorra", regionType: "country", capital: "Andorra la Vella", population: "0.08M", area: "468 km²", continent: "Europe", currency: "Euro", language: "Catalan" },
  "112": { name: "Belarus", regionType: "country", capital: "Minsk", population: "9.4M", area: "207,600 km²", continent: "Europe", currency: "Belarusian Ruble", language: "Belarusian, Russian" },
  "070": { name: "Bosnia and Herzegovina", regionType: "country", capital: "Sarajevo", population: "3.2M", area: "51,209 km²", continent: "Europe", currency: "Bosnia-Herzegovina Convertible Mark", language: "Bosnian, Croatian, Serbian" },
  "233": { name: "Estonia", regionType: "country", capital: "Tallinn", population: "1.3M", area: "45,228 km²", continent: "Europe", currency: "Euro", language: "Estonian" },
  "352": { name: "Iceland", regionType: "country", capital: "Reykjavík", population: "0.4M", area: "103,000 km²", continent: "Europe", currency: "Icelandic Króna", language: "Icelandic" },
  "383": { name: "Kosovo", regionType: "country", capital: "Pristina", population: "1.8M", area: "10,908 km²", continent: "Europe", currency: "Euro", language: "Albanian, Serbian" },
  "428": { name: "Latvia", regionType: "country", capital: "Riga", population: "1.8M", area: "64,589 km²", continent: "Europe", currency: "Euro", language: "Latvian" },
  "438": { name: "Liechtenstein", regionType: "country", capital: "Vaduz", population: "0.04M", area: "160 km²", continent: "Europe", currency: "Swiss Franc", language: "German" },
  "440": { name: "Lithuania", regionType: "country", capital: "Vilnius", population: "2.8M", area: "65,300 km²", continent: "Europe", currency: "Euro", language: "Lithuanian" },
  "442": { name: "Luxembourg", regionType: "country", capital: "Luxembourg City", population: "0.7M", area: "2,586 km²", continent: "Europe", currency: "Euro", language: "Luxembourgish, French, German" },
  "470": { name: "Malta", regionType: "country", capital: "Valletta", population: "0.5M", area: "316 km²", continent: "Europe", currency: "Euro", language: "Maltese, English" },
  "498": { name: "Moldova", regionType: "country", capital: "Chișinău", population: "2.6M", area: "33,846 km²", continent: "Europe", currency: "Moldovan Leu", language: "Romanian" },
  "492": { name: "Monaco", regionType: "country", capital: "Monaco", population: "0.04M", area: "2 km²", continent: "Europe", currency: "Euro", language: "French" },
  "499": { name: "Montenegro", regionType: "country", capital: "Podgorica", population: "0.6M", area: "13,812 km²", continent: "Europe", currency: "Euro", language: "Montenegrin" },
  "807": { name: "North Macedonia", regionType: "country", capital: "Skopje", population: "2.1M", area: "25,713 km²", continent: "Europe", currency: "Macedonian Denar", language: "Macedonian" },
  "674": { name: "San Marino", regionType: "country", capital: "San Marino City", population: "0.03M", area: "61 km²", continent: "Europe", currency: "Euro", language: "Italian" },
  "336": { name: "Vatican City", regionType: "country", capital: "Vatican City", population: "0.0008M", area: "0.44 km²", continent: "Europe", currency: "Euro", language: "Italian, Latin" },
  "688": { name: "Serbia", regionType: "country", capital: "Belgrade", population: "6.8M", area: "77,474 km²", continent: "Europe", currency: "Serbian Dinar", language: "Serbian" },
  "703": { name: "Slovakia", regionType: "country", capital: "Bratislava", population: "5.5M", area: "49,035 km²", continent: "Europe", currency: "Euro", language: "Slovak" },
  "705": { name: "Slovenia", regionType: "country", capital: "Ljubljana", population: "2.1M", area: "20,273 km²", continent: "Europe", currency: "Euro", language: "Slovenian" },

  // Additional Americas
  "028": { name: "Antigua and Barbuda", regionType: "country", capital: "Saint John's", population: "0.1M", area: "443 km²", continent: "North America", currency: "East Caribbean Dollar", language: "English" },
  "044": { name: "Bahamas", regionType: "country", capital: "Nassau", population: "0.4M", area: "13,943 km²", continent: "North America", currency: "Bahamian Dollar", language: "English" },
  "052": { name: "Barbados", regionType: "country", capital: "Bridgetown", population: "0.3M", area: "430 km²", continent: "North America", currency: "Barbadian Dollar", language: "English" },
  "084": { name: "Belize", regionType: "country", capital: "Belmopan", population: "0.4M", area: "22,966 km²", continent: "North America", currency: "Belize Dollar", language: "English" },
  "192": { name: "Cuba", regionType: "country", capital: "Havana", population: "11.3M", area: "109,884 km²", continent: "North America", currency: "Cuban Peso", language: "Spanish" },
  "212": { name: "Dominica", regionType: "country", capital: "Roseau", population: "0.07M", area: "751 km²", continent: "North America", currency: "East Caribbean Dollar", language: "English" },
  "222": { name: "El Salvador", regionType: "country", capital: "San Salvador", population: "6.6M", area: "21,041 km²", continent: "North America", currency: "US Dollar", language: "Spanish" },
  "308": { name: "Grenada", regionType: "country", capital: "St. George's", population: "0.1M", area: "344 km²", continent: "North America", currency: "East Caribbean Dollar", language: "English" },
  "328": { name: "Guyana", regionType: "country", capital: "Georgetown", population: "0.8M", area: "214,969 km²", continent: "South America", currency: "Guyanese Dollar", language: "English" },
  "332": { name: "Haiti", regionType: "country", capital: "Port-au-Prince", population: "11.5M", area: "27,750 km²", continent: "North America", currency: "Haitian Gourde", language: "Haitian Creole, French" },
  "340": { name: "Honduras", regionType: "country", capital: "Tegucigalpa", population: "10.3M", area: "112,492 km²", continent: "North America", currency: "Honduran Lempira", language: "Spanish" },
  "388": { name: "Jamaica", regionType: "country", capital: "Kingston", population: "2.8M", area: "10,991 km²", continent: "North America", currency: "Jamaican Dollar", language: "English" },
  "558": { name: "Nicaragua", regionType: "country", capital: "Managua", population: "6.9M", area: "130,373 km²", continent: "North America", currency: "Nicaraguan Córdoba", language: "Spanish" },
  "591": { name: "Panama", regionType: "country", capital: "Panama City", population: "4.4M", area: "75,417 km²", continent: "North America", currency: "Panamanian Balboa", language: "Spanish" },
  "659": { name: "Saint Kitts and Nevis", regionType: "country", capital: "Basseterre", population: "0.05M", area: "261 km²", continent: "North America", currency: "East Caribbean Dollar", language: "English" },
  "662": { name: "Saint Lucia", regionType: "country", capital: "Castries", population: "0.18M", area: "616 km²", continent: "North America", currency: "East Caribbean Dollar", language: "English" },
  "670": { name: "Saint Vincent and the Grenadines", regionType: "country", capital: "Kingstown", population: "0.11M", area: "389 km²", continent: "North America", currency: "East Caribbean Dollar", language: "English" },
  "740": { name: "Suriname", regionType: "country", capital: "Paramaribo", population: "0.6M", area: "163,820 km²", continent: "South America", currency: "Surinamese Dollar", language: "Dutch" },
  "780": { name: "Trinidad and Tobago", regionType: "country", capital: "Port of Spain", population: "1.5M", area: "5,131 km²", continent: "North America", currency: "Trinidad and Tobago Dollar", language: "English" },

  // Additional Oceania
  "242": { name: "Fiji", regionType: "country", capital: "Suva", population: "0.9M", area: "18,272 km²", continent: "Oceania", currency: "Fijian Dollar", language: "English, Fijian, Hindi" },
  "296": { name: "Kiribati", regionType: "country", capital: "South Tarawa", population: "0.12M", area: "811 km²", continent: "Oceania", currency: "Australian Dollar", language: "English, Gilbertese" },
  "584": { name: "Marshall Islands", regionType: "country", capital: "Majuro", population: "0.04M", area: "181 km²", continent: "Oceania", currency: "US Dollar", language: "Marshallese, English" },
  "583": { name: "Micronesia", regionType: "country", capital: "Palikir", population: "0.1M", area: "702 km²", continent: "Oceania", currency: "US Dollar", language: "English" },
  "520": { name: "Nauru", regionType: "country", capital: "Yaren", population: "0.01M", area: "21 km²", continent: "Oceania", currency: "Australian Dollar", language: "Nauruan, English" },
  "585": { name: "Palau", regionType: "country", capital: "Ngerulmud", population: "0.02M", area: "459 km²", continent: "Oceania", currency: "US Dollar", language: "Palauan, English" },
  "598": { name: "Papua New Guinea", regionType: "country", capital: "Port Moresby", population: "10.3M", area: "462,840 km²", continent: "Oceania", currency: "Papua New Guinean Kina", language: "Tok Pisin, English, Hiri Motu" },
  "882": { name: "Samoa", regionType: "country", capital: "Apia", population: "0.2M", area: "2,842 km²", continent: "Oceania", currency: "Samoan Tālā", language: "Samoan, English" },
  "090": { name: "Solomon Islands", regionType: "country", capital: "Honiara", population: "0.7M", area: "28,896 km²", continent: "Oceania", currency: "Solomon Islands Dollar", language: "English" },
  "776": { name: "Tonga", regionType: "country", capital: "Nukuʻalofa", population: "0.1M", area: "747 km²", continent: "Oceania", currency: "Tongan Paʻanga", language: "Tongan, English" },
  "798": { name: "Tuvalu", regionType: "country", capital: "Funafuti", population: "0.01M", area: "26 km²", continent: "Oceania", currency: "Australian Dollar", language: "Tuvaluan, English" },
  "548": { name: "Vanuatu", regionType: "country", capital: "Port Vila", population: "0.3M", area: "12,189 km²", continent: "Oceania", currency: "Vanuatu Vatu", language: "Bislama, English, French" },

  "462": { name: "Maldives", regionType: "country", capital: "Malé", population: "0.5M", area: "298 km²", continent: "Asia", currency: "Maldivian Rufiyaa", language: "Dhivehi" },
  "275": { name: "Palestine", regionType: "country", capital: "Ramallah", population: "5.4M", area: "6,020 km²", continent: "Asia", currency: "Israeli New Shekel", language: "Arabic" },
};

// US States by FIPS code (zero-padded 2-digit string)
const US_STATE_DATA: RegionRecord = {
  "01": { name: "Alabama", regionType: "us-state", capital: "Montgomery", population: "5.1M", area: "135,767 km²", joined: "1819", nickname: "The Yellowhammer State" },
  "02": { name: "Alaska", regionType: "us-state", capital: "Juneau", population: "0.7M", area: "1,723,337 km²", joined: "1959", nickname: "The Last Frontier" },
  "04": { name: "Arizona", regionType: "us-state", capital: "Phoenix", population: "7.4M", area: "295,234 km²", joined: "1912", nickname: "The Grand Canyon State" },
  "05": { name: "Arkansas", regionType: "us-state", capital: "Little Rock", population: "3.0M", area: "137,732 km²", joined: "1836", nickname: "The Natural State" },
  "06": { name: "California", regionType: "us-state", capital: "Sacramento", population: "39.0M", area: "423,970 km²", joined: "1850", nickname: "The Golden State" },
  "08": { name: "Colorado", regionType: "us-state", capital: "Denver", population: "5.8M", area: "269,601 km²", joined: "1876", nickname: "The Centennial State" },
  "09": { name: "Connecticut", regionType: "us-state", capital: "Hartford", population: "3.6M", area: "14,357 km²", joined: "1788", nickname: "The Constitution State" },
  "10": { name: "Delaware", regionType: "us-state", capital: "Dover", population: "1.0M", area: "6,446 km²", joined: "1787", nickname: "The First State" },
  "11": { name: "District of Columbia", regionType: "us-state", capital: "Washington D.C.", population: "0.7M", area: "177 km²", joined: "1791", nickname: "The Nation's Capital" },
  "12": { name: "Florida", regionType: "us-state", capital: "Tallahassee", population: "22.6M", area: "170,312 km²", joined: "1845", nickname: "The Sunshine State" },
  "13": { name: "Georgia", regionType: "us-state", capital: "Atlanta", population: "10.9M", area: "153,910 km²", joined: "1788", nickname: "The Peach State" },
  "15": { name: "Hawaii", regionType: "us-state", capital: "Honolulu", population: "1.4M", area: "28,313 km²", joined: "1959", nickname: "The Aloha State" },
  "16": { name: "Idaho", regionType: "us-state", capital: "Boise", population: "1.9M", area: "216,443 km²", joined: "1890", nickname: "The Gem State" },
  "17": { name: "Illinois", regionType: "us-state", capital: "Springfield", population: "12.6M", area: "149,995 km²", joined: "1818", nickname: "The Prairie State" },
  "18": { name: "Indiana", regionType: "us-state", capital: "Indianapolis", population: "6.8M", area: "94,326 km²", joined: "1816", nickname: "The Hoosier State" },
  "19": { name: "Iowa", regionType: "us-state", capital: "Des Moines", population: "3.2M", area: "145,746 km²", joined: "1846", nickname: "The Hawkeye State" },
  "20": { name: "Kansas", regionType: "us-state", capital: "Topeka", population: "2.9M", area: "213,100 km²", joined: "1861", nickname: "The Sunflower State" },
  "21": { name: "Kentucky", regionType: "us-state", capital: "Frankfort", population: "4.5M", area: "104,656 km²", joined: "1792", nickname: "The Bluegrass State" },
  "22": { name: "Louisiana", regionType: "us-state", capital: "Baton Rouge", population: "4.6M", area: "135,659 km²", joined: "1812", nickname: "The Pelican State" },
  "23": { name: "Maine", regionType: "us-state", capital: "Augusta", population: "1.4M", area: "91,633 km²", joined: "1820", nickname: "The Pine Tree State" },
  "24": { name: "Maryland", regionType: "us-state", capital: "Annapolis", population: "6.2M", area: "32,133 km²", joined: "1788", nickname: "The Old Line State" },
  "25": { name: "Massachusetts", regionType: "us-state", capital: "Boston", population: "7.0M", area: "27,336 km²", joined: "1788", nickname: "The Bay State" },
  "26": { name: "Michigan", regionType: "us-state", capital: "Lansing", population: "10.0M", area: "250,487 km²", joined: "1837", nickname: "The Great Lakes State" },
  "27": { name: "Minnesota", regionType: "us-state", capital: "Saint Paul", population: "5.7M", area: "225,163 km²", joined: "1858", nickname: "The North Star State" },
  "28": { name: "Mississippi", regionType: "us-state", capital: "Jackson", population: "2.9M", area: "125,438 km²", joined: "1817", nickname: "The Magnolia State" },
  "29": { name: "Missouri", regionType: "us-state", capital: "Jefferson City", population: "6.2M", area: "180,540 km²", joined: "1821", nickname: "The Show-Me State" },
  "30": { name: "Montana", regionType: "us-state", capital: "Helena", population: "1.1M", area: "380,831 km²", joined: "1889", nickname: "Big Sky Country" },
  "31": { name: "Nebraska", regionType: "us-state", capital: "Lincoln", population: "1.9M", area: "200,330 km²", joined: "1867", nickname: "The Cornhusker State" },
  "32": { name: "Nevada", regionType: "us-state", capital: "Carson City", population: "3.1M", area: "286,352 km²", joined: "1864", nickname: "The Silver State" },
  "33": { name: "New Hampshire", regionType: "us-state", capital: "Concord", population: "1.4M", area: "24,214 km²", joined: "1788", nickname: "The Granite State" },
  "34": { name: "New Jersey", regionType: "us-state", capital: "Trenton", population: "9.3M", area: "22,591 km²", joined: "1787", nickname: "The Garden State" },
  "35": { name: "New Mexico", regionType: "us-state", capital: "Santa Fe", population: "2.1M", area: "314,917 km²", joined: "1912", nickname: "Land of Enchantment" },
  "36": { name: "New York", regionType: "us-state", capital: "Albany", population: "20.2M", area: "141,297 km²", joined: "1788", nickname: "The Empire State" },
  "37": { name: "North Carolina", regionType: "us-state", capital: "Raleigh", population: "10.7M", area: "139,391 km²", joined: "1789", nickname: "The Tar Heel State" },
  "38": { name: "North Dakota", regionType: "us-state", capital: "Bismarck", population: "0.8M", area: "183,108 km²", joined: "1889", nickname: "The Peace Garden State" },
  "39": { name: "Ohio", regionType: "us-state", capital: "Columbus", population: "11.8M", area: "116,098 km²", joined: "1803", nickname: "The Buckeye State" },
  "40": { name: "Oklahoma", regionType: "us-state", capital: "Oklahoma City", population: "4.0M", area: "181,037 km²", joined: "1907", nickname: "The Sooner State" },
  "41": { name: "Oregon", regionType: "us-state", capital: "Salem", population: "4.2M", area: "254,800 km²", joined: "1859", nickname: "The Beaver State" },
  "42": { name: "Pennsylvania", regionType: "us-state", capital: "Harrisburg", population: "13.0M", area: "119,279 km²", joined: "1787", nickname: "The Keystone State" },
  "44": { name: "Rhode Island", regionType: "us-state", capital: "Providence", population: "1.1M", area: "4,001 km²", joined: "1790", nickname: "The Ocean State" },
  "45": { name: "South Carolina", regionType: "us-state", capital: "Columbia", population: "5.3M", area: "82,933 km²", joined: "1788", nickname: "The Palmetto State" },
  "46": { name: "South Dakota", regionType: "us-state", capital: "Pierre", population: "0.9M", area: "199,729 km²", joined: "1889", nickname: "The Mount Rushmore State" },
  "47": { name: "Tennessee", regionType: "us-state", capital: "Nashville", population: "7.0M", area: "109,153 km²", joined: "1796", nickname: "The Volunteer State" },
  "48": { name: "Texas", regionType: "us-state", capital: "Austin", population: "30.0M", area: "695,662 km²", joined: "1845", nickname: "The Lone Star State" },
  "49": { name: "Utah", regionType: "us-state", capital: "Salt Lake City", population: "3.4M", area: "219,882 km²", joined: "1896", nickname: "The Beehive State" },
  "50": { name: "Vermont", regionType: "us-state", capital: "Montpelier", population: "0.6M", area: "24,906 km²", joined: "1791", nickname: "The Green Mountain State" },
  "51": { name: "Virginia", regionType: "us-state", capital: "Richmond", population: "8.7M", area: "110,787 km²", joined: "1788", nickname: "The Old Dominion" },
  "53": { name: "Washington", regionType: "us-state", capital: "Olympia", population: "7.8M", area: "184,661 km²", joined: "1889", nickname: "The Evergreen State" },
  "54": { name: "West Virginia", regionType: "us-state", capital: "Charleston", population: "1.8M", area: "62,756 km²", joined: "1863", nickname: "The Mountain State" },
  "55": { name: "Wisconsin", regionType: "us-state", capital: "Madison", population: "5.9M", area: "169,635 km²", joined: "1848", nickname: "The Badger State" },
  "56": { name: "Wyoming", regionType: "us-state", capital: "Cheyenne", population: "0.6M", area: "253,335 km²", joined: "1890", nickname: "The Equality State" },
};

// Canadian provinces/territories — keyed by name as it appears in the TopoJSON
const CA_PROVINCE_DATA: Record<string, RegionInfo> = {
  "Alberta": { name: "Alberta", regionType: "ca-province", capital: "Edmonton", population: "4.6M", area: "661,848 km²", joined: "1905", nickname: "Wild Rose Country" },
  "British Columbia": { name: "British Columbia", regionType: "ca-province", capital: "Victoria", population: "5.4M", area: "944,735 km²", joined: "1871", nickname: "Beautiful British Columbia" },
  "Manitoba": { name: "Manitoba", regionType: "ca-province", capital: "Winnipeg", population: "1.4M", area: "647,797 km²", joined: "1870", nickname: "The Keystone Province" },
  "New Brunswick": { name: "New Brunswick", regionType: "ca-province", capital: "Fredericton", population: "0.8M", area: "72,908 km²", joined: "1867", nickname: "The Picture Province" },
  "Newfoundland and Labrador": { name: "Newfoundland and Labrador", regionType: "ca-province", capital: "St. John's", population: "0.5M", area: "405,212 km²", joined: "1949", nickname: "The Rock" },
  "Northwest Territories": { name: "Northwest Territories", regionType: "ca-province", capital: "Yellowknife", population: "0.045M", area: "1,346,106 km²", joined: "1870", nickname: "Spectacular NWT" },
  "Nova Scotia": { name: "Nova Scotia", regionType: "ca-province", capital: "Halifax", population: "1.0M", area: "55,284 km²", joined: "1867", nickname: "Canada's Ocean Playground" },
  "Nunavut": { name: "Nunavut", regionType: "ca-province", capital: "Iqaluit", population: "0.04M", area: "2,093,190 km²", joined: "1999", nickname: "Our Land" },
  "Ontario": { name: "Ontario", regionType: "ca-province", capital: "Toronto", population: "14.9M", area: "1,076,395 km²", joined: "1867", nickname: "Yours to Discover" },
  "Prince Edward Island": { name: "Prince Edward Island", regionType: "ca-province", capital: "Charlottetown", population: "0.17M", area: "5,660 km²", joined: "1873", nickname: "The Garden Province" },
  "Quebec": { name: "Quebec", regionType: "ca-province", capital: "Quebec City", population: "8.8M", area: "1,542,056 km²", joined: "1867", nickname: "La Belle Province" },
  "Saskatchewan": { name: "Saskatchewan", regionType: "ca-province", capital: "Regina", population: "1.2M", area: "651,036 km²", joined: "1905", nickname: "The Land of Living Skies" },
  "Yukon Territory": { name: "Yukon Territory", regionType: "ca-province", capital: "Whitehorse", population: "0.04M", area: "482,443 km²", joined: "1898", nickname: "Canada's True North" },
};

const CONTINENT_COLORS: Record<string, string> = {
  "Africa": "#f59e0b",
  "Asia": "#10b981",
  "Europe": "#3b82f6",
  "North America": "#ef4444",
  "South America": "#8b5cf6",
  "Oceania": "#06b6d4",
  "Asia/Europe": "#6366f1",
  "Europe/Asia": "#6366f1",
};

const US_STATE_COLOR = "#ef4444";
const US_STATE_HOVER_COLOR = "#dc2626";
const CA_PROVINCE_COLOR = "#f97316";
const CA_PROVINCE_HOVER_COLOR = "#ea580c";
const SELECTED_COLOR = "#facc15";

const BUCKET_LIST_COLOR = "#a37c1a";
const BUCKET_LIST_HOVER_COLOR = "#c49a22";
const BUCKET_LIST_STROKE = "#fbbf24";

function getCountryFill(numericCode: string, isSelected: boolean, isHovered: boolean, isVisited: boolean, isBucketList: boolean) {
  if (isSelected) return SELECTED_COLOR;
  const data = COUNTRY_DATA[numericCode];
  if (data) {
    if (isVisited) {
      const base = CONTINENT_COLORS[data.continent ?? ""] ?? "#64748b";
      return isHovered ? base : base + "cc";
    }
    if (isBucketList) return isHovered ? BUCKET_LIST_HOVER_COLOR : BUCKET_LIST_COLOR;
    return isHovered ? "#3d4a5c" : "#253040";
  }
  return isHovered ? "#3d4a5c" : "#1e293b";
}

function getStateFill(isSelected: boolean, isHovered: boolean, isVisited: boolean, isBucketList: boolean) {
  if (isSelected) return SELECTED_COLOR;
  if (isVisited) return isHovered ? US_STATE_HOVER_COLOR : US_STATE_COLOR + "cc";
  if (isBucketList) return isHovered ? BUCKET_LIST_HOVER_COLOR : BUCKET_LIST_COLOR;
  return isHovered ? "#3d4a5c" : "#253040";
}

function getProvinceFill(isSelected: boolean, isHovered: boolean, isVisited: boolean, isBucketList: boolean) {
  if (isSelected) return SELECTED_COLOR;
  if (isVisited) return isHovered ? CA_PROVINCE_HOVER_COLOR : CA_PROVINCE_COLOR + "cc";
  if (isBucketList) return isHovered ? BUCKET_LIST_HOVER_COLOR : BUCKET_LIST_COLOR;
  return isHovered ? "#3d4a5c" : "#253040";
}

// ─── Photos ──────────────────────────────────────────────────────────────────

type PhotoCategory = "country" | "state" | "province" | "stadium" | "tcc" | "park";

interface VisitPhoto {
  id: string;
  base64: string;
  caption: string;
  uploadedAt: number;
}

const photoKey = (cat: PhotoCategory, id: string) => `photos:${cat}:${id}`;
const MAX_PHOTOS_PER_DEST = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const STORAGE_WARN_BYTES = 4 * 1024 * 1024; // ~4MB → near typical 5MB origin quota

function loadPhotos(cat: PhotoCategory, id: string): VisitPhoto[] {
  try {
    const raw = localStorage.getItem(photoKey(cat, id));
    return raw ? (JSON.parse(raw) as VisitPhoto[]) : [];
  } catch {
    return [];
  }
}

function savePhotos(cat: PhotoCategory, id: string, photos: VisitPhoto[]): { ok: boolean; warning?: string; error?: string } {
  try {
    if (photos.length === 0) localStorage.removeItem(photoKey(cat, id));
    else localStorage.setItem(photoKey(cat, id), JSON.stringify(photos));
  } catch {
    return { ok: false, error: "Storage is full — couldn't save photo. Try removing existing photos." };
  }
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) ?? "";
      total += k.length + v.length;
    }
  } catch { /* ignore */ }
  return { ok: true, warning: total > STORAGE_WARN_BYTES ? "Storage nearly full — consider removing some photos" : undefined };
}

async function resizeImageToBase64(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });
  const MAX = 1200;
  let w = img.width, h = img.height;
  if (w >= h && w > MAX) { h = Math.round((h * MAX) / w); w = MAX; }
  else if (h > w && h > MAX) { w = Math.round((w * MAX) / h); h = MAX; }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function usePhotos(category: PhotoCategory, locationId: string) {
  const [photos, setPhotos] = useState<VisitPhoto[]>(() => loadPhotos(category, locationId));
  useEffect(() => {
    setPhotos(loadPhotos(category, locationId));
  }, [category, locationId]);
  const update = useCallback((next: VisitPhoto[]): { ok: boolean; warning?: string; error?: string } => {
    const result = savePhotos(category, locationId, next);
    if (result.ok) setPhotos(next);
    return result;
  }, [category, locationId]);
  return { photos, update };
}

function PhotoLightbox({
  photos, index, onClose, onPrev, onNext, onCaptionChange, isReadOnly,
}: {
  photos: VisitPhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCaptionChange: (id: string, caption: string) => void;
  isReadOnly: boolean;
}) {
  const photo = photos[index];
  const [draftCaption, setDraftCaption] = useState(photo?.caption ?? "");
  const draftRef = useRef(draftCaption);
  draftRef.current = draftCaption;
  useEffect(() => { setDraftCaption(photo?.caption ?? ""); }, [photo?.id, photo?.caption]);
  const flushCaption = useCallback(() => {
    if (!photo) return;
    if (draftRef.current !== photo.caption) onCaptionChange(photo.id, draftRef.current);
  }, [photo, onCaptionChange]);
  const closeWithFlush = useCallback(() => { flushCaption(); onClose(); }, [flushCaption, onClose]);
  const prevWithFlush = useCallback(() => { flushCaption(); onPrev(); }, [flushCaption, onPrev]);
  const nextWithFlush = useCallback(() => { flushCaption(); onNext(); }, [flushCaption, onNext]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWithFlush();
      else if (e.key === "ArrowLeft" && photos.length > 1) prevWithFlush();
      else if (e.key === "ArrowRight" && photos.length > 1) nextWithFlush();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeWithFlush, prevWithFlush, nextWithFlush, photos.length]);
  if (!photo) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
         onClick={(e) => { if (e.target === e.currentTarget) closeWithFlush(); }}>
      <button
        onClick={closeWithFlush}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white text-xl flex items-center justify-center transition-colors"
        aria-label="Close lightbox"
      >✕</button>
      {photos.length > 1 && (
        <>
          <button onClick={prevWithFlush} className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white text-2xl flex items-center justify-center" aria-label="Previous">‹</button>
          <button onClick={nextWithFlush} className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white text-2xl flex items-center justify-center" aria-label="Next">›</button>
        </>
      )}
      <div className="flex flex-col items-center max-w-full max-h-full gap-4">
        <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center"
             style={{ width: "min(800px, 90vw)", height: "min(600px, 65vh)" }}>
          <img src={photo.base64} alt={photo.caption || "Visit photo"} className="max-w-full max-h-full object-contain" />
        </div>
        <div className="w-full max-w-[800px]">
          {isReadOnly ? (
            photo.caption ? <p className="text-sm text-slate-200 text-center">{photo.caption}</p> : null
          ) : (
            <input
              type="text"
              maxLength={120}
              placeholder="Add a caption…"
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              onBlur={() => { if (draftCaption !== photo.caption) onCaptionChange(photo.id, draftCaption); }}
              className="w-full bg-slate-800/80 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
          {photos.length > 1 && (
            <p className="text-xs text-slate-500 text-center mt-2">{index + 1} / {photos.length}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoGrid({ category, locationId, isReadOnly }: { category: PhotoCategory; locationId: string; isReadOnly: boolean }) {
  const { photos, update } = usePhotos(category, locationId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flashError = (m: string) => { setError(m); setTimeout(() => setError(null), 4000); };
  const flashWarning = (m: string) => { setWarning(m); setTimeout(() => setWarning(null), 5000); };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      flashError("Only JPEG, PNG, and WebP images are supported");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      flashError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
      return;
    }
    if (photos.length >= MAX_PHOTOS_PER_DEST) {
      flashError(`Up to ${MAX_PHOTOS_PER_DEST} photos per destination`);
      return;
    }
    setUploading(true);
    try {
      const base64 = await resizeImageToBase64(file);
      const newPhoto: VisitPhoto = {
        id: `p${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        base64,
        caption: "",
        uploadedAt: Date.now(),
      };
      const next = [...photos, newPhoto];
      const result = update(next);
      if (!result.ok) flashError(result.error ?? "Failed to save photo");
      else if (result.warning) flashWarning(result.warning);
    } catch {
      flashError("Couldn't process that image");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    const next = photos.filter(p => p.id !== id);
    const result = update(next);
    if (!result.ok) flashError(result.error ?? "Failed to remove photo");
    if (lightboxIndex !== null && lightboxIndex >= next.length) {
      setLightboxIndex(next.length === 0 ? null : next.length - 1);
    }
  };

  const handleEditCaption = (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    const updated = window.prompt("Caption (max 120 chars):", photo.caption);
    if (updated === null) return;
    handleCaptionChange(id, updated.slice(0, 120));
  };

  const handleCaptionChange = (id: string, caption: string) => {
    const next = photos.map(p => p.id === id ? { ...p, caption: caption.slice(0, 120) } : p);
    const result = update(next);
    if (!result.ok) flashError(result.error ?? "Failed to save caption");
  };

  const slots: (VisitPhoto | null)[] = [];
  for (let i = 0; i < MAX_PHOTOS_PER_DEST; i++) slots.push(photos[i] ?? null);

  return (
    <div className="mt-5 pt-5 border-t border-slate-800">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Photos</p>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((photo, idx) => {
          if (photo) {
            return (
              <div key={photo.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className="block w-full aspect-square rounded-lg overflow-hidden bg-slate-800 border border-slate-700 hover:border-slate-500 transition-colors"
                  style={{ width: "120px", height: "120px" }}
                >
                  <img src={photo.base64} alt={photo.caption || "Visit photo"} className="w-full h-full object-cover" />
                </button>
                {!isReadOnly && (
                  <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/50 transition-colors pointer-events-none flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100"
                       style={{ width: "120px", height: "120px" }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleEditCaption(photo.id); }}
                      className="w-8 h-8 rounded-full bg-slate-900/90 hover:bg-slate-700 text-white text-sm flex items-center justify-center pointer-events-auto"
                      title="Edit caption"
                    >✏️</button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                      className="w-8 h-8 rounded-full bg-red-700/90 hover:bg-red-600 text-white text-sm flex items-center justify-center pointer-events-auto"
                      title="Delete photo"
                    >🗑</button>
                  </div>
                )}
                {photo.caption && (
                  <p className="mt-1 text-[10px] text-slate-400 truncate" style={{ width: "120px" }} title={photo.caption}>{photo.caption}</p>
                )}
              </div>
            );
          }
          if (isReadOnly) {
            return (
              <div key={`empty-${idx}`} className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40"
                   style={{ width: "120px", height: "120px" }} />
            );
          }
          return (
            <button
              key={`add-${idx}`}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800/40 text-slate-500 hover:text-slate-300 transition-colors flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-wait"
              style={{ width: "120px", height: "120px" }}
            >
              {uploading && idx === photos.length ? (
                <>
                  <span className="text-2xl animate-spin">⏳</span>
                  <span className="text-[10px]">Uploading…</span>
                </>
              ) : (
                <>
                  <span className="text-2xl">📷</span>
                  <span className="text-[10px]">+ Add Photo</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {!isReadOnly && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            onPickFile(file);
            e.target.value = "";
          }}
        />
      )}
      {error && (
        <p className="mt-2 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-md px-2 py-1.5">{error}</p>
      )}
      {warning && (
        <p className="mt-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-900/50 rounded-md px-2 py-1.5">⚠ {warning}</p>
      )}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))}
          onNext={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length))}
          onCaptionChange={handleCaptionChange}
          isReadOnly={isReadOnly}
        />
      )}
    </div>
  );
}

// ─── Short notes ─────────────────────────────────────────────────────────────

const NOTE_KEY_PREFIX = "shortnote:";
const noteKey = (cat: PhotoCategory, id: string) => `${NOTE_KEY_PREFIX}${cat}:${id}`;
const MAX_NOTE_LENGTH = 280;

type NotesIndex = Record<PhotoCategory, Set<string>>;

function emptyNotesIndex(): NotesIndex {
  return { country: new Set(), state: new Set(), province: new Set(), stadium: new Set(), tcc: new Set(), park: new Set() };
}

function loadNote(cat: PhotoCategory, id: string): string {
  try { return localStorage.getItem(noteKey(cat, id)) ?? ""; } catch { return ""; }
}

function saveNote(cat: PhotoCategory, id: string, text: string): void {
  try {
    const trimmed = text.slice(0, MAX_NOTE_LENGTH);
    if (trimmed.trim() === "") localStorage.removeItem(noteKey(cat, id));
    else localStorage.setItem(noteKey(cat, id), trimmed);
  } catch { /* ignore — non-fatal */ }
}

function buildNotesIndexFromStorage(): NotesIndex {
  const idx = emptyNotesIndex();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(NOTE_KEY_PREFIX)) continue;
      const rest = k.slice(NOTE_KEY_PREFIX.length);
      const colon = rest.indexOf(":");
      if (colon < 0) continue;
      const cat = rest.slice(0, colon) as PhotoCategory;
      const id = rest.slice(colon + 1);
      if (id && (cat === "country" || cat === "state" || cat === "province" || cat === "stadium" || cat === "tcc" || cat === "park")) {
        idx[cat].add(id);
      }
    }
  } catch { /* ignore */ }
  return idx;
}

function loadAllNotes(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(NOTE_KEY_PREFIX)) continue;
      const v = localStorage.getItem(k);
      if (!v) continue;
      out[k.slice(NOTE_KEY_PREFIX.length)] = v;
    }
  } catch { /* ignore */ }
  return out;
}

function NoteField({
  category, locationId, isReadOnly, readOnlyValue, onSaved,
}: {
  category: PhotoCategory;
  locationId: string;
  isReadOnly: boolean;
  readOnlyValue?: string;
  onSaved?: (cat: PhotoCategory, id: string, text: string) => void;
}) {
  const initial = isReadOnly ? (readOnlyValue ?? "") : loadNote(category, locationId);
  const [text, setText] = useState(initial);
  const [savedFlash, setSavedFlash] = useState(false);
  const lastSavedRef = useRef(initial);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const v = isReadOnly ? (readOnlyValue ?? "") : loadNote(category, locationId);
    setText(v);
    lastSavedRef.current = v;
  }, [category, locationId, isReadOnly, readOnlyValue]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = 22;
    const maxHeight = lineHeight * 5 + 16;
    const minHeight = lineHeight * 2 + 16;
    ta.style.height = Math.min(Math.max(ta.scrollHeight, minHeight), maxHeight) + "px";
  }, [text]);

  if (isReadOnly) {
    return (
      <div className="mt-5 pt-5 border-t border-slate-800">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">📝 Note</p>
        {text
          ? <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{text}</p>
          : <p className="text-xs text-slate-500 italic">No note</p>}
      </div>
    );
  }

  const handleBlur = () => {
    if (text === lastSavedRef.current) return;
    saveNote(category, locationId, text);
    lastSavedRef.current = text;
    onSaved?.(category, locationId, text);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="mt-5 pt-5 border-t border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">📝 Note</p>
        {savedFlash && <span className="text-xs text-emerald-400 transition-opacity">Saved ✓</span>}
      </div>
      <div className="relative">
        <textarea
          ref={taRef}
          rows={2}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Add a quick note about this place..."
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={handleBlur}
          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 pr-16 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 leading-snug"
        />
        <span className="absolute bottom-2 right-2 text-[10px] text-slate-500 font-mono pointer-events-none bg-slate-800/80 px-1 rounded">
          {text.length} / {MAX_NOTE_LENGTH}
        </span>
      </div>
    </div>
  );
}

function VisitDetailsPanel({
  locationId,
  category,
  isReadOnly,
  details,
  onUpdate,
}: {
  locationId: string;
  category: PhotoCategory;
  isReadOnly: boolean;
  details: VisitDetails | undefined;
  onUpdate: (id: string, patch: VisitDetails) => void;
}) {
  const d = details ?? {};
  const showWarning = d.firstYear && d.lastYear && d.firstYear > d.lastYear;

  const selectClass =
    "w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer";

  return (
    <div className="mt-5 pt-5 border-t border-slate-800">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">My Visit</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Times Visited</label>
          <select
            className={selectClass}
            value={d.timesVisited ?? ""}
            onChange={e => onUpdate(locationId, { timesVisited: e.target.value === "" ? undefined : Number(e.target.value) })}
          >
            <option value="">— select —</option>
            {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
            <option value={10}>10+</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">First Visit</label>
          <select
            className={selectClass}
            value={d.firstYear ?? ""}
            onChange={e => onUpdate(locationId, { firstYear: e.target.value === "" ? undefined : Number(e.target.value) })}
          >
            <option value="">— select year —</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Most Recent Visit</label>
          <select
            className={selectClass}
            value={d.lastYear ?? ""}
            onChange={e => onUpdate(locationId, { lastYear: e.target.value === "" ? undefined : Number(e.target.value) })}
          >
            <option value="">— select year —</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {showWarning && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <span>⚠️</span> First visit year can't be after most recent year
          </p>
        )}
      </div>
      <PhotoGrid category={category} locationId={locationId} isReadOnly={isReadOnly} />
    </div>
  );
}

function buildTravelCSV(
  visitedCountries: Set<string>,
  visitedStates: Set<string>,
  visitedProvinces: Set<string>,
  visitedStadiums: Set<string>,
  visitedParks: Set<string>,
  countryDetails: Record<string, VisitDetails>,
  stateDetails: Record<string, VisitDetails>,
  provinceDetails: Record<string, VisitDetails>,
  stadiumDetails: Record<string, VisitDetails>,
  parkDetails: Record<string, VisitDetails>,
): string {
  function esc(v: string | number | undefined): string {
    if (v === undefined || v === null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function row(...fields: (string | number | undefined)[]): string {
    return fields.map(esc).join(",");
  }
  function timesLabel(n: number | undefined): string | undefined {
    if (!n) return undefined;
    return n === 10 ? "10+" : String(n);
  }

  const rows: string[] = [
    row("Category", "Name", "Region", "Times Visited", "First Year", "Most Recent Year"),
  ];

  // Countries
  Object.entries(COUNTRY_DATA)
    .filter(([id]) => visitedCountries.has(id))
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([id, info]) => {
      const d = countryDetails[id];
      rows.push(row("Country", info.name, info.continent, timesLabel(d?.timesVisited), d?.firstYear, d?.lastYear));
    });

  // US States
  Object.entries(US_STATE_DATA)
    .filter(([fips]) => visitedStates.has(fips))
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([fips, info]) => {
      const d = stateDetails[fips];
      rows.push(row("US State", info.name, "United States", timesLabel(d?.timesVisited), d?.firstYear, d?.lastYear));
    });

  // Canadian Provinces
  Object.entries(CA_PROVINCE_DATA)
    .filter(([name]) => visitedProvinces.has(name))
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([name, info]) => {
      const d = provinceDetails[name];
      rows.push(row("Canadian Province", info.name, "Canada", timesLabel(d?.timesVisited), d?.firstYear, d?.lastYear));
    });

  // MLB Stadiums
  MLB_STADIUMS
    .filter(s => visitedStadiums.has(s.team))
    .sort((a, b) => a.team.localeCompare(b.team))
    .forEach(s => {
      const d = stadiumDetails[s.team];
      rows.push(row("MLB Stadium", s.stadium, `${s.team} (${s.division})`, timesLabel(d?.timesVisited), d?.firstYear, d?.lastYear));
    });

  // National Parks
  US_NATIONAL_PARKS
    .filter(p => visitedParks.has(p.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(p => {
      const d = parkDetails[p.name];
      rows.push(row("National Park", p.name, p.state, timesLabel(d?.timesVisited), d?.firstYear, d?.lastYear));
    });

  return rows.join("\n");
}

function ExportModal({
  onClose,
  visitedCountries, visitedStates, visitedProvinces, visitedStadiums, visitedParks,
  countryDetails, stateDetails, provinceDetails, stadiumDetails, parkDetails,
}: {
  onClose: () => void;
  visitedCountries: Set<string>;
  visitedStates: Set<string>;
  visitedProvinces: Set<string>;
  visitedStadiums: Set<string>;
  visitedParks: Set<string>;
  countryDetails: Record<string, VisitDetails>;
  stateDetails: Record<string, VisitDetails>;
  provinceDetails: Record<string, VisitDetails>;
  stadiumDetails: Record<string, VisitDetails>;
  parkDetails: Record<string, VisitDetails>;
}) {
  const [copied, setCopied] = useState(false);

  const csv = buildTravelCSV(
    visitedCountries, visitedStates, visitedProvinces, visitedStadiums, visitedParks,
    countryDetails, stateDetails, provinceDetails, stadiumDetails, parkDetails,
  );

  function handleCopy() {
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `travel-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">Export Travel Log</h2>
            <p className="text-xs text-slate-400 mt-0.5">CSV format — opens directly in Excel or Google Sheets</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <pre className="flex-1 overflow-y-auto px-6 py-4 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre bg-slate-950/50 rounded-none">
          {csv}
        </pre>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-800">
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${copied ? "bg-emerald-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-white"}`}
          >
            {copied ? "✓ Copied!" : "Copy to Clipboard"}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Download .csv
          </button>
          <span className="ml-auto text-xs text-slate-500">Click outside to close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Share helpers ────────────────────────────────────────────────────────────

interface ShareData {
  vc: string[]; vt: string[]; vs: string[]; vp: string[];
  bc: string[]; bt: string[]; bs: string[]; bp: string[];
  tv?: string[]; tb?: string[]; // TCC visited / TCC bucket-list (entry names)
  vk?: string[]; bk?: string[]; // National Parks visited / bucket-list
  n?: Record<string, string>;   // notes keyed by "category:id"
}

const SHARE_URL_BUDGET = 6000;

function encodeShareData(data: ShareData): string {
  // Unicode-safe: convert UTF-8 bytes to a Latin1 string before btoa,
  // so notes containing emojis or accented characters don't throw.
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function decodeShareData(encoded: string): ShareData | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    const bin = atob(b64 + "=".repeat(pad));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as ShareData;
  } catch { return null; }
}

function buildShareUrl(data: ShareData): string {
  return `${window.location.origin}${window.location.pathname}?share=${encodeShareData(data)}`;
}

function ShareModal({
  onClose, visitedCountries, visitedStates, visitedProvinces, visitedStadiums, visitedParks,
  bucketCountries, bucketStates, bucketProvinces, bucketStadiums, bucketParks,
  tccVisited, tccBucket, notesByKey,
}: {
  onClose: () => void;
  visitedCountries: Set<string>; visitedStates: Set<string>;
  visitedProvinces: Set<string>; visitedStadiums: Set<string>; visitedParks: Set<string>;
  bucketCountries: Set<string>; bucketStates: Set<string>;
  bucketProvinces: Set<string>; bucketStadiums: Set<string>; bucketParks: Set<string>;
  tccVisited: Set<string>; tccBucket: Set<string>;
  notesByKey: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);
  const baseData: ShareData = {
    vc: [...visitedCountries], vt: [...visitedStadiums],
    vs: [...visitedStates],   vp: [...visitedProvinces],
    bc: [...bucketCountries], bt: [...bucketStadiums],
    bs: [...bucketStates],    bp: [...bucketProvinces],
    tv: [...tccVisited],      tb: [...tccBucket],
    vk: [...visitedParks],    bk: [...bucketParks],
  };
  const hasNotes = Object.keys(notesByKey).length > 0;
  let url = buildShareUrl(baseData);
  let notesOmitted = false;
  if (hasNotes) {
    const urlWith = buildShareUrl({ ...baseData, n: notesByKey });
    if (urlWith.length <= SHARE_URL_BUDGET) url = urlWith;
    else notesOmitted = true;
  }
  const totalVisited = visitedCountries.size + visitedStates.size + visitedProvinces.size + visitedStadiums.size + visitedParks.size + tccVisited.size;
  const totalBucket  = bucketCountries.size  + bucketStates.size  + bucketProvinces.size  + bucketStadiums.size  + bucketParks.size + tccBucket.size;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">Share Your Travel Map</h2>
            <p className="text-xs text-slate-400 mt-0.5">Anyone with the link sees a read-only snapshot of your map</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-300">{totalVisited}</p>
              <p className="text-xs text-slate-400 mt-0.5">Places visited</p>
            </div>
            <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-300">{totalBucket}</p>
              <p className="text-xs text-slate-400 mt-0.5">On bucket list</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Shareable Link</p>
            <div className="flex gap-2">
              <input
                type="text" value={url} readOnly
                className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 font-mono"
                onFocus={e => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  copied ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                {copied ? "✓ Copied!" : "Copy Link"}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 italic">📷 Photos are not included in shared links</p>
          {notesOmitted && (
            <p className="text-xs text-slate-500 italic">📝 Notes are not included in shared links (link would exceed size limit)</p>
          )}

          <div className="bg-slate-800/60 rounded-xl p-4 space-y-2.5">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">How to post</p>
            <p className="text-sm text-slate-400">🐦 <span className="text-slate-300 font-medium">X / Twitter · Facebook · WhatsApp:</span> paste the link directly</p>
            <p className="text-sm text-slate-400">📸 <span className="text-slate-300 font-medium">Instagram:</span> go to your profile → <span className="text-amber-300">Edit Profile → Add link</span>, or share in a Story using the <span className="text-amber-300">Link sticker</span></p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Dashboard ─────────────────────────────────────────────────────────

interface StatsDashboardProps {
  onClose: () => void;
  visitedCountries: Set<string>;
  visitedStates: Set<string>;
  visitedProvinces: Set<string>;
  visitedStadiums: Set<string>;
  visitedParks: Set<string>;
  tccVisited: Set<string>;
  bucketCountries: Set<string>;
  bucketStates: Set<string>;
  bucketProvinces: Set<string>;
  bucketStadiums: Set<string>;
  bucketParks: Set<string>;
  tccBucket: Set<string>;
  countryDetails: Record<string, VisitDetails>;
  stateDetails: Record<string, VisitDetails>;
  provinceDetails: Record<string, VisitDetails>;
  stadiumDetails: Record<string, VisitDetails>;
  parkDetails: Record<string, VisitDetails>;
  tccDetails: Record<string, VisitDetails>;
}

interface VisitedItem {
  id: string;
  name: string;
  category: "country" | "state" | "province" | "stadium" | "tcc" | "park";
  continent?: string;
  year?: number;
}

function StatsDashboard(props: StatsDashboardProps) {
  const {
    onClose,
    visitedCountries, visitedStates, visitedProvinces, visitedStadiums, visitedParks, tccVisited,
    bucketCountries, bucketStates, bucketProvinces, bucketStadiums, bucketParks, tccBucket,
    countryDetails, stateDetails, provinceDetails, stadiumDetails, parkDetails, tccDetails,
  } = props;

  const cardRef = useRef<HTMLDivElement>(null);
  const [profileName, setProfileName] = useState<string>(() => {
    try { return localStorage.getItem("wm_profile_name") || "My Travels"; } catch { return "My Travels"; }
  });
  const updateProfileName = (n: string) => {
    setProfileName(n);
    try { localStorage.setItem("wm_profile_name", n); } catch { /* ignore */ }
  };
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "downloaded" | "error">("idle");

  // Build flat visited items list with year extracted
  const items: VisitedItem[] = useMemo(() => {
    const out: VisitedItem[] = [];
    const yearOf = (d: VisitDetails | undefined): number | undefined => d?.firstYear ?? d?.lastYear;
    visitedCountries.forEach(id => {
      const info = COUNTRY_DATA[id];
      if (info) out.push({ id, name: info.name, category: "country", continent: info.continent, year: yearOf(countryDetails[id]) });
    });
    visitedStates.forEach(fips => {
      const info = US_STATE_DATA[fips];
      if (info) out.push({ id: fips, name: info.name, category: "state", year: yearOf(stateDetails[fips]) });
    });
    visitedProvinces.forEach(name => {
      out.push({ id: name, name, category: "province", year: yearOf(provinceDetails[name]) });
    });
    visitedStadiums.forEach(team => {
      out.push({ id: team, name: team, category: "stadium", year: yearOf(stadiumDetails[team]) });
    });
    visitedParks.forEach(name => {
      out.push({ id: name, name, category: "park", year: yearOf(parkDetails[name]) });
    });
    tccVisited.forEach(name => {
      out.push({ id: name, name, category: "tcc", year: yearOf(tccDetails[name]) });
    });
    return out;
  }, [visitedCountries, visitedStates, visitedProvinces, visitedStadiums, visitedParks, tccVisited, countryDetails, stateDetails, provinceDetails, stadiumDetails, parkDetails, tccDetails]);

  // Continent breakdown (countries only)
  const continents: { name: string; visited: number; total: number; color: string }[] = useMemo(() => {
    const buckets = ["Africa", "Asia", "Europe", "North America", "South America", "Oceania"];
    const totals = new Map<string, number>();
    const visits = new Map<string, number>();
    for (const [id, info] of Object.entries(COUNTRY_DATA)) {
      const c = info.continent;
      if (!c) continue;
      totals.set(c, (totals.get(c) ?? 0) + 1);
      if (visitedCountries.has(id)) visits.set(c, (visits.get(c) ?? 0) + 1);
    }
    return buckets.map(c => ({
      name: c,
      total: totals.get(c) ?? 0,
      visited: visits.get(c) ?? 0,
      color: CONTINENT_COLORS[c] || "#94a3b8",
    }));
  }, [visitedCountries]);

  // Timeline: group items by year (or "Undated")
  const timeline = useMemo(() => {
    const byYear = new Map<number | "undated", VisitedItem[]>();
    items.forEach(it => {
      const k: number | "undated" = it.year ?? "undated";
      if (!byYear.has(k)) byYear.set(k, []);
      byYear.get(k)!.push(it);
    });
    const years = [...byYear.keys()].filter((k): k is number => typeof k === "number").sort((a, b) => b - a);
    const undated = byYear.get("undated") ?? [];
    const max = Math.max(1, ...years.map(y => byYear.get(y)!.length));
    return { years: years.map(y => ({ year: y, items: byYear.get(y)! })), undated, max };
  }, [items]);

  // Fun facts
  const facts = useMemo(() => {
    const dated = items.filter(i => i.year !== undefined) as (VisitedItem & { year: number })[];
    const earliest = dated.length ? dated.reduce((a, b) => a.year < b.year ? a : b) : null;
    const latest = dated.length ? dated.reduce((a, b) => a.year > b.year ? a : b) : null;
    // Busiest year
    const yearCounts = new Map<number, number>();
    dated.forEach(d => yearCounts.set(d.year, (yearCounts.get(d.year) ?? 0) + 1));
    let busiestYear: number | null = null, busiestCount = 0;
    yearCounts.forEach((c, y) => { if (c > busiestCount) { busiestCount = c; busiestYear = y; } });
    // Most-visited continent
    const contCounts = continents.filter(c => c.visited > 0).sort((a, b) => b.visited - a.visited);
    const topContinent = contCounts[0] ?? null;
    // Combined completion
    const totalVisited = visitedCountries.size + visitedStates.size + visitedProvinces.size + visitedStadiums.size + visitedParks.size + tccVisited.size;
    const totalAvail = 195 + 51 + 13 + 30 + NP_TOTAL + TCC_TOTAL;
    const completionPct = totalAvail > 0 ? (totalVisited / totalAvail) * 100 : 0;
    // TCC distance
    const tccGap = TCC_MEMBERSHIP_THRESHOLD - tccVisited.size;
    // Avg per year
    let avgPerYear: number | null = null;
    if (dated.length >= 2) {
      const span = Math.max(1, (latest!.year - earliest!.year + 1));
      avgPerYear = dated.length / span;
    }
    return { earliest, latest, busiestYear, busiestCount, topContinent, totalVisited, totalAvail, completionPct, tccGap, avgPerYear };
  }, [items, continents, visitedCountries.size, visitedStates.size, visitedProvinces.size, visitedStadiums.size, visitedParks.size, tccVisited.size]);

  const totalBucket = bucketCountries.size + bucketStates.size + bucketProvinces.size + bucketStadiums.size + bucketParks.size + tccBucket.size;

  const headlineTiles = [
    { icon: "🌍", label: "Countries", visited: visitedCountries.size, total: 195, color: "from-blue-600 to-blue-800" },
    { icon: "🗺", label: "TCC Territories", visited: tccVisited.size, total: TCC_TOTAL, color: "from-purple-600 to-purple-800" },
    { icon: "🏟", label: "MLB Stadiums", visited: visitedStadiums.size, total: 30, color: "from-sky-600 to-sky-800" },
    { icon: "🏞", label: "Nat. Parks", visited: visitedParks.size, total: NP_TOTAL, color: "from-green-600 to-green-800" },
    { icon: "🇺🇸", label: "US States", visited: visitedStates.size, total: 51, color: "from-red-600 to-red-800" },
    { icon: "🍁", label: "CA Provinces", visited: visitedProvinces.size, total: 13, color: "from-orange-600 to-orange-800" },
    { icon: "⭐", label: "Bucket List", visited: totalBucket, total: null, color: "from-amber-600 to-amber-800" },
  ];

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    setCopyStatus("copying");
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: "#0f172a", cacheBust: true });
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopyStatus("copied");
      } catch {
        // Fallback to download
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${profileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-travel-stats.png`;
        a.click();
        setCopyStatus("downloaded");
      }
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2500);
    }
  };

  const factCards: { key: string; icon: string; title: string; value: React.ReactNode; sub?: string }[] = [];
  if (facts.earliest) factCards.push({ key: "first", icon: "🥇", title: "First destination", value: facts.earliest.name, sub: `${facts.earliest.year}` });
  if (facts.latest && facts.latest !== facts.earliest) factCards.push({ key: "latest", icon: "🆕", title: "Most recent", value: facts.latest.name, sub: `${facts.latest.year}` });
  if (facts.busiestYear) factCards.push({ key: "busy", icon: "📅", title: "Busiest year", value: facts.busiestYear, sub: `${facts.busiestCount} new ${facts.busiestCount === 1 ? "destination" : "destinations"}` });
  if (facts.topContinent) factCards.push({ key: "cont", icon: "🌐", title: "Top continent", value: facts.topContinent.name, sub: `${facts.topContinent.visited} of ${facts.topContinent.total} countries` });
  factCards.push({ key: "comp", icon: "🏆", title: "Total completion", value: `${facts.completionPct.toFixed(1)}%`, sub: `${facts.totalVisited} of ${facts.totalAvail} destinations` });
  factCards.push({
    key: "tcc",
    icon: "✈️",
    title: "TCC membership",
    value: facts.tccGap <= 0 ? "🎉 Achieved!" : `${facts.tccGap} to go`,
    sub: facts.tccGap <= 0 ? `${tccVisited.size} of ${TCC_TOTAL}` : `${tccVisited.size} of 100 needed`,
  });
  if (facts.avgPerYear !== null) factCards.push({ key: "avg", icon: "🗓", title: "Average per year", value: facts.avgPerYear.toFixed(1), sub: "new destinations" });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div
        className="min-h-full max-w-6xl mx-auto p-6 md:p-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 md:px-8 py-5 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur-sm rounded-t-2xl z-10">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">📊 Travel Statistics</h2>
              <p className="text-sm text-slate-400 mt-0.5">A snapshot of your journey so far</p>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
            >
              ✕ Close
            </button>
          </div>

          <div className="p-6 md:p-8 space-y-10">
            {/* Section 1: Headline Numbers */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Headline numbers</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {headlineTiles.map(t => (
                  <div key={t.label} className={`p-4 rounded-xl bg-gradient-to-br ${t.color} shadow-md`}>
                    <div className="text-2xl mb-1">{t.icon}</div>
                    <div className="text-2xl font-bold text-white">
                      {t.visited}{t.total !== null && <span className="text-sm font-normal text-white/70"> / {t.total}</span>}
                    </div>
                    <div className="text-xs text-white/80 mt-0.5">{t.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Continent Breakdown */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Continent breakdown</h3>
              <div className="space-y-2.5">
                {continents.map(c => {
                  const pct = c.total > 0 ? (c.visited / c.total) * 100 : 0;
                  return (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300 font-medium flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </span>
                        <span className="text-slate-400 font-mono">{c.visited}/{c.total}</span>
                      </div>
                      <div className="h-6 bg-slate-800 rounded-md overflow-hidden relative">
                        <div
                          className="h-full transition-all duration-500 flex items-center justify-end px-2"
                          style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: c.color, opacity: pct > 0 ? 1 : 0.2 }}
                        >
                          {pct >= 8 && <span className="text-[10px] font-bold text-slate-900">{pct.toFixed(0)}%</span>}
                        </div>
                        {pct < 8 && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{pct.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 3: Travel Timeline */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Travel timeline</h3>
              {timeline.years.length === 0 && timeline.undated.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No visits recorded yet. Start marking destinations to build your timeline.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.years.map(({ year, items: yearItems }) => {
                    const pct = (yearItems.length / timeline.max) * 100;
                    const previewNames = yearItems.slice(0, 6).map(i => i.name).join(", ");
                    const more = yearItems.length > 6 ? ` +${yearItems.length - 6} more` : "";
                    return (
                      <div key={year} className="flex gap-4 items-start">
                        <div className="w-16 shrink-0 text-right">
                          <div className="text-lg font-bold text-white">{year}</div>
                          <div className="text-xs text-slate-500">{yearItems.length} new</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-1.5">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-xs text-slate-400 leading-snug">{previewNames}{more}</p>
                        </div>
                      </div>
                    );
                  })}
                  {timeline.undated.length > 0 && (
                    <div className="flex gap-4 items-start pt-3 mt-3 border-t border-slate-800">
                      <div className="w-16 shrink-0 text-right">
                        <div className="text-sm font-semibold text-slate-400">Undated</div>
                        <div className="text-xs text-slate-500">{timeline.undated.length}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500 leading-snug">
                          {timeline.undated.slice(0, 8).map(i => i.name).join(", ")}
                          {timeline.undated.length > 8 ? ` +${timeline.undated.length - 8} more` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Section 4: Fun Facts */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Fun facts</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {factCards.map(f => (
                  <div key={f.key} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <div className="text-xl mb-1">{f.icon}</div>
                    <div className="text-xs text-slate-400 uppercase tracking-wide">{f.title}</div>
                    <div className="text-lg font-bold text-white mt-1 leading-tight">{f.value}</div>
                    {f.sub && <div className="text-xs text-slate-500 mt-0.5">{f.sub}</div>}
                  </div>
                ))}
              </div>
            </section>

            {/* Section 5: Shareable Summary Card */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Shareable summary</h3>
                <button
                  onClick={handleCopyImage}
                  disabled={copyStatus === "copying"}
                  className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-lg text-white font-medium flex items-center gap-1.5 transition-colors"
                >
                  {copyStatus === "copying" && "⏳ Generating…"}
                  {copyStatus === "copied" && "✅ Copied to clipboard"}
                  {copyStatus === "downloaded" && "💾 Downloaded"}
                  {copyStatus === "error" && "⚠️ Failed"}
                  {copyStatus === "idle" && "📋 Copy as Image"}
                </button>
              </div>
              <div
                ref={cardRef}
                className="p-8 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700"
              >
                <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
                  <input
                    type="text"
                    value={profileName}
                    onChange={e => updateProfileName(e.target.value)}
                    maxLength={40}
                    className="text-3xl font-bold text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-amber-500 outline-none transition-colors flex-1 min-w-[200px]"
                  />
                  <span className="text-sm text-slate-400">🌍 World Map</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  {headlineTiles.slice(0, 6).map(t => (
                    <div key={t.label} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/40">
                      <div className="text-lg">{t.icon}</div>
                      <div className="text-xl font-bold text-white">
                        {t.visited}{t.total !== null && <span className="text-xs font-normal text-slate-500"> / {t.total}</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{t.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {headlineTiles.filter(t => t.total !== null).map(t => {
                    const pct = t.total ? (t.visited / t.total) * 100 : 0;
                    return (
                      <div key={t.label}>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                          <span>{t.icon} {t.label}</span>
                          <span className="font-mono">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 pt-4 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-500">
                  <span>Total completion</span>
                  <span className="font-mono text-amber-400">{facts.completionPct.toFixed(1)}%</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Excel import / template helpers ─────────────────────────────────────────

interface ImportResult {
  matched: number;
  unmatched: string[];
}

interface ParsedRow {
  name: string;
  type: string;
  timesVisited?: number;
  firstYear?: number;
  lastYear?: number;
}

function buildLookupMaps() {
  const countryByName = new Map<string, string>();
  for (const [id, info] of Object.entries(COUNTRY_DATA)) {
    countryByName.set(info.name.toLowerCase().trim(), id);
  }
  const stateByName = new Map<string, string>();
  for (const [fips, info] of Object.entries(US_STATE_DATA)) {
    stateByName.set(info.name.toLowerCase().trim(), fips);
  }
  const provinceByName = new Map<string, string>();
  for (const [key, info] of Object.entries(CA_PROVINCE_DATA)) {
    provinceByName.set(info.name.toLowerCase().trim(), key);
  }
  const stadiumByName = new Map<string, string>();
  for (const s of MLB_STADIUMS) {
    stadiumByName.set(s.stadium.toLowerCase().trim(), s.team);
    stadiumByName.set(s.team.toLowerCase().trim(), s.team);
  }
  return { countryByName, stateByName, provinceByName, stadiumByName };
}

function parseTimesVisited(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).trim();
  if (s === "10+") return 10;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : undefined;
}

function parseYear(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : undefined;
}

function parseExcelRows(wb: XLSX.WorkBook): ParsedRow[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map(r => {
    const key = (k: string) => {
      const match = Object.keys(r).find(rk => rk.toLowerCase().trim() === k);
      return match ? r[match] : undefined;
    };
    return {
      name: String(key("name") ?? "").trim(),
      type: String(key("type") ?? "").toLowerCase().trim(),
      timesVisited: parseTimesVisited(key("times visited")),
      firstYear: parseYear(key("first year")),
      lastYear: parseYear(key("most recent year")),
    };
  }).filter(r => r.name.length > 0);
}

function processImport(
  rows: ParsedRow[],
  lookups: ReturnType<typeof buildLookupMaps>,
  setVisitedCountries: React.Dispatch<React.SetStateAction<Set<string>>>,
  setVisitedStates: React.Dispatch<React.SetStateAction<Set<string>>>,
  setVisitedProvinces: React.Dispatch<React.SetStateAction<Set<string>>>,
  setVisitedStadiums: React.Dispatch<React.SetStateAction<Set<string>>>,
  setCountryDetail: (id: string, d: VisitDetails | null) => void,
  setStateDetail: (id: string, d: VisitDetails | null) => void,
  setProvinceDetail: (id: string, d: VisitDetails | null) => void,
  setStadiumDetail: (id: string, d: VisitDetails | null) => void,
): ImportResult {
  const { countryByName, stateByName, provinceByName, stadiumByName } = lookups;
  const unmatched: string[] = [];
  let matched = 0;

  const detail = (row: ParsedRow): VisitDetails => ({
    ...(row.timesVisited !== undefined ? { timesVisited: row.timesVisited } : {}),
    ...(row.firstYear !== undefined ? { firstYear: row.firstYear } : {}),
    ...(row.lastYear !== undefined ? { lastYear: row.lastYear } : {}),
  });

  for (const row of rows) {
    const name = row.name.toLowerCase();
    const t = row.type;

    const tryCountry = () => {
      const id = countryByName.get(name);
      if (!id) return false;
      setVisitedCountries(prev => { const n = new Set(prev); n.add(id); return n; });
      const d = detail(row);
      if (Object.keys(d).length > 0) setCountryDetail(id, d);
      matched++;
      return true;
    };
    const tryState = () => {
      const fips = stateByName.get(name);
      if (!fips) return false;
      setVisitedStates(prev => { const n = new Set(prev); n.add(fips); return n; });
      const d = detail(row);
      if (Object.keys(d).length > 0) setStateDetail(fips, d);
      matched++;
      return true;
    };
    const tryProvince = () => {
      const key = provinceByName.get(name);
      if (!key) return false;
      setVisitedProvinces(prev => { const n = new Set(prev); n.add(key); return n; });
      const d = detail(row);
      if (Object.keys(d).length > 0) setProvinceDetail(key, d);
      matched++;
      return true;
    };
    const tryStadium = () => {
      const team = stadiumByName.get(name);
      if (!team) return false;
      setVisitedStadiums(prev => { const n = new Set(prev); n.add(team); return n; });
      const d = detail(row);
      if (Object.keys(d).length > 0) setStadiumDetail(team, d);
      matched++;
      return true;
    };

    let found = false;
    if (t === "country") found = tryCountry();
    else if (t === "state") found = tryState();
    else if (t === "province") found = tryProvince();
    else if (t === "stadium") found = tryStadium();
    else {
      found = tryCountry() || tryState() || tryProvince() || tryStadium();
    }

    if (!found) unmatched.push(row.name);
  }

  return { matched, unmatched };
}

function downloadTemplate() {
  const headers = ["Name", "Type", "Times Visited", "First Year", "Most Recent Year"];
  const examples = [
    ["France", "country", 3, 2010, 2023],
    ["California", "state", 5, 2005, 2024],
    ["Yankee Stadium", "stadium", 1, 2019, 2019],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Travel Tracker");
  XLSX.writeFile(wb, "travel_tracker_template.xlsx");
}

// ─── End Excel helpers ────────────────────────────────────────────────────────

// ─── Search coordinates ───────────────────────────────────────────────────────

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "4":[-67.7,33.9],"8":[20.2,41.2],"12":[2.6,28.0],"20":[1.6,42.5],"24":[17.5,-11.2],
  "28":[-61.8,17.1],"31":[47.6,40.1],"32":[-63.6,-38.4],"36":[133.8,-25.3],"40":[14.6,47.7],
  "44":[-77.4,24.8],"48":[50.5,26.0],"50":[90.4,23.7],"52":[-59.6,13.2],"56":[4.5,50.5],
  "64":[90.4,27.5],"68":[-64.7,-17.0],"70":[17.7,44.2],"72":[24.7,-22.3],"76":[-51.9,-14.2],
  "84":[-88.5,17.2],"90":[160.2,-9.6],"96":[114.7,4.5],"100":[25.5,42.7],"104":[95.9,21.9],
  "108":[29.9,-3.4],"112":[28.0,53.5],"116":[104.9,12.6],"120":[12.3,5.7],"132":[-23.6,15.1],
  "140":[20.9,6.6],"144":[80.7,7.9],"148":[18.7,15.5],"152":[-71.5,-35.7],"156":[104.2,35.9],
  "158":[121.0,23.7],"170":[-74.3,4.1],"174":[43.3,-11.9],"178":[15.8,-0.7],"180":[23.7,-2.9],
  "188":[-84.0,9.7],"191":[15.7,45.2],"192":[-79.5,22.0],"196":[33.2,35.1],"203":[15.5,49.8],
  "204":[2.3,9.3],"208":[10.0,56.3],"212":[-61.4,15.4],"214":[-70.2,18.7],"218":[-78.1,-1.8],
  "222":[-88.9,13.8],"226":[10.3,1.7],"231":[39.6,8.6],"232":[39.8,15.2],"233":[25.0,58.7],
  "242":[178.1,-18.1],"246":[26.3,64.0],"250":[2.2,46.2],"262":[42.6,11.8],"266":[11.6,-0.8],
  "268":[43.4,42.0],"270":[-15.3,13.4],"275":[35.2,31.9],"276":[10.5,51.2],"288":[-1.0,7.9],
  "296":[174.0,1.4],"300":[21.8,39.1],"304":[-41.4,72.0],"308":[-61.7,12.1],"320":[-90.2,15.8],"324":[-11.8,10.9],
  "328":[-58.9,4.8],"332":[-72.3,19.1],"340":[-86.6,15.1],"344":[114.2,22.3],"348":[19.5,47.2],
  "356":[78.9,20.6],"360":[113.9,-0.8],"364":[53.7,32.4],"368":[43.7,33.2],"372":[-8.0,53.4],
  "376":[34.9,31.5],"380":[12.6,42.8],"388":[-77.3,18.1],"392":[138.3,36.2],"398":[66.9,48.0],
  "400":[36.2,31.2],"404":[37.9,0.0],"408":[127.5,40.3],"410":[127.8,36.5],"414":[47.5,29.5],
  "417":[74.8,41.5],"418":[103.8,18.2],"422":[35.8,33.9],"426":[28.2,-29.6],"428":[25.0,56.9],
  "430":[-9.4,6.4],"434":[17.2,27.0],"438":[9.6,47.1],"440":[23.9,55.9],"442":[6.1,49.8],
  "450":[46.9,-19.4],"454":[34.3,-13.3],"458":[109.7,4.2],"462":[73.5,3.2],"466":[-2.0,17.6],
  "470":[14.4,35.9],"478":[-11.8,20.3],"480":[57.6,-20.3],"484":[-102.6,23.6],"492":[7.4,43.7],
  "496":[103.8,46.9],"498":[28.5,47.4],"499":[19.4,42.7],"500":[-62.2,17.1],"504":[-7.1,31.8],
  "508":[35.5,-18.7],"512":[56.0,21.5],"516":[18.5,-22.0],"520":[166.9,-0.5],"524":[84.1,28.4],
  "528":[5.3,52.1],"548":[167.0,-15.4],"554":[172.5,-41.5],"558":[-85.0,12.9],"562":[8.1,17.6],
  "566":[8.7,9.1],"578":[8.5,60.5],"583":[158.3,6.9],"584":[168.7,9.6],"585":[134.5,7.5],
  "586":[69.3,30.4],"591":[-80.1,8.5],"598":[143.9,-6.3],"600":[-58.4,-23.4],"604":[-75.0,-9.2],
  "608":[121.8,12.9],"616":[20.0,51.9],"620":[-8.2,39.6],"624":[-15.2,12.0],"626":[125.7,-8.9],
  "634":[51.2,25.4],"642":[24.9,45.9],"643":[99.1,61.5],"646":[29.9,-2.0],"659":[-62.7,17.3],
  "662":[-60.9,13.9],"670":[-61.2,13.3],"674":[12.5,43.9],"678":[6.6,0.2],"682":[45.1,24.2],
  "686":[-14.5,14.5],"688":[21.0,44.0],"690":[55.5,-4.7],"694":[-11.8,8.5],"703":[19.7,48.7],
  "704":[108.3,14.1],"705":[14.8,46.1],"706":[45.3,6.1],"710":[25.1,-28.7],"716":[29.2,-20.0],
  "724":[-3.7,40.2],"729":[29.9,15.6],"740":[-56.0,4.0],"752":[17.0,62.0],"756":[8.2,46.8],
  "760":[38.3,35.0],"762":[71.3,38.9],"764":[101.0,15.9],"768":[1.2,8.6],"776":[-175.2,-21.2],
  "780":[-61.2,10.5],"784":[53.8,24.0],"788":[9.6,33.9],"792":[35.2,38.9],"795":[58.4,40.1],
  "798":[178.1,-8.5],"800":[32.3,1.4],"804":[31.2,49.0],"818":[30.8,26.8],"826":[-3.4,55.4],
  "834":[35.0,-6.4],"836":[-14.5,14.5],"854":[-1.6,12.4],"858":[-55.8,-32.5],"860":[63.9,41.4],
  "862":[-66.6,8.0],"882":[-172.5,-13.6],"887":[48.5,16.0],"894":[27.8,-14.0],
  "336":[12.5,41.9],
};

const COUNTRY_ZOOM: Record<string, number> = {
  "36":2,"643":2,"156":2,"076":2,"840":2,"124":2,"356":3,"484":3,"036":2,"304":2,
  "520":8,"798":8,"492":8,"438":8,"674":7,"336":8,"462":8,"028":7,"212":7,
  "659":7,"662":7,"670":7,"308":7,
};

const US_STATE_CENTROIDS: Record<string, [number, number]> = {
  "01":[-86.8,32.8],"02":[-153.4,64.2],"04":[-111.6,34.3],"05":[-92.4,34.9],
  "06":[-119.5,37.2],"08":[-105.5,39.0],"09":[-72.7,41.6],"10":[-75.5,38.9],
  "11":[-77.0,38.9],"12":[-82.5,28.1],"13":[-83.4,32.7],"15":[-157.5,21.1],
  "16":[-114.5,44.0],"17":[-89.3,40.0],"18":[-86.3,40.3],"19":[-93.5,42.0],
  "20":[-98.4,38.5],"21":[-84.8,37.7],"22":[-91.8,31.1],"23":[-69.2,45.2],
  "24":[-76.6,39.0],"25":[-71.5,42.4],"26":[-84.7,44.3],"27":[-94.3,46.4],
  "28":[-89.7,32.8],"29":[-92.5,38.4],"30":[-110.4,46.8],"31":[-99.7,41.5],
  "32":[-117.1,38.5],"33":[-71.6,43.8],"34":[-74.5,40.1],"35":[-106.2,34.5],
  "36":[-75.4,42.9],"37":[-79.4,35.5],"38":[-100.5,47.5],"39":[-82.9,40.4],
  "40":[-97.5,35.6],"41":[-120.6,44.0],"42":[-77.2,40.9],"44":[-71.5,41.6],
  "45":[-81.0,33.9],"46":[-100.2,44.5],"47":[-86.7,35.9],"48":[-99.3,31.4],
  "49":[-111.1,39.3],"50":[-72.7,44.0],"51":[-78.7,37.5],"53":[-120.5,47.5],
  "54":[-80.5,38.7],"55":[-89.7,44.5],"56":[-107.3,43.0],
};

const CA_PROVINCE_CENTROIDS: Record<string, [number, number]> = {
  "Alberta":[-115.0,55.0],"British Columbia":[-124.0,54.0],"Manitoba":[-98.0,55.0],
  "New Brunswick":[-66.5,46.5],"Newfoundland and Labrador":[-60.0,53.0],
  "Northwest Territories":[-120.0,65.0],"Nova Scotia":[-63.0,45.0],
  "Nunavut":[-85.0,70.0],"Ontario":[-85.0,50.0],"Prince Edward Island":[-63.1,46.5],
  "Quebec":[-72.0,52.0],"Saskatchewan":[-105.0,54.0],"Yukon Territory":[-135.0,63.0],
};

interface SearchItem {
  id: string;
  label: string;
  sublabel: string;
  category: "country" | "us-state" | "ca-province" | "stadium";
  coordinates: [number, number];
  zoom: number;
}

function buildSearchIndex(): SearchItem[] {
  const items: SearchItem[] = [];
  for (const [id, info] of Object.entries(COUNTRY_DATA)) {
    const coords = COUNTRY_CENTROIDS[id];
    if (!coords) continue;
    items.push({
      id, label: info.name,
      sublabel: (info as RegionInfo & { continent?: string }).continent ?? "Country",
      category: "country",
      coordinates: coords,
      zoom: COUNTRY_ZOOM[id] ?? 3,
    });
  }
  for (const [fips, info] of Object.entries(US_STATE_DATA)) {
    const coords = US_STATE_CENTROIDS[fips];
    if (!coords) continue;
    items.push({ id: fips, label: info.name, sublabel: "U.S. State", category: "us-state", coordinates: coords, zoom: 5 });
  }
  for (const [key, info] of Object.entries(CA_PROVINCE_DATA)) {
    const coords = CA_PROVINCE_CENTROIDS[key];
    if (!coords) continue;
    items.push({ id: key, label: info.name, sublabel: "CA Province", category: "ca-province", coordinates: coords, zoom: 4 });
  }
  for (const s of MLB_STADIUMS) {
    items.push({
      id: s.team, label: s.stadium, sublabel: s.team,
      category: "stadium", coordinates: s.coordinates as [number, number], zoom: 8,
    });
  }
  return items;
}

const SEARCH_INDEX = buildSearchIndex();

const CATEGORY_BADGE: Record<SearchItem["category"], string> = {
  "country": "bg-blue-900 text-blue-300",
  "us-state": "bg-red-900 text-red-300",
  "ca-province": "bg-orange-900 text-orange-300",
  "stadium": "bg-violet-900 text-violet-300",
};
const CATEGORY_LABEL: Record<SearchItem["category"], string> = {
  "country": "Country",
  "us-state": "US State",
  "ca-province": "Province",
  "stadium": "Stadium",
};

function SearchBar({ onSelect }: { onSelect: (item: SearchItem) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const suggestions = query.trim().length < 1 ? [] : (() => {
    const q = query.toLowerCase();
    const starts: SearchItem[] = [];
    const contains: SearchItem[] = [];
    for (const item of SEARCH_INDEX) {
      const l = item.label.toLowerCase();
      if (l.startsWith(q)) starts.push(item);
      else if (l.includes(q) || item.sublabel.toLowerCase().includes(q)) contains.push(item);
      if (starts.length + contains.length >= 10) break;
    }
    return [...starts, ...contains].slice(0, 8);
  })();

  const commit = (item: SearchItem) => {
    setQuery("");
    setOpen(false);
    setActiveIdx(-1);
    onSelect(item);
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); commit(suggestions[activeIdx]); }
    else if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
  };

  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="relative flex-1 max-w-sm">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search countries, states, stadiums…"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
        />
        {query && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            onMouseDown={e => { e.preventDefault(); setQuery(""); setOpen(false); }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute top-full mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-auto max-h-72 py-1"
        >
          {suggestions.map((item, i) => (
            <li key={`${item.category}-${item.id}`}>
              <button
                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-700 transition-colors ${i === activeIdx ? "bg-slate-700" : ""}`}
                onMouseDown={e => { e.preventDefault(); commit(item); }}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide ${CATEGORY_BADGE[item.category]}`}>
                  {CATEGORY_LABEL[item.category]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white font-medium truncate">{item.label}</span>
                  <span className="block text-xs text-slate-400 truncate">{item.sublabel}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── End search ───────────────────────────────────────────────────────────────

const DIVISION_COLORS: Record<string, string> = {
  "AL East": "#1d4ed8",
  "AL Central": "#2563eb",
  "AL West": "#3b82f6",
  "NL East": "#1e40af",
  "NL Central": "#1e3a8a",
  "NL West": "#1d4ed8",
};

export default function App({ authUser, isAuthenticated, onLogin, onLogout }: AuthProps) {
  const [selected, setSelected] = useState<{ key: string; info: RegionInfo } | null>(null);
  const [selectedStadium, setSelectedStadium] = useState<StadiumInfo | null>(null);
  const [hoveredStadium, setHoveredStadium] = useState<string | null>(null);
  const [selectedPark, setSelectedPark] = useState<NationalParkInfo | null>(null);
  const [hoveredPark, setHoveredPark] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipName, setTooltipName] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([0, 20]);
  const [listTab, setListTab] = useState<"countries" | "stadiums" | "nat-parks" | "us-states" | "ca-provinces" | "tcc" | "bucket-list">("countries");
  const [confirmBucket, setConfirmBucket] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [sharedData, setSharedData] = useState<ShareData | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: "success" | "warning" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rawVisitedCountries, setVisitedCountries] = useLocalStorageSet("wm_visited_countries");
  const [rawVisitedStadiums, setVisitedStadiums] = useLocalStorageSet("wm_visited_stadiums");
  const [rawVisitedParks, setVisitedParks] = useLocalStorageSet("wm_visited_parks");
  const [rawVisitedStates, setVisitedStates] = useLocalStorageSet("wm_visited_states");
  const [rawVisitedProvinces, setVisitedProvinces] = useLocalStorageSet("wm_visited_provinces");
  const [rawBucketCountries, setBucketCountries] = useLocalStorageSet("wm_bucket_countries");
  const [rawBucketStadiums, setBucketStadiums] = useLocalStorageSet("wm_bucket_stadiums");
  const [rawBucketParks, setBucketParks] = useLocalStorageSet("wm_bucket_parks");
  const [rawBucketStates, setBucketStates] = useLocalStorageSet("wm_bucket_states");
  const [rawBucketProvinces, setBucketProvinces] = useLocalStorageSet("wm_bucket_provinces");
  const [rawTccVisited, setTccVisited] = useLocalStorageSet("wm_tcc_visited");
  const [rawTccBucket,  setTccBucket]  = useLocalStorageSet("wm_tcc_bucket");

  // Year filter state (persisted)
  const [yearFilter, setYearFilterRaw] = useState<YearFilterState>(() => {
    try {
      const v = localStorage.getItem("wm_year_filter");
      if (v) return JSON.parse(v) as YearFilterState;
    } catch { /* ignore */ }
    return { enabled: false, mode: "range", min: CURRENT_YEAR - 10, max: CURRENT_YEAR, snapshot: CURRENT_YEAR };
  });
  const setYearFilter = useCallback((updater: YearFilterState | ((p: YearFilterState) => YearFilterState)) => {
    setYearFilterRaw(prev => {
      const next = typeof updater === "function" ? (updater as (p: YearFilterState) => YearFilterState)(prev) : updater;
      try { localStorage.setItem("wm_year_filter", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [filterPlaying, setFilterPlaying] = useState(false);

  // Map mode: "world" (countries / states / stadiums) or "tcc" (TCC list)
  const [mapMode, setMapModeRaw] = useState<MapMode>(() => {
    try {
      const v = localStorage.getItem("wm_map_mode");
      return v === "tcc" ? "tcc" : "world";
    } catch { return "world"; }
  });
  const setMapMode = useCallback((m: MapMode) => {
    setMapModeRaw(m);
    try { localStorage.setItem("wm_map_mode", m); } catch { /* ignore */ }
  }, []);

  // Detect ?share= URL param on first load
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("share");
    if (param) {
      const decoded = decodeShareData(param);
      if (decoded) setSharedData(decoded);
    }
  }, []);

  // In read-only (shared) mode, display the shared data instead of own localStorage data
  const isReadOnly = sharedData !== null;
  const [notesIndex, setNotesIndex] = useState<NotesIndex>(() => buildNotesIndexFromStorage());
  const handleNoteSaved = useCallback((cat: PhotoCategory, id: string, text: string) => {
    setNotesIndex(prev => {
      const nextSet = new Set(prev[cat]);
      if (text.trim() === "") nextSet.delete(id);
      else nextSet.add(id);
      return { ...prev, [cat]: nextSet };
    });
  }, []);
  const sharedNotesByKey: Record<string, string> = isReadOnly ? (sharedData!.n ?? {}) : {};
  const effectiveNotesIndex: NotesIndex = useMemo(() => {
    if (!isReadOnly) return notesIndex;
    const idx = emptyNotesIndex();
    Object.keys(sharedNotesByKey).forEach(k => {
      const colon = k.indexOf(":");
      if (colon < 0) return;
      const cat = k.slice(0, colon) as PhotoCategory;
      const id = k.slice(colon + 1);
      if (id && (cat === "country" || cat === "state" || cat === "province" || cat === "stadium" || cat === "tcc")) {
        idx[cat].add(id);
      }
    });
    return idx;
  }, [isReadOnly, sharedNotesByKey, notesIndex]);
  const totalNoteCount = effectiveNotesIndex.country.size + effectiveNotesIndex.state.size + effectiveNotesIndex.province.size + effectiveNotesIndex.stadium.size + effectiveNotesIndex.park.size + effectiveNotesIndex.tcc.size;
  const getReadOnlyNote = useCallback((cat: PhotoCategory, id: string): string | undefined => {
    return isReadOnly ? sharedNotesByKey[`${cat}:${id}`] : undefined;
  }, [isReadOnly, sharedNotesByKey]);
  const baseVisitedCountries = isReadOnly ? new Set<string>(sharedData!.vc) : rawVisitedCountries;
  const baseVisitedStadiums  = isReadOnly ? new Set<string>(sharedData!.vt) : rawVisitedStadiums;
  const baseVisitedParks     = isReadOnly ? new Set<string>(sharedData!.vk ?? []) : rawVisitedParks;
  const baseVisitedStates    = isReadOnly ? new Set<string>(sharedData!.vs) : rawVisitedStates;
  const baseVisitedProvinces = isReadOnly ? new Set<string>(sharedData!.vp) : rawVisitedProvinces;
  const bucketCountries      = isReadOnly ? new Set<string>(sharedData!.bc) : rawBucketCountries;
  const bucketStadiums       = isReadOnly ? new Set<string>(sharedData!.bt) : rawBucketStadiums;
  const bucketParks          = isReadOnly ? new Set<string>(sharedData!.bk ?? []) : rawBucketParks;
  const bucketStates         = isReadOnly ? new Set<string>(sharedData!.bs) : rawBucketStates;
  const bucketProvinces      = isReadOnly ? new Set<string>(sharedData!.bp) : rawBucketProvinces;
  const baseTccVisited       = isReadOnly ? new Set<string>(sharedData!.tv ?? []) : rawTccVisited;
  const tccBucket            = isReadOnly ? new Set<string>(sharedData!.tb ?? []) : rawTccBucket;
  const [countryDetails, setCountryDetail] = useLocalStorageRecord("wm_details_countries");
  const [stadiumDetails, setStadiumDetail] = useLocalStorageRecord("wm_details_stadiums");
  const [parkDetails, setParkDetail] = useLocalStorageRecord("wm_details_parks");
  const [stateDetails, setStateDetail] = useLocalStorageRecord("wm_details_states");
  const [provinceDetails, setProvinceDetail] = useLocalStorageRecord("wm_details_provinces");
  const [tccDetails, setTccDetail] = useLocalStorageRecord("wm_details_tcc");

  // Apply year filter to visited sets (bucket sets are NOT filtered per spec)
  function filterVisited(base: Set<string>, details: Record<string, VisitDetails>): Set<string> {
    if (!yearFilter.enabled) return base;
    const out = new Set<string>();
    base.forEach(id => { if (detailMatchesFilter(details[id], yearFilter)) out.add(id); });
    return out;
  }
  const visitedCountries = filterVisited(baseVisitedCountries, countryDetails);
  const visitedStadiums  = filterVisited(baseVisitedStadiums,  stadiumDetails);
  const visitedParks     = filterVisited(baseVisitedParks,     parkDetails);
  const visitedStates    = filterVisited(baseVisitedStates,    stateDetails);
  const visitedProvinces = filterVisited(baseVisitedProvinces, provinceDetails);
  const tccVisited       = filterVisited(baseTccVisited,       tccDetails);

  // Earliest visit year across all categories (for slider min)
  const earliestYear = (() => {
    let m = CURRENT_YEAR;
    for (const r of [countryDetails, stateDetails, provinceDetails, stadiumDetails, parkDetails, tccDetails]) {
      for (const k in r) {
        const d = r[k];
        if (d.firstYear && d.firstYear < m) m = d.firstYear;
        if (d.lastYear  && d.lastYear  < m) m = d.lastYear;
      }
    }
    return Math.min(m, CURRENT_YEAR);
  })();

  // Clamp filter values when earliestYear changes
  useEffect(() => {
    setYearFilter(p => {
      const min = Math.max(p.min, earliestYear);
      const max = Math.min(Math.max(p.max, min), CURRENT_YEAR);
      const snapshot = Math.min(Math.max(p.snapshot, earliestYear), CURRENT_YEAR);
      if (min === p.min && max === p.max && snapshot === p.snapshot) return p;
      return { ...p, min, max, snapshot };
    });
  }, [earliestYear, setYearFilter]);

  // Snapshot playback: advance year every second
  useEffect(() => {
    if (!filterPlaying || !yearFilter.enabled || yearFilter.mode !== "snapshot") return;
    const id = setInterval(() => {
      setYearFilter(p => {
        if (p.snapshot >= CURRENT_YEAR) return p;
        return { ...p, snapshot: p.snapshot + 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [filterPlaying, yearFilter.enabled, yearFilter.mode, yearFilter.snapshot, setYearFilter]);
  // Stop playback when reaching the end
  useEffect(() => {
    if (filterPlaying && yearFilter.snapshot >= CURRENT_YEAR) setFilterPlaying(false);
  }, [filterPlaying, yearFilter.snapshot]);

  const sortedTcc: TccEntry[] = [...TCC_DATA].sort((a, b) => a.name.localeCompare(b.name));
  const [selectedTcc, setSelectedTcc] = useState<TccEntry | null>(null);
  const [hoveredTcc, setHoveredTcc] = useState<string | null>(null);

  const sortedCountries = Object.entries(COUNTRY_DATA)
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sortedStadiums = [...MLB_STADIUMS].sort((a, b) => a.team.localeCompare(b.team));
  const sortedParks    = [...US_NATIONAL_PARKS].sort((a, b) => a.name.localeCompare(b.name));

  const sortedStates = Object.entries(US_STATE_DATA)
    .map(([fips, info]) => ({ fips, ...info }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sortedProvinces = Object.entries(CA_PROVINCE_DATA)
    .map(([name, info]) => ({ key: name, ...info }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const toggleCountryVisited = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setVisitedCountries(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); setCountryDetail(id, null); }
      else { n.add(id); setBucketCountries(b => { const nb = new Set(b); nb.delete(id); return nb; }); }
      return n;
    });
  }, [setCountryDetail, setBucketCountries]);

  const toggleTccVisited = useCallback((name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isReadOnly) return;
    setTccVisited(prev => {
      const n = new Set(prev);
      if (n.has(name)) { n.delete(name); setTccDetail(name, null); }
      else { n.add(name); setTccBucket(b => { const nb = new Set(b); nb.delete(name); return nb; }); }
      return n;
    });
  }, [isReadOnly, setTccVisited, setTccBucket, setTccDetail]);

  const toggleTccBucket = useCallback((name: string, removeFromVisited: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isReadOnly) return;
    setTccBucket(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name);
      else {
        n.add(name);
        if (removeFromVisited) {
          setTccVisited(v => { const nv = new Set(v); nv.delete(name); return nv; });
          setTccDetail(name, null);
        }
      }
      return n;
    });
  }, [isReadOnly, setTccBucket, setTccVisited, setTccDetail]);

  const handleTccGeoClick = useCallback((entry: TccEntry) => {
    setSelectedTcc(prev => prev?.name === entry.name ? null : entry);
    setConfirmBucket(null);
  }, []);

  const toggleStadiumVisited = useCallback((team: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setVisitedStadiums(prev => {
      const n = new Set(prev);
      if (n.has(team)) { n.delete(team); setStadiumDetail(team, null); }
      else { n.add(team); setBucketStadiums(b => { const nb = new Set(b); nb.delete(team); return nb; }); }
      return n;
    });
  }, [setStadiumDetail, setBucketStadiums]);

  const toggleStateVisited = useCallback((fips: string) => {
    setVisitedStates(prev => {
      const n = new Set(prev);
      if (n.has(fips)) { n.delete(fips); setStateDetail(fips, null); }
      else { n.add(fips); setBucketStates(b => { const nb = new Set(b); nb.delete(fips); return nb; }); }
      return n;
    });
  }, [setStateDetail, setBucketStates]);

  const toggleProvinceVisited = useCallback((name: string) => {
    setVisitedProvinces(prev => {
      const n = new Set(prev);
      if (n.has(name)) { n.delete(name); setProvinceDetail(name, null); }
      else { n.add(name); setBucketProvinces(b => { const nb = new Set(b); nb.delete(name); return nb; }); }
      return n;
    });
  }, [setProvinceDetail, setBucketProvinces]);

  const toggleCountryBucket = useCallback((id: string, isVisited: boolean) => {
    setConfirmBucket(null);
    if (isVisited) {
      setVisitedCountries(prev => { const n = new Set(prev); n.delete(id); return n; });
      setCountryDetail(id, null);
    }
    setBucketCountries(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, [setCountryDetail]);

  const toggleStateBucket = useCallback((fips: string, isVisited: boolean) => {
    setConfirmBucket(null);
    if (isVisited) {
      setVisitedStates(prev => { const n = new Set(prev); n.delete(fips); return n; });
      setStateDetail(fips, null);
    }
    setBucketStates(prev => { const n = new Set(prev); if (n.has(fips)) n.delete(fips); else n.add(fips); return n; });
  }, [setStateDetail]);

  const toggleProvinceBucket = useCallback((name: string, isVisited: boolean) => {
    setConfirmBucket(null);
    if (isVisited) {
      setVisitedProvinces(prev => { const n = new Set(prev); n.delete(name); return n; });
      setProvinceDetail(name, null);
    }
    setBucketProvinces(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }, [setProvinceDetail]);

  const toggleStadiumBucket = useCallback((team: string, isVisited: boolean) => {
    setConfirmBucket(null);
    if (isVisited) {
      setVisitedStadiums(prev => { const n = new Set(prev); n.delete(team); return n; });
      setStadiumDetail(team, null);
    }
    setBucketStadiums(prev => { const n = new Set(prev); if (n.has(team)) n.delete(team); else n.add(team); return n; });
  }, [setStadiumDetail]);

  const toggleParkVisited = useCallback((name: string) => {
    setVisitedParks(prev => {
      const n = new Set(prev);
      if (n.has(name)) { n.delete(name); setParkDetail(name, null); }
      else { n.add(name); setBucketParks(b => { const nb = new Set(b); nb.delete(name); return nb; }); }
      return n;
    });
  }, [setParkDetail, setBucketParks]);

  const toggleParkBucket = useCallback((name: string, isVisited: boolean) => {
    setConfirmBucket(null);
    if (isVisited) {
      setVisitedParks(prev => { const n = new Set(prev); n.delete(name); return n; });
      setParkDetail(name, null);
    }
    setBucketParks(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }, [setParkDetail]);

  const handleParkClick = useCallback((park: NationalParkInfo) => {
    setSelected(null);
    setSelectedTcc(null);
    setConfirmBucket(null);
    setSelectedPark(prev => prev?.name === park.name ? null : park);
  }, []);

  const showToast = useCallback((message: string, kind: "success" | "warning") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Debounced server sync — runs 3s after any data change when logged in
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const notesByKey: Record<string, string> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith("shortnote:")) notesByKey[k] = localStorage.getItem(k) ?? "";
        }
      } catch {}
      const payload = {
        visitedCountries: [...rawVisitedCountries],
        visitedStates: [...rawVisitedStates],
        visitedProvinces: [...rawVisitedProvinces],
        visitedStadiums: [...rawVisitedStadiums],
        visitedParks: [...rawVisitedParks],
        tccVisited: [...rawTccVisited],
        bucketCountries: [...rawBucketCountries],
        bucketStates: [...rawBucketStates],
        bucketProvinces: [...rawBucketProvinces],
        bucketStadiums: [...rawBucketStadiums],
        bucketParks: [...rawBucketParks],
        tccBucket: [...rawTccBucket],
        countryDetails,
        stateDetails,
        provinceDetails,
        stadiumDetails,
        parkDetails,
        tccDetails,
        notesByKey,
        profileName: localStorage.getItem("wm_profile_name") ?? undefined,
      };
      fetch("/api/map-data", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 3000);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [
    isAuthenticated,
    rawVisitedCountries, rawVisitedStates, rawVisitedProvinces, rawVisitedStadiums, rawVisitedParks, rawTccVisited,
    rawBucketCountries, rawBucketStates, rawBucketProvinces, rawBucketStadiums, rawBucketParks, rawTccBucket,
    countryDetails, stateDetails, provinceDetails, stadiumDetails, parkDetails, tccDetails,
    notesIndex,
  ]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const rows = parseExcelRows(wb);
        if (rows.length === 0) {
          showToast("No data rows found in the file.", "warning");
          return;
        }
        const lookups = buildLookupMaps();
        const result = processImport(
          rows, lookups,
          setVisitedCountries, setVisitedStates, setVisitedProvinces, setVisitedStadiums,
          setCountryDetail, setStateDetail, setProvinceDetail, setStadiumDetail,
        );
        if (result.unmatched.length > 0) {
          showToast(
            `Imported ${result.matched} location${result.matched !== 1 ? "s" : ""} successfully. ` +
            `${result.unmatched.length} couldn't be matched — check spelling: ${result.unmatched.slice(0, 3).join(", ")}${result.unmatched.length > 3 ? "…" : ""}`,
            "warning",
          );
        } else {
          showToast(`Imported ${result.matched} location${result.matched !== 1 ? "s" : ""} successfully`, "success");
        }
      } catch {
        showToast("Failed to read the file. Make sure it's a valid .xlsx file.", "warning");
      }
    };
    reader.readAsArrayBuffer(file);
  }, [setVisitedCountries, setVisitedStates, setVisitedProvinces, setVisitedStadiums,
      setCountryDetail, setStateDetail, setProvinceDetail, setStadiumDetail, showToast]);

  const handleCountryClick = useCallback((geo: { id: string }) => {
    const code = geo.id;
    const info = COUNTRY_DATA[code];
    setSelectedStadium(null);
    setConfirmBucket(null);
    if (!info) { setSelected(null); return; }
    const key = `country-${code}`;
    setSelected(prev => prev?.key === key ? null : { key, info });
  }, []);

  const handleStateClick = useCallback((geo: { id: string }) => {
    const fips = String(geo.id).padStart(2, "0");
    const info = US_STATE_DATA[fips];
    setSelectedStadium(null);
    setConfirmBucket(null);
    if (!info) return;
    const key = `state-${fips}`;
    setSelected(prev => prev?.key === key ? null : { key, info });
  }, []);

  const handleProvinceClick = useCallback((geo: { properties: Record<string, string> }) => {
    const name = geo.properties.name || geo.properties.NAME_1 || geo.properties.NAME;
    const info = CA_PROVINCE_DATA[name];
    setSelectedStadium(null);
    setConfirmBucket(null);
    if (!info) return;
    const key = `province-${name}`;
    setSelected(prev => prev?.key === key ? null : { key, info });
  }, []);

  const handleStadiumClick = useCallback((stadium: StadiumInfo) => {
    setSelected(null);
    setConfirmBucket(null);
    setSelectedStadium(prev => prev?.team === stadium.team ? null : stadium);
  }, []);

  const handleMicrostateClick = useCallback((id: string) => {
    const info = COUNTRY_DATA[id];
    if (!info) return;
    setSelectedStadium(null);
    setConfirmBucket(null);
    const key = `country-${id}`;
    setSelected(prev => prev?.key === key ? null : { key, info });
  }, []);

  const handleSearchSelect = useCallback((item: SearchItem) => {
    setCenter(item.coordinates);
    setZoom(item.zoom);
    if (item.category === "country") {
      const info = COUNTRY_DATA[item.id];
      if (info) {
        setSelectedStadium(null);
        setVisitedCountries(prev => { const n = new Set(prev); n.add(item.id); return n; });
        setSelected({ key: `country-${item.id}`, info });
      }
    } else if (item.category === "us-state") {
      const info = US_STATE_DATA[item.id];
      if (info) {
        setSelectedStadium(null);
        setVisitedStates(prev => { const n = new Set(prev); n.add(item.id); return n; });
        setSelected({ key: `state-${item.id}`, info });
      }
    } else if (item.category === "ca-province") {
      const info = CA_PROVINCE_DATA[item.id];
      if (info) {
        setSelectedStadium(null);
        setVisitedProvinces(prev => { const n = new Set(prev); n.add(item.id); return n; });
        setSelected({ key: `province-${item.id}`, info });
      }
    } else if (item.category === "stadium") {
      const stadium = MLB_STADIUMS.find(s => s.team === item.id);
      if (stadium) {
        setSelected(null);
        setVisitedStadiums(prev => { const n = new Set(prev); n.add(stadium.team); return n; });
        setSelectedStadium(stadium);
      }
    }
  }, [setVisitedCountries, setVisitedStates, setVisitedProvinces, setVisitedStadiums]);

  const handleMouseEnter = useCallback((name: string, evt: React.MouseEvent) => {
    setHovered(name);
    setTooltipName(name);
    setTooltipPos({ x: evt.clientX, y: evt.clientY });
  }, []);

  const handleMouseMove = useCallback((evt: React.MouseEvent) => {
    setTooltipPos({ x: evt.clientX, y: evt.clientY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setTooltipName("");
  }, []);

  const regionTypeLabel = (type: RegionInfo["regionType"]) => {
    if (type === "us-state") return "U.S. State";
    if (type === "ca-province") return "Canadian Province / Territory";
    return selected?.info.continent ?? "Country";
  };

  const badgeColor = (info: RegionInfo) => {
    if (info.regionType === "us-state") return US_STATE_COLOR;
    if (info.regionType === "ca-province") return CA_PROVINCE_COLOR;
    return CONTINENT_COLORS[info.continent ?? ""] ?? "#64748b";
  };

  return (
    <div className="flex flex-col bg-slate-950 text-white">
      {isReadOnly && (
        <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-blue-950/80 border-b border-blue-800/60 text-sm">
          <div className="flex items-center gap-2 text-blue-200">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1a6.5 6.5 0 100 13A6.5 6.5 0 007.5 1zM7.5 4.5v4M7.5 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span>You're viewing a <span className="font-semibold">shared travel map</span> — read-only</span>
          </div>
          <button
            onClick={() => { window.location.href = window.location.pathname; }}
            className="px-3 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            Open My Map →
          </button>
        </div>
      )}

      {mapMode === "tcc" && tccVisited.size >= TCC_MEMBERSHIP_THRESHOLD && (
        <div className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-900/80 via-fuchsia-900/80 to-purple-900/80 border-b border-purple-700/60 text-sm">
          <span className="text-2xl leading-none">🏆</span>
          <span className="text-purple-100 font-semibold">
            You qualify for TCC membership!
          </span>
          <span className="text-purple-300/80">
            {tccVisited.size} / {TCC_TOTAL} countries &amp; territories visited
          </span>
        </div>
      )}

      <header className="flex items-center gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm flex-wrap relative z-10">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-white">World Map</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {mapMode === "tcc"
              ? "Track your progress toward Travelers' Century Club membership"
              : "Click any country, U.S. state, Canadian province, or MLB stadium to explore"}
          </p>
        </div>

        {/* Map mode switcher */}
        <div className="flex items-center gap-0.5 bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
          <button
            onClick={() => {
              setMapMode("world");
              setSelectedTcc(null);
              if (listTab === "tcc") setListTab("countries");
            }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              mapMode === "world"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-700/60"
            }`}
            title="Show countries, US states, Canadian provinces and MLB stadiums"
          >
            🌍 World
          </button>
          <button
            onClick={() => {
              setMapMode("tcc");
              setSelected(null);
              setSelectedStadium(null);
              setListTab("tcc");
            }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              mapMode === "tcc"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-700/60"
            }`}
            title="Travelers' Century Club: 330 countries & territories"
          >
            ✈️ TCC
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              mapMode === "tcc" ? "bg-purple-800/80 text-purple-100" : "bg-slate-900 text-slate-400"
            }`}>{tccVisited.size}/{TCC_TOTAL}</span>
          </button>
        </div>

        <SearchBar onSelect={handleSearchSelect} />
        <div className="flex gap-2 flex-wrap justify-end ml-auto">
          <button onClick={() => setZoom(z => Math.min(z * 1.5, 12))} className="px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors font-medium">+</button>
          <button onClick={() => setZoom(z => Math.max(z / 1.5, 0.5))} className="px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors font-medium">−</button>
          <button onClick={() => { setZoom(1); setCenter([0, 20]); setSelected(null); setSelectedStadium(null); }} className="px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors font-medium">Reset</button>
          <button
            onClick={() => setFilterExpanded(v => !v)}
            className={`px-3 py-2 text-sm rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
              yearFilter.enabled
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
            title="Filter map by year"
          >
            📅 {yearFilter.enabled
              ? (yearFilter.mode === "snapshot" ? `As of ${yearFilter.snapshot}` : `${yearFilter.min}–${yearFilter.max}`)
              : "Filter by Year"}
          </button>
          <div className="w-px bg-slate-700 self-stretch mx-1" />
          {!isReadOnly && <>
            <button
              onClick={downloadTemplate}
              className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-medium text-white flex items-center gap-1.5"
              title="Download a blank .xlsx template"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 9.5v1.5a1 1 0 001 1h8a1 1 0 001-1V9.5M6.5 1v7M3.5 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Template
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors font-medium text-white flex items-center gap-1.5"
              title="Import visited locations from an .xlsx file"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 9V2M3.5 5l3-3 3 3M1 9.5v1A1.5 1.5 0 002.5 12h8A1.5 1.5 0 0012 10.5v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Import Excel
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors font-medium text-white flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M3.5 5l3 3 3-3M1 9.5v1A1.5 1.5 0 002.5 12h8A1.5 1.5 0 0012 10.5v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export
            </button>
          </>}
          <button
            onClick={() => setShowStats(true)}
            className="px-3 py-2 text-sm bg-fuchsia-700 hover:bg-fuchsia-600 rounded-lg transition-colors font-medium text-white flex items-center gap-1.5"
            title="View travel statistics dashboard"
          >
            📊 Stats
          </button>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-2 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors font-medium text-white flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="10.5" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="10.5" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="2.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6l5-3M4 7l5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Share
          </button>
          <div className="w-px bg-slate-700 self-stretch" />
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              {authUser?.profileImageUrl ? (
                <img src={authUser.profileImageUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-600" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-300 border border-slate-600">
                  {authUser?.firstName?.[0]?.toUpperCase() ?? authUser?.id?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <button
                onClick={onLogout}
                className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-medium text-slate-300 hover:text-white"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-medium text-slate-300 hover:text-white flex items-center gap-1.5"
              title="Sign in to save your travel data to the cloud"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1H11a1 1 0 011 1v9a1 1 0 01-1 1H8.5M5.5 9.5l3-3-3-3M8.5 6.5H1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Sign in
            </button>
          )}
        </div>
      </header>

      {filterExpanded && (
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center gap-4 flex-wrap relative z-10">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={yearFilter.enabled}
              onChange={e => setYearFilter(p => ({ ...p, enabled: e.target.checked }))}
              className="w-4 h-4 accent-amber-500"
            />
            <span>Enable year filter</span>
          </label>
          <div className="flex items-center gap-0.5 bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => { setYearFilter(p => ({ ...p, mode: "range" })); setFilterPlaying(false); }}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${yearFilter.mode === "range" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"}`}
            >Range</button>
            <button
              onClick={() => setYearFilter(p => ({ ...p, mode: "snapshot" }))}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${yearFilter.mode === "snapshot" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"}`}
            >Snapshot</button>
          </div>
          <div className="flex-1 min-w-[280px] flex flex-col gap-1">
            <div className="text-xs text-amber-300 font-mono">
              {yearFilter.mode === "snapshot" ? `As of ${yearFilter.snapshot}` : `${yearFilter.min} – ${yearFilter.max}`}
              <span className="text-slate-500 ml-2">({earliestYear} – {CURRENT_YEAR})</span>
            </div>
            {yearFilter.mode === "range" ? (
              <div className="flex flex-col gap-1">
                <div className="flex gap-3 items-center">
                  <span className="text-[10px] text-slate-400 w-8 text-right">From</span>
                  <input
                    type="range"
                    min={earliestYear}
                    max={CURRENT_YEAR}
                    value={yearFilter.min}
                    onChange={e => setYearFilter(p => ({ ...p, min: Math.min(Number(e.target.value), p.max) }))}
                    disabled={!yearFilter.enabled}
                    className="flex-1 accent-amber-500 disabled:opacity-40"
                  />
                  <span className="text-xs text-slate-300 font-mono w-10">{yearFilter.min}</span>
                </div>
                <div className="flex gap-3 items-center">
                  <span className="text-[10px] text-slate-400 w-8 text-right">To</span>
                  <input
                    type="range"
                    min={earliestYear}
                    max={CURRENT_YEAR}
                    value={yearFilter.max}
                    onChange={e => setYearFilter(p => ({ ...p, max: Math.max(Number(e.target.value), p.min) }))}
                    disabled={!yearFilter.enabled}
                    className="flex-1 accent-amber-500 disabled:opacity-40"
                  />
                  <span className="text-xs text-slate-300 font-mono w-10">{yearFilter.max}</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 items-center">
                <span className="text-xs text-slate-500 w-10 text-right">{earliestYear}</span>
                <input
                  type="range"
                  min={earliestYear}
                  max={CURRENT_YEAR}
                  value={yearFilter.snapshot}
                  onChange={e => setYearFilter(p => ({ ...p, snapshot: Number(e.target.value) }))}
                  disabled={!yearFilter.enabled}
                  className="flex-1 accent-amber-500 disabled:opacity-40"
                />
                <span className="text-xs text-slate-500 w-10">{CURRENT_YEAR}</span>
              </div>
            )}
          </div>
          {yearFilter.mode === "snapshot" && (
            <button
              onClick={() => setFilterPlaying(p => !p)}
              disabled={!yearFilter.enabled}
              className="px-3 py-1.5 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              title="Auto-advance the snapshot year"
            >
              {filterPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
          )}
          <button
            onClick={() => {
              setFilterPlaying(false);
              setYearFilter({ enabled: false, mode: "range", min: earliestYear, max: CURRENT_YEAR, snapshot: CURRENT_YEAR });
            }}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => setFilterExpanded(false)}
            className="px-2 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            title="Hide filter bar"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex overflow-hidden" style={{ height: "calc(100vh - 72px - 260px)", minHeight: "400px" }}>
        <div className="flex-1 relative overflow-hidden bg-slate-950">
          <ComposableMap
            projection="geoMercator"
            style={{ width: "100%", height: "100%" }}
            projectionConfig={{ scale: 130, center: [0, 20] }}
          >
            <ZoomableGroup zoom={zoom} center={center} onMoveEnd={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>
              {mapMode === "tcc" && (
                <>
                  {/* TCC: world geographies tinted by region — skip USA (840); handled by states layer */}
                  <Geographies geography={WORLD_URL}>
                    {({ geographies }) =>
                      geographies.filter(geo => String(geo.id) !== "840").map((geo) => {
                        const tcc = TCC_BY_GEO_ID.get(String(geo.id));
                        const tccName = tcc?.name;
                        const isSelected = !!tccName && selectedTcc?.name === tccName;
                        const isVisited = !!tccName && tccVisited.has(tccName);
                        const isBucketList = !!tccName && !isVisited && tccBucket.has(tccName);
                        const isHov = !!tccName && hoveredTcc === tccName;
                        const region = tcc ? TCC_REGIONS[tcc.region] : null;
                        const baseFill = region
                          ? (isVisited ? region.color : (isBucketList ? BUCKET_LIST_COLOR : region.fillUnvisited))
                          : "#1f2937";
                        const fill = isSelected ? SELECTED_COLOR : (isHov && tcc ? region!.color : baseFill);
                        const stroke = isBucketList ? BUCKET_LIST_STROKE : (tcc ? "#0f172a" : "#1e293b");
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onClick={() => { if (tcc) handleTccGeoClick(tcc); }}
                            onMouseEnter={(evt) => { if (tccName) { setHoveredTcc(tccName); setTooltipName(tccName); setTooltipPos({ x: evt.clientX, y: evt.clientY }); } }}
                            onMouseMove={(evt) => setTooltipPos({ x: evt.clientX, y: evt.clientY })}
                            onMouseLeave={() => { setHoveredTcc(null); setTooltipName(""); }}
                            style={{
                              default: { fill, stroke, strokeWidth: isBucketList ? 0.9 : (tcc ? 0.5 : 0.3), strokeDasharray: isBucketList ? "3 2" : undefined, outline: "none", cursor: tcc ? "pointer" : "default", transition: "fill 0.15s" },
                              hover:   { fill: isSelected ? SELECTED_COLOR : (region ? region.color : "#1f2937"), stroke: isBucketList ? BUCKET_LIST_STROKE : (tcc ? "#334155" : "#1e293b"), strokeWidth: isBucketList ? 1 : (tcc ? 0.7 : 0.3), outline: "none", cursor: tcc ? "pointer" : "default" },
                              pressed: { fill: SELECTED_COLOR, outline: "none" },
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>

                  {/* TCC: marker dots for entries without a geoId (small islands etc.)
                      — exclude US State entries since they are rendered as polygons below */}
                  {TCC_DATA.filter(e => e.lng !== undefined && e.lat !== undefined && !TCC_US_STATE_ENTRIES.has(e.name)).map((entry) => {
                    const isSelected = selectedTcc?.name === entry.name;
                    const isVisited = tccVisited.has(entry.name);
                    const isBucketList = !isVisited && tccBucket.has(entry.name);
                    const isHov = hoveredTcc === entry.name;
                    const region = TCC_REGIONS[entry.region];
                    const s = 1 / zoom;
                    const dotFill = isSelected ? SELECTED_COLOR : isVisited ? region.color : isBucketList ? BUCKET_LIST_COLOR : region.fillUnvisited;
                    const ringColor = isSelected ? "#f59e0b" : isVisited ? region.color : isBucketList ? BUCKET_LIST_STROKE : region.color;
                    return (
                      <Marker key={`tcc-${entry.name}`} coordinates={[entry.lng!, entry.lat!]}>
                        <g
                          transform={`scale(${s})`}
                          style={{ cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); handleTccGeoClick(entry); }}
                          onMouseEnter={(e) => { setHoveredTcc(entry.name); setTooltipName(entry.name); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => { setHoveredTcc(null); setTooltipName(""); }}
                        >
                          <circle r={isHov || isSelected ? 5 : 3.5} fill={ringColor} opacity={0.4} />
                          <circle r={isHov || isSelected ? 3 : 2.2} fill={dotFill} stroke={ringColor} strokeWidth={1} />
                        </g>
                      </Marker>
                    );
                  })}

                  {/* TCC: US States layer — splits the USA into three independent TCC entries:
                      "United States (Contiguous)", "Alaska", and "Hawaiian Islands" */}
                  <Geographies geography={US_STATES_URL}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const fips = String(geo.id).padStart(2, "0");
                        const tccName = FIPS_TO_TCC_NAME[fips] ?? "United States (Contiguous)";
                        const tccEntry = TCC_BY_NAME.get(tccName);
                        if (!tccEntry) return null;
                        const isSelected = selectedTcc?.name === tccName;
                        const isVisited = tccVisited.has(tccName);
                        const isBucketList = !isVisited && tccBucket.has(tccName);
                        const isHov = hoveredTcc === tccName;
                        const region = TCC_REGIONS[tccEntry.region];
                        const baseFill = isVisited ? region.color : isBucketList ? BUCKET_LIST_COLOR : region.fillUnvisited;
                        const fill = isSelected ? SELECTED_COLOR : (isHov ? region.color : baseFill);
                        const stroke = isBucketList ? BUCKET_LIST_STROKE : "#0f172a";
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onClick={() => handleTccGeoClick(tccEntry)}
                            onMouseEnter={(evt) => { setHoveredTcc(tccName); setTooltipName(tccName); setTooltipPos({ x: evt.clientX, y: evt.clientY }); }}
                            onMouseMove={(evt) => setTooltipPos({ x: evt.clientX, y: evt.clientY })}
                            onMouseLeave={() => { setHoveredTcc(null); setTooltipName(""); }}
                            style={{
                              default: { fill, stroke, strokeWidth: isBucketList ? 0.9 : 0.4, strokeDasharray: isBucketList ? "3 2" : undefined, outline: "none", cursor: "pointer", transition: "fill 0.15s" },
                              hover:   { fill: isSelected ? SELECTED_COLOR : region.color, stroke: isBucketList ? BUCKET_LIST_STROKE : "#334155", strokeWidth: isBucketList ? 1 : 0.6, outline: "none", cursor: "pointer" },
                              pressed: { fill: SELECTED_COLOR, outline: "none" },
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                </>
              )}

              {mapMode === "world" && (<>
              {/* World countries — excluding US (840) and Canada (124) */}
              <Geographies geography={WORLD_URL}>
                {({ geographies }) =>
                  geographies
                    .filter(geo => geo.id !== "840" && geo.id !== "124")
                    .map((geo) => {
                      const key = `country-${geo.id}`;
                      const isSelected = selected?.key === key;
                      const isVisited = visitedCountries.has(geo.id);
                      const isBucketList = !isVisited && bucketCountries.has(geo.id);
                      const countryName = COUNTRY_DATA[geo.id]?.name ?? "";
                      const isHovered = hovered === countryName;
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onClick={() => handleCountryClick(geo)}
                          onMouseEnter={(evt) => handleMouseEnter(countryName || "Unknown territory", evt)}
                          onMouseMove={handleMouseMove}
                          onMouseLeave={handleMouseLeave}
                          style={{
                            default: { fill: getCountryFill(geo.id, isSelected, false, isVisited, isBucketList), stroke: isBucketList ? BUCKET_LIST_STROKE : "#1e293b", strokeWidth: isBucketList ? 0.8 : 0.5, strokeDasharray: isBucketList ? "3 2" : undefined, outline: "none", cursor: "pointer", transition: "fill 0.15s" },
                            hover: { fill: getCountryFill(geo.id, isSelected, true, isVisited, isBucketList), stroke: isBucketList ? BUCKET_LIST_STROKE : "#334155", strokeWidth: isBucketList ? 1 : 0.7, outline: "none", cursor: "pointer" },
                            pressed: { fill: SELECTED_COLOR, outline: "none" },
                          }}
                        />
                      );
                    })
                }
              </Geographies>

              {/* US States */}
              <Geographies geography={US_STATES_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const fips = String(geo.id).padStart(2, "0");
                    const key = `state-${fips}`;
                    const isSelected = selected?.key === key;
                    const isVisited = visitedStates.has(fips);
                    const isBucketList = !isVisited && bucketStates.has(fips);
                    const stateName = US_STATE_DATA[fips]?.name ?? "Unknown State";
                    const isHovered = hovered === stateName;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => handleStateClick(geo)}
                        onMouseEnter={(evt) => handleMouseEnter(stateName, evt)}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        style={{
                          default: { fill: getStateFill(isSelected, false, isVisited, isBucketList), stroke: isBucketList ? BUCKET_LIST_STROKE : "#1e293b", strokeWidth: isBucketList ? 0.8 : 0.4, strokeDasharray: isBucketList ? "3 2" : undefined, outline: "none", cursor: "pointer", transition: "fill 0.15s" },
                          hover: { fill: getStateFill(isSelected, true, isVisited, isBucketList), stroke: isBucketList ? BUCKET_LIST_STROKE : "#334155", strokeWidth: isBucketList ? 1 : 0.6, outline: "none", cursor: "pointer" },
                          pressed: { fill: SELECTED_COLOR, outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>

              {/* Canadian Provinces */}
              <Geographies geography={CA_PROVINCES_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const name = geo.properties.name || geo.properties.NAME_1 || geo.properties.NAME || "";
                    const key = `province-${name}`;
                    const isSelected = selected?.key === key;
                    const isVisited = visitedProvinces.has(name);
                    const isBucketList = !isVisited && bucketProvinces.has(name);
                    const isHovered = hovered === name;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => handleProvinceClick(geo)}
                        onMouseEnter={(evt) => handleMouseEnter(name || "Canadian Province", evt)}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        style={{
                          default: { fill: getProvinceFill(isSelected, false, isVisited, isBucketList), stroke: isBucketList ? BUCKET_LIST_STROKE : "#1e293b", strokeWidth: isBucketList ? 0.8 : 0.4, strokeDasharray: isBucketList ? "3 2" : undefined, outline: "none", cursor: "pointer", transition: "fill 0.15s" },
                          hover: { fill: getProvinceFill(isSelected, true, isVisited, isBucketList), stroke: isBucketList ? BUCKET_LIST_STROKE : "#334155", strokeWidth: isBucketList ? 1 : 0.6, outline: "none", cursor: "pointer" },
                          pressed: { fill: SELECTED_COLOR, outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
              {/* Microstate Dot Markers */}
              {MICROSTATE_MARKERS.map(({ id, coordinates }) => {
                const info = COUNTRY_DATA[id];
                if (!info) return null;
                const isSelected = selected?.key === `country-${id}`;
                const isVisited = visitedCountries.has(id);
                const isBucketList = !isVisited && bucketCountries.has(id);
                const isHov = hovered === info.name;
                const s = 1 / zoom;
                const continentColor = (CONTINENT_COLORS as Record<string, string>)[info.continent ?? ""] ?? "#94a3b8";
                const fillColor = isSelected ? SELECTED_COLOR : isVisited ? continentColor : isBucketList ? BUCKET_LIST_COLOR : (isHov ? "#475569" : "#334155");
                const ringColor = isSelected ? "#f59e0b" : isVisited ? continentColor : isBucketList ? BUCKET_LIST_STROKE : "#475569";
                return (
                  <Marker key={id} coordinates={coordinates}>
                    <g
                      transform={`scale(${s})`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); handleMicrostateClick(id); }}
                      onMouseEnter={(e) => handleMouseEnter(info.name, e)}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    >
                      <circle r={isHov || isSelected ? 5 : 4} fill={ringColor} opacity={0.35} />
                      <circle r={isHov || isSelected ? 3 : 2.5} fill={fillColor} stroke={ringColor} strokeWidth={1} />
                    </g>
                  </Marker>
                );
              })}

              {/* MLB Stadium Markers */}
              {MLB_STADIUMS.map((stadium) => {
                const isSelected = selectedStadium?.team === stadium.team;
                const isHov = hoveredStadium === stadium.team;
                const isVisited = visitedStadiums.has(stadium.team);
                const isBucketList = !isVisited && bucketStadiums.has(stadium.team);
                const s = 1 / zoom;
                const poleColor = isSelected ? "#facc15" : isVisited ? "#93c5fd" : isBucketList ? BUCKET_LIST_STROKE : "#64748b";
                const flagColor = isSelected ? "#facc15" : isVisited ? (isHov ? "#60a5fa" : "#2563eb") : isBucketList ? "none" : (isHov ? "#64748b" : "#374151");
                const flagStroke = isSelected ? "#f59e0b" : isVisited ? "#1d4ed8" : isBucketList ? BUCKET_LIST_STROKE : "#1f2937";
                const dotColor = isSelected ? "#facc15" : isVisited ? "#2563eb" : isBucketList ? BUCKET_LIST_COLOR : "#374151";
                return (
                  <Marker key={stadium.team} coordinates={stadium.coordinates}>
                    <g
                      transform={`scale(${s})`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); handleStadiumClick(stadium); }}
                      onMouseEnter={(e) => { setHoveredStadium(stadium.team); setTooltipName(stadium.team); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => { setHoveredStadium(null); setTooltipName(""); }}
                    >
                      <line x1="0" y1="0" x2="0" y2="-20" stroke={poleColor} strokeWidth={isHov || isSelected ? 2 : 1.5} />
                      <polygon points="0,-20 12,-16 0,-12" fill={flagColor} stroke={flagStroke} strokeWidth={isBucketList ? 1 : 0.5} />
                      <circle r={isHov || isSelected ? 3.5 : 2.5} fill={dotColor} stroke="#0f172a" strokeWidth="0.8" />
                    </g>
                  </Marker>
                );
              })}

              {/* National Park Markers */}
              {US_NATIONAL_PARKS.map((park) => {
                const isSelected = selectedPark?.name === park.name;
                const isHov = hoveredPark === park.name;
                const isVisited = visitedParks.has(park.name);
                const isBucketList = !isVisited && bucketParks.has(park.name);
                const s = 1 / zoom;
                const poleColor = isSelected ? "#facc15" : isVisited ? "#86efac" : isBucketList ? BUCKET_LIST_STROKE : "#64748b";
                const flagColor = isSelected ? "#facc15" : isVisited ? (isHov ? "#15803d" : "#16a34a") : isBucketList ? "none" : (isHov ? "#64748b" : "#374151");
                const flagStroke = isSelected ? "#f59e0b" : isVisited ? "#14532d" : isBucketList ? BUCKET_LIST_STROKE : "#1f2937";
                const dotColor = isSelected ? "#facc15" : isVisited ? "#16a34a" : isBucketList ? BUCKET_LIST_COLOR : "#374151";
                return (
                  <Marker key={park.name} coordinates={park.coordinates}>
                    <g
                      transform={`scale(${s})`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); handleParkClick(park); }}
                      onMouseEnter={(e) => { setHoveredPark(park.name); setTooltipName(park.name); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => { setHoveredPark(null); setTooltipName(""); }}
                    >
                      <line x1="0" y1="0" x2="0" y2="-20" stroke={poleColor} strokeWidth={isHov || isSelected ? 2 : 1.5} />
                      <polygon points="0,-20 12,-16 0,-12" fill={flagColor} stroke={flagStroke} strokeWidth={isBucketList ? 1 : 0.5} />
                      <circle r={isHov || isSelected ? 3.5 : 2.5} fill={dotColor} stroke="#0f172a" strokeWidth="0.8" />
                    </g>
                  </Marker>
                );
              })}
              </>)}
            </ZoomableGroup>
          </ComposableMap>

          {/* Tooltip */}
          {(hovered || hoveredStadium || hoveredPark) && tooltipName && (
            <div
              className="fixed z-50 pointer-events-none bg-slate-800 text-white text-sm px-3 py-1.5 rounded-lg shadow-xl border border-slate-600 font-medium whitespace-nowrap"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 36 }}
            >
              {tooltipName}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 border-l border-slate-800 bg-slate-900 flex flex-col overflow-y-auto">
          {selectedTcc ? (
            <div className="p-6 flex-1">
              <button onClick={() => setSelectedTcc(null)} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors">
                ← Back
              </button>
              {(() => {
                const region = TCC_REGIONS[selectedTcc.region];
                const isVisited = tccVisited.has(selectedTcc.name);
                const isBucketList = !isVisited && tccBucket.has(selectedTcc.name);
                const confirmKey = `tcc-${selectedTcc.name}`;
                return (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-3 text-white" style={{ backgroundColor: region.color }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                      {region.name}
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">{selectedTcc.name}</h2>
                    <p className="text-slate-400 text-sm mb-5">Travelers' Century Club entry</p>

                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                        <span className="text-xl">🌐</span>
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">TCC Region</p>
                          <p className="text-sm font-medium text-white mt-0.5">{region.name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                        {(() => {
                          const hasPolygon = !!(selectedTcc.geoId || TCC_US_STATE_ENTRIES.has(selectedTcc.name));
                          return (
                            <>
                              <span className="text-xl">{hasPolygon ? "🗺" : "📍"}</span>
                              <div>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Map Location</p>
                                <p className="text-sm font-medium text-white mt-0.5">
                                  {hasPolygon ? "Highlighted on the TCC map" : "Marker dot on the TCC map"}
                                </p>
                                {TCC_US_STATE_ENTRIES.has(selectedTcc.name) && selectedTcc.name !== "United States (Contiguous)" && (
                                  <p className="text-xs text-slate-400 mt-1">Independent TCC entry — separate from United States (Contiguous)</p>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                        <span className="text-xl">🏆</span>
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">TCC Membership</p>
                          <p className="text-sm font-medium text-white mt-0.5">
                            {tccVisited.size} / {TCC_TOTAL} visited
                            {tccVisited.size >= TCC_MEMBERSHIP_THRESHOLD
                              ? " — qualified ✓"
                              : ` — ${TCC_MEMBERSHIP_THRESHOLD - tccVisited.size} to go`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {!isReadOnly && (
                      <>
                        <div className="flex gap-2 mt-5 pt-5 border-t border-slate-800">
                          <button
                            onClick={() => { toggleTccVisited(selectedTcc.name); setConfirmBucket(null); }}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isVisited ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                          >
                            <span>{isVisited ? "✓" : "○"}</span>{isVisited ? "Visited" : "Mark Visited"}
                          </button>
                          <button
                            onClick={() => { if (!isBucketList && isVisited) { setConfirmBucket(confirmKey); } else { toggleTccBucket(selectedTcc.name, false); } }}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isBucketList ? "bg-amber-700 hover:bg-amber-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                          >
                            <span>★</span>{isBucketList ? "On Bucket List" : "Bucket List"}
                          </button>
                        </div>
                        {confirmBucket === confirmKey && (
                          <div className="mt-2 p-3 bg-amber-900/40 border border-amber-700/60 rounded-lg text-sm">
                            <p className="text-amber-200 mb-2">Remove from visited and add to bucket list?</p>
                            <div className="flex gap-2">
                              <button onClick={() => toggleTccBucket(selectedTcc.name, true)} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium">Confirm</button>
                              <button onClick={() => setConfirmBucket(null)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium">Cancel</button>
                            </div>
                          </div>
                        )}
                        {isVisited && <VisitDetailsPanel locationId={selectedTcc.name} category="tcc" isReadOnly={isReadOnly} details={tccDetails[selectedTcc.name]} onUpdate={setTccDetail} />}
                      </>
                    )}
                    <NoteField category="tcc" locationId={selectedTcc.name} isReadOnly={isReadOnly} readOnlyValue={getReadOnlyNote("tcc", selectedTcc.name)} onSaved={handleNoteSaved} />
                  </>
                );
              })()}
            </div>
          ) : selectedPark ? (
            <div className="p-6 flex-1">
              <button onClick={() => setSelectedPark(null)} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors">
                ← Back
              </button>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-3 text-white bg-green-700">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <line x1="5" y1="10" x2="5" y2="2" stroke="white" strokeWidth="1.5"/>
                  <polygon points="5,2 10,4 5,6" fill="white"/>
                </svg>
                National Park
              </div>
              <h2 className="text-xl font-bold text-white mb-0.5">{selectedPark.name}</h2>
              <p className="text-slate-400 text-sm mb-5">{selectedPark.state}</p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">📍</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">State(s)</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selectedPark.state}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">📅</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Established</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selectedPark.established}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">🌲</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Area</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selectedPark.area}</p>
                  </div>
                </div>
              </div>

              {!isReadOnly && (() => {
                const name = selectedPark.name;
                const isVisited = visitedParks.has(name);
                const isBucketList = !isVisited && bucketParks.has(name);
                const confirmKey = `park-${name}`;
                return (
                  <>
                    <div className="flex gap-2 mt-5 pt-5 border-t border-slate-800">
                      <button
                        onClick={() => { toggleParkVisited(name); setConfirmBucket(null); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isVisited ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                      >
                        <span>{isVisited ? "✓" : "○"}</span>{isVisited ? "Visited" : "Mark Visited"}
                      </button>
                      <button
                        onClick={() => { if (!isBucketList && isVisited) { setConfirmBucket(confirmKey); } else { toggleParkBucket(name, false); } }}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isBucketList ? "bg-amber-700 hover:bg-amber-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                      >
                        <span>★</span>{isBucketList ? "On Bucket List" : "Bucket List"}
                      </button>
                    </div>
                    {confirmBucket === confirmKey && (
                      <div className="mt-2 p-3 bg-amber-900/40 border border-amber-700/60 rounded-lg text-sm">
                        <p className="text-amber-200 mb-2">Remove from visited and add to bucket list?</p>
                        <div className="flex gap-2">
                          <button onClick={() => toggleParkBucket(name, true)} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium">Confirm</button>
                          <button onClick={() => setConfirmBucket(null)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium">Cancel</button>
                        </div>
                      </div>
                    )}
                    {isVisited && <VisitDetailsPanel locationId={name} category="park" isReadOnly={isReadOnly} details={parkDetails[name]} onUpdate={setParkDetail} />}
                  </>
                );
              })()}

              <NoteField category="park" locationId={selectedPark.name} isReadOnly={isReadOnly} readOnlyValue={getReadOnlyNote("park", selectedPark.name)} onSaved={handleNoteSaved} />
            </div>
          ) : selectedStadium ? (
            <div className="p-6 flex-1">
              <button onClick={() => setSelectedStadium(null)} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors">
                ← Back
              </button>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-3 text-white bg-blue-700">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <line x1="5" y1="10" x2="5" y2="2" stroke="white" strokeWidth="1.5"/>
                  <polygon points="5,2 10,4 5,6" fill="white"/>
                </svg>
                MLB Stadium
              </div>
              <h2 className="text-xl font-bold text-white mb-0.5">{selectedStadium.team}</h2>
              <p className="text-slate-400 text-sm mb-5">{selectedStadium.city}</p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">🏟️</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Stadium</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selectedStadium.stadium}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">⚾</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Division</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selectedStadium.division}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">💺</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Capacity</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selectedStadium.capacity} seats</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">📍</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Location</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selectedStadium.city}</p>
                  </div>
                </div>
              </div>

              {!isReadOnly && (() => {
                const team = selectedStadium.team;
                const isVisited = visitedStadiums.has(team);
                const isBucketList = !isVisited && bucketStadiums.has(team);
                const confirmKey = `stadium-${team}`;
                return (
                  <>
                    <div className="flex gap-2 mt-5 pt-5 border-t border-slate-800">
                      <button
                        onClick={() => { toggleStadiumVisited(team); setConfirmBucket(null); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isVisited ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                      >
                        <span>{isVisited ? "✓" : "○"}</span>{isVisited ? "Visited" : "Mark Visited"}
                      </button>
                      <button
                        onClick={() => { if (!isBucketList && isVisited) { setConfirmBucket(confirmKey); } else { toggleStadiumBucket(team, false); } }}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isBucketList ? "bg-amber-700 hover:bg-amber-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                      >
                        <span>★</span>{isBucketList ? "On Bucket List" : "Bucket List"}
                      </button>
                    </div>
                    {confirmBucket === confirmKey && (
                      <div className="mt-2 p-3 bg-amber-900/40 border border-amber-700/60 rounded-lg text-sm">
                        <p className="text-amber-200 mb-2">Remove from visited and add to bucket list?</p>
                        <div className="flex gap-2">
                          <button onClick={() => toggleStadiumBucket(team, true)} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium">Confirm</button>
                          <button onClick={() => setConfirmBucket(null)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium">Cancel</button>
                        </div>
                      </div>
                    )}
                    {isVisited && <VisitDetailsPanel locationId={team} category="stadium" isReadOnly={isReadOnly} details={stadiumDetails[team]} onUpdate={setStadiumDetail} />}
                  </>
                );
              })()}

              <NoteField category="stadium" locationId={selectedStadium.team} isReadOnly={isReadOnly} readOnlyValue={getReadOnlyNote("stadium", selectedStadium.team)} onSaved={handleNoteSaved} />

              <div className="mt-5 pt-5 border-t border-slate-800">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Other Teams in {selectedStadium.division}</p>
                <div className="space-y-2">
                  {MLB_STADIUMS
                    .filter(s => s.division === selectedStadium.division && s.team !== selectedStadium.team)
                    .map(s => (
                      <button
                        key={s.team}
                        onClick={() => setSelectedStadium(s)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 transition-colors text-sm text-slate-300 hover:text-white"
                      >
                        {s.team}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : selected ? (
            <div className="p-6 flex-1">
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors">
                ← Back
              </button>
              <div className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-3 text-white" style={{ backgroundColor: badgeColor(selected.info) }}>
                {regionTypeLabel(selected.info.regionType)}
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">{selected.info.name}</h2>
              {selected.info.nickname && (
                <p className="text-slate-400 text-sm italic mb-5">"{selected.info.nickname}"</p>
              )}
              {!selected.info.nickname && <div className="mb-5" />}

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">🏛️</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Capital</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selected.info.capital}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">👥</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Population</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selected.info.population}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                  <span className="text-xl">📏</span>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Area</p>
                    <p className="text-sm font-medium text-white mt-0.5">{selected.info.area}</p>
                  </div>
                </div>
                {selected.info.joined && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                    <span className="text-xl">📅</span>
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        {selected.info.regionType === "us-state" ? "Year of Statehood" : "Year Joined Confederation"}
                      </p>
                      <p className="text-sm font-medium text-white mt-0.5">{selected.info.joined}</p>
                    </div>
                  </div>
                )}
                {selected.info.currency && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                    <span className="text-xl">💰</span>
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Currency</p>
                      <p className="text-sm font-medium text-white mt-0.5">{selected.info.currency}</p>
                    </div>
                  </div>
                )}
                {selected.info.language && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                    <span className="text-xl">🗣️</span>
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Language</p>
                      <p className="text-sm font-medium text-white mt-0.5">{selected.info.language}</p>
                    </div>
                  </div>
                )}
                {selected.info.regionType !== "country" && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60">
                    <span className="text-xl">🌎</span>
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Country</p>
                      <p className="text-sm font-medium text-white mt-0.5">{selected.info.regionType === "us-state" ? "United States" : "Canada"}</p>
                    </div>
                  </div>
                )}
              </div>

              {!isReadOnly && (() => {
                const rawId = selected.key.replace(/^(country|state|province)-/, "");
                const isCountry = selected.key.startsWith("country-");
                const isState = selected.key.startsWith("state-");
                const isVisited = isCountry ? visitedCountries.has(rawId) : isState ? visitedStates.has(rawId) : visitedProvinces.has(rawId);
                const isBucketList = (isCountry ? bucketCountries : isState ? bucketStates : bucketProvinces).has(rawId);
                const confirmKey = selected.key;
                const handleToggleVisited = () => {
                  setConfirmBucket(null);
                  if (isCountry) toggleCountryVisited(rawId);
                  else if (isState) toggleStateVisited(rawId);
                  else toggleProvinceVisited(rawId);
                };
                const handleToggleBucket = () => {
                  if (!isBucketList && isVisited) { setConfirmBucket(confirmKey); }
                  else if (isCountry) toggleCountryBucket(rawId, false);
                  else if (isState) toggleStateBucket(rawId, false);
                  else toggleProvinceBucket(rawId, false);
                };
                const handleConfirmBucket = () => {
                  if (isCountry) toggleCountryBucket(rawId, true);
                  else if (isState) toggleStateBucket(rawId, true);
                  else toggleProvinceBucket(rawId, true);
                };
                const details = isCountry ? countryDetails[rawId] : isState ? stateDetails[rawId] : provinceDetails[rawId];
                const setter = isCountry ? setCountryDetail : isState ? setStateDetail : setProvinceDetail;
                return (
                  <>
                    <div className="flex gap-2 mt-5 pt-5 border-t border-slate-800">
                      <button
                        onClick={handleToggleVisited}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isVisited ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                      >
                        <span>{isVisited ? "✓" : "○"}</span>{isVisited ? "Visited" : "Mark Visited"}
                      </button>
                      <button
                        onClick={handleToggleBucket}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isBucketList ? "bg-amber-700 hover:bg-amber-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"}`}
                      >
                        <span>★</span>{isBucketList ? "On Bucket List" : "Bucket List"}
                      </button>
                    </div>
                    {confirmBucket === confirmKey && (
                      <div className="mt-2 p-3 bg-amber-900/40 border border-amber-700/60 rounded-lg text-sm">
                        <p className="text-amber-200 mb-2">Remove from visited and add to bucket list?</p>
                        <div className="flex gap-2">
                          <button onClick={handleConfirmBucket} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium">Confirm</button>
                          <button onClick={() => setConfirmBucket(null)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium">Cancel</button>
                        </div>
                      </div>
                    )}
                    {isVisited && <VisitDetailsPanel locationId={rawId} category={isCountry ? "country" : isState ? "state" : "province"} isReadOnly={isReadOnly} details={details} onUpdate={setter} />}
                  </>
                );
              })()}
              {(() => {
                const rawId = selected.key.replace(/^(country|state|province)-/, "");
                const isCountry = selected.key.startsWith("country-");
                const isState = selected.key.startsWith("state-");
                const cat: PhotoCategory = isCountry ? "country" : isState ? "state" : "province";
                return <NoteField category={cat} locationId={rawId} isReadOnly={isReadOnly} readOnlyValue={getReadOnlyNote(cat, rawId)} onSaved={handleNoteSaved} />;
              })()}
            </div>
          ) : mapMode === "tcc" ? (
            <div className="p-6 flex-1">
              <h2 className="text-lg font-semibold text-white mb-1">Travelers' Century Club</h2>
              <p className="text-slate-400 text-sm mb-6">Track your progress across all 330 TCC countries and territories.</p>

              <div className="mb-6">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">TCC Regions</h3>
                <div className="space-y-2">
                  {(Object.entries(TCC_REGIONS) as [TccRegionKey, typeof TCC_REGIONS[TccRegionKey]][]).map(([k, r]) => {
                    const visitedInRegion = sortedTcc.filter(e => e.region === k && tccVisited.has(e.name)).length;
                    const totalInRegion = sortedTcc.filter(e => e.region === k).length;
                    return (
                      <div key={k} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="text-sm text-slate-300 flex-1">{r.name}</span>
                        <span className="text-xs font-mono text-slate-500">{visitedInRegion}/{totalInRegion}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-800">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0 border-2" style={{ backgroundColor: BUCKET_LIST_COLOR, borderColor: BUCKET_LIST_STROKE, borderStyle: "dashed" }} />
                    <span className="text-sm text-slate-300">Bucket List</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Progress</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-purple-900/30 border border-purple-800/40 text-center">
                    <p className="text-xl font-bold text-purple-200">{tccVisited.size}</p>
                    <p className="text-xs text-purple-300/80 mt-0.5">Visited</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/60 text-center">
                    <p className="text-xl font-bold text-white">{TCC_TOTAL}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Total</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-800/30 text-center">
                    <p className="text-xl font-bold text-amber-300">{tccBucket.size}</p>
                    <p className="text-xs text-amber-400/80 mt-0.5">Bucket List</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/60 text-center">
                    <p className="text-xl font-bold text-white">{Math.max(0, TCC_MEMBERSHIP_THRESHOLD - tccVisited.size)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">To 100 ✈️</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">About TCC</h3>
                <div className="space-y-1.5 text-sm text-slate-400">
                  <p>The Travelers' Century Club recognizes travelers who have visited 100 or more of the world's 330 countries and territories.</p>
                  <p>• Click any country shape to mark it visited</p>
                  <p>• Use the TCC tab to manage all 330 entries</p>
                  <p>• Reach 100 to qualify for membership</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 flex-1">
              <h2 className="text-lg font-semibold text-white mb-1">Explore the World</h2>
              <p className="text-slate-400 text-sm mb-6">Click any region on the map to see its details.</p>

              <div className="mb-6">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Legend</h3>
                <div className="space-y-2">
                  {([
                    { label: "Africa", color: "#f59e0b", continent: "Africa" },
                    { label: "Asia", color: "#10b981", continent: "Asia" },
                    { label: "Europe", color: "#3b82f6", continent: "Europe" },
                    { label: "North America", color: "#ef4444", continent: "North America" },
                    { label: "South America", color: "#8b5cf6", continent: "South America" },
                    { label: "Oceania", color: "#06b6d4", continent: "Oceania" },
                  ]).map(({ label, color, continent }) => {
                    const totalInContinent = sortedCountries.filter(c => c.continent === continent).length;
                    const visitedInContinent = sortedCountries.filter(c => c.continent === continent && visitedCountries.has(c.id)).length;
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm text-slate-300 flex-1">{label}</span>
                        <span className="text-xs font-mono text-slate-500">{visitedInContinent}/{totalInContinent}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: US_STATE_COLOR }} />
                    <span className="text-sm text-slate-300 flex-1">U.S. States</span>
                    <span className="text-xs font-mono text-slate-500">{visitedStates.size}/{sortedStates.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CA_PROVINCE_COLOR }} />
                    <span className="text-sm text-slate-300 flex-1">Canadian Provinces</span>
                    <span className="text-xs font-mono text-slate-500">{visitedProvinces.size}/{sortedProvinces.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="-2 -14 14 14" fill="none" className="flex-shrink-0">
                      <line x1="0" y1="0" x2="0" y2="-12" stroke="#93c5fd" strokeWidth="1.5"/>
                      <polygon points="0,-12 8,-9 0,-6" fill="#2563eb"/>
                      <circle cy="0" r="2.5" fill="#1d4ed8"/>
                    </svg>
                    <span className="text-sm text-slate-300 flex-1">MLB Stadium</span>
                    <span className="text-xs font-mono text-slate-500">{visitedStadiums.size}/{sortedStadiums.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="-2 -14 14 14" fill="none" className="flex-shrink-0">
                      <line x1="0" y1="0" x2="0" y2="-12" stroke="#86efac" strokeWidth="1.5"/>
                      <polygon points="0,-12 8,-9 0,-6" fill="#16a34a"/>
                      <circle cy="0" r="2.5" fill="#15803d"/>
                    </svg>
                    <span className="text-sm text-slate-300 flex-1">National Park</span>
                    <span className="text-xs font-mono text-slate-500">{visitedParks.size}/{sortedParks.length}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-800">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0 border-2" style={{ backgroundColor: BUCKET_LIST_COLOR, borderColor: BUCKET_LIST_STROKE, borderStyle: "dashed" }} />
                    <span className="text-sm text-slate-300 flex-1">Bucket List</span>
                    <span className="text-xs font-mono text-slate-500">{bucketCountries.size + bucketStates.size + bucketProvinces.size + bucketStadiums.size + bucketParks.size}</span>
                  </div>
                  {totalNoteCount > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 flex items-center justify-center text-[10px] flex-shrink-0">📝</span>
                      <span className="text-sm text-slate-300 flex-1">Notes</span>
                      <span className="text-xs font-mono text-slate-500">{totalNoteCount}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Stats</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-slate-800/60 text-center">
                    <p className="text-xl font-bold text-white">{Object.keys(COUNTRY_DATA).length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Countries</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/60 text-center">
                    <p className="text-xl font-bold text-white">51</p>
                    <p className="text-xs text-slate-400 mt-0.5">US States</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/60 text-center">
                    <p className="text-xl font-bold text-white">13</p>
                    <p className="text-xs text-slate-400 mt-0.5">CA Provinces</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/60 text-center">
                    <p className="text-xl font-bold text-white">30</p>
                    <p className="text-xs text-slate-400 mt-0.5">MLB Stadiums</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/60 text-center">
                    <p className="text-xl font-bold text-white">{NP_TOTAL}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Nat. Parks</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Controls</h3>
                <div className="space-y-1.5 text-sm text-slate-400">
                  <p>• Scroll to zoom in/out</p>
                  <p>• Drag to pan the map</p>
                  <p>• Click any region to explore</p>
                  <p>• Use + / − buttons to zoom</p>
                  <p>• Zoom into North America to click individual US states or Canadian provinces</p>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Tabbed list section below the map */}
      <section className="border-t border-slate-800 bg-slate-900">
        {/* Tab bar + progress */}
        <div className="flex items-center justify-between px-6 pt-4 pb-0 border-b border-slate-800 flex-wrap gap-y-2">
          <div className="flex items-center gap-1 flex-wrap">
            {(mapMode === "tcc"
              ? ([
                  { id: "tcc",         label: `TCC (${TCC_TOTAL})` },
                  { id: "bucket-list", label: "★ Bucket List" },
                ] as const)
              : ([
                  { id: "countries",   label: "Countries" },
                  { id: "us-states",   label: "US States" },
                  { id: "ca-provinces", label: "CA Provinces" },
                  { id: "stadiums",    label: "MLB Stadiums" },
                  { id: "nat-parks",   label: "Nat. Parks" },
                  { id: "bucket-list", label: "★ Bucket List" },
                ] as const)
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setListTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  listTab === tab.id
                    ? "border-blue-500 text-white bg-slate-800/60"
                    : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/30"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Progress badges */}
          <div className="flex items-center gap-3 pb-2 flex-wrap">
            {(mapMode === "tcc"
              ? [
                  { label: "TCC", visited: tccVisited.size, total: TCC_TOTAL, color: "bg-purple-500" },
                ]
              : [
                  { label: "Countries", visited: visitedCountries.size, total: sortedCountries.length, color: "bg-emerald-500" },
                  { label: "US States", visited: visitedStates.size, total: sortedStates.length, color: "bg-red-500" },
                  { label: "CA Prov.", visited: visitedProvinces.size, total: sortedProvinces.length, color: "bg-orange-500" },
                  { label: "Stadiums", visited: visitedStadiums.size, total: sortedStadiums.length, color: "bg-blue-500" },
                  { label: "Parks", visited: visitedParks.size, total: sortedParks.length, color: "bg-green-500" },
                ]
            ).map(({ label, visited, total, color }, i, arr) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-white border border-slate-700">
                  {visited} <span className="text-slate-400 font-normal">/ {total}</span>
                </span>
                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all duration-300`} style={{ width: `${(visited / total) * 100}%` }} />
                </div>
                <div className="w-px h-5 bg-slate-700" />
              </div>
            ))}
            {(() => {
              const bucketTotal = bucketCountries.size + bucketStates.size + bucketProvinces.size + bucketStadiums.size;
              return (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400">★ Bucket List</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-900/40 text-amber-300 border border-amber-700/50">
                    {bucketTotal}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Countries tab */}
        {listTab === "countries" && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
              {sortedCountries.map((country) => {
                const isVisited = visitedCountries.has(country.id);
                const isBucket = !isVisited && bucketCountries.has(country.id);
                const isActive = selected?.key === `country-${country.id}`;
                return (
                  <div
                    key={country.id}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-yellow-500/20 border border-yellow-500/40"
                        : isVisited
                        ? "bg-emerald-900/30 border border-emerald-700/30 hover:bg-emerald-800/30"
                        : isBucket
                        ? "bg-amber-900/20 border border-amber-700/30 hover:bg-amber-900/30"
                        : "bg-slate-800/40 hover:bg-slate-700/60 border border-transparent"
                    }`}
                  >
                    {!isReadOnly && <input
                      type="checkbox"
                      checked={isVisited}
                      onChange={() => toggleCountryVisited(country.id)}
                      className="w-3.5 h-3.5 flex-shrink-0 accent-emerald-500 cursor-pointer"
                    />}
                    <button
                      onClick={() => {
                        setSelectedStadium(null);
                        setConfirmBucket(null);
                        const key = `country-${country.id}`;
                        setSelected(prev => prev?.key === key ? null : { key, info: country });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`text-left truncate flex-1 min-w-0 ${isActive ? "text-yellow-300" : isVisited ? "text-emerald-300" : isBucket ? "text-amber-300" : "text-slate-300 hover:text-white"}`}
                      title={country.name}
                    >
                      {country.name}
                    </button>
                    {effectiveNotesIndex.country.has(country.id) && <span className="text-[10px] flex-shrink-0" title="Has note">📝</span>}
                    {!isReadOnly && <button
                      onClick={(e) => { e.stopPropagation(); toggleCountryBucket(country.id, isVisited); }}
                      className={`flex-shrink-0 text-sm leading-none transition-colors ${isBucket ? "text-amber-400 hover:text-slate-400" : "text-slate-600 hover:text-amber-400"}`}
                      title={isBucket ? "Remove from bucket list" : "Add to bucket list"}
                    >★</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* US States tab */}
        {listTab === "us-states" && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
              {sortedStates.map((state) => {
                const isVisited = visitedStates.has(state.fips);
                const isBucket = !isVisited && bucketStates.has(state.fips);
                const isActive = selected?.key === `state-${state.fips}`;
                return (
                  <div
                    key={state.fips}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-yellow-500/20 border border-yellow-500/40"
                        : isVisited
                        ? "bg-red-900/30 border border-red-700/30 hover:bg-red-800/30"
                        : isBucket
                        ? "bg-amber-900/20 border border-amber-700/30 hover:bg-amber-900/30"
                        : "bg-slate-800/40 hover:bg-slate-700/60 border border-transparent"
                    }`}
                  >
                    {!isReadOnly && <input
                      type="checkbox"
                      checked={isVisited}
                      onChange={() => toggleStateVisited(state.fips)}
                      className="w-3.5 h-3.5 flex-shrink-0 accent-red-500 cursor-pointer"
                    />}
                    <button
                      onClick={() => {
                        setSelectedStadium(null);
                        setConfirmBucket(null);
                        const key = `state-${state.fips}`;
                        setSelected(prev => prev?.key === key ? null : { key, info: state });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`text-left truncate flex-1 min-w-0 ${isActive ? "text-yellow-300" : isVisited ? "text-red-300" : isBucket ? "text-amber-300" : "text-slate-300 hover:text-white"}`}
                      title={state.name}
                    >
                      {state.name}
                    </button>
                    {effectiveNotesIndex.state.has(state.fips) && <span className="text-[10px] flex-shrink-0" title="Has note">📝</span>}
                    {!isReadOnly && <button
                      onClick={(e) => { e.stopPropagation(); toggleStateBucket(state.fips, isVisited); }}
                      className={`flex-shrink-0 text-sm leading-none transition-colors ${isBucket ? "text-amber-400 hover:text-slate-400" : "text-slate-600 hover:text-amber-400"}`}
                      title={isBucket ? "Remove from bucket list" : "Add to bucket list"}
                    >★</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CA Provinces tab */}
        {listTab === "ca-provinces" && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
              {sortedProvinces.map((province) => {
                const isVisited = visitedProvinces.has(province.key);
                const isBucket = !isVisited && bucketProvinces.has(province.key);
                const isActive = selected?.key === `province-${province.key}`;
                return (
                  <div
                    key={province.key}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-yellow-500/20 border border-yellow-500/40"
                        : isVisited
                        ? "bg-orange-900/30 border border-orange-700/30 hover:bg-orange-800/30"
                        : isBucket
                        ? "bg-amber-900/20 border border-amber-700/30 hover:bg-amber-900/30"
                        : "bg-slate-800/40 hover:bg-slate-700/60 border border-transparent"
                    }`}
                  >
                    {!isReadOnly && <input
                      type="checkbox"
                      checked={isVisited}
                      onChange={() => toggleProvinceVisited(province.key)}
                      className="w-3.5 h-3.5 flex-shrink-0 accent-orange-500 cursor-pointer"
                    />}
                    <button
                      onClick={() => {
                        setSelectedStadium(null);
                        setConfirmBucket(null);
                        const key = `province-${province.key}`;
                        setSelected(prev => prev?.key === key ? null : { key, info: province });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`text-left truncate flex-1 min-w-0 ${isActive ? "text-yellow-300" : isVisited ? "text-orange-300" : isBucket ? "text-amber-300" : "text-slate-300 hover:text-white"}`}
                      title={province.name}
                    >
                      {province.name}
                    </button>
                    {effectiveNotesIndex.province.has(province.key) && <span className="text-[10px] flex-shrink-0" title="Has note">📝</span>}
                    {!isReadOnly && <button
                      onClick={(e) => { e.stopPropagation(); toggleProvinceBucket(province.key, isVisited); }}
                      className={`flex-shrink-0 text-sm leading-none transition-colors ${isBucket ? "text-amber-400 hover:text-slate-400" : "text-slate-600 hover:text-amber-400"}`}
                      title={isBucket ? "Remove from bucket list" : "Add to bucket list"}
                    >★</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MLB Stadiums tab */}
        {listTab === "stadiums" && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
              {sortedStadiums.map((stadium) => {
                const isVisited = visitedStadiums.has(stadium.team);
                const isBucket = !isVisited && bucketStadiums.has(stadium.team);
                const isActive = selectedStadium?.team === stadium.team;
                return (
                  <div
                    key={stadium.team}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-yellow-500/20 border border-yellow-500/40"
                        : isVisited
                        ? "bg-blue-900/30 border border-blue-700/30 hover:bg-blue-800/30"
                        : isBucket
                        ? "bg-amber-900/20 border border-amber-700/30 hover:bg-amber-900/30"
                        : "bg-slate-800/40 hover:bg-slate-700/60 border border-transparent"
                    }`}
                  >
                    {!isReadOnly && <input
                      type="checkbox"
                      checked={isVisited}
                      onChange={() => toggleStadiumVisited(stadium.team)}
                      className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 accent-blue-500 cursor-pointer"
                    />}
                    <button
                      onClick={() => {
                        setSelected(null);
                        setConfirmBucket(null);
                        setSelectedStadium(prev => prev?.team === stadium.team ? null : stadium);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className={`font-medium truncate ${isActive ? "text-yellow-300" : isVisited ? "text-blue-300" : isBucket ? "text-amber-300" : "text-slate-300 hover:text-white"}`}>
                        {stadium.team}
                        {effectiveNotesIndex.stadium.has(stadium.team) && <span className="text-[10px] ml-1" title="Has note">📝</span>}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{stadium.stadium}</p>
                    </button>
                    {!isReadOnly && <button
                      onClick={(e) => { e.stopPropagation(); toggleStadiumBucket(stadium.team, isVisited); }}
                      className={`flex-shrink-0 text-sm leading-none transition-colors mt-0.5 ${isBucket ? "text-amber-400 hover:text-slate-400" : "text-slate-600 hover:text-amber-400"}`}
                      title={isBucket ? "Remove from bucket list" : "Add to bucket list"}
                    >★</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* National Parks tab */}
        {listTab === "nat-parks" && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
              {sortedParks.map((park) => {
                const isVisited = visitedParks.has(park.name);
                const isBucket = !isVisited && bucketParks.has(park.name);
                const isActive = selectedPark?.name === park.name;
                return (
                  <div
                    key={park.name}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-yellow-500/20 border border-yellow-500/40"
                        : isVisited
                        ? "bg-green-900/30 border border-green-700/30 hover:bg-green-800/30"
                        : isBucket
                        ? "bg-amber-900/20 border border-amber-700/30 hover:bg-amber-900/30"
                        : "bg-slate-800/40 hover:bg-slate-700/60 border border-transparent"
                    }`}
                  >
                    {!isReadOnly && <input
                      type="checkbox"
                      checked={isVisited}
                      onChange={() => toggleParkVisited(park.name)}
                      className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 accent-green-500 cursor-pointer"
                    />}
                    <button
                      onClick={() => {
                        setSelected(null);
                        setConfirmBucket(null);
                        setSelectedPark(prev => prev?.name === park.name ? null : park);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className={`font-medium truncate ${isActive ? "text-yellow-300" : isVisited ? "text-green-300" : isBucket ? "text-amber-300" : "text-slate-300 hover:text-white"}`}>
                        {park.name}
                        {effectiveNotesIndex.park.has(park.name) && <span className="text-[10px] ml-1" title="Has note">📝</span>}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{park.state}</p>
                    </button>
                    {!isReadOnly && <button
                      onClick={(e) => { e.stopPropagation(); toggleParkBucket(park.name, isVisited); }}
                      className={`flex-shrink-0 text-sm leading-none transition-colors mt-0.5 ${isBucket ? "text-amber-400 hover:text-slate-400" : "text-slate-600 hover:text-amber-400"}`}
                      title={isBucket ? "Remove from bucket list" : "Add to bucket list"}
                    >★</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TCC tab */}
        {listTab === "tcc" && (
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Regions</span>
              {(Object.entries(TCC_REGIONS) as [TccRegionKey, typeof TCC_REGIONS[TccRegionKey]][]).map(([k, r]) => {
                const visitedInRegion = sortedTcc.filter(e => e.region === k && tccVisited.has(e.name)).length;
                const totalInRegion = sortedTcc.filter(e => e.region === k).length;
                return (
                  <span key={k} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: r.color }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                    {r.name}
                    <span className="text-white/80 font-mono">{visitedInRegion}/{totalInRegion}</span>
                  </span>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
              {sortedTcc.map((entry) => {
                const isVisited = tccVisited.has(entry.name);
                const isBucket = !isVisited && tccBucket.has(entry.name);
                const isActive = selectedTcc?.name === entry.name;
                const region = TCC_REGIONS[entry.region];
                return (
                  <div
                    key={entry.name}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm transition-colors border ${
                      isActive
                        ? "bg-yellow-500/20 border-yellow-500/40"
                        : isVisited
                        ? "bg-purple-900/30 border-purple-700/30 hover:bg-purple-800/30"
                        : isBucket
                        ? "bg-amber-900/20 border-amber-700/30 hover:bg-amber-900/30"
                        : "bg-slate-800/40 hover:bg-slate-700/60 border-transparent"
                    }`}
                  >
                    {!isReadOnly && <input
                      type="checkbox"
                      checked={isVisited}
                      onChange={() => toggleTccVisited(entry.name)}
                      className="w-3.5 h-3.5 flex-shrink-0 accent-purple-500 cursor-pointer"
                    />}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: region.color }}
                      title={region.name}
                    />
                    <button
                      onClick={() => {
                        setSelectedTcc(prev => prev?.name === entry.name ? null : entry);
                        setConfirmBucket(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`text-left truncate flex-1 min-w-0 ${isActive ? "text-yellow-300" : isVisited ? "text-purple-200" : isBucket ? "text-amber-300" : "text-slate-300 hover:text-white"}`}
                      title={`${entry.name} — ${region.name}`}
                    >
                      {entry.name}
                    </button>
                    {(entry.geoId || TCC_US_STATE_ENTRIES.has(entry.name)) && (
                      <span className="text-slate-500 text-[10px] flex-shrink-0" title="Located on map">🗺</span>
                    )}
                    {effectiveNotesIndex.tcc.has(entry.name) && <span className="text-[10px] flex-shrink-0" title="Has note">📝</span>}
                    {!isReadOnly && <button
                      onClick={(e) => { e.stopPropagation(); toggleTccBucket(entry.name, isVisited); }}
                      className={`flex-shrink-0 text-sm leading-none transition-colors ${isBucket ? "text-amber-400 hover:text-slate-400" : "text-slate-600 hover:text-amber-400"}`}
                      title={isBucket ? "Remove from bucket list" : "Add to bucket list"}
                    >★</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bucket List tab */}
        {listTab === "bucket-list" && (() => {
          const bucketTotal = bucketCountries.size + bucketStates.size + bucketProvinces.size + bucketStadiums.size + bucketParks.size + tccBucket.size;
          if (bucketTotal === 0) {
            return (
              <div className="px-6 py-12 text-center text-slate-400">
                <div className="text-4xl mb-3">★</div>
                <p className="text-base font-medium text-slate-300 mb-1">Your bucket list is empty</p>
                <p className="text-sm">Click the ★ on any country, state, province, stadium, park, or TCC entry to add it here.</p>
              </div>
            );
          }
          const allItems = [
            ...sortedCountries.filter(c => bucketCountries.has(c.id)).map(c => ({ name: c.name, sub: "", badge: "Country", badgeClass: "bg-blue-900/80 text-blue-300", key: `country-${c.id}`, id: c.id, cat: "country" as const })),
            ...sortedStates.filter(s => bucketStates.has(s.fips)).map(s => ({ name: s.name, sub: "", badge: "US State", badgeClass: "bg-red-900/80 text-red-300", key: `state-${s.fips}`, id: s.fips, cat: "state" as const })),
            ...sortedProvinces.filter(p => bucketProvinces.has(p.key)).map(p => ({ name: p.name, sub: "", badge: "Province", badgeClass: "bg-orange-900/80 text-orange-300", key: `province-${p.key}`, id: p.key, cat: "province" as const })),
            ...sortedStadiums.filter(s => bucketStadiums.has(s.team)).map(s => ({ name: s.team, sub: s.stadium, badge: "Stadium", badgeClass: "bg-violet-900/80 text-violet-300", key: `stadium-${s.team}`, id: s.team, cat: "stadium" as const })),
            ...sortedParks.filter(p => bucketParks.has(p.name)).map(p => ({ name: p.name, sub: p.state, badge: "Park", badgeClass: "bg-green-900/80 text-green-300", key: `park-${p.name}`, id: p.name, cat: "park" as const })),
            ...sortedTcc.filter(e => tccBucket.has(e.name)).map(e => ({ name: e.name, sub: TCC_REGIONS[e.region].name, badge: "TCC", badgeClass: "bg-purple-900/80 text-purple-300", key: `tcc-${e.name}`, id: e.name, cat: "tcc" as const })),
          ].sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                {allItems.map(item => (
                  <div key={item.key} className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-sm bg-amber-900/20 border border-amber-700/30 hover:bg-amber-900/30 transition-colors">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 mt-0.5 ${item.badgeClass}`}>{item.badge}</span>
                    <button
                      className="text-left flex-1 min-w-0"
                      onClick={() => {
                        if (item.cat === "stadium") {
                          const s = MLB_STADIUMS.find(st => st.team === item.id);
                          if (s) { setSelected(null); setSelectedTcc(null); setSelectedPark(null); setSelectedStadium(s); window.scrollTo({ top: 0, behavior: "smooth" }); }
                        } else if (item.cat === "park") {
                          const p = US_NATIONAL_PARKS.find(pk => pk.name === item.id);
                          if (p) { setSelected(null); setSelectedTcc(null); setSelectedStadium(null); setSelectedPark(p); if (mapMode !== "world") setMapMode("world"); window.scrollTo({ top: 0, behavior: "smooth" }); }
                        } else if (item.cat === "tcc") {
                          const t = TCC_BY_NAME.get(item.id);
                          if (t) { setSelected(null); setSelectedStadium(null); setSelectedPark(null); setSelectedTcc(t); if (mapMode !== "tcc") setMapMode("tcc"); window.scrollTo({ top: 0, behavior: "smooth" }); }
                        } else {
                          setSelectedStadium(null); setSelectedTcc(null); setSelectedPark(null);
                          if (item.cat === "country") { const c = sortedCountries.find(c => c.id === item.id); if (c) setSelected({ key: item.key, info: c }); }
                          else if (item.cat === "state") { const s = sortedStates.find(s => s.fips === item.id); if (s) setSelected({ key: item.key, info: s }); }
                          else if (item.cat === "province") { const p = sortedProvinces.find(p => p.key === item.id); if (p) setSelected({ key: item.key, info: p }); }
                          if (mapMode !== "world") setMapMode("world");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }}
                    >
                      <p className="font-medium truncate text-amber-300 hover:text-amber-200">{item.name}</p>
                      {item.sub && <p className="text-xs text-slate-400 truncate mt-0.5">{item.sub}</p>}
                    </button>
                    {!isReadOnly && <button
                      onClick={() => {
                        if (item.cat === "country") toggleCountryBucket(item.id, false);
                        else if (item.cat === "state") toggleStateBucket(item.id, false);
                        else if (item.cat === "province") toggleProvinceBucket(item.id, false);
                        else if (item.cat === "park") toggleParkBucket(item.id, false);
                        else if (item.cat === "tcc") toggleTccBucket(item.id, false);
                        else toggleStadiumBucket(item.id, false);
                      }}
                      className="text-amber-500 hover:text-slate-400 shrink-0 text-sm leading-none mt-0.5"
                      title="Remove from bucket list"
                    >★</button>}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </section>

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          visitedCountries={visitedCountries}
          visitedStates={visitedStates}
          visitedProvinces={visitedProvinces}
          visitedStadiums={visitedStadiums}
          visitedParks={visitedParks}
          countryDetails={countryDetails}
          stateDetails={stateDetails}
          provinceDetails={provinceDetails}
          stadiumDetails={stadiumDetails}
          parkDetails={parkDetails}
        />
      )}

      {showStats && (
        <StatsDashboard
          onClose={() => setShowStats(false)}
          visitedCountries={baseVisitedCountries}
          visitedStates={baseVisitedStates}
          visitedProvinces={baseVisitedProvinces}
          visitedStadiums={baseVisitedStadiums}
          visitedParks={baseVisitedParks}
          tccVisited={baseTccVisited}
          bucketCountries={bucketCountries}
          bucketStates={bucketStates}
          bucketProvinces={bucketProvinces}
          bucketStadiums={bucketStadiums}
          bucketParks={bucketParks}
          tccBucket={tccBucket}
          countryDetails={countryDetails}
          stateDetails={stateDetails}
          provinceDetails={provinceDetails}
          stadiumDetails={stadiumDetails}
          parkDetails={parkDetails}
          tccDetails={tccDetails}
        />
      )}
      {showShare && (
        <ShareModal
          onClose={() => setShowShare(false)}
          notesByKey={loadAllNotes()}
          visitedCountries={isReadOnly ? visitedCountries : rawVisitedCountries}
          visitedStates={isReadOnly ? visitedStates : rawVisitedStates}
          visitedProvinces={isReadOnly ? visitedProvinces : rawVisitedProvinces}
          visitedStadiums={isReadOnly ? visitedStadiums : rawVisitedStadiums}
          visitedParks={isReadOnly ? visitedParks : rawVisitedParks}
          bucketCountries={isReadOnly ? bucketCountries : rawBucketCountries}
          bucketStates={isReadOnly ? bucketStates : rawBucketStates}
          bucketProvinces={isReadOnly ? bucketProvinces : rawBucketProvinces}
          bucketStadiums={isReadOnly ? bucketStadiums : rawBucketStadiums}
          bucketParks={isReadOnly ? bucketParks : rawBucketParks}
          tccVisited={isReadOnly ? tccVisited : rawTccVisited}
          tccBucket={isReadOnly ? tccBucket : rawTccBucket}
        />
      )}

      {/* Hidden file input for Excel import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileImport}
      />

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-start gap-3 transition-all animate-fade-in ${
            toast.kind === "success"
              ? "bg-emerald-800 border border-emerald-600 text-emerald-50"
              : "bg-amber-800 border border-amber-600 text-amber-50"
          }`}
        >
          <span className="flex-shrink-0 mt-0.5">
            {toast.kind === "success" ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            )}
          </span>
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button onClick={() => setToast(null)} className="flex-shrink-0 opacity-70 hover:opacity-100 ml-1">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

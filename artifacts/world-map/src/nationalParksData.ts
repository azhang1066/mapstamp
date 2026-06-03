export interface NationalParkInfo {
  name: string;
  state: string;
  established: string;
  area: string;
  coordinates: [number, number];
}

export const US_NATIONAL_PARKS: NationalParkInfo[] = [
  // A
  { name: "Acadia",                       state: "ME",        established: "1919", area: "49,052 acres",       coordinates: [-68.2100,  44.3386] },
  { name: "American Samoa",               state: "AS",        established: "1988", area: "9,000 acres",        coordinates: [-170.6820, -14.2500] },
  { name: "Arches",                       state: "UT",        established: "1971", area: "76,519 acres",       coordinates: [-109.5925,  38.7331] },
  // B
  { name: "Badlands",                     state: "SD",        established: "1978", area: "242,756 acres",      coordinates: [-102.3397,  43.8554] },
  { name: "Big Bend",                     state: "TX",        established: "1944", area: "801,163 acres",      coordinates: [-103.2520,  29.2498] },
  { name: "Biscayne",                     state: "FL",        established: "1980", area: "172,924 acres",      coordinates: [ -80.4300,  25.4824] },
  { name: "Black Canyon of the Gunnison", state: "CO",        established: "1999", area: "32,950 acres",       coordinates: [-107.7242,  38.5754] },
  { name: "Bryce Canyon",                 state: "UT",        established: "1928", area: "35,835 acres",       coordinates: [-112.1871,  37.5930] },
  // C
  { name: "Canyonlands",                  state: "UT",        established: "1964", area: "337,598 acres",      coordinates: [-109.8782,  38.2000] },
  { name: "Capitol Reef",                 state: "UT",        established: "1971", area: "241,904 acres",      coordinates: [-111.2615,  38.0877] },
  { name: "Carlsbad Caverns",             state: "NM",        established: "1930", area: "46,766 acres",       coordinates: [-104.5567,  32.1478] },
  { name: "Channel Islands",              state: "CA",        established: "1980", area: "249,561 acres",      coordinates: [-119.7312,  34.0069] },
  { name: "Congaree",                     state: "SC",        established: "2003", area: "26,546 acres",       coordinates: [ -80.7820,  33.7948] },
  { name: "Crater Lake",                  state: "OR",        established: "1902", area: "183,224 acres",      coordinates: [-122.1090,  42.9446] },
  { name: "Cuyahoga Valley",              state: "OH",        established: "2000", area: "32,861 acres",       coordinates: [ -81.5680,  41.2808] },
  // D
  { name: "Death Valley",                 state: "CA/NV",     established: "1994", area: "3,373,063 acres",    coordinates: [-116.9325,  36.5054] },
  { name: "Denali",                       state: "AK",        established: "1917", area: "6,045,153 acres",    coordinates: [-151.0063,  63.1148] },
  { name: "Dry Tortugas",                 state: "FL",        established: "1992", area: "64,701 acres",       coordinates: [ -82.8732,  24.6285] },
  // E
  { name: "Everglades",                   state: "FL",        established: "1947", area: "1,508,938 acres",    coordinates: [ -80.9001,  25.2866] },
  // G
  { name: "Gates of the Arctic",          state: "AK",        established: "1980", area: "8,472,506 acres",    coordinates: [-153.2917,  67.7874] },
  { name: "Gateway Arch",                 state: "MO",        established: "2018", area: "193 acres",          coordinates: [ -90.1847,  38.6247] },
  { name: "Glacier",                      state: "MT",        established: "1910", area: "1,013,322 acres",    coordinates: [-113.7870,  48.6962] },
  { name: "Glacier Bay",                  state: "AK",        established: "1980", area: "3,283,168 acres",    coordinates: [-136.9024,  58.6658] },
  { name: "Grand Canyon",                 state: "AZ",        established: "1919", area: "1,201,647 acres",    coordinates: [-112.1129,  36.1070] },
  { name: "Grand Teton",                  state: "WY",        established: "1929", area: "309,994 acres",      coordinates: [-110.8024,  43.7904] },
  { name: "Great Basin",                  state: "NV",        established: "1986", area: "77,180 acres",       coordinates: [-114.2630,  38.9833] },
  { name: "Great Sand Dunes",             state: "CO",        established: "2004", area: "107,342 acres",      coordinates: [-105.5943,  37.7326] },
  { name: "Great Smoky Mountains",        state: "TN/NC",     established: "1934", area: "522,427 acres",      coordinates: [ -83.5070,  35.6532] },
  { name: "Guadalupe Mountains",          state: "TX",        established: "1966", area: "86,367 acres",       coordinates: [-104.8688,  31.9231] },
  // H
  { name: "Haleakalā",                    state: "HI",        established: "1916", area: "33,265 acres",       coordinates: [-156.1551,  20.7097] },
  { name: "Hawaiʻi Volcanoes",            state: "HI",        established: "1916", area: "323,431 acres",      coordinates: [-155.4716,  19.4194] },
  { name: "Hot Springs",                  state: "AR",        established: "1921", area: "5,554 acres",        coordinates: [ -93.0552,  34.5217] },
  // I
  { name: "Indiana Dunes",                state: "IN",        established: "2019", area: "15,349 acres",       coordinates: [ -87.0844,  41.6533] },
  { name: "Isle Royale",                  state: "MI",        established: "1940", area: "571,790 acres",      coordinates: [ -88.5506,  48.0013] },
  // J
  { name: "Joshua Tree",                  state: "CA",        established: "1994", area: "795,156 acres",      coordinates: [-115.9010,  33.8734] },
  // K
  { name: "Katmai",                       state: "AK",        established: "1980", area: "4,093,077 acres",    coordinates: [-155.0168,  58.5984] },
  { name: "Kenai Fjords",                 state: "AK",        established: "1980", area: "669,984 acres",      coordinates: [-150.3063,  59.9208] },
  { name: "Kings Canyon",                 state: "CA",        established: "1940", area: "461,901 acres",      coordinates: [-118.5551,  36.8879] },
  { name: "Kobuk Valley",                 state: "AK",        established: "1980", area: "1,750,717 acres",    coordinates: [-159.0420,  67.1036] },
  // L
  { name: "Lake Clark",                   state: "AK",        established: "1980", area: "2,619,733 acres",    coordinates: [-153.5440,  60.4127] },
  { name: "Lassen Volcanic",              state: "CA",        established: "1916", area: "106,589 acres",      coordinates: [-121.4083,  40.4977] },
  // M
  { name: "Mammoth Cave",                 state: "KY",        established: "1941", area: "54,011 acres",       coordinates: [ -86.1003,  37.1873] },
  { name: "Mesa Verde",                   state: "CO",        established: "1906", area: "52,485 acres",       coordinates: [-108.4618,  37.1853] },
  { name: "Mount Rainier",                state: "WA",        established: "1899", area: "236,381 acres",      coordinates: [-121.7269,  46.8799] },
  // N
  { name: "New River Gorge",              state: "WV",        established: "2020", area: "70,611 acres",       coordinates: [ -81.0720,  38.0650] },
  { name: "North Cascades",               state: "WA",        established: "1968", area: "504,654 acres",      coordinates: [-121.2069,  48.7718] },
  // O
  { name: "Olympic",                      state: "WA",        established: "1938", area: "922,650 acres",      coordinates: [-123.4983,  47.8021] },
  // P
  { name: "Petrified Forest",             state: "AZ",        established: "1962", area: "221,390 acres",      coordinates: [-109.7978,  35.0659] },
  { name: "Pinnacles",                    state: "CA",        established: "2013", area: "26,606 acres",       coordinates: [-121.1825,  36.4906] },
  // R
  { name: "Redwood",                      state: "CA",        established: "1968", area: "138,999 acres",      coordinates: [-124.0046,  41.2132] },
  { name: "Rocky Mountain",               state: "CO",        established: "1915", area: "265,807 acres",      coordinates: [-105.6836,  40.3428] },
  // S
  { name: "Saguaro",                      state: "AZ",        established: "1994", area: "92,867 acres",       coordinates: [-111.1658,  32.2967] },
  { name: "Sequoia",                      state: "CA",        established: "1890", area: "404,064 acres",      coordinates: [-118.5882,  36.4864] },
  { name: "Shenandoah",                   state: "VA",        established: "1935", area: "199,117 acres",      coordinates: [ -78.4678,  38.4755] },
  // T
  { name: "Theodore Roosevelt",           state: "ND",        established: "1978", area: "70,447 acres",       coordinates: [-103.4300,  46.9797] },
  // V
  { name: "Virgin Islands",               state: "VI",        established: "1956", area: "14,737 acres",       coordinates: [ -64.7274,  18.3414] },
  { name: "Voyageurs",                    state: "MN",        established: "1975", area: "218,200 acres",      coordinates: [ -92.8376,  48.4839] },
  // W
  { name: "White Sands",                  state: "NM",        established: "2019", area: "146,716 acres",      coordinates: [-106.3254,  32.7872] },
  { name: "Wind Cave",                    state: "SD",        established: "1903", area: "33,970 acres",       coordinates: [-103.4757,  43.5696] },
  { name: "Wrangell–St. Elias",           state: "AK",        established: "1980", area: "13,175,799 acres",   coordinates: [-142.0000,  61.7100] },
  // Y
  { name: "Yellowstone",                  state: "WY/MT/ID",  established: "1872", area: "2,219,791 acres",    coordinates: [-110.5885,  44.4280] },
  { name: "Yosemite",                     state: "CA",        established: "1890", area: "748,436 acres",      coordinates: [-119.5383,  37.8651] },
  // Z
  { name: "Zion",                         state: "UT",        established: "1919", area: "147,238 acres",      coordinates: [-113.0263,  37.2982] },
];

export const NP_TOTAL = US_NATIONAL_PARKS.length; // 63

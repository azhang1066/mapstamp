import { expect, test, type Page } from "@playwright/test";

const CLOUD_PROGRESS = {
  schemaVersion: 2,
  visitedCountries: ["36"], // Australia
  visitedStates: [],
  visitedProvinces: [],
  tccVisited: ["Albania"],
  bucketCountries: ["392"], // Japan
  bucketStates: ["06"], // California
  bucketProvinces: [],
  tccBucket: ["Abkhazia"],
  countryDetails: {},
  stateDetails: {},
  provinceDetails: {},
  tccDetails: {},
  notesByKey: {},
} as const;

const STALE_BROWSER_PROGRESS = {
  "wm_bucket_countries": ["250"], // France; must be replaced by cloud data.
  "wm_bucket_states": [],
  "wm_bucket_provinces": [],
  "wm_tcc_bucket": ["Aland Islands"],
} as const;

async function expectBucketTabToMatchTotal(page: Page) {
  await page.getByRole("button", { name: "★ Bucket List", exact: true }).click();
  await expect(page.getByTestId("bucket-list-item")).toHaveCount(3);
  await expect(page.getByTestId("bucket-list-item").getByRole("button", { name: "Japan", exact: true })).toBeVisible();
  await expect(page.getByTestId("bucket-list-item").getByRole("button", { name: "California", exact: true })).toBeVisible();
  await expect(
    page
      .getByTestId("bucket-list-item")
      .getByRole("button", { name: /^Abkhazia\b/ }),
  ).toBeVisible();
}

test("restores cloud bucket totals in TCC mode without changing World totals", async ({
  page,
}) => {
  // This runs before the app mounts. Hydration must remove the stale progress
  // while retaining the TCC view preference.
  await page.addInitScript((staleProgress) => {
    localStorage.setItem("wm_map_mode", "tcc");
    for (const [key, value] of Object.entries(staleProgress)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, STALE_BROWSER_PROGRESS);

  await page.goto("/");

  const seedStatus = await page.evaluate(async (cloudProgress) => {
    const response = await fetch("/api/map-data", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloudProgress),
    });
    return response.status;
  }, CLOUD_PROGRESS);
  expect(
    seedStatus === 200,
    `seed cloud map data (${seedStatus})`,
  ).toBeTruthy();

  // Reload after writing the cloud fixture so AuthRoot performs the same
  // per-user hydration sequence that an actual return visit uses.
  await page.reload();

  await expect(page.getByTestId("map-mode-tcc")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("bucket-list-total")).toHaveText("3");
  await expectBucketTabToMatchTotal(page);

  await page.getByTestId("map-mode-world").click();
  await expect(page.getByTestId("map-mode-world")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("bucket-list-total")).toHaveText("3");
  await expectBucketTabToMatchTotal(page);
});
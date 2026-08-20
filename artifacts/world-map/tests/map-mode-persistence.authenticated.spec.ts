import { expect, test, type Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

const SECOND_TRAVELER_EMAIL = "world-map-e2e-second+clerk_test@example.com";

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

const FIRST_TRAVELER_PROGRESS = {
  schemaVersion: 2,
  visitedCountries: ["250"], // France
  visitedStates: [],
  visitedProvinces: [],
  tccVisited: [],
  bucketCountries: ["036"], // Australia
  bucketStates: [],
  bucketProvinces: [],
  tccBucket: [],
  countryDetails: {},
  stateDetails: {},
  provinceDetails: {},
  tccDetails: {},
  notesByKey: {},
} as const;

test("does not save browser progress while cloud hydration is unavailable", async ({
  page,
}) => {
  const putRequests: string[] = [];
  let mapDataGetCount = 0;

  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      request.url().endsWith("/api/map-data")
    ) {
      putRequests.push(request.url());
    }
  });

  await page.route("**/api/map-data", async (route) => {
    if (route.request().method() === "GET") {
      mapDataGetCount += 1;
      if (mapDataGetCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "temporary failure" }),
        });
        return;
      }
    }

    await route.continue();
  });

  await page.addInitScript((staleProgress) => {
    for (const [key, value] of Object.entries(staleProgress)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, STALE_BROWSER_PROGRESS);

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Travel data unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "We couldn't load your cloud travel data. Nothing has been changed.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByTestId("map-canvas")).toHaveCount(0);

  // The failed request must not mount App, so its debounced sync cannot run.
  await page.waitForTimeout(3500);
  expect(putRequests).toHaveLength(0);

  const putAfterRetry = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      request.url().endsWith("/api/map-data"),
    { timeout: 10_000 },
  );
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByTestId("map-canvas")).toBeVisible();
  expect(mapDataGetCount).toBe(2);
  await putAfterRetry;
});

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

test("does not show or save one traveler's progress after switching accounts", async ({
  page,
}) => {
  await page.goto("/");

  const firstSeedStatus = await page.evaluate(async (cloudProgress) => {
    const response = await fetch("/api/map-data", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloudProgress),
    });
    return response.status;
  }, FIRST_TRAVELER_PROGRESS);
  expect(
    firstSeedStatus === 200,
    `seed first traveler map data (${firstSeedStatus})`,
  ).toBeTruthy();

  await page.reload();
  await expect(page.getByTestId("bucket-list-total")).toHaveText("1");
  await page.getByRole("button", { name: "★ Bucket List", exact: true }).click();
  await expect(
    page.getByTestId("bucket-list-item").getByRole("button", {
      name: "Australia",
      exact: true,
    }),
  ).toBeVisible();

  await clerk.signOut({ page });
  await page.waitForFunction(() => window.Clerk?.user === null);
  await clerk.signIn({ page, emailAddress: SECOND_TRAVELER_EMAIL });

  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await expect(page.getByTestId("bucket-list-total")).toHaveText("1");
  await page.getByRole("button", { name: "★ Bucket List", exact: true }).click();
  await expect(
    page.getByTestId("bucket-list-item").getByRole("button", {
      name: "New Zealand",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("bucket-list-item").getByRole("button", {
      name: "Australia",
      exact: true,
    }),
  ).toHaveCount(0);

  // Wait beyond the debounce window and verify the second traveler's cloud
  // fixture is unchanged until they make an intentional edit.
  await page.waitForTimeout(3500);
  const secondTravelerData = await page.evaluate(async () => {
    const response = await fetch("/api/map-data", { credentials: "include" });
    return response.json() as Promise<{
      data: { visitedCountries: string[]; bucketCountries: string[] };
    }>;
  });
  expect(secondTravelerData.data.visitedCountries).toEqual(["124"]);
  expect(secondTravelerData.data.bucketCountries).toEqual(["554"]);
});
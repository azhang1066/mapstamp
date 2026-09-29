import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const FIRST_EMAIL = "world-map-e2e+clerk_test@example.com";
const SECOND_EMAIL = "world-map-e2e-second+clerk_test@example.com";
const SECOND_USERNAME = "world_map_e2e_second";

// These fixtures deliberately have one shared visit, one visit unique to each
// traveler, and a bucket-list cross-over in both directions.
const FIRST_PROGRESS = {
  schemaVersion: 2,
  visitedCountries: ["250", "392"], // France, Japan
  visitedStates: ["06"], // California
  visitedProvinces: [],
  tccVisited: ["Albania", "United States (Contiguous)"],
  bucketCountries: [],
  bucketStates: [],
  bucketProvinces: ["Ontario"],
  tccBucket: ["Abkhazia"],
  countryDetails: {
    "250": { firstYear: 2018, lastYear: 2022, timesVisited: 3 },
    "392": { firstYear: 2019, lastYear: 2023, timesVisited: 2 },
  },
  stateDetails: { "06": { firstYear: 2020, lastYear: 2020, timesVisited: 1 } },
  provinceDetails: {},
  tccDetails: {
    Albania: { firstYear: 2021, lastYear: 2021, timesVisited: 1 },
    "United States (Contiguous)": { firstYear: 2020, lastYear: 2020, timesVisited: 1 },
  },
  notesByKey: {},
};

const PRIVATE_FRIEND_NOTE = "PRIVATE_COMPARE_NOTE_DO_NOT_DISPLAY";
const SECOND_PROGRESS = {
  schemaVersion: 2,
  visitedCountries: ["392"], // Japan
  visitedStates: [],
  visitedProvinces: ["Ontario"],
  tccVisited: ["Abkhazia"],
  bucketCountries: ["250"], // France
  bucketStates: ["06"], // California
  bucketProvinces: [],
  tccBucket: ["Albania", "United States (Contiguous)"],
  countryDetails: {
    "392": { firstYear: 2020, lastYear: 2024, timesVisited: 4 },
    
  },
  stateDetails: {},
  provinceDetails: { Ontario: { firstYear: 2017, lastYear: 2017, timesVisited: 2 } },
  tccDetails: { Abkhazia: { firstYear: 2022, lastYear: 2022, timesVisited: 2 } },
  notesByKey: { "country:392": PRIVATE_FRIEND_NOTE },
};

async function switchTraveler(page: Page, emailAddress: string) {
  await clerk.signOut({ page });
  await page.waitForFunction(() => window.Clerk?.user === null);
  await clerk.signIn({ page, emailAddress });
  // Reset React's account-scoped state and wait for cloud hydration.
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();
  // The Compare toolbar is gated by `isAuthenticated`, while the picker also
  // needs the hydrated `authUser`; wait for the latter to avoid clicking
  // during the short account-switch hydration window.
  await expect(page.getByTitle("Account settings")).toBeVisible();
}

async function api<T>(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        credentials: "include",
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      return { status: response.status, data: (await response.json()) as T };
    },
    { path, method, body },
  );
}

type ConnectionList = {
  pending: { incoming: Array<{ id: string }>; outgoing: Array<{ id: string }> };
  accepted: Array<{ id: string }>;
};

async function clearConnections(page: Page) {
  const { status, data } = await api<ConnectionList>(page, "/api/connections");
  expect(status).toBe(200);
  for (const { id } of [
    ...data.pending.incoming,
    ...data.pending.outgoing,
    ...data.accepted,
  ]) {
    expect((await api(page, `/api/connections/${id}`, "DELETE")).status).toBe(200);
  }
}

async function findSecondTraveler(page: Page) {
  const { status, data } = await api<{
    users: Array<{ userId: string; username: string }>;
  }>(page, `/api/users/search?q=${SECOND_USERNAME}`);
  expect(status).toBe(200);
  const userId = data.users.find((user) => user.username === SECOND_USERNAME)?.userId;
  expect(userId, "Clerk setup must provision the second traveler").toBeTruthy();
  return userId!;
}

async function seedProgress(page: Page, progress: typeof FIRST_PROGRESS | typeof SECOND_PROGRESS) {
  const { status } = await api(page, "/api/map-data", "PUT", progress);
  expect(status, "seed normalized destination rows via the real API").toBe(200);
}

function progressSnapshot(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage)
        // Mode and year-filter preferences are controls, not travel progress.
        .filter(([key]) =>
          /^(wm_(visited_|bucket_|tcc_visited|tcc_bucket|details_|notes)|photos:)/.test(key),
        )
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}

test.describe("authenticated Compare Maps", () => {
  test.describe.configure({ mode: "serial" });

  test("accepted travelers compare visits without saving or exposing private travel data", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await expect(page.getByTestId("map-canvas")).toBeVisible();
    await clearConnections(page);
    const secondId = await findSecondTraveler(page);

    try {
      await seedProgress(page, FIRST_PROGRESS);
      const request = await api<{ id: string }>(
        page,
        `/api/connections/request/${secondId}`,
        "POST",
      );
      expect(request.status).toBe(201);
      expect(request.data.id).toBeTruthy();

      await switchTraveler(page, SECOND_EMAIL);
      await seedProgress(page, SECOND_PROGRESS);
      expect(
        (await api(page, `/api/connections/${request.data.id}/accept`, "POST")).status,
      ).toBe(200);

      await switchTraveler(page, FIRST_EMAIL);
      // Seed changes must have hydrated into this user's own browser state.
      await expect(page.getByTestId("map-canvas")).toBeVisible();
      await page.waitForTimeout(3500); // Allow any baseline hydration save to settle.
      const before = await progressSnapshot(page);
      expect(JSON.stringify(before)).toContain("250");

      const comparePuts: string[] = [];
      let compareMounted = false;
      page.on("request", (req) => {
        if (
          compareMounted &&
          req.method() === "PUT" &&
          new URL(req.url()).pathname === "/api/map-data"
        ) {
          comparePuts.push(req.url());
        }
      });

      // Toolbar entry point: picker must search ACCEPTED connections only.
      await page.getByRole("button", { name: "Compare", exact: true }).click();
      await page.getByRole("dialog", { name: "Compare maps" })
        .getByRole("textbox", { name: "Search connections" }).fill(SECOND_USERNAME);
      await expect(page.getByText(`@${SECOND_USERNAME}`)).toBeVisible();
      await page.getByRole("button", { name: new RegExp(SECOND_USERNAME) }).click();
      await expect(page).toHaveURL(new RegExp(`/compare/${SECOND_USERNAME}$`));
      await expect(page.getByTestId("region-compare-export")).toBeVisible();
      // openComparison waits for the editable map's pending cloud sync before
      // navigation; only requests after mounting /compare count as regressions.
      compareMounted = true;
      expect(await progressSnapshot(page)).toEqual(before);
      await expect(page.getByTestId("legend-compare")).toContainText("Only You");
      await expect(page.getByTestId("legend-compare")).toContainText(`Only ${SECOND_USERNAME}`);
      await expect(page.getByTestId("legend-compare")).toContainText("Both visited");
      await expect(page.getByTestId("legend-compare")).toContainText("bucket list");
      await page.screenshot({ path: "test-results/compare-maps-desktop.png", fullPage: true });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("button-download").click(),
      ]);
      const pngPath = await download.path();
      expect(download.suggestedFilename()).toMatch(/\.png$/i);
      expect(pngPath).toBeTruthy();
      expect((await readFile(pngPath!)).subarray(0, 8).toString("hex"))
        .toBe("89504e470d0a1a0a");

      const comparison = await api<{
        me: { destinations: unknown[] };
        other: { destinations: unknown[] };
      }>(page, `/api/compare/${secondId}`);
      expect(comparison.status).toBe(200);
      expect(JSON.stringify(comparison.data)).not.toContain(PRIVATE_FRIEND_NOTE);
      expect(JSON.stringify(comparison.data)).not.toMatch(/notesByKey|photoKeys|storageKey|photos/i);
      await expect(page.getByText(PRIVATE_FRIEND_NOTE)).toHaveCount(0);
      await expect(page.getByTestId("panel-compare-stats")).toContainText("In common");
      // World: France, Japan, California vs Japan, Ontario.
      await expect(page.getByTestId("text-total-a")).toHaveText("3");
      await expect(page.getByTestId("text-total-b")).toHaveText("2");
      await expect(page.getByTestId("text-common-count")).toHaveText("1");
      await expect(page.getByTestId("text-bucket-hook")).toContainText("1 place");
      await expect(page.getByTestId("text-visits-a")).toHaveText("6");
      await expect(page.getByTestId("text-visits-b")).toHaveText("6");
      await expect(page.getByTestId("list-friend-on-my-bucket")).toContainText("Ontario");
      await expect(page.getByTestId("list-me-on-friend-bucket")).toContainText("France");

      // Japan is visited by both; its two timelines and visit counts must be
      // present both on hover and in the read-only detail panel.
      const japan = page.getByTestId("geo-country:392");
      await expect(japan).toHaveAttribute("style", /-both/);
      // react-simple-maps keeps a transparent interaction rect above paths;
      // focus the verified keyboard-accessible Japan path, which invokes the
      // same tooltip handler without relying on pointer hit-testing.
      await japan.focus();
      const tooltip = page.getByTestId("tooltip-compare");
      await expect(tooltip).toContainText("Japan");
      for (const value of ["2019", "2023", "2", "2020", "2024", "4"]) {
        await expect(tooltip).toContainText(value);
      }
      await japan.click();
      const details = page.getByTestId("panel-compare-details");
      await expect(details).toContainText("Japan");
      await expect(details).toContainText("You");
      await expect(details).toContainText(SECOND_USERNAME);
      for (const value of ["2019", "2023", "2020", "2024"]) {
        await expect(details).toContainText(value);
      }
      await expect(page.getByTestId("details-col-a")).toContainText(/Times visited\s*2/);
      await expect(page.getByTestId("details-col-b")).toContainText(/Times visited\s*4/);
      await expect(details).not.toContainText(PRIVATE_FRIEND_NOTE);
      await expect(details.locator("img")).toHaveCount(0);

      // A recorded year must filter both people's visits, not just the owner.
      await page.getByTestId("select-recorded-year").selectOption("2018");
      await expect(page.getByTestId("text-total-a")).toHaveText("1");
      await expect(page.getByTestId("text-total-b")).toHaveText("0");
      await expect(page.getByTestId("text-common-count")).toHaveText("0");
      await page.getByTestId("checkbox-year-filter").uncheck();
      await expect(page.getByTestId("text-total-a")).toHaveText("3");

      for (const label of ["Me", SECOND_USERNAME, "Both only", "Show bucket lists"]) {
        const toggle = page.getByRole("group", { name: "Layers" })
          .getByRole("button", { name: label, exact: true });
        const initiallyOn = label !== "Both only";
        await expect(toggle).toHaveAttribute("aria-pressed", String(initiallyOn));
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", String(!initiallyOn));
        if (label === "Me") {
          // With A hidden, shared Japan must render as B-only rather than both.
          await expect(japan).toHaveAttribute("style", /-b[)"']/);
        }
        if (initiallyOn) {
          await toggle.click();
          await expect(toggle).toHaveAttribute("aria-pressed", "true");
        }
      }
      await expect(japan).toHaveAttribute("style", /-both/);
      const myOpacity = page.getByTestId("slider-opacity-me");
      await myOpacity.focus();
      await myOpacity.press("ArrowLeft");
      await expect(myOpacity).toHaveValue("0.85");
      await page.getByTestId("button-swap").click();
      await expect(page.getByTestId("legend-compare")).toContainText(`Only ${SECOND_USERNAME}`);
      await expect(page.getByRole("slider", { name: /opacity/i })).toHaveCount(2);

      await page.getByTestId("button-mode-tcc").click();
      await expect(page.getByTestId("button-mode-tcc")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("geo-tcc:Albania")).toBeVisible();
      await expect(page.getByTestId("marker-tcc:Abkhazia")).toBeVisible();
      await expect(page.getByTestId("chart-regions")).toBeVisible();
      // TCC's U.S. layer uses TCC destination IDs, not world-mode state IDs.
      await expect(page.getByTestId("geo-tcc:United States (Contiguous)").first()).toBeVisible();
      await page.getByTestId("button-mode-world").click();
      await expect(page.getByTestId("button-mode-world")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("geo-us_state:06")).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId("button-open-stats")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(390);
      await page.getByTestId("button-open-stats").click();
      await expect(page.getByRole("dialog", { name: "Comparison statistics" })).toBeVisible();
      await page.screenshot({ path: "test-results/compare-maps-mobile.png", fullPage: true });
      await page.getByTestId("button-close-stats").click();
      await page.setViewportSize({ width: 1280, height: 720 });

      // The route is read-only even after controls and detail interactions.
      await page.waitForTimeout(3500);
      expect(comparePuts, "compare view must never PUT /api/map-data").toEqual([]);
      expect(await progressSnapshot(page)).toEqual(before);
      compareMounted = false;
      await page.goto("/");
      await expect(page.getByTestId("map-canvas")).toBeVisible();
      expect(await progressSnapshot(page)).toEqual(before);

      // The accepted connection card supplies the second entry point.
      await page.getByTitle("Account settings").click();
      await page.getByRole("button", { name: "Connections", exact: true }).click();
      await page.getByTestId("connections-tab-connections").click();
      await page.getByRole("button", { name: "Compare maps" }).click();
      await expect(page).toHaveURL(new RegExp(`/compare/${SECOND_USERNAME}$`));
      compareMounted = true;
      await expect(page.getByTestId("region-compare-export")).toBeVisible();
      await page.waitForTimeout(3500);
      expect(comparePuts, "neither compare entry point may write map data").toEqual([]);
      expect(await progressSnapshot(page)).toEqual(before);
    } finally {
      if (new URL(page.url()).pathname !== "/") await page.goto("/");
      await clearConnections(page);
    }
  });

  test("nonconnections cannot view another traveler's compare route", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("map-canvas")).toBeVisible();
    await clearConnections(page);
    const secondId = await findSecondTraveler(page);
    expect((await api(page, `/api/compare/${secondId}`)).status).toBe(403);
    await page.goto(`/compare/${SECOND_USERNAME}`);
    await expect(page.getByText("You need to be connected to compare maps")).toBeVisible();
    await expect(page.getByTestId("region-compare-export")).toHaveCount(0);
  });
});
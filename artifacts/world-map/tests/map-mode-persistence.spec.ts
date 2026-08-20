import { expect, test, type Page } from "@playwright/test";

const SAVED_PROGRESS = {
  "wm_visited_countries": ["250"], // France
  "wm_bucket_countries": ["392"], // Japan
  "wm_tcc_visited": ["Albania"],
  "wm_tcc_bucket": ["Abkhazia"],
  "wm_map_mode": "world",
} as const;

type BrowserIssue = {
  phase: string;
  message: string;
};

function recordBrowserIssues(page: Page) {
  let phase = "initial load";
  const consoleErrors: BrowserIssue[] = [];
  const uncaughtExceptions: BrowserIssue[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ phase, message: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    uncaughtExceptions.push({ phase, message: error.message });
  });

  return {
    setPhase(nextPhase: string) {
      phase = nextPhase;
    },
    async assertClean() {
      const report = { consoleErrors, uncaughtExceptions };
      await test.info().attach("map-mode-browser-issues", {
        body: Buffer.from(JSON.stringify(report, null, 2)),
        contentType: "application/json",
      });

      expect(consoleErrors, "browser console errors").toEqual([]);
      expect(uncaughtExceptions, "uncaught browser exceptions").toEqual([]);
    },
  };
}

async function expectActiveModeWithRenderedMap(page: Page, mode: "world" | "tcc") {
  const modeButton = page.getByTestId(`map-mode-${mode}`);
  const map = page.getByTestId("map-canvas");

  await expect(modeButton).toHaveAttribute("aria-pressed", "true");
  await expect(map).toBeVisible();
  await expect
    .poll(() => map.locator("path").count(), {
      message: `${mode} mode should render map geography paths`,
    })
    .toBeGreaterThan(0);
}

async function seedSavedProgress(page: Page) {
  await page.evaluate((savedProgress) => {
    for (const key of [
      "wm_visited_countries",
      "wm_bucket_countries",
      "wm_tcc_visited",
      "wm_tcc_bucket",
      "wm_map_mode",
    ]) {
      localStorage.removeItem(key);
    }

    for (const [key, value] of Object.entries(savedProgress)) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    // Map mode is the only value that is stored as a plain string.
    localStorage.setItem("wm_map_mode", savedProgress.wm_map_mode);
  }, SAVED_PROGRESS);
}

async function expectWorldSavedProgress(page: Page) {
  await expectActiveModeWithRenderedMap(page, "world");
  await expect(page.getByTestId("bucket-list-total")).toHaveText("2");
  await page.getByRole("button", { name: "Countries", exact: true }).click();

  const france = page.getByRole("button", { name: "France", exact: true }).locator("..");
  const japan = page.getByRole("button", { name: "Japan", exact: true }).locator("..");

  await expect(france).toBeVisible();
  await expect(france).toHaveClass(/bg-emerald-900\/30/);
  await expect(france.getByRole("checkbox")).toBeChecked();

  await expect(japan).toBeVisible();
  await expect(japan).toHaveClass(/bg-amber-900\/20/);
  await expect(japan.getByRole("checkbox")).not.toBeChecked();
  await expect(japan.getByTitle("Remove from bucket list")).toBeVisible();
}

async function expectTccSavedProgress(page: Page) {
  await expectActiveModeWithRenderedMap(page, "tcc");
  await expect(page.getByTestId("map-mode-tcc")).toContainText("1/330");
  await expect(page.getByTestId("bucket-list-total")).toHaveText("2");

  await page.getByRole("button", { name: "★ Bucket List", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Abkhazia\b/ })).toBeVisible();
}

test("keeps saved World and TCC destinations visible through mode changes and reloads", async ({ page }) => {
  const issues = recordBrowserIssues(page);

  await page.goto("/");
  await seedSavedProgress(page);

  issues.setPhase("seeded World reload");
  await page.reload();
  await expectWorldSavedProgress(page);

  await page.getByTestId("map-mode-tcc").click();
  await expectTccSavedProgress(page);

  issues.setPhase("seeded TCC reload");
  await page.reload();
  await expectTccSavedProgress(page);

  await page.getByTestId("map-mode-world").click();
  await expectWorldSavedProgress(page);

  issues.setPhase("seeded World reload after TCC");
  await page.reload();
  await expectWorldSavedProgress(page);

  await issues.assertClean();
});
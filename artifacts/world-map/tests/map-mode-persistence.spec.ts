import { expect, test, type Page } from "@playwright/test";

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

test("preserves World and TCC map modes through browser reloads", async ({ page }) => {
  const issues = recordBrowserIssues(page);

  await page.goto("/");

  await page.getByTestId("map-mode-tcc").click();
  await expectActiveModeWithRenderedMap(page, "tcc");

  issues.setPhase("TCC reload");
  await page.reload();
  await expectActiveModeWithRenderedMap(page, "tcc");

  await page.getByTestId("map-mode-world").click();
  await expectActiveModeWithRenderedMap(page, "world");

  issues.setPhase("World reload");
  await page.reload();
  await expectActiveModeWithRenderedMap(page, "world");

  await issues.assertClean();
});
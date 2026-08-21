import { expect, test } from "@playwright/test";

const EMPTY_CONNECTIONS = {
  pending: { incoming: [], outgoing: [] },
  accepted: [],
};

function isConnectionsPanelModule(url: string) {
  return /(?:^|\/)ConnectionsPanel(?:-[^/]+)?\.(?:js|tsx)$/.test(
    new URL(url).pathname,
  );
}

test("loads Connections only from the signed-in account menu and opens Pending", async ({
  page,
}) => {
  const connectionRequests: string[] = [];
  const panelModuleRequests: string[] = [];

  page.on("request", (request) => {
    if (isConnectionsPanelModule(request.url())) {
      panelModuleRequests.push(request.url());
    }
  });

  await page.route("**/api/connections", async (route) => {
    connectionRequests.push(route.request().method());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(EMPTY_CONNECTIONS),
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();

  // Let React Query settle before asserting that opening the map did not fetch
  // collaboration data or preload the deferred panel. Either eager request
  // would be captured before the account-menu action.
  await page.waitForTimeout(750);
  expect(
    connectionRequests,
    "Connections must not be queried before the account-menu action",
  ).toEqual([]);
  expect(
    panelModuleRequests,
    "ConnectionsPanel must not download before the account-menu action",
  ).toEqual([]);

  await page.getByTitle("Account settings").click();
  const openConnections = page.getByRole("button", {
    name: "Connections",
    exact: true,
  });
  await expect(openConnections).toBeVisible();

  const panelRequest = page.waitForRequest(
    (request) =>
      request.method() === "GET" && request.url().endsWith("/api/connections"),
  );
  const panelModuleRequest = page.waitForRequest((request) =>
    isConnectionsPanelModule(request.url()),
  );
  await openConnections.click();
  await panelModuleRequest;
  await panelRequest;

  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();
  expect(panelModuleRequests).toHaveLength(1);
  expect(connectionRequests).toEqual(["GET"]);
});

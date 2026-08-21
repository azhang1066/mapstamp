import { expect, test, type Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

const FIRST_TRAVELER_EMAIL = "world-map-e2e+clerk_test@example.com";
const FIRST_TRAVELER_USERNAME = "world_map_e2e";
const SECOND_TRAVELER_EMAIL = "world-map-e2e-second+clerk_test@example.com";
const SECOND_TRAVELER_USERNAME = "world_map_e2e_second";

const EMPTY_CONNECTIONS = {
  pending: { incoming: [], outgoing: [] },
  accepted: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Delete every connection visible to the currently signed-in traveler. */
async function deleteAllConnections(page: Page) {
  await page.evaluate(async () => {
    const res = await fetch("/api/connections", { credentials: "include" });
    const data = (await res.json()) as {
      pending: {
        incoming: Array<{ id: string }>;
        outgoing: Array<{ id: string }>;
      };
      accepted: Array<{ id: string }>;
    };
    const all = [
      ...data.pending.incoming,
      ...data.pending.outgoing,
      ...data.accepted,
    ];
    await Promise.all(
      all.map((c) =>
        fetch(`/api/connections/${c.id}`, {
          method: "DELETE",
          credentials: "include",
        }),
      ),
    );
  });
}

/**
 * Open the Connections panel from the account-settings menu.
 * Waits until the panel heading is visible before returning.
 */
async function openConnectionsPanel(page: Page) {
  await page.getByTitle("Account settings").click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
}

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

// ── Two-traveler mutation flows ───────────────────────────────────────────────

test("second traveler can accept a connection request sent by the first traveler", async ({
  page,
}) => {
  // This test performs multiple sign-in/out cycles; give it extra runway.
  test.setTimeout(120_000);

  // ── Clean up: delete all connections visible to the first traveler ───────────
  // DELETE allows either party to remove a connection, so cleaning up as the
  // first traveler is sufficient to clear any prior state between the two.
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await deleteAllConnections(page);

  // ── First traveler opens the panel and sends a connection request ────────────
  await openConnectionsPanel(page);

  // Search for the second traveler and send a request
  await page
    .getByPlaceholder("Search by username or display name…")
    .fill(SECOND_TRAVELER_USERNAME);
  await page.waitForResponse(
    (res) => res.url().includes("/api/users/search") && res.status() === 200,
  );
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Connection request sent!")).toBeVisible();

  // ── Second traveler accepts the request ──────────────────────────────────────
  await clerk.signOut({ page });
  await page.waitForFunction(() => window.Clerk?.user === null);
  await clerk.signIn({ page, emailAddress: SECOND_TRAVELER_EMAIL });
  // Navigate to reset React state (showConnections persists across Clerk
  // sign-in without a navigation and the ConnectionsPanel overlay would block
  // subsequent clicks on UI elements underneath it).
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();

  await openConnectionsPanel(page);
  // The Pending badge changes the button's accessible name to "Pending 1" when
  // there is one incoming request; use a partial match instead of exact:true.
  await page.getByRole("button", { name: /^Pending/ }).click();

  // The Pending tab must show the incoming request from the first traveler
  await expect(page.getByText(`@${FIRST_TRAVELER_USERNAME}`)).toBeVisible();

  // Accept the request
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Connection accepted!")).toBeVisible();

  // ── Verify accepted state in the Connections tab for the second traveler ─────
  // After accepting, React Query invalidates the list; the Connections tab
  // now shows the newly-accepted connection.
  await page.getByRole("button", { name: /^Connections/ }).last().click();
  await expect(page.getByText(`@${FIRST_TRAVELER_USERNAME}`)).toBeVisible();

  // ── Verify accepted state from the first traveler's perspective ───────────────
  await clerk.signOut({ page });
  await page.waitForFunction(() => window.Clerk?.user === null);
  await clerk.signIn({ page, emailAddress: FIRST_TRAVELER_EMAIL });
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();

  await openConnectionsPanel(page);
  await page.getByRole("button", { name: /^Connections/ }).last().click();
  await expect(page.getByText(`@${SECOND_TRAVELER_USERNAME}`)).toBeVisible();
});

test("second traveler can decline a connection request sent by the first traveler", async ({
  page,
}) => {
  // This test performs multiple sign-in/out cycles; give it extra runway.
  test.setTimeout(120_000);

  // ── Clean up: delete all connections visible to the first traveler ───────────
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await deleteAllConnections(page);

  // ── First traveler sends a connection request ─────────────────────────────
  await openConnectionsPanel(page);

  await page
    .getByPlaceholder("Search by username or display name…")
    .fill(SECOND_TRAVELER_USERNAME);
  await page.waitForResponse(
    (res) => res.url().includes("/api/users/search") && res.status() === 200,
  );
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Connection request sent!")).toBeVisible();

  // ── Second traveler declines the request ─────────────────────────────────
  await clerk.signOut({ page });
  await page.waitForFunction(() => window.Clerk?.user === null);
  await clerk.signIn({ page, emailAddress: SECOND_TRAVELER_EMAIL });
  // Navigate to reset React state so the ConnectionsPanel overlay from the
  // first traveler's session does not block UI elements underneath it.
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();

  await openConnectionsPanel(page);
  // Partial match for "Pending" because the badge changes the accessible name
  // to "Pending 1" when there is one incoming request.
  await page.getByRole("button", { name: /^Pending/ }).click();

  // The Pending tab must show the incoming request from the first traveler
  await expect(page.getByText(`@${FIRST_TRAVELER_USERNAME}`)).toBeVisible();

  // Decline the request
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Request declined.")).toBeVisible();

  // ── After declining, the pending tab must be empty for the second traveler ──
  await expect(page.getByText("No pending requests.")).toBeVisible();

  // ── First traveler also has no pending outgoing after refetch ────────────────
  await clerk.signOut({ page });
  await page.waitForFunction(() => window.Clerk?.user === null);
  await clerk.signIn({ page, emailAddress: FIRST_TRAVELER_EMAIL });
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();

  await openConnectionsPanel(page);
  await page.getByRole("button", { name: /^Pending/ }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();
});

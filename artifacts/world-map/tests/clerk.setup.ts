import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const firstTraveler = {
  email: "world-map-e2e+clerk_test@example.com",
  username: "world_map_e2e",
  firstName: "World",
  lastName: "Map E2E",
};
const secondTraveler = {
  email: "world-map-e2e-second+clerk_test@example.com",
  username: "world_map_e2e_second",
  firstName: "Second",
  lastName: "Traveler",
};
const secondTravelerProgress = {
  visitedCountries: ["124"], // Canada
  visitedStates: [],
  visitedProvinces: [],
  tccVisited: [],
  bucketCountries: ["554"], // New Zealand
  bucketStates: [],
  bucketProvinces: [],
  tccBucket: [],
  countryDetails: {},
  stateDetails: {},
  provinceDetails: {},
  tccDetails: {},
  notesByKey: {},
};
const authStatePath = path.resolve(
  import.meta.dirname,
  ".auth/world-map-e2e.json",
);

setup.describe.configure({ mode: "serial" });

setup("prepares Clerk test authentication", async () => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;

  if (!secretKey || !publishableKey) {
    throw new Error(
      "Authenticated map tests require CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.",
    );
  }

  await clerkSetup({ dotenv: false });

  const client = createClerkClient({ secretKey });
  for (const traveler of [firstTraveler, secondTraveler]) {
    const { data: existingUsers } = await client.users.getUserList({
      emailAddress: [traveler.email],
    });

    if (existingUsers.length === 0) {
      await client.users.createUser({
        emailAddress: [traveler.email],
        firstName: traveler.firstName,
        lastName: traveler.lastName,
        password: `${randomBytes(24).toString("base64url")}Aa1!`,
      });
    }
  }
});

setup("prepares two authenticated travelers for map persistence tests", async ({ page }) => {
  async function setUsername(username: string) {
    const usernameStatus = await page.evaluate(async (value) => {
      const response = await fetch("/api/profile/username", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      return response.status;
    }, username);
    expect(
      usernameStatus === 200,
      `set test username (${usernameStatus})`,
    ).toBeTruthy();
  }

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: secondTraveler.email });
  await setUsername(secondTraveler.username);

  const seedStatus = await page.evaluate(async (cloudProgress) => {
    const response = await fetch("/api/map-data", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloudProgress),
    });
    return response.status;
  }, secondTravelerProgress);
  expect(
    seedStatus === 200,
    `seed second traveler map data (${seedStatus})`,
  ).toBeTruthy();

  // Reload while still signed in so no pending empty-state save can replace
  // the fixture before the account-switch regression test begins.
  await page.reload();
  await expect(page.getByTitle("Account settings")).toBeVisible();

  await clerk.signOut({ page });
  await page.waitForFunction(() => window.Clerk?.user === null);

  await clerk.signIn({ page, emailAddress: firstTraveler.email });
  await setUsername(firstTraveler.username);

  await page.reload();
  await expect(page.getByTitle("Account settings")).toBeVisible();

  await mkdir(path.dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
});
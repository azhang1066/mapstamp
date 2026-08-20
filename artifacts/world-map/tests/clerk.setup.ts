import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const testUserEmail = "world-map-e2e+clerk_test@example.com";
const testUsername = "world_map_e2e";
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
  const { data: existingUsers } = await client.users.getUserList({
    emailAddress: [testUserEmail],
  });

  if (existingUsers.length === 0) {
    await client.users.createUser({
      emailAddress: [testUserEmail],
      firstName: "World",
      lastName: "Map E2E",
      password: `${randomBytes(24).toString("base64url")}Aa1!`,
    });
  }
});

setup("signs in the cloud-hydration test user", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: testUserEmail });

  const usernameStatus = await page.evaluate(async (username) => {
    const response = await fetch("/api/profile/username", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    return response.status;
  }, testUsername);
  expect(
    usernameStatus === 200,
    `set test username (${usernameStatus})`,
  ).toBeTruthy();

  await page.reload();
  await expect(page.getByTitle("Account settings")).toBeVisible();

  await mkdir(path.dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
});
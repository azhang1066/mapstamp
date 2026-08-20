import { defineConfig } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 26524);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? 26525);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const authenticatedBaseURL =
  process.env.PLAYWRIGHT_AUTHENTICATED_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  baseURL;
const apiBaseURL =
  process.env.PLAYWRIGHT_API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;
const authenticatedState = path.resolve(
  import.meta.dirname,
  "tests/.auth/world-map-e2e.json",
);

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @workspace/api-server run dev",
      url: `${apiBaseURL}/api/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(apiPort),
      },
    },
    {
      command: "pnpm --filter @workspace/world-map run dev",
      url: `${baseURL}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(port),
        BASE_PATH: "/",
        API_PROXY_TARGET: apiBaseURL,
      },
    },
  ],
  projects: [
    {
      name: "public",
      testIgnore: /\.authenticated\.spec\.ts/,
    },
    {
      name: "clerk setup",
      testMatch: /clerk\.setup\.ts/,
      use: {
        baseURL: authenticatedBaseURL,
      },
    },
    {
      name: "authenticated",
      testMatch: /\.authenticated\.spec\.ts/,
      use: {
        baseURL: authenticatedBaseURL,
        storageState: authenticatedState,
      },
      dependencies: ["clerk setup"],
    },
  ],
});
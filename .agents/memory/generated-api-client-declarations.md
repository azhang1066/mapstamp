---
name: Generated API client declarations
description: Keeping workspace consumers aligned with the regenerated OpenAPI React Query client.
---

After running the OpenAPI code generator, rebuild the `@workspace/api-client-react` TypeScript project so its declaration output matches the fresh generated source before typechecking downstream apps.

**Why:** Workspace consumers can resolve stale declaration files even though Vite serves the new generated TypeScript source, producing false "not exported" errors for recently generated hooks and types.

**How to apply:** Whenever codegen changes the API client, run `pnpm --filter @workspace/api-client-react exec tsc -b` before checking or building dependent artifacts. Generated React Query hook options also require their generated `queryKey` when supplying custom query options such as `enabled` or `staleTime`.
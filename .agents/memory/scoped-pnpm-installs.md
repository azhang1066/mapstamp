---
name: Scoped pnpm installs
description: Installing runtime dependencies in a leaf package of this pnpm monorepo.
---

The generic language package installer invokes `pnpm add` at the workspace root and rejects a pnpm `--filter` argument as a package token. When a dependency belongs to a leaf package, use pnpm's filtered add command rather than installing it at the root.

**Why:** The unfiltered installer fails the workspace-root safety check, and it cannot accept flags needed to scope the install.

**How to apply:** Scope future installs to the consuming artifact or library package so its manifest and the lockfile agree.
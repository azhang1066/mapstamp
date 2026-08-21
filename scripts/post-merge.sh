#!/bin/bash
set -e

# Install / sync dependencies after any merge.
# --no-frozen-lockfile lets pnpm update the lockfile when package.json
# changes land in a merge without a matching lockfile commit.
pnpm install --no-frozen-lockfile

# Rebuild the db library so downstream packages (api-server, world-map)
# see any schema changes that arrived in the merge.
pnpm --filter @workspace/db run build

# Apply any schema changes to the database so the live schema matches
# what the code expects after the merge.
pnpm --filter @workspace/db run push

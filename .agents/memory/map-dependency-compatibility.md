---
name: Map dependency compatibility
description: Why map dependency upgrades require visual checks of region colors and interaction states.
---

Map-library upgrades must preserve the existing default, hover, and pressed region styling, not just geography geometry.

**Why:** A newer major accepted the existing component calls and passed the production build, but rendered every region black because its styling contract had changed. The local ambient types did not catch this.

**How to apply:** Check actual region fills and hover/selection states in the browser before accepting a map-library major upgrade. Until the style API is migrated, prefer compatible transitive security patches over an otherwise unnecessary major upgrade.

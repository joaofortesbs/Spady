---
name: Replit package installation
description: Replit-specific dependency constraints found during imported app setup.
---

The imported dependency set may require the Node runtime version declared by native packages, and Replit's package firewall can block older locked tarballs. When the existing lockfile also has a peer conflict, update only blocked direct dependencies to compatible permitted releases and use `npm install --legacy-peer-deps`.

**Why:** A clean lockfile install initially failed on blocked historical versions and the existing `autumn-js`/`better-auth` peer mismatch, while the app itself remained compatible with bounded dependency updates.

**How to apply:** Check engine warnings and firewall output before changing application code; preserve the framework major version and validate both the app build and the test runner after dependency updates.
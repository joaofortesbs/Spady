---
name: Replit package installation
description: Replit-specific dependency constraints found during imported app setup.
---

The imported dependency set may require the Node runtime version declared by native packages, and Replit's package firewall can block older locked tarballs. Keep the canonical lockfile on permitted releases and align direct peer dependencies after security upgrades; do not rely on `--legacy-peer-deps` for publishing.

**Why:** Local setup can appear healthy with a relaxed resolver, but publishing runs a strict npm install. A safe authentication-library upgrade introduced a higher ORM peer minimum, so publishing failed until the direct ORM dependency matched it.

**How to apply:** Check engine warnings, firewall output, and the full peer chain before changing application code. Preserve framework majors, align direct peers, then validate a clean production build and the test runner.
---
name: Replit package installation
description: Replit-specific dependency constraints found during imported app setup.
---

The imported dependency set may require the Node runtime version declared by native packages, and Replit's package firewall can block older locked tarballs. Keep the canonical lockfile on permitted releases and align direct peer dependencies after security upgrades; do not rely on `--legacy-peer-deps` for publishing.

**Why:** Local setup can appear healthy with a relaxed resolver, but publishing runs a strict npm install. A safe authentication-library upgrade introduced a higher ORM peer minimum, so publishing failed until the direct ORM dependency matched it.

**How to apply:** Check engine warnings, firewall output, and the full peer chain before changing application code. Preserve framework majors, align direct peers, then validate a clean production build and the test runner.

When upgrading Vitest, keep the Vite major consistent across its dependency and peer graph rather than allowing optional peer resolution to select a newer major.

**Why:** npm 10's resolver crashed with `Cannot read properties of null (reading 'edgesOut')` while traversing optional Vite development-tools peers during a Vitest 4 upgrade. Adding Vite as a direct dependency alone did not constrain that traversal; a compatible global Vite override did. Relaxing peer checks would hide the issue from local installation but leave publishing exposed.

**How to apply:** If this resolver error returns, inspect the optional peer chain and the supported Vite ranges before changing the test runner or package manager. Use a compatible override only when the evidence supports it, and verify tests and the production build.
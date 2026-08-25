---
name: Netlify public environment scanning
description: Handling Netlify secrets scanner flags for intentionally public Next.js environment variables.
---

When Netlify's secrets scan flags a `NEXT_PUBLIC_*` Supabase configuration value in a Next.js build artifact, omit only the intentionally public keys with `SECRETS_SCAN_OMIT_KEYS`. Do not disable secrets scanning globally and never omit server-only credentials.

**Why:** Next.js inlines `NEXT_PUBLIC_*` values into browser bundles by design, so the scanner can correctly detect but incorrectly classify public connection configuration as a secret.

**How to apply:** Keep the exception in `netlify.toml` scoped to the public URL and anonymous key. Never include `SUPABASE_SERVICE_ROLE_KEY`, session secrets, or other private values.
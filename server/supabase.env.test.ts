import { describe, expect, it } from "vitest";

describe("Supabase environment", () => {
  it("accepts the configured public URL and anon key", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(supabaseUrl).toMatch(/^https:\/\/[^/]+\.supabase\.co\/?$/);
    expect(anonKey).toBeTruthy();

    const response = await fetch(`${supabaseUrl!.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey! },
    });

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, 15_000);
});

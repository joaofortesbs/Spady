import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe("Supabase service role configuration", () => {
  it("can execute a lightweight authenticated read", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(url).toBeTruthy();
    expect(serviceRoleKey).toBeTruthy();

    const supabase = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase.from("profiles").select("id").limit(1);

    expect(error).toBeNull();
  }, 15000);
});

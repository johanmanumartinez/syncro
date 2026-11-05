import { createAdminClient } from "./admin";
import { createClient } from "./server";
import type { User } from "@supabase/supabase-js";

/** Autentica desde cookie (web) o Authorization: Bearer (extensión). */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = createAdminClient();
    const { data } = await admin.auth.getUser(token);
    return data.user ?? null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

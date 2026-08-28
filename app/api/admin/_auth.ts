import { NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from "../../config/server-config";

const ANON_KEY = SUPABASE_ANON_KEY;
const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

export async function requireAdmin(request: NextRequest) {
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Not authenticated.");

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) throw new Error("Not authenticated.");
  const authUser = await userResponse.json();

  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=id,full_name,role&id=eq.${encodeURIComponent(authUser.id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, cache: "no-store" },
  );
  if (!profileResponse.ok) throw new Error("Unable to verify user role.");
  const profiles = await profileResponse.json();
  const profile = profiles?.[0];
  if (!profile || profile.role !== "admin") throw new Error("Admin access required.");

  return { authUser, profile };
}

export function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
}

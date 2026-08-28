import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from "../../config/server-config";

const ANON_KEY = SUPABASE_ANON_KEY;
const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: NextRequest) {
  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const auth = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!auth.ok) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const user = await auth.json();
    if (!SERVICE_KEY) return NextResponse.json({ id: user.id, email: user.email, full_name: user.user_metadata?.full_name || "", role: "user" });
    const profile = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,full_name,email,role&id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, cache: "no-store" });
    if (!profile.ok) return NextResponse.json({ id: user.id, email: user.email, full_name: user.user_metadata?.full_name || "", role: "user" });
    const rows = await profile.json();
    return NextResponse.json(rows?.[0] || { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || "", role: "user" });
  } catch { return NextResponse.json({ error: "Unable to load profile." }, { status: 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAdmin, AdminAuthError } from "../_auth";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../../../config/server-config";

const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

function errorResponse(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,full_name,email,role,created_at&order=created_at.desc`, { headers: adminHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(await response.text());
    return NextResponse.json(await response.json());
  } catch (e) { return errorResponse(e, e instanceof AdminAuthError ? e.status : 400); }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const full_name = String(body.full_name || "").trim();
    const role = ["user", "author", "admin"].includes(body.role) ? body.role : "user";
    if (!email || !password || !full_name) throw new Error("Full name, email and password are required.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");

    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
        app_metadata: { role },
      }),
    });
    const authData = await authResponse.json();
    if (!authResponse.ok) {
      const detail = authData?.msg || authData?.message || authData?.error_description || authData?.error || "Could not create auth user.";
      throw new Error(detail);
    }

    const authUserId = authData?.id || authData?.user?.id;
    if (!authUserId) throw new Error("Supabase created the account but did not return a user ID.");

    // A database trigger may already have created the public profile. Upsert
    // instead of POSTing a second row, which would otherwise fail on the
    // primary-key constraint and make account creation appear unsuccessful.
    const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=id`, {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: authUserId, full_name, email, role }),
    });
    if (!profileResponse.ok) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, { method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
      const profileError = await profileResponse.text();
      throw new Error(profileError || "Could not create the user profile.");
    }
    return NextResponse.json((await profileResponse.json())?.[0] || { id: authUserId, full_name, email, role });
  } catch (e) { return errorResponse(e, 400); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { authUser } = await requireAdmin(request);
    const body = await request.json();
    const id = String(body.id || "");
    const role = String(body.role || "");
    const full_name = body.full_name == null ? undefined : String(body.full_name).trim();
    if (!id || !["user", "author", "admin"].includes(role)) throw new Error("Valid user id and role are required.");
    if (id === authUser.id && role !== "admin") throw new Error("You cannot remove your own admin role.");
    const payload: Record<string,string> = { role };
    if (full_name !== undefined) payload.full_name = full_name;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...adminHeaders(), Prefer: "return=representation" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(await response.text());

    // Keep the server-managed Auth role in sync with the public profile.
    const authUpdate = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ app_metadata: { role } }),
    });
    if (!authUpdate.ok) throw new Error(await authUpdate.text());

    return NextResponse.json((await response.json())?.[0] || {});
  } catch (e) { return errorResponse(e, e instanceof AdminAuthError ? e.status : 400); }
}

export async function DELETE(request: NextRequest) {
  try {
    const { authUser } = await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) throw new Error("User id is required.");
    if (id === authUser.id) throw new Error("You cannot delete your own account from this dashboard.");
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!response.ok) throw new Error(await response.text());
    await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: adminHeaders() });
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e, 400); }
}

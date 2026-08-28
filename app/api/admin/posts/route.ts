import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAdmin } from "../_auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kdmbspupunfrwkvcosov.supabase.co";

function errorResponse(error: unknown, status = 400) { return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status }); }

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/news?select=*&order=created_at.desc`, { headers: adminHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(await response.text());
    return NextResponse.json(await response.json());
  } catch (e) { return errorResponse(e, 403); }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) throw new Error("Post id is required.");
    const payload: Record<string,unknown> = {};
    ["title","summary","content","category","image_url","status","approval_status","author_id"].forEach((key) => { if (body[key] !== undefined) payload[key] = body[key]; });
    if (payload.status === "published" && body.published_at === undefined) payload.published_at = new Date().toISOString();
    if (payload.status !== "published") payload.published_at = null;
    if (payload.status === "published" && body.approval_status === undefined) payload.approval_status = "approved";
    payload.updated_at = new Date().toISOString();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/news?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...adminHeaders(), Prefer: "return=representation" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(await response.text());
    return NextResponse.json((await response.json())?.[0] || {});
  } catch (e) { return errorResponse(e, 400); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) throw new Error("Post id is required.");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/news?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: adminHeaders() });
    if (!response.ok) throw new Error(await response.text());
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e, 400); }
}

import { NextRequest } from "next/server";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} from "../../config/server-config";

const ANON_KEY = SUPABASE_ANON_KEY;
const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

export const dynamic = "force-dynamic";

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

function jsonErrorText(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed?.message || parsed?.msg || parsed?.error_description || parsed?.error || value;
  } catch {
    return value;
  }
}

export async function requireAdmin(request: NextRequest) {
  if (!ANON_KEY) throw new AdminAuthError("Supabase anon key is not configured on the server.", 500);
  if (!SERVICE_KEY) throw new AdminAuthError("Supabase service-role key is not configured on the server.", 500);

  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new AdminAuthError("Not authenticated.", 401);

  // Validate the browser session against Supabase Auth. The browser must send
  // the user's access token; the service-role key is never accepted as the
  // user's session token.
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!userResponse.ok) {
    const detail = jsonErrorText(await userResponse.text());
    throw new AdminAuthError(`Not authenticated. ${detail}`.trim(), 401);
  }

  const authUser = await userResponse.json();

  // Prefer the authoritative public.users role. Explicitly target the public
  // schema so this also works when a Supabase project has multiple exposed
  // schemas/configurations.
  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=id,full_name,email,role&id=eq.${encodeURIComponent(authUser.id)}&limit=1`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Accept: "application/json",
        "Accept-Profile": "public",
      },
      cache: "no-store",
    },
  );

  if (profileResponse.ok) {
    const profiles = await profileResponse.json();
    let profile = profiles?.[0];

    // Some older Newsight profiles may have been created before the Auth UUID
    // was used as public.users.id. If there is no row by Auth UUID, try the
    // verified Auth email as a compatibility fallback.
    if (!profile && authUser?.email) {
      const emailResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/users?select=id,full_name,email,role&email=eq.${encodeURIComponent(authUser.email)}&limit=1`,
        {
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Accept: "application/json",
            "Accept-Profile": "public",
          },
          cache: "no-store",
        },
      );
      if (emailResponse.ok) profile = (await emailResponse.json())?.[0];
    }

    if (profile?.role === "admin") return { authUser, profile };

    // app_metadata is server-managed by Supabase and cannot be changed by a
    // normal browser client. It is a safe secondary source for the admin role
    // when the profile row has an old/default role.
    if (authUser?.app_metadata?.role === "admin") {
      return {
        authUser,
        profile: profile || {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || "",
          email: authUser.email || "",
          role: "admin",
        },
      };
    }

    if (profile) throw new AdminAuthError("Admin access required.", 403);
  } else {
    // If the profile lookup fails, fall back to a role explicitly stored in
    // Auth metadata. This is useful for projects where the profile trigger
    // has not created a row yet. The admin dashboard still uses the service
    // key for all privileged data operations below.
    const detail = jsonErrorText(await profileResponse.text());
    const metadataRole = authUser?.app_metadata?.role || "";
    if (metadataRole === "admin") {
      return {
        authUser,
        profile: {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || "",
          email: authUser.email || "",
          role: "admin",
        },
      };
    }
    throw new AdminAuthError(`Unable to verify user role. ${detail}`.trim(), 500);
  }

  // No public.users row: allow an explicit Auth admin role as a recovery path.
  const metadataRole = authUser?.app_metadata?.role || "";
  if (metadataRole === "admin") {
    return {
      authUser,
      profile: {
        id: authUser.id,
        full_name: authUser.user_metadata?.full_name || "",
        email: authUser.email || "",
        role: "admin",
      },
    };
  }

  throw new AdminAuthError("Unable to verify user role: no profile was found for this authenticated account.", 403);
}

export function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

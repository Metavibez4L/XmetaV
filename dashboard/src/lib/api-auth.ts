import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Require authenticated user for API routes.
 * Returns the user or a 401 NextResponse.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if (auth.error) return auth.error;
 *   // auth.user is guaranteed
 */
export async function requireAuth(): Promise<
  { user: { id: string; email?: string }; error?: never } | { user?: never; error: NextResponse }
> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server component context — ignore
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }

    return { user: { id: user.id, email: user.email ?? undefined } };
  } catch {
    return {
      error: NextResponse.json({ error: "Auth check failed" }, { status: 401 }),
    };
  }
}

/**
 * Validate a UUID string format.
 */
export function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Clamp a numeric parameter to a safe range.
 */
export function clampLimit(raw: string | null, defaultVal: number, max: number): number {
  const parsed = parseInt(raw || String(defaultVal), 10);
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, max);
}

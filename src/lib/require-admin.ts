import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Requires the caller to be signed in AND have the `admin` role
 * in the public.user_roles table. Uses the SECURITY DEFINER
 * `public.has_role` function so this check bypasses RLS safely.
 *
 * Throws 401 (via requireSupabaseAuth) or 403 otherwise.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) {
      console.error("[requireAdmin] has_role error", error);
      throw new Error("Forbidden");
    }
    if (!data) {
      throw new Error("Forbidden: admin role required");
    }
    return next({ context: { userId } });
  });

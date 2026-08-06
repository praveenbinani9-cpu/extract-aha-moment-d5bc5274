import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gate for signed-in + admin-only routes.
 * ssr: false — Supabase session lives in localStorage, only readable client-side.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw redirect({ to: "/auth" });
    }
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      throw redirect({ to: "/auth" });
    }
    return { user: userData.user };
  },
  component: () => <Outlet />,
});

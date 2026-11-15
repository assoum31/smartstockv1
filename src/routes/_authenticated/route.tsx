import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { meQueryOptions } from "@/lib/me";

export const Route = createFileRoute("/_authenticated")({
  // The session lives in the browser, so this area renders in the browser only.
  ssr: false,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me) throw redirect({ to: "/login" });
    return { me };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { me } = Route.useRouteContext();
  if (me.blocked) {
    return (
      <div className="bg-ledger flex min-h-screen items-center justify-center p-6">
        <div className="surface-card max-w-sm p-8 text-center">
          <ShieldOff className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-extrabold">{me.expired ? "انتهى الاشتراك" : "الحساب موقوف"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {me.expired
              ? "انتهت مدة اشتراك متجرك. تواصل مع المدير العام لتجديد الاشتراك."
              : "تم إيقاف حسابك أو متجرك. تواصل مع المسير أو المدير العام."}
          </p>
          <Button
            className="mt-6"
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }
  return (
    <AppShell me={me}>
      <Outlet />
    </AppShell>
  );
}

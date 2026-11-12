import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberActions, MemberStatus } from "@/components/member-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { MemberForm } from "@/components/member-form";
import { PinReveal, type PinInfo } from "@/components/pin-reveal";
import { createMember } from "@/lib/accounts.functions";
import { teamQuery } from "@/lib/queries";
import { ROLE_LABEL, type Role } from "@/lib/me";
import { errorText, reasonText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/team")({
  beforeLoad: ({ context }) => {
    if (!context.me.isManager || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(teamQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "الفريق | SMART STOCK" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { tenant, me } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: team } = useSuspenseQuery(teamQuery(tenant.id));
  const createFn = useServerFn(createMember);
  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState<PinInfo | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["team", tenant.id] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفريق"
        subtitle={
          <>
            رمز المتجر للدخول:{" "}
            <span className="barcode-chip font-bold text-foreground">{tenant.code}</span>
          </>
        }
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus />
            إضافة عضو
          </Button>
        }
      />

      <div className="surface-card divide-y overflow-hidden">
        {team.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Users className="h-8 w-8" />
            لا يوجد أعضاء بعد.
          </div>
        )}
        {team.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary font-bold">
              {m.full_name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{m.full_name}</p>
              <p className="text-xs text-muted-foreground">
                <span className="barcode-chip">{m.username}</span> ·{" "}
                {m.roles.map((r) => ROLE_LABEL[r as Role]).join("، ")}
              </p>
            </div>
            <MemberStatus m={m} />
            <MemberActions m={m} selfId={me.userId} onPin={setPin} onChanged={refresh} />
          </div>
        ))}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>إضافة عضو للفريق</DialogTitle>
          </DialogHeader>
          <MemberForm
            allowManager
            submitLabel="إنشاء وإظهار رمز التفعيل"
            onSubmit={async (v) => {
              try {
                const r = await createFn({ data: v });
                if (!r.ok) return reasonText(r.reason);
                setAdding(false);
                setPin({ ...r, fullName: v.fullName });
                refresh();
                return null;
              } catch (e) {
                return errorText(e);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <PinReveal info={pin} onClose={() => setPin(null)} />
    </div>
  );
}

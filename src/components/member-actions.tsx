import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { PinInfo } from "@/components/pin-reveal";
import { resetMemberPin, setMemberActive } from "@/lib/accounts.functions";
import type { TeamMember } from "@/lib/queries";
import { errorText } from "@/lib/messages";

export function MemberStatus({ m }: { m: TeamMember }) {
  if (!m.is_active) return <Badge variant="destructive">موقوف</Badge>;
  if (m.must_activate)
    return (
      <Badge className="border-transparent bg-warning text-warning-foreground hover:bg-warning">
        ينتظر التفعيل
      </Badge>
    );
  return (
    <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">نشط</Badge>
  );
}

export function MemberActions({
  m,
  selfId,
  onPin,
  onChanged,
}: {
  m: TeamMember;
  selfId: string;
  onPin: (info: PinInfo) => void;
  onChanged: () => void;
}) {
  const resetFn = useServerFn(resetMemberPin);
  const activeFn = useServerFn(setMemberActive);
  const [busy, setBusy] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  if (m.id === selfId) return <span className="text-xs text-muted-foreground">أنت</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !m.is_active}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await resetFn({ data: { memberId: m.id } });
            onPin({ ...r, fullName: m.full_name });
            onChanged();
          } catch (e) {
            toast.error(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <KeyRound />
        رمز جديد
      </Button>
      {m.is_active ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStopOpen(true)}>
          <Power />
          إيقاف
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await activeFn({ data: { memberId: m.id, active: true } });
              toast.success("تم تفعيل الحساب");
              onChanged();
            } catch (err) {
              toast.error(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Power />
          إعادة تفعيل
        </Button>
      )}
      <AlertDialog open={stopOpen} onOpenChange={setStopOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إيقاف حساب {m.full_name}؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن يستطيع هذا المستخدم الدخول حتى تعيد تفعيله.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                try {
                  await activeFn({ data: { memberId: m.id, active: false } });
                  toast.success("تم إيقاف الحساب");
                  setStopOpen(false);
                  onChanged();
                } catch (err) {
                  toast.error(errorText(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "جاري الإيقاف..." : "إيقاف الحساب"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

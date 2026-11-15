import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Pencil, Power, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleSelect, type MemberRole } from "@/components/member-form";
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
import { deleteMember, resetMemberPin, setMemberActive, updateMember } from "@/lib/accounts.functions";
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
  const [editOpen, setEditOpen] = useState(false);
  if (m.id === selfId) return <span className="text-xs text-muted-foreground">أنت</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditOpen(true)}>
        <Pencil />
        تعديل
      </Button>
      <EditMemberDialog m={m} open={editOpen} onOpenChange={setEditOpen} onChanged={onChanged} />
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
        <AlertDialogContent>
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

function EditMemberDialog({
  m,
  open,
  onOpenChange,
  onChanged,
}: {
  m: TeamMember;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const updateFn = useServerFn(updateMember);
  const deleteFn = useServerFn(deleteMember);
  const initialRole = (["manager", "sales_manager", "storekeeper", "cashier", "pricer", "auditor", "observer", "worker"] as MemberRole[]).find((r) =>
    m.roles.includes(r),
  ) ?? "worker";
  const [fullName, setFullName] = useState(m.full_name);
  const [role, setRole] = useState<MemberRole>(initialRole);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) {
            setFullName(m.full_name);
            setRole(initialRole);
          }
          onOpenChange(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>تعديل {m.full_name}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await updateFn({ data: { memberId: m.id, fullName, role } });
                toast.success("تم حفظ التعديلات");
                onOpenChange(false);
                onChanged();
              } catch (err) {
                toast.error(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`edit-name-${m.id}`}>الاسم الكامل</Label>
              <Input
                id={`edit-name-${m.id}`}
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الصلاحية</Label>
              <RoleSelect value={role} onChange={setRole} allowManager />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 />
              حذف العامل
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {m.full_name} نهائيا؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف الحساب ولن يستطيع الدخول. لا يمكن التراجع عن هذا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await deleteFn({ data: { memberId: m.id } });
                  toast.success("تم حذف العامل");
                  setConfirmDel(false);
                  onOpenChange(false);
                  onChanged();
                } catch (err) {
                  toast.error(errorText(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

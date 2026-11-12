import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Building2,
  ChevronDown,
  Plus,
  Power,
  Store,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PageHeader, StatCard } from "@/components/stat-card";
import { MemberActions, MemberStatus } from "@/components/member-actions";
import { MemberForm, UsernameField } from "@/components/member-form";
import { PinReveal, type PinInfo } from "@/components/pin-reveal";
import { createMember, createStore, setStoreActive } from "@/lib/accounts.functions";
import { isValidStoreCode, isValidUsername } from "@/lib/identity";
import { storesQuery, type StoreSummary } from "@/lib/queries";
import { ROLE_LABEL, type Role } from "@/lib/me";
import { errorText, reasonText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (!context.me.isMaster) throw redirect({ to: context.me.homePath });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(storesQuery()),
  head: () => ({ meta: [{ title: "المتاجر | SMART STOCK" }] }),
  component: AdminPage,
});

function slugify(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31);
}

function AdminPage() {
  const { me } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: stores } = useSuspenseQuery(storesQuery());
  const [creating, setCreating] = useState(false);
  const [pin, setPin] = useState<PinInfo | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["stores"] });

  const activeStores = stores.filter((s) => s.is_active).length;
  const people = stores.reduce((n, s) => n + s.members.length, 0);
  const waiting = stores.reduce(
    (n, s) => n + s.members.filter((m) => m.must_activate && m.is_active).length,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="المتاجر"
        subtitle="أنشئ المتاجر ومسيريها. كل متجر معزول تماماً عن الآخرين."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            متجر جديد
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="المتاجر" value={stores.length} icon={Building2} tone="primary" />
        <StatCard label="متاجر نشطة" value={activeStores} icon={Store} />
        <StatCard label="الأعضاء" value={people} icon={Users} />
        <StatCard label="ينتظرون التفعيل" value={waiting} icon={UserPlus} tone="warning" />
      </div>

      <div className="space-y-3">
        {stores.length === 0 && (
          <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="font-bold">لا توجد متاجر بعد</p>
            <p className="text-sm text-muted-foreground">ابدأ بإنشاء أول متجر ومسيره.</p>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              متجر جديد
            </Button>
          </div>
        )}
        {stores.map((s) => (
          <StoreRow key={s.id} store={s} selfId={me.userId} onPin={setPin} onChanged={refresh} />
        ))}
      </div>

      <CreateStoreDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(info) => {
          setPin(info);
          refresh();
        }}
      />
      <PinReveal info={pin} onClose={() => setPin(null)} />
    </div>
  );
}

function StoreRow({
  store,
  selfId,
  onPin,
  onChanged,
}: {
  store: StoreSummary;
  selfId: string;
  onPin: (i: PinInfo) => void;
  onChanged: () => void;
}) {
  const activeFn = useServerFn(setStoreActive);
  const createFn = useServerFn(createMember);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const managers = store.members.filter((m) => m.roles.includes("manager"));

  const toggleActive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await activeFn({ data: { storeId: store.id, active: !store.is_active } });
      toast.success(store.is_active ? "تم إيقاف المتجر" : "تم تفعيل المتجر");
      setStopOpen(false);
      onChanged();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Collapsible className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-ink-foreground">
          <Store className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{store.name}</p>
          <p className="text-xs text-muted-foreground">
            <span className="barcode-chip">{store.code}</span> · {store.members.length} عضو ·{" "}
            {managers.length ? managers.map((m) => m.full_name).join("، ") : "بدون مسير"}
          </p>
        </div>
        {store.is_active ? (
          <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">
            نشط
          </Badge>
        ) : (
          <Badge variant="destructive">موقوف</Badge>
        )}
        {store.is_active ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStopOpen(true)}>
            <Power />
            إيقاف
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void toggleActive()}>
            <Power />
            تفعيل
          </Button>
        )}
        <AlertDialog open={stopOpen} onOpenChange={setStopOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>إيقاف متجر {store.name}؟</AlertDialogTitle>
              <AlertDialogDescription>
                لن يستطيع أي عامل أو مسير من هذا المتجر الدخول حتى تعيد تفعيله.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void toggleActive();
                }}
              >
                {busy ? "جاري الإيقاف..." : "إيقاف المتجر"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/stores/$storeId" params={{ storeId: store.id }}>
            <BarChart3 />
            الجرد
          </Link>
        </Button>
        <CollapsibleTrigger asChild>
          <Button size="sm" variant="outline" className="group">
            الأعضاء
            <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="divide-y border-t bg-muted/40">
          {store.members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{m.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="barcode-chip">{m.username}</span> ·{" "}
                  {m.roles.map((r) => ROLE_LABEL[r as Role]).join("، ")}
                </p>
              </div>
              <MemberStatus m={m} />
              <MemberActions m={m} selfId={selfId} onPin={onPin} onChanged={onChanged} />
            </div>
          ))}
          <div className="p-3">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <UserPlus />
              إضافة عضو لهذا المتجر
            </Button>
          </div>
        </div>
      </CollapsibleContent>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>عضو جديد — {store.name}</DialogTitle>
          </DialogHeader>
          <MemberForm
            allowManager
            submitLabel="إنشاء وإظهار رمز التفعيل"
            onSubmit={async (v) => {
              try {
                const r = await createFn({ data: { ...v, storeId: store.id } });
                if (!r.ok) return reasonText(r.reason);
                setAdding(false);
                onPin({ ...r, fullName: v.fullName });
                onChanged();
                return null;
              } catch (e) {
                return errorText(e);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

function CreateStoreDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (info: PinInfo) => void;
}) {
  const createFn = useServerFn(createStore);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [managerUsername, setManagerUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName("");
    setCode("");
    setCodeTouched(false);
    setManagerName("");
    setManagerUsername("");
    setError("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>متجر جديد</DialogTitle>
          <DialogDescription>
            ينشأ المتجر مع مسيره. ستحصل على رمز تفعيل تعطيه للمسير.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!isValidStoreCode(code))
              return setError("رمز المتجر: حروف لاتينية صغيرة وأرقام وشرطات (غير admin).");
            if (!isValidUsername(managerUsername)) return setError("اسم مستخدم المسير غير صالح.");
            setLoading(true);
            try {
              const r = await createFn({
                data: { name, code, managerUsername, managerFullName: managerName },
              });
              if (!r.ok) {
                setError(
                  reasonText(r.reason) +
                    ("storeCreated" in r && r.storeCreated
                      ? " (تم إنشاء المتجر، أضف المسير من قائمة الأعضاء)"
                      : ""),
                );
                return;
              }
              onOpenChange(false);
              reset();
              onCreated({
                storeCode: r.storeCode,
                username: r.username,
                pin: r.pin,
                expiresAt: r.expiresAt,
                fullName: managerName,
              });
            } catch (err) {
              setError(errorText(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="store-name">اسم المتجر</Label>
              <Input
                id="store-name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!codeTouched) setCode(slugify(e.target.value));
                }}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-code">رمز المتجر (للدخول)</Label>
              <Input
                id="store-code"
                required
                dir="ltr"
                autoCapitalize="none"
                placeholder="magasin-oran"
                value={code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value.toLowerCase());
                }}
                className="barcode-chip h-11 text-start"
              />
            </div>
          </div>
          <div className="rounded-xl border border-dashed p-4">
            <p className="mb-3 text-sm font-extrabold">مسير المتجر</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manager-name">الاسم الكامل</Label>
                <Input
                  id="manager-name"
                  required
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className="h-11"
                />
              </div>
              <UsernameField
                id="manager-username"
                value={managerUsername}
                onChange={setManagerUsername}
              />
            </div>
          </div>
          {error && <p className="text-sm font-bold text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "جاري الإنشاء..." : "إنشاء المتجر والمسير"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

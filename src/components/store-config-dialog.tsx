import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateStoreConfig } from "@/lib/accounts.functions";
import type { StoreSummary } from "@/lib/queries";
import { errorText } from "@/lib/messages";
import {
  FEATURE_LABEL,
  PLANS,
  daysLeft,
  extendSubscription,
  normalizeFeatures,
  type FeatureKey,
  type StoreFeatures,
} from "@/lib/subscription";

export function SubscriptionBadge({ store }: { store: StoreSummary }) {
  const plan = PLANS.find((p) => p.id === store.plan)?.label ?? store.plan;
  const left = daysLeft(store.subscription_ends_at);
  if (left == null) return <Badge variant="secondary">{plan}</Badge>;
  if (left <= 0) return <Badge variant="destructive">{plan} · منتهي</Badge>;
  return (
    <Badge variant={left <= 7 ? "destructive" : "secondary"}>
      {plan} · {left} يوم
    </Badge>
  );
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function StoreConfigDialog({
  store,
  open,
  onOpenChange,
  onSaved,
}: {
  store: StoreSummary;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(updateStoreConfig);
  const [name, setName] = useState(store.name);
  const [plan, setPlan] = useState(store.plan);
  const [endsAt, setEndsAt] = useState<string | null>(store.subscription_ends_at);
  const [features, setFeatures] = useState<StoreFeatures>(normalizeFeatures(store.features));
  const [maxManagers, setMaxManagers] = useState(store.max_managers?.toString() ?? "");
  const [maxMembers, setMaxMembers] = useState(store.max_members?.toString() ?? "");
  const [notes, setNotes] = useState(store.notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(store.name);
    setPlan(store.plan);
    setEndsAt(store.subscription_ends_at);
    setFeatures(normalizeFeatures(store.features));
    setMaxManagers(store.max_managers?.toString() ?? "");
    setMaxMembers(store.max_members?.toString() ?? "");
    setNotes(store.notes ?? "");
  }, [open, store]);

  const choosePlan = (id: string) => {
    setPlan(id);
    const p = PLANS.find((x) => x.id === id);
    if (!p) return;
    setFeatures(p.features);
    setEndsAt(p.days ? extendSubscription(null, p.days) : null);
  };

  const num = (v: string) => (v.trim() ? Math.max(1, Math.floor(Number(v))) || null : null);
  const left = daysLeft(endsAt);

  const save = async () => {
    setBusy(true);
    try {
      await saveFn({
        data: {
          storeId: store.id,
          name: name.trim(),
          plan,
          subscriptionEndsAt: endsAt,
          features,
          maxManagers: num(maxManagers),
          maxMembers: num(maxMembers),
          notes: notes.trim() || null,
        },
      });
      toast.success("تم حفظ إعدادات المتجر");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>الاشتراك والخصائص · {store.name}</DialogTitle>
          <DialogDescription>تحكم في باقة المتجر، مدته، خصائصه وعدد عماله.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>اسم المتجر</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>الباقة</Label>
            <Select value={plan} onValueChange={choosePlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}{p.days ? ` (${p.days} يوم)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>تاريخ انتهاء الاشتراك</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={toDateInput(endsAt)}
                onChange={(e) => setEndsAt(e.target.value ? new Date(e.target.value + "T23:59:59Z").toISOString() : null)}
              />
              <Button type="button" variant="outline" onClick={() => setEndsAt(null)}>بدون مدة</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[7, 30, 90, 365].map((d) => (
                <Button key={d} type="button" size="sm" variant="secondary" onClick={() => setEndsAt(extendSubscription(endsAt, d))}>
                  +{d} يوم
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {left == null ? "اشتراك مفتوح بدون تاريخ انتهاء." : left <= 0 ? "الاشتراك منتهٍ: المتجر لا يستطيع الدخول." : `متبقٍ ${left} يوم.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>الخصائص المفعّلة</Label>
            <div className="space-y-2 rounded-xl border p-3">
              {(Object.keys(FEATURE_LABEL) as FeatureKey[]).map((k) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{FEATURE_LABEL[k]}</span>
                  <Switch checked={features[k]} onCheckedChange={(v) => setFeatures((f) => ({ ...f, [k]: v }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>أقصى عدد للمسيرين</Label>
              <Input inputMode="numeric" placeholder="بدون حد" value={maxManagers} onChange={(e) => setMaxManagers(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-2">
              <Label>أقصى عدد للعمال (الإجمالي)</Label>
              <Input inputMode="numeric" placeholder="بدون حد" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>ملاحظات (طلب الزبون، السعر...)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void save()}>
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

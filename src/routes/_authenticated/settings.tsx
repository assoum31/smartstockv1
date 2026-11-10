import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/stat-card";
import { MIN_PASSWORD_LENGTH } from "@/lib/identity";
import { ROLE_LABEL } from "@/lib/me";
import { reasonText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "الإعدادات | SMART STOCK" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { me } = Route.useRouteContext();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < MIN_PASSWORD_LENGTH)
      return setError(`كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
    if (next !== confirm) return setError("كلمتا المرور غير متطابقتين.");
    if (next === current) return setError("اختر كلمة مرور مختلفة عن الحالية.");
    setSaving(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({
        password: next,
        current_password: current,
      });
      if (upErr) {
        console.error("password change failed", upErr.name, upErr.message);
        if (/current password|invalid.*password|incorrect/i.test(upErr.message))
          return setError("كلمة المرور الحالية غير صحيحة.");
        const weak =
          upErr.name === "AuthWeakPasswordError" || /weak|pwned|guess/i.test(upErr.message);
        return setError(reasonText(weak ? "weak_password" : "failed"));
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("تم تغيير كلمة المرور.");
    } catch (err) {
      console.error("password change failed", err);
      setError("لا يوجد اتصال بالإنترنت.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="الإعدادات"
        subtitle={`${me.fullName} · ${ROLE_LABEL[me.roles[0] ?? "worker"]}`}
      />
      <form onSubmit={submit} className="surface-card space-y-4 p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <KeyRound className="h-5 w-5 text-primary" />
          تغيير كلمة المرور
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="current-password">كلمة المرور الحالية</Label>
          <Input
            id="current-password"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next-password">كلمة المرور الجديدة</Label>
          <Input
            id="next-password"
            type="password"
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-next">تأكيدها</Label>
          <Input
            id="confirm-next"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11"
          />
        </div>
        {error && <p className="text-sm font-bold text-destructive">{error}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ كلمة المرور"}
        </Button>
      </form>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Languages, Check } from "lucide-react";
import { useI18n, setLang, setDirOverride, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanySettingsCard } from "@/components/company-settings-card";
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
  const { t, lang, dirOverride } = useI18n();

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
        title={t("settings")}
        subtitle={`${me.fullName} · ${ROLE_LABEL[me.roles[0] ?? "worker"]}`}
      />
      <LanguageCard t={t} lang={lang} dirOverride={dirOverride} />
      {me.isManager && me.tenant && <CompanySettingsCard tenantId={me.tenant.id} />}
      <form onSubmit={submit} className="surface-card space-y-4 p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <KeyRound className="h-5 w-5 text-primary" />
          {t("changePassword")}
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="current-password">{t("currentPassword")}</Label>
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
          <Label htmlFor="next-password">{t("newPassword")}</Label>
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
          <Label htmlFor="confirm-next">{t("confirmPassword")}</Label>
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
          {saving ? t("saving") : t("savePassword")}
        </Button>
      </form>
    </div>
  );
}

const LANGS: { code: Lang; name: string; tag: string }[] = [
  { code: "ar", name: "العربية", tag: "AR" },
  { code: "fr", name: "Français", tag: "FR" },
  { code: "en", name: "English", tag: "EN" },
];

function LanguageCard({
  t,
  lang,
  dirOverride,
}: {
  t: ReturnType<typeof useI18n>["t"];
  lang: Lang;
  dirOverride: "rtl" | "ltr" | null;
}) {
  const dirs = [
    { v: null, label: t("dirAuto") },
    { v: "rtl" as const, label: `RTL · ${t("rtl")}` },
    { v: "ltr" as const, label: `LTR · ${t("ltr")}` },
  ];
  return (
    <section className="surface-card space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <Languages className="h-5 w-5 text-primary" />
          {t("language")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("langHint")}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            className={cn(
              "relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 transition-all active:scale-95",
              lang === l.code ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
            )}
          >
            {lang === l.code && <Check className="absolute top-1.5 end-1.5 h-4 w-4 text-primary" />}
            <span className="font-mono text-xs font-bold text-muted-foreground">{l.tag}</span>
            <span className="text-sm font-extrabold">{l.name}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold">{t("direction")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {dirs.map((d) => (
            <button
              key={String(d.v)}
              type="button"
              onClick={() => setDirOverride(d.v)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors",
                dirOverride === d.v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

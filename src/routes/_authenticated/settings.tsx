import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { productsQuery } from "@/lib/queries";
import { useSyncState, flushQueue } from "@/lib/offline";
import { useDeviceSales, syncDeviceSales } from "@/lib/offline-sales";
import { CloudDownload, Building2, WifiOff, Palette, RefreshCw, KeyRound, Languages, Check, Sun, Moon, MonitorSmartphone, Contrast, Save, Printer } from "lucide-react";
import { setTheme, useTheme, type ThemePref } from "@/lib/theme";
import { useI18n, setLang, setDirOverride, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanySettingsCard } from "@/components/company-settings-card";
import { PrinterSettingsCard } from "@/components/printer-settings-card";
import { CameraSettingsCard } from "@/components/camera-settings-card";
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
  const theme = useTheme();

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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle={`${me.fullName} · ${ROLE_LABEL[me.roles[0] ?? "worker"]}`}
      />
      <Tabs defaultValue="appearance" className="space-y-5">
        <TabsList className="no-scrollbar flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
          <TabsTrigger value="appearance" className="shrink-0 gap-1.5 rounded-lg px-3 py-2"><Palette className="h-4 w-4" />المظهر واللغة</TabsTrigger>
          {me.isManager && me.tenant && <TabsTrigger value="company" className="shrink-0 gap-1.5 rounded-lg px-3 py-2"><Building2 className="h-4 w-4" />المؤسسة</TabsTrigger>}
          {me.isManager && me.tenant && <TabsTrigger value="printers" className="shrink-0 gap-1.5 rounded-lg px-3 py-2"><Printer className="h-4 w-4" />الطابعات</TabsTrigger>}
          <TabsTrigger value="camera" className="shrink-0 gap-1.5 rounded-lg px-3 py-2">الكاميرا</TabsTrigger>
          <TabsTrigger value="offline" className="shrink-0 gap-1.5 rounded-lg px-3 py-2"><WifiOff className="h-4 w-4" />العمل دون إنترنت</TabsTrigger>
          <TabsTrigger value="security" className="shrink-0 gap-1.5 rounded-lg px-3 py-2"><KeyRound className="h-4 w-4" />الأمان</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" className="mt-0 space-y-6">
      <LanguageCard t={t} lang={lang} dirOverride={dirOverride} />
      <ThemeCard t={t} />
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          setLang(lang);
          setDirOverride(dirOverride);
          setTheme(theme);
          toast.success(t("settingsSaved"));
        }}
      >
        <Save />
        {t("saveSettings")}
      </Button>
        </TabsContent>
        {me.isManager && me.tenant && (
          <TabsContent value="company" className="mt-0"><CompanySettingsCard tenantId={me.tenant.id} /></TabsContent>
        )}
        {me.isManager && me.tenant && (
          <TabsContent value="printers" className="mt-0"><PrinterSettingsCard tenantId={me.tenant.id} /></TabsContent>
        )}
        <TabsContent value="camera" className="mt-0"><CameraSettingsCard /></TabsContent>
        <TabsContent value="offline" className="mt-0"><OfflineCard tenantId={me.tenant?.id} /></TabsContent>
        <TabsContent value="security" className="mt-0">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OfflineCard({ tenantId }: { tenantId: string | undefined }) {
  const qc = useQueryClient();
  const { queue, online } = useSyncState();
  const { sales } = useDeviceSales();
  const [usage, setUsage] = useState<string>("—");
  const [busy, setBusy] = useState(false);
  const measure = () => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB`));
  };
  useEffect(measure, []);
  const download = async () => {
    if (!tenantId) return;
    setBusy(true);
    try {
      await qc.fetchQuery({ ...productsQuery(tenantId), staleTime: 0 });
      await qc.refetchQueries({ type: "active" });
      toast.success("تم تنزيل البيانات على الجهاز");
      measure();
    } catch {
      toast.error("لا يوجد اتصال بالإنترنت.");
    } finally {
      setBusy(false);
    }
  };
  const pending = queue.length + sales.length;
  return (
    <section className="surface-card space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><WifiOff className="h-5 w-5 text-primary" />العمل دون إنترنت</h2>
        <p className="mt-1 text-sm text-muted-foreground">يحفظ التطبيق المنتجات والجرد والإعدادات على هذا الجهاز ليعمل دون إنترنت، ثم يرسل العمليات تلقائياً عند عودة الاتصال.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">المساحة المستعملة على الجهاز</p><p className="mt-1 font-mono text-xl font-extrabold">{usage}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">عمليات تنتظر المزامنة</p><p className="mt-1 font-mono text-xl font-extrabold">{pending}</p></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={download} disabled={busy || !online || !tenantId} className="flex-1"><CloudDownload />{busy ? "..." : "تنزيل كل البيانات على الجهاز"}</Button>
        <Button variant="outline" onClick={() => { void flushQueue(); void syncDeviceSales(); }} disabled={!online || !pending} className="flex-1"><RefreshCw />مزامنة الآن</Button>
      </div>
    </section>
  );
}

const LANGS: { code: Lang; name: string; tag: string }[] = [
  { code: "ar", name: "العربية الفصحى", tag: "AR" },
  { code: "dz", name: "الدارجة الجزائرية", tag: "DZ" },
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

function ThemeCard({ t }: { t: ReturnType<typeof useI18n>["t"] }) {
  const theme = useTheme();
  const opts: { v: ThemePref; label: string; Icon: typeof Sun }[] = [
    { v: "light", label: t("themeLight"), Icon: Sun },
    { v: "dark", label: t("themeDark"), Icon: Moon },
    { v: "oled", label: t("themeOled"), Icon: Contrast },
    { v: "system", label: t("themeSystem"), Icon: MonitorSmartphone },
  ];
  return (
    <section className="surface-card space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <Moon className="h-5 w-5 text-primary" />
          {t("appearance")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("themeHint")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {opts.map(({ v, label, Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => setTheme(v)}
            className={cn(
              "relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-3 transition-all active:scale-95",
              theme === v ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
            )}
          >
            {theme === v && <Check className="absolute top-1.5 end-1.5 h-4 w-4 text-primary" />}
            <Icon className="h-5 w-5" />
            <span className="text-sm font-extrabold">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

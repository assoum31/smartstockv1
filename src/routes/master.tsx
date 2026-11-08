import { useEffect, useState } from "react";
import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkDefaultMaster, claimMaster } from "@/lib/accounts.functions";
import {
  MASTER_CODE,
  MIN_PASSWORD_LENGTH,
  accountEmail,
  isDefaultMasterLogin,
} from "@/lib/identity";
import { fetchMe, meQueryOptions } from "@/lib/me";
import { reasonText } from "@/lib/messages";

// Private entry for the single master account. Not linked from anywhere.
export const Route = createFileRoute("/master")({
  head: () => ({
    meta: [
      { title: "Stocki Pro" },
      { name: "description", content: "Stocki Pro" },
      { property: "og:title", content: "Stocki Pro" },
      { property: "og:description", content: "Stocki Pro" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MasterPage,
});

function MasterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const claimFn = useServerFn(claimMaster);
  const checkFn = useServerFn(checkDefaultMaster);
  const hydrated = useHydrated();
  const [step, setStep] = useState<"login" | "new-password">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchMe()
      .then((me) => {
        if (me?.isMaster && !me.blocked) navigate({ to: "/admin", replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const enter = async (user: string, pw: string) => {
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: accountEmail(MASTER_CODE, user),
      password: pw,
    });
    if (authErr) return false;
    queryClient.removeQueries({ queryKey: ["me"] });
    const me = await queryClient.fetchQuery(meQueryOptions);
    if (!me?.isMaster) {
      await supabase.auth.signOut();
      return false;
    }
    navigate({ to: "/admin", replace: true });
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (await enter(username, password)) return;
      // First time: the default admin / admin opens the "choose your password" step.
      if (isDefaultMasterLogin(username, password)) {
        const { claimable } = await checkFn({ data: { username, password } });
        if (claimable) {
          setStep("new-password");
          return;
        }
      }
      setError(reasonText("invalid_login"));
    } catch {
      setError("لا يوجد اتصال بالإنترنت.");
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return setError(`كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
    if (newPassword !== confirm) return setError("كلمتا المرور غير متطابقتين.");
    setLoading(true);
    try {
      const res = await claimFn({ data: { username, password, newPassword } });
      if (!res.ok) {
        setError(reasonText(res.reason));
        if (res.reason === "invalid_login") setStep("login");
        return;
      }
      if (!(await enter(username, newPassword))) setError(reasonText("failed"));
    } catch {
      setError(reasonText("failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-4" dir="rtl">
      <div className="surface-card w-full max-w-sm p-6 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-warning">
          <Crown className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">المدير العام</h1>

        {step === "login" ? (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="master-user">اسم المستخدم</Label>
              <Input
                id="master-user"
                required
                dir="ltr"
                autoCapitalize="none"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="barcode-chip h-11 text-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="master-pass">كلمة المرور</Label>
              <Input
                id="master-pass"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>
            {error && <p className="text-sm font-bold text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading || !hydrated}>
              {loading ? "جاري الدخول..." : "دخول"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleNewPassword} className="mt-5 space-y-4">
            <p className="flex gap-2 rounded-xl bg-accent p-3 text-xs leading-relaxed text-accent-foreground">
              <KeyRound className="h-4 w-4 shrink-0" />
              أول دخول: اختر كلمة مرور جديدة. كلمة admin لن تعمل بعد الآن.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="master-new">كلمة مرور جديدة</Label>
              <Input
                id="master-new"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="master-confirm">تأكيدها</Label>
              <Input
                id="master-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                كلمات المرور الشائعة مرفوضة. استعمل كلمة طويلة فيها حروف وأرقام.
              </p>
            </div>
            {error && <p className="text-sm font-bold text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading || !hydrated}>
              {loading ? "جاري الحفظ..." : "حفظ والدخول"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

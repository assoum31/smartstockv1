import { useEffect, useState } from "react";
import { Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, KeyRound, Layers, LogIn, ScanLine, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { activateAccount } from "@/lib/accounts.functions";
import {
  MASTER_CODE,
  MIN_PASSWORD_LENGTH,
  accountEmail,
  normalizeStoreCode,
  portalFor,
  type Portal,
} from "@/lib/identity";
import { fetchMe, meQueryOptions } from "@/lib/me";
import { reasonText } from "@/lib/messages";

const PORTAL_TEXT: Record<
  Portal,
  { title: string; subtitle: string; pinFrom: string; other: Portal; otherLabel: string }
> = {
  manager: {
    title: "دخول المسيرين",
    subtitle: "لمسيري وأصحاب المتاجر: جلسات الجرد، العمال والفوارق.",
    pinFrom: "أعطاك المدير العام رمز تفعيل من 6 أرقام.",
    other: "worker",
    otherLabel: "أنت عامل جرد؟ ادخل من هنا",
  },
  worker: {
    title: "دخول العمال",
    subtitle: "لعمال الجرد: مسح الباركود وتسجيل الكميات.",
    pinFrom: "أعطاك المسير رمز تفعيل من 6 أرقام.",
    other: "manager",
    otherLabel: "أنت مسير متجر؟ ادخل من هنا",
  },
};

const LAST_STORE_KEY = "stocki_last_store";

/** Store sign-in, one page per kind of account (manager or worker). */
export function StoreLogin({ portal }: { portal: Portal }) {
  const text = PORTAL_TEXT[portal];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activateFn = useServerFn(activateAccount);

  const [storeCode, setStoreCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [wrongPage, setWrongPage] = useState(false);
  const [loading, setLoading] = useState(false);
  // Forms only work once the page is interactive; avoid a plain page reload before that.
  const hydrated = useHydrated();

  useEffect(() => {
    setStoreCode(localStorage.getItem(LAST_STORE_KEY) ?? "");
    // Already signed in? Go straight to the right page.
    void fetchMe()
      .then((me) => {
        if (me && !me.blocked) navigate({ to: me.homePath, replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const signIn = async (pw: string) => {
    // The master signs in on its own private page, never here.
    if (normalizeStoreCode(storeCode) === MASTER_CODE) {
      setError("رمز المتجر أو اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: accountEmail(storeCode, username),
      password: pw,
    });
    if (authErr) {
      setError("رمز المتجر أو اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    localStorage.setItem(LAST_STORE_KEY, storeCode.trim().toLowerCase());
    queryClient.removeQueries({ queryKey: ["me"] });
    const me = await queryClient.fetchQuery(meQueryOptions);
    if (me && portalFor(me.roles) !== portal) {
      // Right password, wrong page: sign back out and point to the right one.
      await supabase.auth.signOut();
      queryClient.removeQueries({ queryKey: ["me"] });
      setWrongPage(true);
      setError(reasonText(portal === "manager" ? "use_worker_page" : "use_manager_page"));
      return;
    }
    navigate({ to: me?.homePath ?? "/scan", replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setWrongPage(false);
    setLoading(true);
    try {
      await signIn(password);
    } catch {
      setError("لا يوجد اتصال بالإنترنت.");
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setWrongPage(false);
    if (pin.length !== 6) return setError("أدخل رمز التفعيل المكون من 6 أرقام.");
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return setError(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
    if (newPassword !== confirm) return setError("كلمتا المرور غير متطابقتين.");
    setLoading(true);
    try {
      const res = await activateFn({
        data: { storeCode, username, pin, password: newPassword, portal },
      });
      if (!res.ok) {
        setWrongPage(res.reason === "use_manager_page" || res.reason === "use_worker_page");
        setError(reasonText(res.reason));
        return;
      }
      await signIn(newPassword);
    } catch {
      setError("تحقق من المعلومات أو من الاتصال بالإنترنت.");
    } finally {
      setLoading(false);
    }
  };

  const identityFields = (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="store">رمز المتجر</Label>
        <div className="relative">
          <Store className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="store"
            required
            dir="ltr"
            autoCapitalize="none"
            autoComplete="organization"
            placeholder="ex: magasin-oran"
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
            className="barcode-chip h-11 ps-9 text-start"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="username">اسم المستخدم</Label>
        <Input
          id="username"
          required
          dir="ltr"
          autoCapitalize="none"
          autoComplete="username"
          placeholder="ex: ahmed"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="barcode-chip h-11 text-start"
        />
      </div>
    </>
  );

  const errorBox = error ? (
    <div className="text-sm font-bold text-destructive">
      <p>{error}</p>
      {wrongPage && (
        <Link
          to={text.other === "manager" ? "/manager" : "/worker"}
          className="mt-1 inline-block underline"
        >
          {text.other === "manager" ? "صفحة دخول المسيرين" : "صفحة دخول العمال"}
        </Link>
      )}
    </div>
  ) : null;

  return (
    <div className="bg-ledger flex min-h-screen items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-warning">
            <Layers className="h-6 w-6" />
          </span>
          <span className="text-2xl font-extrabold">
            SMART <span className="text-primary">STOCK</span>
          </span>
        </Link>

        <div className="surface-card p-6 shadow-[var(--shadow-lift)] sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              {portal === "manager" ? (
                <ClipboardList className="h-5 w-5" />
              ) : (
                <ScanLine className="h-5 w-5" />
              )}
            </span>
            <div>
              <h1 className="text-lg font-extrabold">{text.title}</h1>
              <p className="text-xs text-muted-foreground">{text.subtitle}</p>
            </div>
          </div>
          <Tabs defaultValue="login" dir="rtl" onValueChange={() => setError("")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">
                <LogIn className="h-4 w-4" />
                دخول
              </TabsTrigger>
              <TabsTrigger value="activate">
                <KeyRound className="h-4 w-4" />
                أول دخول
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                {identityFields}
                <div className="space-y-1.5">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                  />
                </div>
                {errorBox}
                <Button type="submit" size="lg" className="w-full" disabled={loading || !hydrated}>
                  {loading ? "جاري الدخول..." : "دخول"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="activate" className="mt-6">
              <form onSubmit={handleActivate} className="space-y-4">
                <p className="rounded-xl bg-accent p-3 text-xs leading-relaxed text-accent-foreground">
                  {text.pinFrom} استعمله مرة واحدة لاختيار كلمة المرور الخاصة بك.
                </p>
                {identityFields}
                <div className="space-y-1.5">
                  <Label>رمز التفعيل</Label>
                  <div dir="ltr" className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={pin}
                      onChange={setPin}
                      inputMode="numeric"
                      pattern="^[0-9]*$"
                    >
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} className="h-12 w-11 font-mono text-lg" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">كلمة مرور جديدة</Label>
                    <Input
                      id="new-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">تأكيدها</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
                {errorBox}
                <Button type="submit" size="lg" className="w-full" disabled={loading || !hydrated}>
                  {loading ? "جاري التفعيل..." : "تفعيل الحساب والدخول"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-5 text-center text-sm">
          <Link
            to={text.other === "manager" ? "/manager" : "/worker"}
            className="font-bold text-primary hover:underline"
          >
            {text.otherLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}

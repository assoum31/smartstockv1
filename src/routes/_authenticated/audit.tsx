import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Camera, CameraOff, CheckCircle2, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/stat-card";
import { activeSessionQuery, productsQuery, sessionLogsQuery, type InventoryLog } from "@/lib/queries";
import { errorText, formatDateTime, formatQty } from "@/lib/messages";
import { auditSearchIndex, filterAuditIndex, filterUncounted, normalizeAuditCode, uncountedProducts } from "@/lib/audit-rules";
import type { Product } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/audit")({
  beforeLoad: ({ context }) => {
    if (!context.me.canAudit || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, userId: context.me.userId };
  },
  loader: async ({ context }) => {
    const active = await context.queryClient.ensureQueryData(activeSessionQuery(context.tenant.id));
    await Promise.all([
      context.queryClient.ensureQueryData(sessionLogsQuery(active?.id ?? null)),
      context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
    ]);
  },
  head: () => ({
    meta: [
      { title: "تدقيق الجرد | SMART STOCK" },
      { name: "description", content: "تدقيق الباركود والاسم والرقم ومكان الرف لكل منتج محسوب." },
      { property: "og:title", content: "تدقيق الجرد | SMART STOCK" },
      { property: "og:description", content: "البحث في المنتجات المحسوبة وتدقيق الباركود والرقم والرف." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { tenant, userId } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: active } = useSuspenseQuery(activeSessionQuery(tenant.id));
  const { data: logs } = useSuspenseQuery(sessionLogsQuery(active?.id ?? null));
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState("");
  const [unauditedOnly, setUnauditedOnly] = useState(false);
  const [view, setView] = useState<"all" | "counted" | "uncounted">("all");
  const [pickProduct, setPickProduct] = useState<Product | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [tab, setTab] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<InventoryLog | null>(null);

  const index = useMemo(() => auditSearchIndex(logs, products), [logs, products]);
  const filtered = useMemo(() => filterAuditIndex(index, q, shelf, unauditedOnly), [index, q, shelf, unauditedOnly]);
  const missing = useMemo(() => uncountedProducts(products, logs), [products, logs]);
  const missingFiltered = useMemo(
    () => (unauditedOnly && view !== "uncounted" ? [] : filterUncounted(missing, q, shelf)),
    [missing, q, shelf, unauditedOnly, view],
  );
  const shownLogs = view === "uncounted" ? [] : filtered;
  const shownMissing = view === "counted" ? [] : missingFiltered.slice(0, 100);
  const shelves = useMemo(() => Array.from(new Set([...logs.map((l) => l.location), ...products.map((p) => p.default_location)].filter((l): l is string => Boolean(l)))).sort(), [logs, products]);
  const onDetected = useCallback((code: string) => {
    setQ(code);
    setShelf("");
    setCameraOn(false);
    searchRef.current?.focus();
  }, []);
  const mine = useMemo(
    () =>
      logs
        .filter((l) => l.audited_by === userId)
        .sort((a, b) => (b.audited_at ?? "").localeCompare(a.audited_at ?? "")),
    [logs, userId],
  );
  const done = logs.filter((l) => l.audited_at).length;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["session-logs", active?.id ?? null] });

  if (!active)
    return (
      <div className="space-y-6">
        <PageHeader title="تدقيق الجرد" subtitle="لا توجد جلسة جرد مفتوحة" />
        <div className="surface-card p-10 text-center text-muted-foreground">انتظر حتى يفتح المسير جلسة جرد.</div>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader title="تدقيق الجرد" subtitle={`${active.name} · تم تدقيق ${done} من ${logs.length}`} />
      <Tabs value={tab} onValueChange={(value) => { setTab(value); setCameraOn(false); }}>
        <TabsList>
          <TabsTrigger value="all">كل المنتجات</TabsTrigger>
          <TabsTrigger value="mine">سجلي ({mine.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              aria-label="البحث في الجرد"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالباركود، الاسم، الرقم ID أو الرف"
              className="h-11 ps-9 pe-10"
            />
            {q && <Button type="button" variant="ghost" size="icon" className="absolute end-1 top-1 h-9 w-9" aria-label="مسح البحث" onClick={() => { setQ(""); searchRef.current?.focus(); }}><X className="h-4 w-4" /></Button>}
          </div>
          <Button type="button" variant={cameraOn ? "secondary" : "outline"} size="icon" className="h-11 w-11 shrink-0" aria-label={cameraOn ? "إيقاف الكاميرا" : "تشغيل الكاميرا"} title={cameraOn ? "إيقاف الكاميرا" : "تشغيل الكاميرا"} onClick={() => setCameraOn((v) => !v)}>
            {cameraOn ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          </Button>
          </div>
          {cameraOn && <BarcodeScanner onDetected={onDetected} />}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={shelf || "__all__"} onValueChange={(value) => setShelf(value === "__all__" ? "" : value)}>
              <SelectTrigger className="w-44" aria-label="الرف أو المكان"><SelectValue placeholder="كل الرفوف" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">كل الرفوف</SelectItem>{shelves.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={view} onValueChange={(value) => setView(value as typeof view)}>
              <SelectTrigger className="w-44" aria-label="حالة الجرد"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">المحسوب وغير المحسوب</SelectItem>
                <SelectItem value="counted">المحسوبة فقط</SelectItem>
                <SelectItem value="uncounted">غير المحسوبة فقط ({missing.length})</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={unauditedOnly} onCheckedChange={(value) => setUnauditedOnly(value === true)} />غير المدقق فقط</label>
            <span className="text-sm text-muted-foreground">{shownLogs.length + missingFiltered.length * (view === "counted" ? 0 : 1)} / {logs.length + missing.length}</span>
          </div>
          {(shownLogs.length > 0 || shownMissing.length === 0) && <LogList logs={shownLogs} onPick={setEdit} />}
          {shownMissing.length > 0 && (
            <ul className="space-y-2">
              {shownMissing.map((p) => (
                <li key={p.id}>
                  <Button type="button" variant="outline" onClick={() => setPickProduct(p)} className="surface-card flex h-auto w-full items-center gap-3 whitespace-normal border-warning/60 p-3 text-start hover:bg-secondary/50">
                    <span className="min-w-14 rounded-md bg-warning/20 px-2 py-1 text-center text-xs font-bold text-warning-foreground">غير محسوب</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{p.name}</span>
                      <span className="barcode-chip block truncate text-xs text-muted-foreground">{p.barcode}</span>
                      <span className="block text-xs text-muted-foreground">الرف: {p.default_location || "—"}</span>
                    </span>
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                  </Button>
                </li>
              ))}
              {missingFiltered.length > shownMissing.length && <li className="text-center text-xs text-muted-foreground">يظهر 100 من {missingFiltered.length} — دقّق البحث</li>}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <LogList logs={mine} onPick={setEdit} showAudit />
        </TabsContent>
      </Tabs>
      {pickProduct && (
        <UncountedDialog
          product={pickProduct}
          sessionId={active.id}
          onClose={() => setPickProduct(null)}
          onDone={() => { setPickProduct(null); setQ(""); refresh(); window.setTimeout(() => searchRef.current?.focus(), 100); }}
        />
      )}
      {edit && (
        <AuditDialog
          log={edit}
          sessionId={active.id}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setQ("");
            setShelf("");
            setTab("all");
            setCameraOn(false);
            refresh();
            window.setTimeout(() => searchRef.current?.focus(), 100);
          }}
        />
      )}
    </div>
  );
}

function UncountedDialog({ product, sessionId, onClose, onDone }: { product: Product; sessionId: string; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [location, setLocation] = useState(product.default_location ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.rpc("next_audit_code", { _session_id: sessionId }).then(({ data }) => { if (data) setCode(normalizeAuditCode(String(data))); });
  }, [sessionId]);
  const run = async (mode: "zero" | "alert") => {
    setBusy(true);
    const { error } = await supabase.rpc("audit_uncounted_product", {
      _session_id: sessionId, _barcode: product.barcode, _mode: mode, _code: normalizeAuditCode(code), _location: location,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("duplicate_audit_code") ? "هذا الرقم ID مستعمل لمنتج آخر"
        : error.message.includes("already_counted") ? "هذا المنتج محسوب بالفعل" : errorText(error));
      return;
    }
    toast.success(mode === "zero" ? "تم تسجيله في الجرد بكمية 0" : "تم إرسال تنبيه لفريق الجرد");
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-start"><DialogTitle>منتج غير محسوب في الجرد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-secondary p-3">
            <p className="font-bold">{product.name}</p>
            <p className="barcode-chip text-xs text-muted-foreground">{product.barcode}</p>
          </div>
          <div className="space-y-1.5"><Label htmlFor="u-code">الرقم ID (اختياري)</Label><Input id="u-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} className="barcode-chip" /></div>
          <div className="space-y-1.5"><Label htmlFor="u-loc">الرف / المكان</Label><Input id="u-loc" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" disabled={busy} onClick={() => void run("zero")}>تسجيله كـ 0 وتدقيقه</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void run("alert")}>تنبيه فريق الجرد</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogList({ logs, onPick, showAudit }: { logs: InventoryLog[]; onPick: (l: InventoryLog) => void; showAudit?: boolean }) {
  if (!logs.length) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">لا توجد نتائج</div>;
  return (
    <ul className="space-y-2">
      {logs.map((l) => (
        <li key={l.id}>
          <Button type="button" variant="outline" onClick={() => onPick(l)} className="surface-card flex h-auto w-full items-center gap-3 whitespace-normal p-3 text-start hover:bg-secondary/50">
            <span className="barcode-chip min-w-14 rounded-md bg-secondary px-2 py-1 text-center text-xs font-bold">
              {l.audit_code ?? "----"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{l.product_name}</span>
              <span className="barcode-chip block truncate text-xs text-muted-foreground">
                {l.barcode}
              </span>
              <span className="block text-xs text-muted-foreground">
                الرف: {l.location || "—"} · الكمية: {formatQty(Number(l.counted_quantity))}
                {showAudit && l.audited_at ? ` · ${formatDateTime(l.audited_at)}` : ""}
              </span>
            </span>
            {l.audited_at && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function AuditDialog({ log, sessionId, onClose, onSaved }: { log: InventoryLog; sessionId: string; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(log.audit_code ?? "");
  const [barcode, setBarcode] = useState(log.barcode);
  const [name, setName] = useState(log.product_name);
  const [location, setLocation] = useState(log.location ?? "");
  const [editQty, setEditQty] = useState(false);
  const [qty, setQty] = useState(String(log.counted_quantity));
  const [busy, setBusy] = useState(false);
  const [codeLoading, setCodeLoading] = useState(!log.audit_code);
  const codeRef = useRef<HTMLInputElement>(null);
  const codeTouched = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    let mounted = true;
    if (!log.audit_code) {
      void supabase.rpc("next_audit_code", { _session_id: sessionId }).then(({ data, error }) => {
        if (!mounted) return;
        setCodeLoading(false);
        if (error) toast.error(errorText(error));
        else if (!codeTouched.current) setCode(normalizeAuditCode(String(data ?? "")));
      });
    }
    return () => { mounted = false; };
  }, [log.audit_code, sessionId]);

  const nextCode = async () => {
    setCodeLoading(true);
    const { data, error } = await supabase.rpc("next_audit_code", { _session_id: sessionId });
    setCodeLoading(false);
    if (error) toast.error(errorText(error));
    else { setCode(normalizeAuditCode(String(data ?? ""))); codeRef.current?.focus(); }
  };

  const save = async () => {
    if (saving.current || codeLoading) return;
    const n = Number(qty);
    if (editQty && (!Number.isFinite(n) || n < 0)) { toast.error("كمية غير صالحة"); return; }
    setBusy(true);
    saving.current = true;
    const normalizedCode = normalizeAuditCode(code);
    setCode(normalizedCode);
    const { error } = await supabase.rpc("audit_inventory_log", {
      _log_id: log.id,
      _code: normalizedCode,
      _barcode: barcode,
      _name: name,
      _location: location,
      _qty: (editQty ? n : null) as number,
    });
    setBusy(false);
    saving.current = false;
    if (error) {
      toast.error(error.message.includes("duplicate_audit_code") ? "هذا الرقم ID مستعمل لمنتج آخر" : errorText(error));
      return;
    }
    toast.success("تم التدقيق");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" onOpenAutoFocus={(event) => { event.preventDefault(); codeRef.current?.focus(); }}>
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            تدقيق المنتج
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="a-code">الرقم ID (اختياري)</Label>
            <div className="flex gap-2">
              <Input ref={codeRef} id="a-code" inputMode="numeric" value={code} onChange={(e) => { codeTouched.current = true; setCode(e.target.value); }} onBlur={() => setCode(normalizeAuditCode(code))} placeholder="0001" className="barcode-chip" />
              <Button type="button" variant="outline" disabled={busy || codeLoading} onClick={() => void nextCode()}>
                الرقم التالي
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-bc">الباركود</Label>
            <Input id="a-bc" value={barcode} onChange={(e) => setBarcode(e.target.value)} className="barcode-chip" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-name">اسم المنتج</Label>
            <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-loc">المكان في المخزن (مثلا رف A1)</Label>
            <Input id="a-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A1" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={editQty} onCheckedChange={(v) => setEditQty(v === true)} />
            تعديل الكمية
          </label>
          {editQty && (
            <Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          )}
          <Button type="submit" className="w-full" disabled={busy || codeLoading}>
            حفظ التدقيق
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

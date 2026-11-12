import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CloudOff,
  History,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Send,
  Trash2,
  Flashlight,
  FlashlightOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { activeSessionQuery, productsQuery, sessionLogsQuery } from "@/lib/queries";
import { discardQueued, enqueueCount, newClientId, useSyncState } from "@/lib/offline";
import { formatDateTime, formatQty } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { findProductByBarcode } from "@/lib/inventory-rules";

export const Route = createFileRoute("/_authenticated/scan")({
  beforeLoad: ({ context }) => {
    if (!context.me.tenant) throw new Error("no_store");
    return { tenant: context.me.tenant };
  },
  loader: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      activeSessionQuery(context.tenant.id),
    );
    await Promise.all([
      context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(sessionLogsQuery(session?.id ?? null)),
    ]);
  },
  head: () => ({ meta: [{ title: "السكان | SMART STOCK" }] }),
  component: ScanPage,
});

const LAST_LOCATION_KEY = "stocki_last_location";

interface Entry {
  key: string;
  id: string | null;
  client_id: string | null;
  barcode: string;
  product_name: string;
  counted_quantity: number;
  location: string;
  counted_by: string | null;
  counted_by_name: string;
  counted_at: string;
  pending: boolean;
  failed?: string | undefined;
}

function ScanPage() {
  const { tenant, me } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: session } = useSuspenseQuery(activeSessionQuery(tenant.id));
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const { data: serverLogs } = useSuspenseQuery(sessionLogsQuery(session?.id ?? null));
  const { queue, online, lastSyncedAt } = useSyncState();

  const [barcode, setBarcode] = useState("");
  const [productName, setProductName] = useState("");
  const [autoName, setAutoName] = useState(false);
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [unit, setUnit] = useState<"piece" | "carton">("piece");
  const [cartonSize, setCartonSize] = useState("1");
  const [cameraOn, setCameraOn] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [target, setTarget] = useState<Entry | null>(null);
  const [search, setSearch] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocation(localStorage.getItem(LAST_LOCATION_KEY) ?? "");
  }, []);

  // After counts reach the server, refresh the shared list
  useEffect(() => {
    if (lastSyncedAt && session)
      void queryClient.invalidateQueries({ queryKey: ["session-logs", session.id] });
  }, [lastSyncedAt, session, queryClient]);

  // Other workers' counts arrive live, for duplicate warnings
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`scan-${session.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_logs",
          filter: `session_id=eq.${session.id}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ["session-logs", session.id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, queryClient]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.barcode, p])), [products]);

  /** Server lines + lines still waiting on this phone. */
  const entries = useMemo<Entry[]>(() => {
    if (!session) return [];
    const mine = queue.filter(
      (q) => q.payload.session_id === session.id && q.user_id === me.userId,
    );
    const byClient = new Map(mine.map((q) => [q.client_id, q]));
    const list: Entry[] = serverLogs.map((l) => {
      const q = (l.client_id && byClient.get(l.client_id)) || mine.find((m) => m.log_id === l.id);
      const p = q?.payload;
      return {
        key: l.id,
        id: l.id,
        client_id: l.client_id,
        barcode: l.barcode,
        product_name: p?.product_name ?? l.product_name,
        counted_quantity: p?.counted_quantity ?? Number(l.counted_quantity),
        location: p?.location ?? l.location ?? "",
        counted_by: l.counted_by,
        counted_by_name: l.counted_by_name,
        counted_at: p?.counted_at ?? l.counted_at,
        pending: Boolean(q),
        failed: q?.status === "failed" ? q.error : undefined,
      };
    });
    const known = new Set(serverLogs.map((l) => l.client_id).filter(Boolean));
    for (const q of mine) {
      if (q.op === "insert" && !known.has(q.client_id)) {
        list.unshift({
          key: q.client_id,
          id: null,
          client_id: q.client_id,
          ...q.payload,
          counted_by: q.user_id,
          pending: true,
          failed: q.status === "failed" ? q.error : undefined,
        });
      }
    }
    return list;
  }, [serverLogs, queue, session, me.userId]);

  const typed = barcode.trim();
  // An alternate barcode is counted under the product's main barcode
  const clean = (typed && findProductByBarcode(products, typed)?.barcode) || typed;
  const isAlt = Boolean(typed && clean !== typed);
  const duplicates = useMemo(
    () => (clean ? entries.filter((e) => e.barcode === clean) : []),
    [entries, clean],
  );
  const myRecent = useMemo(
    () => entries.filter((e) => e.counted_by === me.userId).slice(0, 8),
    [entries, me.userId],
  );
  const sq = search.trim().toLowerCase();
  const searchResults = useMemo(
    () =>
      sq.length < 2
        ? []
        : products
            .filter(
              (p) =>
                p.name.toLowerCase().includes(sq) ||
                p.barcode.toLowerCase().includes(sq) ||
                (p.alt_barcodes ?? []).some((b) => b.toLowerCase().includes(sq)),
            )
            .slice(0, 8),
    [products, sq],
  );
  const [altCodes, setAltCodes] = useState<string[]>([""]);
  const pickProduct = (p: (typeof products)[number]) => {
    setBarcode(p.barcode);
    setProductName(p.name);
    setAutoName(true);
    setSearch("");
    window.setTimeout(() => qtyRef.current?.select(), 250);
  };
  const failed = useMemo(() => entries.filter((e) => e.failed), [entries]);
  const locations = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.location && set.add(e.location));
    products.forEach((p) => p.default_location && set.add(p.default_location));
    return Array.from(set).slice(0, 150);
  }, [entries, products]);

  // Fill the product name from the catalog when a barcode is recognised
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!clean) {
        if (autoName) setProductName("");
        setTarget(null);
        return;
      }
      const p = productMap.get(clean);
      if (p && (!productName || autoName)) {
        setProductName(p.name);
        setAutoName(true);
        if (!location && p.default_location) setLocation(p.default_location);
      }
      setAltCodes(p?.alt_barcodes?.length ? [...p.alt_barcodes] : [""]);
      setPurchasePrice(p ? String(Number(p.purchase_price)) : "");
      setSellingPrice(p ? String(Number(p.selling_price)) : "");
      setCartonSize(String(Number(p?.carton_size) > 0 ? Number(p?.carton_size) : 1));
      // Same product already counted at this location? Default to editing that line.
      const sameSpot = entries.find(
        (e) =>
          e.barcode === clean &&
          e.location.trim() === location.trim() &&
          (e.counted_by === me.userId || me.isManager),
      );
      setTarget(sameSpot ?? null);
      if (sameSpot) setQuantity(String(sameSpot.counted_quantity));
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, productMap]);

  const onDetected = useCallback((code: string) => {
    setBarcode(code);
    setAutoName(true);
    window.setTimeout(() => qtyRef.current?.select(), 250);
  }, []);

  const bump = (delta: number) =>
    setQuantity((q) =>
      String(Math.max(0, Math.round(((Number(q.replace(",", ".")) || 0) + delta) * 1000) / 1000)),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const entered = quantity.trim() ? Number(quantity.replace(",", ".")) : 1;
    const perCarton = Number(cartonSize.replace(",", ".")) || 0;
    if (unit === "carton" && perCarton <= 0) return void toast.error("سعة الكرتون غير صالحة.");
    const qty = unit === "carton" ? Math.round(entered * perCarton * 1000) / 1000 : entered;
    if (!clean) return void toast.error("الباركود مطلوب.");
    if (!Number.isFinite(qty) || qty < 0) return void toast.error("كمية غير صالحة.");
    const loc = location.trim() || "غير محدد";
    const payload = {
      session_id: session.id,
      barcode: clean,
      product_name: productName.trim() || productMap.get(clean)?.name || `منتج غير مسجل (${clean})`,
      counted_quantity: qty,
      location: loc,
      counted_by_name: me.fullName,
      counted_at: new Date().toISOString(),
      notes: notes.trim() || null,
    };
    const known = productMap.get(clean);
    if (known) {
      const pp = Number(purchasePrice.replace(",", "."));
      const sp = Number(sellingPrice.replace(",", "."));
      if (!Number.isFinite(pp) || pp < 0 || !Number.isFinite(sp) || sp < 0)
        return void toast.error("سعر غير صالح.");
      if (pp !== Number(known.purchase_price) || sp !== Number(known.selling_price)) {
        const { error } = await supabase.rpc("set_product_prices", {
          _barcode: clean,
          _purchase: pp,
          _selling: sp,
        });
        if (error) toast.error("تعذر حفظ الأسعار.");
        else void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
      }
    }
    if (known) {
      const wanted = Array.from(new Set(altCodes.map((b) => b.trim()).filter((b) => b && b !== clean)));
      const current = known.alt_barcodes ?? [];
      if (wanted.join("|") !== current.join("|")) {
        // Best effort: never blocks saving the count; invalid/duplicate codes are skipped by the DB.
        void supabase
          .rpc("set_product_alt_barcodes", { _barcode: clean, _alts: wanted })
          .then(({ error }) => {
            if (!error) void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
          });
      }
    }
    const editing = target;
    await enqueueCount({
      client_id: editing?.client_id ?? newClientId(),
      log_id: editing?.id ?? null,
      user_id: me.userId,
      op: editing ? "update" : "insert",
      payload,
      created_at: new Date().toISOString(),
      status: "pending",
    });
    localStorage.setItem(LAST_LOCATION_KEY, location.trim());
    toast.success(
      online
        ? editing
          ? `تم تعديل «${payload.product_name}»`
          : `تم تسجيل «${payload.product_name}» × ${formatQty(qty)}`
        : "محفوظ في الهاتف، سيُرسل عند عودة الاتصال",
    );
    setBarcode("");
    setProductName("");
    setAutoName(false);
    setQuantity("1");
    setNotes("");
    setPurchasePrice("");
    setSellingPrice("");
    setSecondBarcode("");
    setUnit("piece");
    setTarget(null);
    barcodeRef.current?.focus();
  };

  if (!session) {
    return (
      <div className="mx-auto max-w-md">
        <div className="surface-card bg-ledger flex flex-col items-center gap-3 p-10 text-center">
          <History className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-extrabold">لا توجد جلسة جرد مفتوحة</p>
          <p className="text-sm text-muted-foreground">
            {me.isManager
              ? "ابدأ جلسة من لوحة الجرد ليتمكن الفريق من المسح."
              : "انتظر حتى يفتح المسير جلسة جرد."}
          </p>
          {me.isManager && (
            <Button asChild>
              <Link to="/dashboard">لوحة الجرد</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const canEdit = (e: Entry) => e.counted_by === me.userId || me.isManager;

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
          <div className="min-w-0">
            <p className="text-[11px] opacity-80">الجلسة الجارية</p>
            <p className="truncate font-extrabold">{session.name}</p>
          </div>
          <div className="text-end">
            <p className="text-[11px] opacity-80">أسطري</p>
            <p className="font-mono text-xl font-bold">
              {entries.filter((e) => e.counted_by === me.userId).length}
            </p>
          </div>
        </div>

        {!online && (
          <div className="flex items-center gap-2 rounded-xl bg-warning p-3 text-sm font-bold text-warning-foreground">
            <CloudOff className="h-4 w-4 shrink-0" />
            بدون اتصال: استمر في العدّ، كل شيء يُحفظ في الهاتف ويُرسل لاحقاً.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant={torchOn ? "warning" : "outline"}
            disabled={!cameraOn || !torchSupported}
            onClick={() => setTorchOn((t) => !t)}
            title={torchSupported ? "الفلاش" : "الفلاش غير متاح في هذه الكاميرا"}
          >
            {torchOn ? <FlashlightOff /> : <Flashlight />}
            {torchOn ? "إطفاء الفلاش" : "الفلاش"}
          </Button>
          <Button
            type="button"
            variant={cameraOn ? "outline" : "default"}
            onClick={() => {
              const next = !cameraOn;
              setCameraOn(next);
              if (!next) setTorchOn(false);
              if (!next) window.setTimeout(() => barcodeRef.current?.focus(), 50);
            }}
          >
            {cameraOn ? <CameraOff /> : <Camera />}
            {cameraOn ? "إيقاف الكاميرا (كتابة يدوية)" : "تشغيل الكاميرا"}
          </Button>
        </div>

        {cameraOn && (
          <BarcodeScanner
            onDetected={onDetected}
            torchOn={torchOn}
            onTorchSupport={setTorchSupported}
          />
        )}

        <form onSubmit={submit} className="surface-card space-y-4 p-4 sm:p-5">
          <div className="relative space-y-1.5">
            <Label htmlFor="product-search">بحث بالاسم أو الباركود</Label>
            <div className="flex gap-2">
              <Input
                id="product-search"
                autoComplete="off"
                placeholder="اكتب اسم المنتج أو جزءاً من الباركود"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (searchResults[0]) pickProduct(searchResults[0]);
                  }
                }}
                className="h-11"
              />
              {search && (
                <Button type="button" variant="outline" className="h-11" onClick={() => setSearch("")}>
                  مسح
                </Button>
              )}
            </div>
            {sq.length >= 2 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border bg-popover text-popover-foreground shadow-lg">
                {searchResults.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">لا توجد نتائج</p>
                ) : (
                  searchResults.map((p) => (
                    <button
                      key={p.barcode}
                      type="button"
                      onClick={() => pickProduct(p)}
                      className="flex w-full items-center justify-between gap-2 border-b p-3 text-start last:border-b-0 hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{p.name}</span>
                        <span className="barcode-chip text-xs">{p.barcode}</span>
                      </span>
                      <span className="shrink-0 text-end text-xs text-muted-foreground">
                        بيع: {Number(p.selling_price)}
                        <br />
                        شراء: {Number(p.purchase_price)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="barcode">الباركود</Label>
            <Input
              id="barcode"
              ref={barcodeRef}
              required
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              placeholder="امسح أو اكتب الرمز"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="barcode-chip h-12 bg-muted text-center text-lg font-bold"
            />
            {isAlt && (
              <p className="text-xs text-muted-foreground">
                باركود بديل ← يُحسب على الرمز الرئيسي <span className="barcode-chip">{clean}</span>
              </p>
            )}
          </div>

          {productMap.has(clean) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>الأكواد البديلة (اختياري)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAltCodes((a) => [...a, ""])}
                >
                  <Plus className="size-4" /> كود آخر
                </Button>
              </div>
              {altCodes.map((code, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`كود بديل ${i + 1}`}
                    placeholder={`كود بديل ${i + 1}`}
                    value={code}
                    onChange={(e) => setAltCodes((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                    className="barcode-chip h-11 flex-1 text-center font-bold"
                  />
                  {altCodes.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-11 w-11"
                      aria-label="حذف الكود"
                      onClick={() => setAltCodes((a) => a.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="space-y-2 rounded-xl border-2 border-warning bg-warning/10 p-3">
              <p className="flex items-center gap-2 text-sm font-extrabold text-warning-foreground">
                <AlertTriangle className="h-4 w-4" />
                هذا المنتج محسوب في هذه الجلسة ({duplicates.length})
              </p>
              <div className="space-y-1.5">
                {duplicates.map((d) => (
                  <div
                    key={d.key}
                    className={cn(
                      "flex items-center gap-2 rounded-lg bg-card p-2 text-xs",
                      target?.key === d.key && "ring-2 ring-warning",
                    )}
                  >
                    <span className="font-mono text-base font-bold">
                      {formatQty(d.counted_quantity)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 font-bold">
                        <MapPin className="h-3 w-3" />
                        {d.location || "—"}
                      </span>
                      <span className="text-muted-foreground">
                        {d.counted_by_name} · {formatDateTime(d.counted_at)}
                      </span>
                    </span>
                    {canEdit(d) && (
                      <Button
                        type="button"
                        size="sm"
                        variant={target?.key === d.key ? "warning" : "outline"}
                        onClick={() => {
                          setTarget(d);
                          setQuantity(String(d.counted_quantity));
                          setLocation(d.location);
                        }}
                      >
                        <Pencil />
                        تعديل
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant={target ? "outline" : "default"}
                className="w-full"
                onClick={() => {
                  setTarget(null);
                  setQuantity("1");
                }}
              >
                <Plus />
                إضافة كسطر جديد (رف آخر)
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="product-name">
              اسم المنتج
              {autoName && productMap.has(clean) && (
                <span className="ms-2 rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                  من الكتالوج
                </span>
              )}
            </Label>
            <Input
              id="product-name"
              placeholder="اختياري"
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                setAutoName(false);
              }}
              className="h-11 font-bold"
            />
          </div>

          {productMap.has(clean) ? (
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-accent/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="purchase-price">سعر الشراء</Label>
                <Input id="purchase-price" dir="ltr" inputMode="decimal" value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)} className="h-11 text-end font-mono font-bold" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="selling-price">سعر البيع</Label>
                <Input id="selling-price" dir="ltr" inputMode="decimal" value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)} className="h-11 text-end font-mono font-bold" />
              </div>
            </div>
          ) : clean ? (
            <p className="rounded-xl bg-warning/15 p-2 text-xs font-bold text-warning-foreground">
              منتج غير مسجل في المخزون، لا توجد أسعار.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="location">الموقع (الرف)</Label>
            <Input
              id="location"
              list="locations-list"
              placeholder="مثلاً: المخزن 1 - الرف B2"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-11"
            />
            <datalist id="locations-list">
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="qty">
                {unit === "carton"
                  ? "عدد الكراتين"
                  : target
                    ? "الكمية الجديدة"
                    : "الكمية المحسوبة"}
              </Label>
              <div className="flex rounded-lg bg-muted p-0.5 text-xs font-bold">
                {(["piece", "carton"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={cn(
                      "rounded-md px-3 py-1",
                      unit === u ? "bg-card shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {u === "piece" ? "بالقطعة" : "بالكرتون"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-14 w-14 shrink-0 text-xl"
                onClick={() => bump(1)}
                aria-label="زيادة"
              >
                <Plus className="!size-6" />
              </Button>
              <Input
                id="qty"
                ref={qtyRef}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-14 text-center font-mono text-2xl font-bold"
              />
              <Button
                type="button"
                variant="secondary"
                className="h-14 w-14 shrink-0 text-xl"
                onClick={() => bump(-1)}
                aria-label="نقصان"
              >
                <Minus className="!size-6" />
              </Button>
            </div>
            {unit === "carton" && (
              <div className="flex items-center gap-2 rounded-xl bg-accent p-2 text-sm text-accent-foreground">
                <Label htmlFor="carton-size" className="shrink-0">
                  قطع في الكرتون
                </Label>
                <Input
                  id="carton-size"
                  inputMode="decimal"
                  value={cartonSize}
                  onChange={(e) => setCartonSize(e.target.value)}
                  className="h-9 w-20 text-center font-mono font-bold"
                />
                <span className="ms-auto font-mono font-bold">
                  ={" "}
                  {formatQty(
                    (Number(quantity.replace(",", ".")) || 0) *
                      (Number(cartonSize.replace(",", ".")) || 0),
                  )}{" "}
                  قطعة
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">ملاحظة (اختياري، تصل للمسير في التنبيهات)</Label>
            <Input
              id="notes"
              placeholder="مثلاً: كرتون مفتوح، تاريخ قريب..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11"
            />
          </div>

          <Button
            type="submit"
            size="xl"
            variant={target ? "warning" : "default"}
            className="w-full"
          >
            <Send />
            {target ? "حفظ التعديل على هذا السطر" : "تسجيل العدّ"}
          </Button>
        </form>
      </div>

      <aside className="space-y-4">
        {failed.length > 0 && (
          <div className="surface-card border-destructive p-4">
            <p className="text-sm font-extrabold text-destructive">أسطر رفضها الخادم</p>
            <p className="mt-1 text-xs text-muted-foreground">
              غالباً لأن الجلسة أُغلقت. أعد العدّ أو احذفها.
            </p>
            <div className="mt-3 space-y-2">
              {failed.map((f) => (
                <div key={f.key} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 font-bold">
                    {f.product_name} × {formatQty(f.counted_quantity)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="حذف"
                    onClick={() => f.client_id && void discardQueued(f.client_id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="surface-card overflow-hidden">
          <p className="border-b px-4 py-3 text-sm font-extrabold">آخر ما عددته</p>
          {myRecent.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              لا شيء بعد. امسح أول منتج.
            </p>
          ) : (
            <div className="divide-y">
              {myRecent.map((e) => (
                <div key={e.key} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono text-lg font-bold">
                    {formatQty(e.counted_quantity)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{e.product_name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {e.location}
                    </span>
                  </span>
                  {e.pending && !e.failed && (
                    <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
                      في الانتظار
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

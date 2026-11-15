export type FeatureKey = "sales" | "inventory" | "stock_io" | "import_export" | "online_store";
export type StoreFeatures = Record<FeatureKey, boolean>;

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  sales: "البيع ونقطة البيع",
  inventory: "الجرد",
  stock_io: "الإدخال والإخراج (وصول السلع والإرجاع)",
  import_export: "الاستيراد والتصدير Excel",
  online_store: "المتجر الإلكتروني",
};

export const ALL_ON: StoreFeatures = { sales: true, inventory: true, stock_io: true, import_export: true, online_store: true };

export const PLANS: { id: string; label: string; days: number | null; features: StoreFeatures }[] = [
  { id: "trial", label: "تجريبي", days: 14, features: ALL_ON },
  { id: "sales_only", label: "البيع فقط", days: 30, features: { ...ALL_ON, inventory: false, online_store: false } },
  { id: "inventory_only", label: "الجرد فقط", days: 30, features: { sales: false, inventory: true, stock_io: false, import_export: true, online_store: false } },
  { id: "monthly", label: "شهري كامل", days: 30, features: ALL_ON },
  { id: "yearly", label: "سنوي كامل", days: 365, features: ALL_ON },
  { id: "full", label: "مخصص / بدون مدة", days: null, features: ALL_ON },
];

export function normalizeFeatures(raw: unknown): StoreFeatures {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...ALL_ON };
  for (const k of Object.keys(ALL_ON) as FeatureKey[]) if (o[k] === false) out[k] = false;
  return out;
}

/** Days left; null = no end date. Negative = expired. */
export function daysLeft(endsAt: string | null | undefined, now = new Date()): number | null {
  if (!endsAt) return null;
  return Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 86_400_000);
}

export function isExpired(endsAt: string | null | undefined, now = new Date()) {
  return endsAt ? new Date(endsAt).getTime() <= now.getTime() : false;
}

/** New end date after adding days to whichever is later: now or the current end. */
export function extendSubscription(endsAt: string | null, days: number, now = new Date()): string {
  const base = endsAt && new Date(endsAt) > now ? new Date(endsAt) : now;
  return new Date(base.getTime() + days * 86_400_000).toISOString();
}

/** Whether a store may add another member with this role. null limit = unlimited. */
export function memberLimitReason(
  counts: { managers: number; total: number },
  limits: { max_managers: number | null; max_members: number | null },
  role: string,
): "limit_managers" | "limit_members" | null {
  if (limits.max_members != null && counts.total >= limits.max_members) return "limit_members";
  if (role === "manager" && limits.max_managers != null && counts.managers >= limits.max_managers) return "limit_managers";
  return null;
}

/** Algerian G50 monthly summary from TTC sales/purchases. */
export function g50Summary(input: { salesTtc: number; purchasesTtc: number; tvaRate: number; tapRate: number }) {
  const r = input.tvaRate / 100;
  const round = (n: number) => Math.round(n * 100) / 100;
  const salesHt = round(input.salesTtc / (1 + r));
  const tvaCollected = round(input.salesTtc - salesHt);
  const purchasesHt = round(input.purchasesTtc / (1 + r));
  const tvaDeductible = round(input.purchasesTtc - purchasesHt);
  const tvaDue = round(Math.max(0, tvaCollected - tvaDeductible));
  const tvaCredit = round(Math.max(0, tvaDeductible - tvaCollected));
  const tap = round(salesHt * (input.tapRate / 100));
  return { salesHt, tvaCollected, purchasesHt, tvaDeductible, tvaDue, tvaCredit, tap, totalDue: round(tvaDue + tap) };
}

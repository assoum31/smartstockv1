import { useSyncExternalStore } from "react";
import { setPageLanguage, translateString } from "@/lib/dom-translate";
const dzWord = (ar: string) => translateString(ar, "dz");

export type Lang = "ar" | "dz" | "fr" | "en";
export type Dir = "rtl" | "ltr";
const KEY = "smartstock:lang";
const DIR_KEY = "smartstock:dir";

const dict = {
  stores: { ar: "المتاجر", fr: "Magasins", en: "Stores" },
  dashboard: { ar: "لوحة التحكم", fr: "Tableau de bord", en: "Dashboard" },
  dashboardShort: { ar: "الرئيسية", fr: "Accueil", en: "Home" },
  inventory: { ar: "الجرد", fr: "Inventaire", en: "Inventory" },
  audit: { ar: "التدقيق", fr: "Contrôle", en: "Audit" },
  customers: { ar: "الزبائن", fr: "Clients", en: "Customers" },
  onlineStore: { ar: "إدارة المتجر أونلاين", fr: "Gérer la boutique", en: "Manage online store" },
  onlineOrders: { ar: "طلبيات أونلاين", fr: "Commandes en ligne", en: "Online orders" },
  ordersShort: { ar: "الطلبيات", fr: "Commandes", en: "Orders" },
  stock: { ar: "المخزون", fr: "Stock", en: "Stock" },
  expenses: { ar: "المصاريف", fr: "Dépenses", en: "Expenses" },
  advances: { ar: "التسبيقات", fr: "Acomptes", en: "Advances" },
  scan: { ar: "السكان", fr: "Scanner", en: "Scan" },
  pos: { ar: "البيع", fr: "Vente", en: "Sales" },
  salesLog: { ar: "سجل المبيعات", fr: "Journal des ventes", en: "Sales log" },
  suppliers: { ar: "الموردون", fr: "Fournisseurs", en: "Suppliers" },
  returns: { ar: "بونات الإرجاع", fr: "Bons de retour", en: "Returns" },
  activity: { ar: "سجل العمليات", fr: "Journal d'activité", en: "Activity log" },
  activityShort: { ar: "السجل", fr: "Journal", en: "Log" },
  salesShort: { ar: "المبيعات", fr: "Ventes", en: "Sales" },
  returnsShort: { ar: "الإرجاع", fr: "Retours", en: "Returns" },
  receiptsShort: { ar: "السلع", fr: "Réception", en: "Goods" },
  receipts: { ar: "وصول السلع", fr: "Réceptions", en: "Receipts" },
  products: { ar: "المنتجات", fr: "Produits", en: "Products" },
  team: { ar: "الفريق", fr: "Équipe", en: "Team" },
  hq: { ar: "الإدارة العامة", fr: "Administration", en: "Head office" },
  online: { ar: "متصل", fr: "En ligne", en: "Online" },
  offline: { ar: "بدون اتصال", fr: "Hors ligne", en: "Offline" },
  sending: { ar: "قيد الإرسال", fr: "Envoi…", en: "Sending" },
  rejected: { ar: "مرفوض", fr: "rejeté", en: "failed" },
  notifications: { ar: "التنبيهات", fr: "Alertes", en: "Alerts" },
  settings: { ar: "الإعدادات", fr: "Paramètres", en: "Settings" },
  signOut: { ar: "تسجيل الخروج", fr: "Déconnexion", en: "Sign out" },
  language: { ar: "اللغة", fr: "Langue", en: "Language" },
  direction: { ar: "اتجاه الواجهة", fr: "Sens d'affichage", en: "Layout direction" },
  dirAuto: { ar: "تلقائي حسب اللغة", fr: "Auto selon la langue", en: "Auto by language" },
  rtl: { ar: "من اليمين لليسار", fr: "Droite à gauche", en: "Right to left" },
  ltr: { ar: "من اليسار لليمين", fr: "Gauche à droite", en: "Left to right" },
  langHint: {
    ar: "تتغير كل الشاشات فوراً.",
    fr: "Tous les écrans changent immédiatement.",
    en: "Every screen changes instantly.",
  },
  changePassword: { ar: "تغيير كلمة المرور", fr: "Changer le mot de passe", en: "Change password" },
  currentPassword: { ar: "كلمة المرور الحالية", fr: "Mot de passe actuel", en: "Current password" },
  newPassword: { ar: "كلمة المرور الجديدة", fr: "Nouveau mot de passe", en: "New password" },
  confirmPassword: { ar: "تأكيدها", fr: "Confirmer", en: "Confirm" },
  savePassword: { ar: "حفظ كلمة المرور", fr: "Enregistrer", en: "Save password" },
  appearance: { ar: "المظهر", fr: "Apparence", en: "Appearance" },
  themeLight: { ar: "نهاري", fr: "Clair", en: "Light" },
  themeDark: { ar: "ليلي", fr: "Nuit", en: "Night" },
  themeOled: { ar: "أسود", fr: "Noir OLED", en: "OLED black" },
  saveSettings: { ar: "حفظ الإعدادات", fr: "Enregistrer les paramètres", en: "Save settings" },
  settingsSaved: { ar: "تم حفظ الإعدادات", fr: "Paramètres enregistrés", en: "Settings saved" },
  themeSystem: { ar: "حسب الهاتف", fr: "Selon l'appareil", en: "Match device" },
  themeHint: { ar: "الليلي بألوان هادئة وكتابة خافتة لراحة العين، والأسود بالكامل يوفر البطارية.", fr: "Nuit : couleurs apaisées et texte atténué. Noir OLED : noir intégral, économe en batterie.", en: "Night uses soft colors and dimmed text; OLED black is true black and saves battery." },
  saving: { ar: "جاري الحفظ...", fr: "Enregistrement…", en: "Saving…" },
} satisfies Record<string, Record<"ar" | "fr" | "en", string>>;
export type TKey = keyof typeof dict;

type State = { lang: Lang; dirOverride: Dir | null };
let state: State = { lang: "ar", dirOverride: null };
const subs = new Set<() => void>();
const serverState: State = { lang: "ar", dirOverride: null };

function apply() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = state.lang === "dz" ? "ar-DZ" : state.lang;
  document.documentElement.dir = dirOf(state);
  setPageLanguage(state.lang);
}
function dirOf(s: State): Dir {
  return s.dirOverride ?? (s.lang === "ar" || s.lang === "dz" ? "rtl" : "ltr");
}
function emit() {
  apply();
  subs.forEach((f) => f());
}

/** Call once from a useEffect to load the saved preference. */
export function initI18n() {
  try {
    const l = localStorage.getItem(KEY) as Lang | null;
    const d = localStorage.getItem(DIR_KEY) as Dir | null;
    state = {
      lang: l === "fr" || l === "en" || l === "ar" || l === "dz" ? l : "ar",
      dirOverride: d === "rtl" || d === "ltr" ? d : null,
    };
  } catch {}
  emit();
}
export function setLang(lang: Lang) {
  state = { ...state, lang };
  try { localStorage.setItem(KEY, lang); } catch {}
  emit();
}
export function setDirOverride(d: Dir | null) {
  state = { ...state, dirOverride: d };
  try { d ? localStorage.setItem(DIR_KEY, d) : localStorage.removeItem(DIR_KEY); } catch {}
  emit();
}

export function useI18n() {
  const s = useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => state,
    () => serverState,
  );
  return {
    lang: s.lang,
    dir: dirOf(s),
    dirOverride: s.dirOverride,
    t: (k: TKey) => (s.lang === "dz" ? dzWord(dict[k].ar) : dict[k][s.lang]),
  };
}

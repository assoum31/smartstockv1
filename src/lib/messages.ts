const FAILED = "حدث خطأ، حاول مرة أخرى.";
const FORBIDDEN = "ليست لديك صلاحية لهذا الإجراء.";

export const REASON_TEXT: Record<string, string | undefined> = {
  username_taken: "اسم المستخدم مستعمل من قبل في هذا المتجر.",
  code_taken: "رمز المتجر مستعمل من قبل.",
  invalid_pin: "الرمز أو اسم المستخدم أو رمز المتجر غير صحيح.",
  store_suspended: "هذا المتجر موقوف حالياً. اطلب من المدير العام إعادة تفعيله.",
  pin_locked: "تم تجاوز عدد المحاولات. اطلب رمزاً جديداً من المسير.",
  pin_expired: "انتهت صلاحية الرمز. اطلب رمزاً جديداً من المسير.",
  weak_password: "كلمة المرور سهلة التخمين أو مسرّبة. اختر كلمة أطول وأقل شيوعاً.",
  use_manager_page: "هذا حساب مسير. ادخل من صفحة دخول المسيرين.",
  use_worker_page: "هذا حساب عامل. ادخل من صفحة دخول العمال.",
  invalid_login: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  create_failed: "تعذر إنشاء الحساب، حاول مرة أخرى.",
  failed: "حدث خطأ، حاول مرة أخرى.",
};

export function reasonText(reason?: string): string {
  return (reason && REASON_TEXT[reason]) || FAILED;
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
  if (/cash_session_not_open/.test(msg)) return 'الصندوق الأصلي مغلق. البيع محفوظ على الجهاز ويحتاج مراجعة المسير.';
  if (/forbidden/.test(msg)) return FORBIDDEN;
  if (/session_already_active/.test(msg)) return "توجد جلسة جرد مفتوحة بالفعل.";
  if (/session_not_active/.test(msg)) return "لا يمكن تسجيل بيع إلا في جلسة مفتوحة.";
  if (/empty_ticket/.test(msg)) return "البون فارغ، أضف منتجاً واحداً على الأقل.";
  if (/invalid_item/.test(msg)) return "كمية أو سعر غير صالح في البون.";
  if (/return_exceeds_sold/.test(msg)) return "الكمية المرجعة أكبر من المباعة في هذا الوصل.";
  if (/ticket_not_found/.test(msg)) return "الوصل غير موجود.";
  if (/fetch|network/i.test(msg)) return "لا يوجد اتصال بالإنترنت.";
  return FAILED;
}

export function formatQty(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

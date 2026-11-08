import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardList, Layers, ScanLine } from "lucide-react";

const TITLE = "تسجيل الدخول | Stocki Pro";
const DESCRIPTION = "اختر صفحة الدخول: مسير المتجر أو عامل الجرد.";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginChooser,
});

const CHOICES = [
  {
    to: "/manager" as const,
    icon: ClipboardList,
    title: "مسير المتجر",
    text: "جلسات الجرد، العمال، الكميات والفوارق.",
  },
  {
    to: "/worker" as const,
    icon: ScanLine,
    title: "عامل الجرد",
    text: "مسح الباركود وتسجيل الكميات.",
  },
];

function LoginChooser() {
  return (
    <div className="bg-ledger flex min-h-screen items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-warning">
            <Layers className="h-6 w-6" />
          </span>
          <span className="text-2xl font-extrabold">
            Stocki <span className="text-primary">Pro</span>
          </span>
        </Link>
        <h1 className="mb-4 text-center text-lg font-extrabold">من أنت؟</h1>
        <div className="space-y-3">
          {CHOICES.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="surface-card flex items-center gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink text-ink-foreground">
                <c.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{c.title}</span>
                <span className="block text-xs text-muted-foreground">{c.text}</span>
              </span>
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

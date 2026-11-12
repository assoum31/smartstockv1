import { BrandMark } from "@/components/brand-logo";
import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ClipboardList,
  CloudOff,
  ScanLine,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchMe } from "@/lib/me";
import heroImage from "@/assets/warehouse-scan.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SMART STOCK | منصة الجرد الذكي للمتاجر" },
      {
        name: "description",
        content:
          "جرد ميداني بالباركود لعدة متاجر: جلسات جرد، فوارق المخزون لكل منتج، عمل بدون إنترنت وتصدير Excel.",
      },
      { property: "og:title", content: "SMART STOCK | منصة الجرد الذكي للمتاجر" },
      {
        property: "og:description",
        content:
          "جرد ميداني بالباركود لعدة متاجر: جلسات جرد، فوارق المخزون لكل منتج، عمل بدون إنترنت وتصدير Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: ScanLine, title: "سكان بالكاميرا", text: "أي هاتف يصبح قارئ باركود، بدون جهاز إضافي." },
  {
    icon: Scale,
    title: "فارق لكل منتج",
    text: "مجموع كل الرفوف مقابل مخزون النظام المجمّد عند بداية الجلسة.",
  },
  {
    icon: CloudOff,
    title: "يعمل بدون إنترنت",
    text: "العدّ يُحفظ في الهاتف ويُرسل تلقائياً عند عودة الشبكة.",
  },
  {
    icon: ShieldCheck,
    title: "متاجر معزولة",
    text: "كل متجر يرى بياناته فقط، وكل عامل يدخل برمز تفعيل خاص.",
  },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    void fetchMe()
      .then((me) => {
        if (me && !me.blocked) navigate({ to: me.homePath, replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
        <section className="bg-ledger flex flex-col px-6 py-8 sm:px-12">
          <header className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <BrandMark className="h-9 w-9 shrink-0 shadow-lift rounded-xl" />
              <span className="text-xl font-extrabold">
                SMART <span className="text-primary">STOCK</span>
              </span>
            </span>
            <Button asChild variant="outline">
              <Link to="/login">تسجيل الدخول</Link>
            </Button>
          </header>

          <div className="my-auto max-w-xl py-12">
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
              جرد ميداني مباشر
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.25] tracking-tight sm:text-5xl">
              اعرف ما في رفوفك
              <br />
              <span className="text-primary">في الوقت الحالي</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              فريق الحساب يمسح الباركود بالهاتف و المسير يرى الفوارق لحظة بلحظة
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="xl">
                <Link to="/worker">
                  <ScanLine />
                  دخول العمال
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link to="/manager">
                  <ClipboardList />
                  دخول المسيرين
                  <ArrowLeft />
                </Link>
              </Button>
            </div>

            <dl className="mt-12 grid gap-5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-ink-foreground">
                    <f.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <dt className="text-sm font-extrabold">{f.title}</dt>
                    <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {f.text}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="relative hidden overflow-hidden bg-ink lg:block">
          <img
            src={heroImage}
            alt="عامل يمسح باركود صندوق في مخزن بالهاتف"
            width={1280}
            height={1600}
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
          <div className="absolute inset-x-8 bottom-8 rounded-2xl bg-ink/85 p-5 text-ink-foreground backdrop-blur">
            <p className="text-xs text-ink-muted">زيت زيتون 1L — الرف B2</p>
            <div className="mt-2 flex items-end justify-between">
              <span className="barcode-chip text-sm text-ink-muted">6111245780031</span>
              <span className="font-mono text-2xl font-bold text-warning" dir="ltr">
                −3
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

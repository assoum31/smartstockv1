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
      { title: T },
      { name: "description", content: D },
      { name: "keywords", content: "برنامج تسيير المخزون الجزائر, برنامج كاشير, برنامج كاسة, جرد بالباركود, نقطة البيع POS, logiciel de caisse Algérie, logiciel gestion de stock Algérie, inventaire code-barres, bon de réception, gestion fournisseurs" },
      { property: "og:title", content: T },
      { property: "og:description", content: D },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://stoky.online/" },
      { property: "og:locale", content: "ar_DZ" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://stoky.online/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "SMART STOCK",
          url: "https://stoky.online/",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web, Android, iOS",
          inLanguage: ["ar", "fr", "en"],
          areaServed: { "@type": "Country", name: "Algeria" },
          description: D,
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: Landing,
});

const T = "SMART STOCK | برنامج كاشير وتسيير المخزون والجرد بالباركود في الجزائر";
const D = "برنامج كاشير POS وتسيير المخزون في الجزائر: جرد بالباركود بالهاتف، فواتير ووصولات الموردين، Logiciel de caisse et gestion de stock Algérie بالدينار الجزائري.";

const FAQ = [
  { q: "هل أحتاج جهاز قارئ باركود خاص؟", a: "لا، كاميرا أي هاتف تقرأ الباركود مباشرة، مع إمكانية الكتابة يدوياً." },
  { q: "هل يعمل البرنامج بدون إنترنت؟", a: "نعم، العدّ يُحفظ في الهاتف ويُرسل تلقائياً عند عودة الشبكة." },
  { q: "هل يمكن طباعة الوصولات وملصقات الباركود؟", a: "نعم، وصولات بيع بعرض 58 أو 60 أو 80 ملم، وملصقات باركود بمقاس 40×20 ملم أو مقاسات أخرى." },
  { q: "هل يمكن استيراد السلع والفواتير من Excel؟", a: "نعم، استيراد وتصدير المنتجات ووصولات الاستلام والمبيعات بملفات Excel." },
  { q: "Est-ce un logiciel de caisse et de gestion de stock en Algérie ?", a: "Oui : caisse POS, inventaire par code-barres, fournisseurs et bons de réception, en dinar algérien (DZD)." },
];

const MODULES = [
  { title: "نقطة البيع والكاشير (POS)", text: "صندوق، تخفيضات، طرق دفع، تسبيقات، مرتجعات، وطباعة الوصولات مع QR." },
  { title: "الجرد الميداني بالباركود", text: "مسح بالهاتف، فوارق لكل منتج، وقيمة العجز والفائض بالدينار الجزائري." },
  { title: "الموردون ووصولات الاستلام", text: "Bons de réception وفواتير الشراء، مع استيراد Excel وطباعة A4." },
  { title: "صلاحيات وسجل عمليات", text: "مسير، بائع، عامل جرد، مدقق، مراقب، مصحح أسعار، وسجل كامل لكل عملية." },
];

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
    <div className="min-h-screen bg-background">
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

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-extrabold sm:text-3xl">
          برنامج كاشير وتسيير المخزون للمحلات في الجزائر
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          SMART STOCK — logiciel de caisse et de gestion de stock pour supérettes, magasins et
          grossistes en Algérie. كل ما يحتاجه محلك في منصة واحدة.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {MODULES.map((m) => (
            <article key={m.title} className="rounded-2xl border bg-card p-5">
              <h3 className="font-extrabold text-primary">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
            </article>
          ))}
        </div>

        <h2 className="mt-16 text-2xl font-extrabold">أسئلة شائعة</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer font-bold">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t px-6 py-6 text-center text-xs text-muted-foreground">
        © SMART STOCK — برنامج تسيير المخزون والكاشير في الجزائر · stoky.online
      </footer>
    </div>
  );
}

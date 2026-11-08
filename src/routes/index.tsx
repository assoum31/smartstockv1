import { createFileRoute } from "@tanstack/react-router";
import capturedCSS from "../styles/site.css?raw";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "تسجيل الدخول | Stocki Pro" }] }),
  staticData: { importedDocument: { html: { "dir": "rtl", "lang": "ar" }, body: { "className": "\x61ntialiased" } } },
  component: Index,
});

function Index() {
  return (
    <>
      <style>{capturedCSS}</style>
      <div className={"\x62g-ledger flex min-h-screen items-center justify-center p-4"} dir="rtl">
        <div className="w-full max-w-md">
          <a className="mb-6 flex items-center justify-center gap-2.5" href="/">
            <span className={"flex h-11 w-11 items-center justify-center rounded-2xl \x62g-ink text-warning"}>
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
                <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
              </svg>
            </span>
            <span className="text-2xl font-extrabold">Stocki <span className="text-primary">Pro</span></span>
          </a>
          <h1 className="mb-4 text-center text-lg font-extrabold">من أنت؟</h1>
          <div className={"\x73pace-y-3"}>
            <a className={"surface-card flex items-center gap-4 p-5 transition-shadow \x68over:\x73hadow-[\x76ar(\x2d-shadow-lift)]"} href="/manager">
              <span className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-xl \x62g-ink text-ink-foreground"}>
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <path d="M12 11h4" />
                  <path d="M12 16h4" />
                  <path d="M8 11h.01" />
                  <path d="M8 16h.01" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">مسير المتجر</span>
                <span className="block text-xs text-muted-foreground">جلسات الجرد، العمال، الكميات والفوارق.</span>
              </span>
              <svg className="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </a>
            <a className={"surface-card flex items-center gap-4 p-5 transition-shadow \x68over:\x73hadow-[\x76ar(\x2d-shadow-lift)]"} href="/worker">
              <span className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-xl \x62g-ink text-ink-foreground"}>
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <path d="M7 12h10" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">عامل الجرد</span>
                <span className="block text-xs text-muted-foreground">مسح الباركود وتسجيل الكميات.</span>
              </span>
              <svg className="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </a>
          </div>
        </div>
      </div>
      <section aria-label="Notifications alt+T" tabIndex={-1} aria-live="polite" aria-relevant="additions text" aria-atomic="false" />
    </>
  );
}

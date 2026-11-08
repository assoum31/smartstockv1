import { createFileRoute } from "@tanstack/react-router";
import { StoreLogin } from "@/components/store-login";

const TITLE = "دخول العمال | Stocki Pro";
const DESCRIPTION = "صفحة دخول عمال الجرد: مسح الباركود وتسجيل الكميات من الهاتف.";

export const Route = createFileRoute("/worker")({
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
  component: WorkerLogin,
});

function WorkerLogin() {
  return <StoreLogin portal="worker" />;
}

import { createFileRoute } from "@tanstack/react-router";
import { StoreLogin } from "@/components/store-login";

const TITLE = "دخول المسيرين | Stocki Pro";
const DESCRIPTION = "صفحة دخول مسيري وأصحاب المتاجر: جلسات الجرد، متابعة العمال والفوارق.";

export const Route = createFileRoute("/manager")({
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
  component: ManagerLogin,
});

function ManagerLogin() {
  return <StoreLogin portal="manager" />;
}

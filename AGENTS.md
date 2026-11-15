<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

## Project rules

- Official document references use additive annual per-tenant/type counters assigned atomically by database triggers; keep legacy ticket numbers for old links, and use src/lib/document-number.ts for display so offline caches never fabricate official numbers.

- Offline installability uses vite-plugin-pwa generateSW and one guarded registration module; only published top-level apps register, and HTML is NetworkFirst to avoid stale previews.
- Device sales and counts persist in IndexedDB before success is shown; sales synchronize via sync_offline_sale with a unique client ID and original time/cash session so retries cannot double-charge stock or cash. Cached identity enables local screens only; the server revalidates permissions on sync.

- Auditor search and numeric ID normalization live in `src/lib/audit-rules.ts`; save audits only through the existing database function so permissions and logging remain enforced.

- Accounts are real auth users with a synthetic per-store email (`username@storecode...`); only server functions in `src/lib/accounts.functions.ts` create them or check activation PINs (hashed, table has no client policies), so no browser can create accounts or read PINs. The legacy `app_users` table is retired.
- Every store-owned row carries `tenant_id` and RLS limits reads/writes to the caller's store; inventory sessions open/close only through database functions that snapshot stock, so variances compare against stock at session start.
- There is exactly one master; it signs in only on the unlinked /master page (store login refuses the master code). Its first sign-in with the default credentials goes through `claimMaster`, which forces a new password, so the default never becomes a real password.
- Login/master submit buttons stay disabled until the page is interactive, so a click never triggers a plain page reload.
- The camera barcode library (html5-qrcode) is imported statically in `src/components/barcode-scanner.tsx`; the `Html5Qrcode` instance is only created inside the camera-start callback, so browser APIs are not touched during server rendering.
- Sellers (manager or cashier) may add and edit products; only managers delete. Store roles are manager, cashier, worker, pricer, observer (read-only inventory), auditor (audits counted lines via `audit_inventory_log`), sales_manager (seller + `Me.canSeeStats` for revenue/profit) stored in user_roles; `Me.canSell`/`canSeeProducts`/`canWatchInventory`/`canAudit` drive route guards and nav, and sales/goods receipts go only through DB functions that also move product stock, so client code never edits quantities directly.
- Every sensitive action is written to `activity_log` by database triggers (never by client code), so the log can't be skipped or edited; ticket-linked returns go through `create_ticket_return`, which caps quantities at sold minus already returned.
- Screen text is written in Arabic in the code; French/English come from `src/lib/translations.ts` applied to the page by `src/lib/dom-translate.ts` after hydration, so new Arabic UI text needs a matching entry there. Pages must not hard-code `dir`; the root sets it from the language. Print windows stay Arabic RTL.
- Day/night mode toggles the `.dark` class on <html> (`src/lib/theme.ts`); colors come only from the tokens in styles.css, so components need no dark-specific classes.

- The public store `/store/$code` reads only through `public_store_catalog_v2` and orders only through `place_online_order` (security definer, granted to anon), so visitors never touch tables or see purchase prices; it lists every manager-visible product regardless of stock.
- Store subscription (plan, end date, feature switches, staff limits) lives on `tenants` and is edited only by the master via `updateStoreConfig`; `Me.features`/`Me.expired`/`Me.canStock` (storekeeper = receipts, suppliers, returns, G50) gate nav and routes, and staff limits are enforced server-side in `createMember`/`updateMember`. Rules are in `src/lib/subscription.ts`.
- Subscription expiry, store suspension, disabled features and the storekeeper no-sell rule are enforced by BEFORE INSERT triggers (`enforce_tenant_feature`) on sales, cash, inventory, receipt/return and online-order tables, so hiding nav is not the only barrier.
- The Windows .exe is a Tauri v2 shell (`src-tauri/`) that opens the published site, built by the manual GitHub workflow; offline comes from the same PWA cache, so desktop needs no separate code path.

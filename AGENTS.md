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

- Accounts are real auth users with a synthetic per-store email (`username@storecode...`); only server functions in `src/lib/accounts.functions.ts` create them or check activation PINs (hashed, table has no client policies), so no browser can create accounts or read PINs. The legacy `app_users` table is retired.
- Every store-owned row carries `tenant_id` and RLS limits reads/writes to the caller's store; inventory sessions open/close only through database functions that snapshot stock, so variances compare against stock at session start.
- There is exactly one master; it signs in only on the unlinked /master page (store login refuses the master code). Its first sign-in with the default credentials goes through `claimMaster`, which forces a new password, so the default never becomes a real password.
- Login/master submit buttons stay disabled until the page is interactive, so a click never triggers a plain page reload.
- The camera barcode library is loaded with a dynamic import inside an effect, because it touches browser APIs and would break server rendering.
- Store roles are manager, cashier, worker, pricer (stored in user_roles); `Me.canSell`/`canSeeProducts` drive route guards and nav, and sales/goods receipts go only through DB functions that also move product stock, so client code never edits quantities directly.

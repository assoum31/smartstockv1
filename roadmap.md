# Stocki Pro roadmap

- [ ] Auditor: shelf/name/all-barcode/ID search, automatic or manual IDs, camera, unaudited filter, Enter save and clear search after saving

- [ ] Get the original spec (cahier des charges + topo) from the user — waiting on the user
- [x] Step 1: secure accounts (real sign-in, synthetic email per store), stores, roles, store isolation rules + tests across 2 stores
- [x] Step 2: /login + first sign-in with one-time PIN + route protection
- [x] Step 3: /scan with inventory sessions, duplicate detection per session, offline queue + sync
- [x] Step 4: /dashboard with live updates, écart per product (stock snapshot), Excel import/export (barcodes as text)
- [x] Step 5: /admin (master) for stores and managers, installable phone app (home-screen icon)
- [ ] Import existing data from the old backend (CSV exports) — waiting on the user
- [x] Camera on/off + manual entry, count notes, manager-only product delete in a session
- [x] Purchase/selling prices in products + Excel; detailed sales Excel import (rows grouped by ticket number)
- [x] Sales deducted only from counted products, and only when sold after the count
- [x] Scan: only barcode required; notes go to manager alerts tab
- [x] Flash (torch) button next to camera on/off
- [x] Rename app to SMART STOCK + new home headline/subtitle
- [x] Scan: show + edit purchase/selling price when product is known; prices editable inline on products page
- [x] Notification bell in header + /notifications page for managers
- [x] Scan page: search products by name or barcode
- [x] Return a sale ticket from the sales log (limited to sold qty), barcode + QR on printed slips, ticket lookup/scan on returns page
- [x] Mobile bottom bar redesign + activity log page (own for staff, whole store for managers, filters, Excel)

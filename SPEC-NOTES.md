# Implementation Notes

Quick map from your spec to what's actually in the code, plus the few
judgment calls made along the way.

## Navigation
Bottom nav has exactly your 4 screens (Quick Entry, Profile, Finance, Logs).
Settings (vehicle management, custom buttons, currency, backups) lives
behind the ⚙️ icon in the top bar next to the vehicle switcher — it's app
configuration, not one of your 4 core screens, so it stays out of the way.

## Where each Quick Entry type ends up
- **Fuel** and **Expense / Toll / Fine** → both land in the **Expenses**
  tab on Screen 4 (fuel is a running/operational cost, same as tolls).
- **Maintenance** → **Maintenance** tab on Screen 4, with a Workshop field.
- **Damage / Scratch** → does **not** appear on Screen 4 at all. It goes to
  the **Damage Log Table** on Screen 2 (Vehicle Profile), linked to a body
  zone, with a Fixed/Pending status you can toggle.
- **Custom buttons** you add in Settings ask you which of the three logs
  above they should feed into, and reuse that log's category list.

## "Category dynamically filters"
Each action type has its own preset category dropdown (Fuel: Petrol/
Diesel/CNG/etc., Expense: Parking/Toll/Fine/etc., Maintenance: Oil Change/
Brake Servicing/etc.) with an "Other" option that reveals a free-text field.

## Total lifelong expenditure & cost/km
`Total = Acquisition (ex-showroom + taxes + registration) + EMI paid so far
+ all Expense/Maintenance/Damage log amounts.` Down-payment contributions
aren't added on top of that — they just record *who* funded the
acquisition, for the settlement ledger.
`Cost per KM = Total ÷ (highest odometer reading − lowest odometer
reading)` across all logged entries.

## Partner Settlement Ledger
Combines every entry with a "Paid By" — quick-entry logs, down-payment
contributions, and EMI payments. "You" paid → partner owes half; "Partner"
paid → you owe half; "Split" → already even, no effect.

## Pinch & zoom
Implemented from scratch in `zoom.js` (touch pinch/pan, double-tap,
desktop wheel/drag) — no external library, so it works fully offline.

## Everything from the previous version that's kept
Local JSON export/import, Firebase Realtime Database cloud backup
(`firebase-sync.js` + `README-FIREBASE.md`), the generated app icon/logo,
and the offline PWA service worker.

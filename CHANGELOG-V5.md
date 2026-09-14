# v5 Changelog

1. **Share Vehicle Details** — Profile screen > "📤 Share Vehicle Details".
   Pick which sections to include (Key Specs, Engine Oil, Coolant/Brake,
   Tyre, Filters, Service Station — Select All or pick individually), then
   it shares as a text note via your device's share sheet, or copies to
   clipboard if sharing isn't available. Handy for texting a mechanic
   "which oil/tyre pressure does this car use".

2. **Expandable note on log entries** — Quick Entry has a "+ Add Note"
   toggle that reveals a free-text field. If filled in, it shows as a
   collapsible "Note" on that entry's card in the Logs/Damage lists.

3. **Personal vs. Shared expenses** — Quick Entry now has a Shared/Personal
   toggle above Paid By.
   - **Shared** (purchase costs, most maintenance): works as before — You /
     Partner / custom split, and it counts toward the settlement ledger.
   - **Personal** (a solo trip, your own fine): just records who bore the
     cost, with no debt created. It shows separately on the Dashboard under
     "Personal Spending" and never touches the settlement balance.

4. **Documents** — New card on the Profile screen for RC, Insurance,
   Pollution Certificate (PUC), Driving License, or a custom type. Each has
   a number, expiry date, and an optional photo/scan, with a
   Valid/Expiring/Expired badge computed from the expiry date.

5. **Reminders & notifications** — New card on the Profile screen for
   reminders (Oil Change, Insurance Renewal, custom — e.g. "Plan water
   service on the 10th"). Adding an expiry date to a Document automatically
   keeps a matching reminder in sync. On each app open, due/overdue
   reminders show as a toast and, if you've enabled notifications in
   Settings, a browser notification too.
   **Honesty note:** MANSKIT is a fully offline static app with no server —
   it cannot push notifications while closed. Reminders are checked
   whenever you open the app, not on a schedule in the background.

6. **Gallery zoom fixes** —
   - The photo-zone modal (Replace/Remove/Set as Cover) now has an explicit
     **Cancel** button.
   - Pinch-zoom/pan/wheel gestures are now bound to the photo itself, not
     the surrounding dark frame — tapping or dragging the frame does
     nothing (tapping it closes the viewer, like the ✕ button). Also fixed
     a bug where reopening the viewer repeatedly stacked duplicate gesture
     handlers, making zoom behave erratically after a few uses.

7. **Settle Up** — Dashboard's Shared Settlement Ledger has a "✓ Settle Up
   (Reset to Zero)" button. It records an offsetting entry that brings the
   running balance back to ₹0 — past entries aren't changed, so the history
   stays accurate. Settlement history is listed underneath with an Undo
   option per record in case of a mistake.

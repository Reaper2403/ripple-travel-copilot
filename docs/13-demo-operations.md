# Demo operations

## Operating modes

- `PROVIDER_MODE=fake`: deterministic rehearsal with no external writes.
- `PROVIDER_MODE=real`: labeled Gmail input, real Calendar analysis, and approved writes to Notion, Calendar, and allowlisted Gmail recipients.

Restart the server after changing modes.

## Executive-week fixtures

```bash
npm run seed:demo
```

This ensures 19 clearly prefixed Calendar events and one synthetic Gmail disruption source. It is idempotent and suppresses Calendar invitation notifications.

The seeded week is intentionally balanced across Monday-Friday (4/4/4/4/3 events). Berlin-based internal work sits mainly in the morning and early afternoon, while investor, customer, and US-facing reviews use late-afternoon Berlin slots that overlap Pacific working hours. The gaps are deliberate: preserve them for preparation, overruns, and last-minute changes instead of packing the calendar edge-to-edge.

```bash
npm run fixtures:watch
```

This checks Calendar and Gmail every 60 seconds and repairs missing test fixtures. Stop it with `Ctrl+C` when continuous simulation is unnecessary.

```bash
npm run reset:demo
```

This removes only Calendar events carrying `ripple_fixture=true` or `ripple_case_id=demo`. It never deletes unmarked events and does not modify Gmail or Notion.

## Automatic Gmail labeling for the hackathon

Use a native Gmail filter so Ripple keeps least-privilege read/send OAuth:

1. Open Gmail on a computer.
2. In the search box, open **Show search options**.
3. Put `[RIPPLE TEST] Flight NS 442 cancelled` in **Subject**.
4. Select **Create filter**.
5. Select **Apply the label** and choose `RIPPLE/READY`.
6. Optionally select **Also apply filter to matching conversations**.
7. Create the filter.

For broader synthetic testing, use a stable sender plus the `[RIPPLE TEST]` subject prefix. Do not build a broad production filter around the word “cancelled”; it will create noisy and unsafe triggers.

Official Gmail filter instructions: <https://support.google.com/mail/answer/6579>

## Production ingestion design

Labels should not be the core trigger in a real deployment. Use:

1. Gmail `users.watch` with Cloud Pub/Sub for mailbox-change notification.
2. Persist the returned `historyId` per connected mailbox.
3. Resolve changes with `history.list`; fall back to a bounded full sync after an expired history cursor.
4. Classify candidate travel messages without taking action.
5. Store Ripple’s own processed/unprocessed state so mailbox labels remain optional presentation metadata.
6. Renew Gmail watches daily; Google requires renewal at least every seven days.
7. Use periodic reconciliation because push notifications can be delayed or dropped.

Official Gmail push guide: <https://developers.google.com/workspace/gmail/api/guides/push>

If Ripple itself must add `RIPPLE/READY`, request `https://www.googleapis.com/auth/gmail.modify` during a new consent flow and call `users.messages.modify` with the label ID. That is a materially broader restricted mailbox permission, so it should remain optional and explained clearly to users. For the hackathon, the Gmail filter is lower risk and requires no OAuth changes.

Official message-label modification reference: <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify>

## Two-minute reset

1. Run `npm run preflight`; require all `PASS`.
2. Run `npm run seed:demo`; expect zero or only intentional repairs.
3. Ensure `PROVIDER_MODE=real` and restart the server.
4. `POST /api/cases/demo` once to stage `READY_FOR_REVIEW`.
5. Confirm the exact recipients and three actions in the UI.
6. Approve once.
7. Show the Notion page, Calendar hold, Gmail receipt, and zero-action replay.

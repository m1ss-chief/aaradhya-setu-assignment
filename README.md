# Aaradhya Setu · Software Engineering Intern Assignment

**Mili Parashar** · IIT Madras (BS Data Science) · parasharmili19@gmail.com

My main submission is **Option 2, the puja booking admin dashboard** (Next.js + Node API routes + MongoDB). It runs with sign-in, full booking CRUD, **puja slots with clash prevention**, cancellation, server-side pagination and an editable message workflow. I also connected it to **Option 3** (workflow + WhatsApp notifications) and **Option 1** (Shopify puja product page), because the three are parts of one journey:

```
 Devotee                    Aaradhya Setu team                           Devotee's WhatsApp
 ───────                    ──────────────────                           ──────────────────
 Option 1                   Option 2                                     Option 3
 Shopify puja page  ──────► Admin dashboard (Next.js + MongoDB)  ──────► Workflow + notifications
 package, devotee   order   sign-in · search · filter · CRUD            Confirmed → Puja Started →
 details, add-ons  webhook  slots · cancel · paging · CSV · settings     Completed → Video Available
                                                                         (or Cancelled), with retries
```

![Overview](docs/screenshots/overview.png)

---

## Run it locally

You need **Node.js 20.6+** and **MongoDB** (local Docker, or a free MongoDB Atlas cluster).

```bash
# 1. MongoDB (skip if you use Atlas)
docker compose up -d

# 2. The app
cd web
npm install
cp .env.example .env.local      # set MONGODB_URI if you use Atlas, and a long random AUTH_SECRET
npm run seed                    # demo slots, bookings, WhatsApp history and the admin login
npm run dev                     # http://localhost:3000

# Tests (no database needed)
npm test
```

**Demo login** (created by `npm run seed`): admin ID **`admin`**, password **`Setu@2026`**. Add more admins with `npm run create-admin -- <admin-id> <password> "<Full name>"`.

The demo data has:
- bookings at every stage, and **one cancelled booking**;
- slots at 07:00 and 10:00 at every temple (Mahakaleshwar's 10:00 slot has one pandit, so booked days show **Full**);
- **one closed day** at Kashi Vishwanath, and a Shopify order for that day which **needs a slot**: assign one, then confirm;
- **one devotee with a mistyped WhatsApp number**. Their message failed, so you can try the fix: **Edit** the number, then press **Resend**.

---

## Option 2 · Puja booking dashboard

### Sign-in

![Sign in](docs/screenshots/login.png)

- **Designed after the aaradhyasetu.com sign-in screen** (maroon brand panel and cream form). Admins use an **admin ID and password** instead of the devotee WhatsApp OTP.
- **Passwords** are stored only as salted **scrypt** hashes, using Node's built-in `crypto` (no extra dependency).
- **Signed session cookie** (HMAC-SHA256, `httpOnly`, `sameSite=lax`, 8 hours). `middleware.js` checks it on **every page and API route**. Signed-out visitors go to `/login?next=…` and come back to the page they wanted.
- **Hardening:**
  - 5 failed attempts per ID + IP lock that ID for 15 minutes.
  - A wrong ID takes as long to check as a wrong password, so admin IDs can't be guessed from timing.
  - Changes sent from another website are refused (`403`).
  - `next=` only accepts paths inside the app.

### Bookings: search, filter, sort, paging, CRUD

![Bookings](docs/screenshots/dashboard.png)

- **Searchable table:** booking ID, devotee, puja (with temple), date, amount and status. Search covers ID, devotee, puja, temple and phone, and waits 250 ms after typing stops before querying.
- **Filters and sorting:** by status (dropdown or the clickable count cards, Cancelled included) and by puja. Sort by date, amount or devotee.
- **Server-side pagination:** MongoDB returns one page (`skip`/`limit`) plus a total count. The booking ID breaks ties in the sort, so paging never repeats or skips a row. The overview figures come from count and aggregation queries, not from loading every booking.
- **CSV export** of *every* matching booking, built on the server. Values that look like spreadsheet formulas are escaped so they can't run in Excel.
- **Create / Read / Update / Delete:**
  - **Create:** a form for phone or walk-in bookings. Shopify orders arrive automatically.
  - **Read:** a details page with devotee and puja info, add-ons, Shopify order, workflow stepper, status history and messages.
  - **Update:** only the fields that changed are sent. Status is deliberately **not** editable here; it only moves through the workflow, so the devotee is always notified.
  - **Delete:** after a confirmation dialog. It also removes the booking's message history, and the dialog suggests cancelling instead.
- **Overview:** key figures, bookings by stage, booking value by puja (click a bar to open the filtered list), this week's pujas, the latest messages and an alert when messages failed.

### Puja slots: no clashes, no overbooking

![Slots](docs/screenshots/slots.png)

Devotees book, but a temple can only perform as many pujas at once as it has pandits. So admins publish **slots**, and every booking holds one seat in one.

- **A slot** is a temple, a start time (India time), a duration and the **number of pandits available**. The **Slots** page shows a week per temple with a seat bar for each slot, and admins can add or remove a pandit, close or reopen a slot, or delete an empty one.
- **Create many at once:** a date range, weekdays and start times (e.g. every day at 07:00 and 10:00 for two weeks). The button shows how many slots it will create.
- **Clash rules:**
  - **No overbooking, even at the same instant.** A seat is taken by one conditional database update (`booked < capacity`). In the end-to-end test, 4 bookings sent at the same moment to a 2-pandit slot: 2 succeeded, 2 were told it was full.
  - **Slots at the same temple can't overlap**, or the same pandits would be counted twice. Overlapping times are skipped and listed with the slot they clash with.
  - **Capacity can't go below the bookings already made**, and **only empty slots can be deleted**. To stop new bookings, close the slot.
  - **Closed, full or already-started slots can't be booked.** The picker shows them greyed out with the reason.
- **Booking form:** pick a day (each day shows how many pandits are free), then a time. The puja date *is* the slot's time.
- **Reschedule:** from the booking page, the calendar icon on each table row, or Edit.
  - The dialog opens on the booking's current slot (marked *Current*). You pick a new day and time and can add a reason.
  - It shows the move (e.g. *4 Dec, 10:00 am → 26 Nov, 7:00 am*) and the exact WhatsApp message the devotee will get.
  - The new seat is taken **before** the old one is freed, so a failed move changes nothing.
  - A **confirmed** devotee gets a **"Rescheduled" WhatsApp** (on by default, can be turned off). A pending one hasn't been told a time yet, so their confirmation carries the new one.
  - Every move is kept in the booking's **reschedule history** (from → to, when, by whom, why).
  - Only Pending and Confirmed bookings can move. The temple is fixed by the slot.
  - The same dialog gives a "needs a slot" booking its first slot.
  - The message wording is editable in Settings like the others.

![Reschedule](docs/screenshots/reschedule.png)
- **Seats come back:** cancelling or deleting a booking frees its seat for another devotee.
- **Workflow rules:**
  - a booking **can't be confirmed without a slot**, because the confirmation tells the devotee the date and time;
  - a puja **can't be marked as started before its day**.
- **Shopify orders are paid, so they are never rejected.** The order takes the first free slot on the chosen day (or the exact `Slot ID` if the product page sends one). If the day is full or closed, the booking is flagged **Needs a slot** on the overview and the bookings list, and the admin places it.

![Needs a slot](docs/screenshots/needs-slot.png)

### Cancel instead of delete

![Cancel booking](docs/screenshots/cancel.png)

Temples cancel far more often than they delete, so **Cancelled** is a final status that keeps the booking and its history:

- Possible while the booking is Pending, Confirmed or In Progress, but not after the puja is completed.
- A **reason is required**. Sending the devotee a WhatsApp message is optional, and the dialog previews it.
- Cancelled bookings are counted but **excluded from booking value**. They are shown crossed out in the table, with a banner on the booking page.

### Confirmation before anything irreversible

![Confirm status change](docs/screenshots/confirm-status.png)

Moving a booking forward, cancelling it and deleting it all ask first. The status dialog shows the change (e.g. Pending → Confirmed), **the exact message the devotee will get**, and that it can't be rolled back.

### Settings

![Settings](docs/screenshots/settings.png)

- See your account and **change your password**, which needs the current one.
- **Edit the WhatsApp message wording without a code change**, with placeholder buttons and a live preview. The text is checked before saving:
  - unknown placeholders (e.g. `{{name}}`) and unclosed `{{` are refused;
  - `{{devoteeName}}`, `{{pujaName}}` and `{{bookingId}}` are required, plus `{{videoUrl}}` for the video message.
  - **Reset to default** is one click away, and the page shows who last edited each message.

## Option 3 · Booking workflow & notifications

![Failed message and resend](docs/screenshots/failed-message.png)

- **One status list covers both options:** `Pending → Confirmed → In Progress → Completed → Video Available`, shown in the dashboard as "Booking Received → Booking Confirmed → Puja Started → Puja Completed → Video Available". `Cancelled` is a side exit.
- **Automatic notifications:** every step renders its template (devotee name, puja, temple, date, booking ID, video link or cancel reason), "sends" it through the mock WhatsApp provider and saves it with its delivery result.
- **Failed messages and Resend:** like a real provider, the mock rejects malformed numbers (e.g. `+91` with 9 digits). `MOCK_WHATSAPP_FAILURE_RATE` can also make a share of sends fail at random. Failed messages are flagged on the booking, the Notifications page ("Failed only") and the overview. **Resend** sends to the booking's *current* number and counts attempts. Two people pressing Resend at once send it only once.
- **Notification history:** per booking (chat-style) and for all bookings on the Notifications page.

![Workflow complete](docs/screenshots/details-complete.png)

## Option 1 · Shopify custom puja product page

`shopify-theme/sections/aaradhya-puja-product.liquid` (+ CSS, JS, product template)

![Shopify product page](docs/screenshots/shop-desktop.png)

- **Visually aligned with aaradhyasetu.com:** colours taken from the live site (maroon `#3A1E22`, terracotta `#C5532F`, saffron `#E08A2B`, cream), Bricolage Grotesque headings, pill buttons.
- Main image and thumbnail gallery, description, price with compare-at price, and benefits from section blocks (or a `custom.benefits` metafield).
- **Package picker** (variants as pills), with live price, availability and variant id.
- **Devotee details for the sankalp** (name, WhatsApp number, gotra, puja date) sent as **line item properties**, so the booking system receives them with the order.
- **Optional offering add-ons**, a quantity selector and a live total. With JavaScript, the puja and its add-ons go to the cart in **one** `/cart/add.js` request; without JavaScript it still works as a normal Shopify form.
- **Mobile:** single column, large touch targets, and a sticky Add to Cart bar.

**Preview without a store:** `npx serve shopify-theme -l 5000`, then open http://localhost:5000/preview/.
**In a real store:** copy the section, assets and `templates/product.puja.json` into an Online Store 2.0 theme, create a puja product (vendor = temple, variants = packages) and assign the `product.puja` template. Optionally point an `orders/create` webhook to `/api/webhooks/shopify/orders-create`, with its secret in `SHOPIFY_WEBHOOK_SECRET`.

---

## Design decisions

- **Business rules live in one place, independent of the database.** The services (`bookings-service.js`, `auth-service.js`) take a `repo` argument: the app passes the MongoDB repo, the tests pass an in-memory one. So every rule is unit-tested without a database: workflow, cancel, resend, paging, templates, passwords.
- **Bookings only move one step forward.** Skipping a step would skip a devotee message, and going backwards would send confusing ones. Cancellation is a separate action that needs a reason.
- **No double messages when two admins click at once.** Status changes and resends are conditional updates (`findOneAndUpdate({ bookingId, status: from })`), so the second request gets `409 Conflict` and nothing is sent twice.
- **A message is never sent with an empty placeholder.** Rendering throws if a value is missing, and edited templates are validated before saving.
- **The account is checked on every request.** The server loads the signed-in admin from the database each time, so a deleted account is refused immediately, not when its 8-hour session runs out.
- **Sequential, readable booking IDs** (`AS-2026-0001`) come from an atomic counter, so two bookings created at once never share an ID.
- **Mock WhatsApp is swappable.** `lib/notifier.js` returns `{ status: 'sent' | 'failed', error }`. Replacing its body with the WhatsApp Business Cloud API (or Twilio/Gupshup) is the only change needed to go live.

## API

All routes need a signed-in admin except the two marked *public*.

| Method | Route | Purpose | Access |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }`, sets the session cookie | *public* |
| POST | `/api/auth/logout` | Clears the session | |
| GET | `/api/auth/me` | The signed-in admin | |
| POST | `/api/auth/password` | `{ currentPassword, newPassword }` | |
| GET | `/api/bookings?q=&status=&puja=&from=&to=&sort=&order=&page=&pageSize=` | One page + `total`, `pages` | |
| GET | `/api/bookings/export?…same filters` | CSV of all matches | |
| POST | `/api/bookings` | Create, with a `slotId` (takes a seat) | |
| GET | `/api/bookings/:id` | Booking + its messages | |
| PUT | `/api/bookings/:id` | Edit details (not status or slot) | |
| POST | `/api/bookings/:id/reschedule` | `{ slotId, reason?, notifyDevotee? }`: move to another slot, recorded in `scheduleHistory` | |
| DELETE | `/api/bookings/:id` | Delete booking + messages | |
| PATCH | `/api/bookings/:id/status` | `{ status, videoUrl?, note? }`, one step forward + message | |
| POST | `/api/bookings/:id/cancel` | `{ reason, notifyDevotee }` | |
| GET | `/api/notifications?bookingId=&status=&delivery=failed` | Message history | |
| POST | `/api/notifications/:id/resend` | Retry a failed message | |
| GET | `/api/stats` | Counts, booking value, by puja, upcoming, failed messages, needs-a-slot count, seats in the next 7 days | |
| GET | `/api/slots?temple=&from=&to=&available=1` | Slots with `booked`, `remaining` and state (open / full / closed / past) | |
| POST | `/api/slots` | `{ templeName, from, to, weekdays, times, durationMinutes, capacity }`, returns `{ created, skipped }` | |
| GET | `/api/slots/:id` | A slot and the bookings in it | |
| PATCH | `/api/slots/:id` | `{ capacity?, status?: open/closed, note? }` | |
| DELETE | `/api/slots/:id` | Delete an empty slot | |
| GET | `/api/templates` | Current wording, defaults and placeholder rules | |
| PUT / DELETE | `/api/templates/:status` | Save / reset a message | |
| POST | `/api/webhooks/shopify/orders-create` | Shopify order → booking(s), HMAC-verified | *public* |

Errors come back as `{ "error": "..." }` with the right status code: 400 validation, 401 signed out, 403 cross-site request, 404 not found, 409 conflict or invalid transition, 429 too many sign-in attempts.

## Project structure

```
web/
  middleware.js             Sign-in check on every page + API route
  app/
    login/                  Sign-in page
    (admin)/layout.js       Sidebar shell; loads the signed-in admin
    (admin)/page.js         Overview
    (admin)/bookings/       Table, new, [id] details + workflow + cancel, [id]/edit
    (admin)/slots/          Week view per temple, create slots, pandits, close/delete
    (admin)/notifications/  All messages, failed filter, resend
    (admin)/settings/       Password + message templates
    api/...                 Route handlers (thin: check sign-in → call service)
  components/               Admin shell, booking form, slot picker, message bubble, dialogs, icons
  lib/
    workflow.js             Statuses, transitions, default templates and placeholder rules
    bookings-service.js     Booking rules: CRUD, paging, workflow, cancel, resend, templates, stats
    slots-service.js        Slots, clash rules, taking and freeing seats
    auth-service.js         Login and passwords
    current-admin.js        Loads the signed-in admin from the database
    session.js              Signed session cookie (Web Crypto, works in middleware)
    passwords.js            scrypt hashing
    notifier.js             Mock WhatsApp sender (can fail)
    repo/mongo-repo.js      MongoDB data layer
    repo/memory-repo.js     In-memory data layer for tests
    models/index.js         Booking, Slot, Notification, Counter, Admin, Template
    seed-data.js, seed.js   Demo data, generated through the real workflow
  scripts/                  seed.mjs, create-admin.mjs
  tests/                    bookings, auth, features and slots tests (node --test)
shopify-theme/              Option 1: section, assets, template, static preview
```

## Testing

- **`npm test`:** 36 unit tests, no database needed:
  - workflow rules, templates and validation;
  - search, filters and sorting; server-side paging (stable order, caps, last page); CSV escaping;
  - the full status journey with notifications, and concurrent clicks;
  - cancel (reason, optional message, excluded from booking value);
  - failed messages and resend (including two people resending at once);
  - password change, session signing/expiry/tampering;
  - editable templates; the Shopify order mapping;
  - slots: planning in India time, overlap rules, no overbooking under simultaneous bookings, seats freed on cancel/delete, rescheduling (new seat first, recorded with a reason, devotee told only if confirmed, first slot for a waiting booking), capacity and delete guards, confirm-needs-a-slot, no early start, Shopify orders placed or flagged.
- **End to end in a real browser (Playwright + Edge):**
  - sign in, wrong password, redirect back after sign-in;
  - edit, cancel, delete and status confirmation;
  - the failed-message → edit number → resend flow;
  - slots: creating with clashes skipped, 4 simultaneous bookings for 2 seats (2 succeed), full and closed times greyed out, assigning a slot to a Shopify order, rescheduling from the table, booking page, banner and Edit (history, message, old seat freed, completed bookings refused), no early start;
  - paging across pages, CSV export, template validation and use, password change;
  - no horizontal scrolling at phone width.

## What I'd do next

- Real WhatsApp Business API with approved templates, and automatic retries with back-off.
- Shared rate limiting (Redis) when running on several servers, and an audit log page.
- Upload the puja video directly (S3) instead of pasting a link.
- Refunds linked to cancellations.
- Named pandits (who is free, who does which puja) instead of a pandit count, and a public availability endpoint so the Shopify product page only offers free slots.

*AI tools were used while building this, as the brief allows. I can walk through and explain every part of the code.*

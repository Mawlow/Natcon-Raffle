# Natcon Raffle — Dynamic Raffle Management System

A production-oriented raffle platform for live corporate events. Administrators
import participants, configure prizes and winner counts, and run a cinematic
full-screen draw on a projector or TV.

**The public draw screen shows ticket numbers and nothing else.** Names, email
addresses and phone numbers live in the database and the admin dashboard, and
are never included in the payload that drives the display.

---

## Stack

| Layer     | Technology |
|-----------|-----------|
| Backend   | Laravel 12, PHP 8.3+ |
| Database  | MySQL 8 |
| Frontend  | React 19, React Router 7, Vite 7 |
| Styling   | Tailwind CSS 4 (black + gold theme) |
| Motion    | Framer Motion |
| Icons     | Lucide React |
| Charts    | Recharts |

A single Laravel project serves both the API and the SPA, so deployment is one
app and one document root (`public/`).

---

## Getting started

```bash
composer install
npm install

cp .env.example .env          # if you do not already have a .env
php artisan key:generate

# Point .env at your MySQL server, then:
mysql -u root -p -e "CREATE DATABASE natcon_raffle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

php artisan migrate --seed
npm run build                 # or: npm run dev
php artisan serve
```

There is **no sign-in screen** — open the app and you are the administrator.
`AutoLoginAdmin` (`app/Http/Middleware/AutoLoginAdmin.php`) adopts the first
active admin account for every API request, so anyone who can reach this
server has full control. Run it on a trusted machine or network. The seeder
creates that account as `admin@raffle.test`; delete the middleware line in
`bootstrap/app.php` to put a login back in front.

The seeder creates four sample raffles, each with its own participant list
(100, 40, 60 and 0 entrants) plus one disqualified ticket apiece. Ticket
numbers restart at `000001` in every raffle. One raffle already has winners so
the history and audit views have data.

---

## The draw is decided on the server

This is the central rule of the system.

```
React                         Laravel
  │
  │  POST /api/raffles/{id}/draw
  │  (no candidate ticket in the body)
  ├─────────────────────────────────▶
  │                            RaffleDrawService::draw()
  │                              • lock the raffle row (transaction)
  │                              • re-read the winners already drawn
  │                              • build the eligible pool
  │                              • random_int() over that pool   ← CSPRNG
  │                              • persist Winner + DrawEvent
  │  { "ticket_number": "000827" }
  ◀─────────────────────────────────┤
  │
  │  animate towards 000827
```

The frontend receives a decided result and animates towards it. Anything a
client sends in the request body beyond an optional `request_id` is ignored —
there is a test that posts `{"ticket_number": "000001"}` and asserts the server
picks its own winner.

All selection logic lives in `app/Services/RaffleDrawService.php`; controllers
only translate HTTP to service calls.

### How duplicate winners are prevented

With `allow_repeat_winners = false` (the default), four things stack up:

1. The eligible-pool query excludes any ticket already recorded as a winner of
   that raffle (`whereNotExists` against `winners`).
2. The whole draw runs inside a transaction holding `lockForUpdate()` on the
   raffle row, so simultaneous draws serialise rather than race.
3. A `unique(raffle_id, position)` index makes a duplicate winner slot
   impossible at the database level even if application logic were bypassed.
4. The draw endpoint takes a cache lock per raffle and rejects an overlapping
   request with `409 DRAW_IN_PROGRESS`.

An optional `request_id` makes the endpoint idempotent: a retried request
returns the original winner instead of consuming another slot.

---

## Ticket numbers keep their leading zeros

Ticket numbers are `VARCHAR` everywhere — in the migration, the models, the CSV
importer, the API payloads and the React components. `000001` is never cast to
an integer, so it never becomes `1`. CSV export prefixes each ticket with a tab
so spreadsheet software does not silently reformat it either.

---

## Routes

### Public

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/raffle/{raffle}/display` | Full-screen draw presentation |
| `GET`  | `/api/raffles/{raffle}/display` | Display data — **ticket numbers only** |

### Authenticated (admin)

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/me` | The account the API is acting as |
| `GET`  | `/api/dashboard` | Dashboard statistics |
| `GET`/`POST` | `/api/raffles` | List / create raffles |
| `GET`/`PUT`/`DELETE` | `/api/raffles/{raffle}` | Show / update / delete |
| `POST` | `/api/raffles/{raffle}/draw` | **Draw a winner** |
| `POST` | `/api/raffles/{raffle}/transition` | ready / start / pause / complete / cancel |
| `POST` | `/api/raffles/{raffle}/duplicate`, `/archive`, `/restore` | Lifecycle actions |
| `GET`  | `/api/raffles/{raffle}/winners`, `/draw-events` | Per-raffle results and audit |
| `GET`/`POST` | `/api/raffles/{raffle}/participants` | That raffle's entrants — paginated, searchable, filterable |
| `GET`/`PUT`/`DELETE` | `/api/raffles/{raffle}/participants/{participant}` | Show / update / delete one entrant |
| `DELETE` | `/api/raffles/{raffle}/participants` | Clear the list (blocked once a winner is drawn) |
| `POST` | `/api/raffles/{raffle}/participants/import/preview` | Validate a CSV without writing |
| `POST` | `/api/raffles/{raffle}/participants/import` | Commit the import |
| `GET`  | `/api/raffles/{raffle}/participants/export` | CSV export |
| `GET`  | `/api/winners`, `/api/draw-events` | Global history and audit log |

---

## Running an event

1. **Create the raffle** — set the prize, the number of winners and the
   presentation options. Saving takes you straight to its Participants tab.
2. **Import its participants** — Raffle → Participants → Import CSV. Only
   `ticket_number` is required; `name`, `email`, `phone` and `category` are
   optional, and any other column is kept as participant metadata. The preview
   reports valid rows, invalid rows, duplicates inside the file, and tickets
   already in this raffle, and writes nothing until you confirm. Participants
   belong to the raffle they were imported into, so ticket numbers only have to
   be unique within one raffle and the same file can be used for several.
3. **Mark it READY** — refused while the raffle has no participants.
4. **Open the display** — the button on the raffle page opens
   `/raffle/{id}/display` in a new tab. Press the fullscreen control, then
   **START RAFFLE** (this gesture is what unlocks browser audio).
5. **Draw** — GET READY → 3 · 2 · 1 → DRAWING… → the ticket settles digit by
   digit onto the winner, with a gold reveal and confetti.
6. Repeat for each winner. The raffle completes itself when the last slot fills.

The draw can be driven from the display itself or from the raffle page in the
dashboard. A display opened on a machine that is not signed in shows a **LIVE
VIEW** badge and animates winners as they are drawn elsewhere.

---

## CSV format

```csv
ticket_number,name,email,category
000001,Juan Dela Cruz,juan@email.com,VISITOR
000002,Maria Santos,maria@email.com,VISITOR
000003,Pedro Cruz,pedro@email.com,VIP
```

A ticket number may contain letters, digits, spaces and `# . _ / -`, so
`000001`, `#01`, `A-1` and `VIP/002` all work; it must hold at least one
letter or digit, and quotes, commas and angle brackets are refused. Leading
zeros are preserved.

Only `ticket_number` is required, and it must be named recognisably
(`ticket_number`, `ticket`, `ticket no`, `number`). The optional columns are
matched loosely: `full name`, `mobile`, `e-mail` all work, and a descriptive
heading ending in the right word — `Attendee / Couple Name`, `Award /
Category` — is matched too. Anything else is kept as participant metadata.

The separator is detected from the header row, so comma, tab, semicolon and
pipe files all import, whatever the extension says — spreadsheet exports named
`.csv` are frequently tab separated. UTF-8 and UTF-16 (Excel's "Unicode Text")
are both handled, with or without a byte-order mark. Uploads are capped at
10 MB and must be `.csv`, `.tsv` or `.txt`. Re-uploading a byte-identical file
into the same raffle is detected and flagged in the preview.

---

## Security

- **No sign-in**: `AutoLoginAdmin` signs every request in as the administrator,
  so reaching the server is the same as being an admin. Everything below still
  applies, but network access is now the only real boundary.
- Every admin route still sits behind `auth:sanctum`, and the authorization
  policies (`RafflePolicy`, `ParticipantPolicy`) still run on every action — so
  restoring the login screen is a one-line change.
- CSRF protection on every state-changing API call, via the rotating
  `XSRF-TOKEN` cookie.
- Rate limiting: 30/min on draws per user *and* per raffle, 20–30/min on imports.
- Upload validation on size, extension and MIME type.
- Transactions plus row-level locking around every draw.
- Every draw attempt — successful or refused — is written to `draw_events` with
  a UUID, the acting user, the sequence, the eligible count, the request ID and
  the IP address. Failures are recorded *after* the rollback so the audit trail
  survives a rejected draw.
- Stack traces are suppressed in JSON responses when `APP_DEBUG=false`.

---

## Tests

```bash
php artisan test
```

93 tests covering CSV import and validation, duplicate ticket detection, raffle
creation and lifecycle, winner selection, multiple winners, repeat-winner
prevention, completed-raffle rejection, unauthorized access, concurrent-draw
protection, audit logging, leading-zero preservation, and — importantly — that
the public display payload contains no participant identity.

The suite runs against in-memory SQLite, so no MySQL is needed to run it.

---

## Project layout

```
app/
  Services/
    RaffleDrawService.php        ← winner selection (the important one)
    ParticipantImportService.php ← per-raffle CSV parsing, validation, commit
    RaffleStatsService.php       ← dashboard aggregates
  Http/Controllers/Api/          ← thin HTTP translation
  Policies/  Enums/  Models/

resources/js/
  pages/PublicDisplay.jsx        ← the projector screen
  components/display/            ← TicketRoller, Countdown, WinnerReveal, GoldParticles
  components/raffle/             ← RaffleCard, RaffleForm, DrawControls, WinnerHistory
  components/participants/       ← ParticipantTable, CsvUploader, CsvPreview
  components/layout/  components/ui/
```

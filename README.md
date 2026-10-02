# GCS CRM

Back-office CRM for Growth Capital Services. Deployed alongside the website on one
Contabo VPS, served by Nginx at `growthcapitalservices.in/crm`.

## Stack

| Layer | Choice |
| --- | --- |
| Backend | NestJS (TypeScript), port 4000 |
| Database | PostgreSQL |
| ORM | Prisma |
| Frontend | React (Vite SPA) |
| Auth | JWT bearer + role guards (ADMIN / MANAGER / ADVISOR) |
| Documents | Backblaze B2 (S3-compatible) — keys only in Postgres; MinIO stands in locally |

## Local setup

```bash
docker compose up -d                 # Postgres on 5433, MinIO on 9000/9001
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed.ts
npm run dev                          # http://localhost:4000/crm/api
```

Seed creates the 25 website loan products, 37 lenders, and an admin login
(`admin@growthcapitalservices.in` / `ChangeMe123!` — change before deploying).

## Website integration

The website's `submitLead()` in `src/lib/leads.ts` is the single integration point.
It posts to the one public endpoint:

```
POST /crm/api/public/leads
{ name, phone, email?, city?, source, productSlug?, amount?, detail? }
```

`productSlug` matches the website's own product slugs, so intake resolves the loan
product automatically. Everything else on the API requires a bearer token.

The website can also read organisation details and the lender list without auth:

```
GET /crm/api/public/settings  ->  { org.name, org.phone, org.email, org.cities, ... }
```


```
GET /crm/api/public/lenders   ->  [{ name, type, logoUrl }]
```

Only lenders flagged visible and active are served, so an internal-only lender
can be worked with without appearing on a public page.

The lead intake endpoint is protected by a Cloudflare Turnstile captcha and a 5-per-minute
per-IP rate limit. Set `TURNSTILE_SECRET` from the Turnstile dashboard and pass
the widget's token as `captchaToken`; the app refuses to boot in production
without it. Behind Nginx, set `TRUST_PROXY_HOPS=1` or rate limiting will see
every request as one client.

## Module status

| Module | Backend | Frontend |
| --- | --- | --- |
| Auth & roles | done | done (login, route guard, role-aware nav) — labels: Super Admin (ADMIN), Admin (MANAGER), Staff (ADVISOR); DB values unchanged |
| Dashboard | done (time range, conversion metrics, loan distribution) | done (range filter, CSV export, punch card) |
| Leads (+ follow-ups, public intake) | done (+ bulk CSV import, lost reasons) | done (list, filters by loan type / time, detail, status, follow-ups, import/export) |
| Applications | done | done (Application and Login Status tabs, filters, detail, applicants, references, lender) |
| Sanctions | done | done (register + per-application panel) |
| Disbursements | done | done (register + per-application panel) |
| Commissions | done | done (register + per-disbursement recording, splits, payout status, CSV export) |
| Documents | done (S3/B2 upload, presigned download) | done (panel on application) |
| Document Checklist | done (per product + applicant profile, Given/Pending gap view) | done (panel on application, admin editor in Settings) |
| Lender Directory | done (+ public feed) | done |
| Settings (+ loan products) | done | done |
| Team | done (employee code, DOB, joined date, reports-to hierarchy, commission %) | done (create/edit modal, roles, deactivate, reset password) |
| Sourcing Partners | done (partner code, reporting manager) | done (roster + referral stats) |
| Attendance & Payroll | done (+ self check-in/out, half-day cutoff) | done (punch card, today's headcount, month grid + payroll) |
| Reports | done (+ record-level report builder, CSV export) | done (Summary and Records views, column picker) |
| Client (Borrower) Portal | done | done (phone + access code login, status tracker) |
| Audit log | done | done (admin only) |

## Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173/crm/ — proxies /crm/api to port 4000
```

## Document storage

Files live in object storage, never on the VPS disk — Postgres holds only the
object key. Production uses Backblaze B2; local dev uses the MinIO container,
which speaks the same S3 API so the code path is identical.

First-time local setup creates the bucket:

```bash
docker run --rm --network host --entrypoint sh quay.io/minio/minio:latest -c \
  "mc alias set local http://localhost:9000 gcsminio gcsminio123 && \
   mc mb --ignore-existing local/gcs-crm-docs"
```

Uploads accept PDF and images up to 15MB. Object keys are random UUIDs, not
filenames, so two applicants uploading `pan.pdf` cannot collide and keys do not
leak applicant names. Downloads are 5-minute presigned URLs, so files stream
from storage rather than through the API.

## Document Checklist

Real lender checklists don't vary by loan product alone — they branch by the
applicant's profile (Salaried, Proprietorship, Partnership, Private Limited,
NRI, ...), with a shared KYC/photo core underneath. `ChecklistItem` models
this as master data: each row is optionally scoped to a `loanProductId` (null
= every product) and a `ChecklistApplicantType` (null = every profile).

An application's required list is resolved by `ChecklistService.resolveChecklistBucket`,
which reads the primary applicant's `isNRI` / `employmentType` / `constitution`
fields — NRI overrides everything else, then employment type, then business
constitution for the self-employed/business case — and pulls every
`ChecklistItem` matching that bucket or product. Each item is then checked
against the application's uploaded `Document`s by category (not by exact item
— a coarser match, since `Document` doesn't reference a specific checklist
row) to render as Given or Pending.

`GET /applications/:id/checklist` serves the per-application gap view; the
master `ChecklistItem` rows are admin-managed the same way as loan products,
under Settings → Document checklist.

## Settings

Every configurable value lives in one registry (`backend/src/settings/settings.registry.ts`).
Adding an entry there is the only step needed to make something editable — the
API, validation and the settings screen are all generated from it.

Settings are not decorative: each one replaces a value that was previously
hardcoded, and changes take effect without a restart.

| Setting | What it changes |
| --- | --- |
| `numbering.*` | Application reference format (prefix, digits, year) |
| `pipeline.sanctionSanityMultiple` | Threshold above which a sanction is refused as a typo |
| `pipeline.stalledAfterDays` | When Reports calls a case stalled |
| `pipeline.autoAssignToCreator` | Whether an advisor owns leads they create |
| `documents.categories` | The upload category list |
| `documents.maxUploadMb` | Upload size limit |
| `documents.downloadLinkMinutes` | Presigned link validity |
| `security.sessionHours` | JWT lifetime, applied at sign-in |
| `security.minPasswordLength` | Staff password policy |
| `org.*` | Organisation details, some served to the website |

## Partner Portal

A separate, real login for sourcing partners at `/crm/partner-login` — distinct
session (own localStorage key, own JWT `type: "partner"` claim, own Passport
strategy) so a partner token and a staff token are never interchangeable, and
a partner and a staff member can be signed in from the same browser at once
without either session evicting the other.

A partner sees only their own referrals, stats and commission structure —
never another partner's data, and never anything from the internal CRM.
Portal access is opt-in per partner: Super Admin sets a password for a partner
(`Set password` on the Sourcing Partners page); until then the phone number
simply can't sign in.

```
POST /crm/api/partner/auth/login   { phone, password } -> { accessToken, partner }
GET  /crm/api/partner/me
GET  /crm/api/partner/stats
GET  /crm/api/partner/leads
GET  /crm/api/partner/commission-structure
```

The commission-structure rate card (per loan-product commission range, avg
loan size, potential earning) is admin-managed master data — `CommissionRateCard`
— separate from a partner's own negotiated `commissionRate`. It's also public
at `/crm/api/public/commission-structure` for the website's partner-recruitment
page.

## Client (Borrower) Portal

A third, fully separate session at `/crm/track-login` for the loan applicant —
own token key, own JWT `type: "borrower"` claim, own Passport strategy. A
borrower signs in with the primary applicant's phone number plus an
8-character access code generated on the application (Application detail →
Borrower Portal Access, where staff can copy or regenerate it). They see only
their own file: stage tracker, bank login, sanction legs and disbursements —
never internal notes, commission data or other applicants.

```
POST /crm/api/borrower/auth/login   { phone, accessCode } -> { accessToken }
GET  /crm/api/borrower/me
POST /crm/api/applications/:id/portal-access-code   (staff — issues a fresh code)
```

## Bulk lead import and lead outcomes

`POST /crm/api/leads/bulk` takes up to 500 rows (`name`, `phone`, optional
`email`, `city`, `product`, `amount`, `notes`), validates each independently,
skips phones that already exist, and returns per-row outcomes. The Leads page
has an Import button with a CSV template. Marking a lead **Lost** requires a
reason (not interested, not eligible, non-contactable, wrong number, …), which
is kept on the lead and shown in the leads report.

## Report builder

`GET /crm/api/reports/records?type=leads|applications|sanctions|disbursements|commissions`
returns flat rows with `from`, `to`, `status`, `loanProductId` and `q` filters;
`/reports/records/export` downloads it as a print-ready Excel workbook
(`format=xlsx`, the default) or a CSV with the same letterhead (`format=csv`),
honouring the column picker. Both carry the company letterhead (from Settings →
Organisation), report title, generated date and user, filters applied, summary
totals, the table with real dates and ₹ formatting, and a totals row. The
Records view shows the same header on screen and has a Print / PDF button.
Staff (ADVISOR) only ever get their own records.

## Attendance

Anyone signed in can check themselves in and out (`/attendance/me/*`), in India
time. Checking in after the half-day cutoff (Settings → Attendance) is recorded
as a half day; Super Admin and Admin can still mark or correct any day from the
month grid. Self check-in can be switched off in Settings.

## Reminders and "my day"

`GET /crm/api/notifications` works out what needs attention right now — overdue and due-today follow-ups, files
gone quiet (`pipeline.stalledAfterDays`), sanctions about to expire (`pipeline.sanctionExpiryWarnDays`), submitted
files with no bank login (`pipeline.loginPendingDays`), and for managers unowned leads and commissions not received
after 30 days. Nothing is stored: an item disappears the moment the problem is fixed. It feeds the bell in the top bar
and the dashboard's "My day" / "Needs attention" list. Staff see only their own files.

## Masters, archive and duplicates

Lists that rarely change — banks & NBFCs, loan products, document checklists, rate cards — live under
**Settings → Masters**, not in the daily menu (the old `/lenders` page still works for direct links and search).
Finished files are archived, never deleted: Settings → **Archive** hides converted/lost leads and
disbursed/rejected/withdrawn applications older than N months from the working lists (`Show archived` brings them
back; search and reports always include them). The New Lead form warns when the phone number is already in the CRM.

## Customer application form

On any **draft** application, the *Customer application form* panel creates a link
(`/crm/apply/<token>`) the customer opens on their phone — no login. Staff copy it or send it on WhatsApp
(a click-to-chat link with the message ready; no WhatsApp account needed).

- The customer works through six steps (about you, work & income, loan, references, documents, review). Everything
  they type is **saved as a draft as they go**, so closing the page loses nothing; it only lands on the real file
  when they tick the declaration and **send**. Their phone number is fixed, and the document list follows what they
  say they do for work (the same checklist staff see).
- On submit the answers go onto the primary applicant, the loan amount/tenure/purpose and the references are
  updated, and the link locks. The file stays a **draft** — staff check it and take it forward. Staff get a
  *"… sent in their application form"* reminder (bell and *My day*) until they do. Customer uploads appear in the
  file's documents as "Customer (online form)".
- To correct something, send a fresh link: it starts from the answers already on file. Sending a new link retires
  the old one; a link can also be withdrawn. Links expire (default 14 days), and stop working once the file moves
  past draft.
- Settings → **Customer form**: link validity, how many references are required (default 2, 0 to waive), and the
  most files per link.
- Safety: the link is 256 random bits and only a hash is stored (staff can re-copy it; an encrypted copy is kept).
  Uploads are checked by content (PDF/JPG/PNG/WebP/HEIC), customers can only remove files they uploaded themselves
  through that link, only Aadhaar's last 4 digits are asked for, and every action is in the audit trail as a
  *Client* action.

## Security

- Staff accounts made or reset by an admin must choose their own password before anything else works
  (server-enforced, not just a screen). The seeded admin is forced to change the documented default.
- Two-step login with any authenticator app (My account → Two-step login). Implemented to RFC 6238 with Node's crypto
  and checked against the RFC's test vectors. A Super Admin can reset a lost phone from the Team page.
- Commission economics (ledger, splits, commission reports, the dashboard total) are Admin/Super Admin only —
  enforced on the API, not just hidden in the menu.
- Guessing is capped per account as well as per IP: five wrong passwords (or codes) lock that sign-in for 15 minutes,
  for staff, partners and borrowers alike. Unknown emails/phones behave identically, so nothing is revealed.
  A Super Admin's password reset, or the lock timing out, lets the person back in.
- Sessions can be revoked: changing or resetting a password, resetting/turning off two-step login, setting a
  partner's password or regenerating a borrower's code ends every session already open (a per-account token version).
- Two-step login: a code works once (no replay within its 30-second window), a sign-in challenge works once and a
  newer password sign-in replaces it, and the seed is encrypted in the database (`SECRETS_ENCRYPTION_KEY`, required in
  production — keep a copy with your backups, apart from the dump).
- Uploads are judged by their contents (PDF/JPG/PNG/WebP/HEIC only), never by the browser's claimed type or the
  filename; stored names are cleaned and downloads are always attachments.
- Exports defuse spreadsheet formulas (a leading `=`, `+`, `-`, `@` gets an apostrophe) in CSV.
- Every request field has a ceiling (text 5,000 chars, amounts below 1e13, bounded arrays/nesting) on top of the
  per-field rules. The API sends strict headers (helmet); Nginx sends a Content-Security-Policy for the CRM so only our
  own scripts run.
- Known trade-off: sign-in tokens live in the browser's local storage (not a cookie). The CSP above is the main
  defence against stealing them; moving to HttpOnly cookies would also need CSRF protection.
- Login and code entry are also rate-limited per IP; the API refuses to start in production with a weak secret or missing keys.

## Tests

```bash
cd backend && npm test            # unit tests: dates/financial year, numbering, reports, search, TOTP, config checks
cd backend && npm run test:e2e    # permissions, portals' token isolation, archiving, security (builds a throwaway database)
cd frontend && npm test           # formatting, India-time helpers, CSV import
```
The end-to-end suite needs the development Postgres running; it creates and drops its own database
(`gcs_crm_e2e`), so it never touches real data. Run all three before deploying a change.

## Going live and backups

See `ops/DEPLOY.md` (server setup, Nginx, systemd, B2, uptime monitor) and `ops/backup.sh` / `ops/restore-check.sh`
(nightly verified dumps, and a monthly proof that one restores). `GET /crm/api/health` is the uptime-monitor endpoint.

## Motion

All animation is plain CSS in `frontend/src/styles.css` (no animation library) and
is switched off for `prefers-reduced-motion` and in print. Use the existing
classes rather than adding new ones: `page-enter` (route changes, applied once in
the shell), `pop-enter` (dropdowns and popovers), `overlay-enter` + `dialog-enter`
(dialogs; use the shared `Modal` for the exit animation and Escape-to-close),
`bar-grow` (progress bars), `fade-enter`, `lift` (hover tiles) and `skeleton`
(`TableSkeleton` / `DashboardSkeleton` while a register loads). Table rows
stagger in automatically. `CountUp` animates dashboard figures.

## Search

The search box in the top bar (focus it with `/` or Ctrl/⌘+K) searches the whole
CRM with `GET /crm/api/search?q=`: leads (name, phone, email, city, notes,
follow-up notes, lead no. like `L-12`), applications (application no., every
applicant and co-applicant's name/phone/email/PAN/city/employer, bank reference,
banker, sanction letter no., UTR, loan account, references, document file
names, borrower access code), lenders, sourcing partners, team, loan products,
required documents, rate cards, pages, settings and the audit log. Several
words must all match (`sneha bajaj`), phone numbers match however they are
typed (`+91 98220 44556`), and results are role-scoped — Staff only ever find
their own leads and applications. Each result shows which field matched and a
breadcrumb, and opens the exact section (`/applications/:id#sanction`,
`#disbursement`, `#documents`, a settings tab, a directory row) with a
highlight. `/crm/search?q=` is the full results page. Add a new searchable
thing in `backend/src/search/search.service.ts`.

## Dates, periods and long-term use

This is meant to run for decades, so nothing assumes a particular year:

- **India time everywhere.** "Today", attendance days, report periods and
  application-number years are all IST, whatever the server or browser timezone.
  Use `backend/src/common/date.util.ts` and `frontend/src/lib/date.ts`; do not
  call `toISOString().slice(0, 10)` or `setHours` for calendar-day logic.
- **Financial year (April–March).** Every list, report and the dashboard accept
  `range=` (`today`, `7d`, `30d`, `month`, `last_month`, `quarter`, `fy`,
  `last_fy`, `year`, `all`) or a custom `from`/`to`. Financial quarters and the
  "2026-27" labels roll over on their own; the picker's options come from
  `GET /dashboard/periods`.
- **Application numbers** can use the calendar year or the financial year
  (Settings → Numbering). The counter is one continuous sequence, so numbers
  stay unique forever; padding only sets the minimum width.
- **History stays reachable**: the attendance year picker runs from the founding
  year (Settings → Organisation) to next year, and report exports are not
  capped (the on-screen preview shows the first 1,000 rows).
- **Date pickers.** Use `DatePicker` / `MonthPicker` (`frontend/src/components/date-picker.tsx`)
  instead of `<input type="date">`: click the month title for a month grid, then
  the year for a year grid, so any date is a few clicks away. Values are plain
  `YYYY-MM-DD` strings, so no timezone can shift a day.
- **Indexes** cover the created-date, loan-type, lender and partner columns the
  filters use, so lists stay fast as records accumulate.

## Document checklist data

`backend/prisma/checklist-data.ts` is generated from the website's per-product
checklist PDFs (`public/checklists/*.pdf`) and holds the product-specific
items; universal KYC and the per-profile income sets stay in `seed.ts`.
Re-run the seed after editing either.

## Role labels

The three staff roles are unchanged in the database (`ADMIN`, `MANAGER`,
`ADVISOR`) — only their on-screen names changed, to match how GCS actually
talks about the hierarchy:

| DB value | Displayed as |
| --- | --- |
| `ADMIN` | Super Admin |
| `MANAGER` | Admin |
| `ADVISOR` | Staff |

Staff (ADVISOR) keeps its existing restriction — sees only leads and
applications assigned to them.

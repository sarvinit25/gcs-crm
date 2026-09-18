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
| Dashboard | done | done |
| Leads (+ follow-ups, public intake) | done | done (list, filters, detail, status, follow-ups) |
| Applications | done | done (list, detail, applicants, references, lender) |
| Sanctions | done | done (register + per-application panel) |
| Disbursements | done | done (register + per-application panel) |
| Commissions | — | placeholder |
| Documents | done (S3/B2 upload, presigned download) | done (panel on application) |
| Lender Directory | done (+ public feed) | done |
| Settings (+ loan products) | done | done |
| Team | done | done (create, roles, deactivate, reset password) |
| Sourcing Partners | done | done (roster + referral stats) |
| Attendance & Payroll | done | done (month grid + payroll) |
| Reports | done (+ CSV export) | done |
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

**Not built yet:** the Client Portal (the loan applicant's own login to track
their application) — noted as a future portal, same pattern, different data
shape.

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

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

The website's partner directory can also read the lender list without auth:

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
| Auth & roles | done | done (login, route guard, role-aware nav) |
| Dashboard | done | done |
| Leads (+ follow-ups, public intake) | done | done (list, filters, detail, status, follow-ups) |
| Applications | done | done (list, detail, applicants, references, lender) |
| Sanctions | done | done (register + per-application panel) |
| Disbursements | done | done (register + per-application panel) |
| Commissions | — | placeholder |
| Documents | done (S3/B2 upload, presigned download) | done (panel on application) |
| Lender Directory | done (+ public feed) | done |
| Loan Products / Settings | schema + seed | placeholder |
| Team | done | done (create, roles, deactivate, reset password) |
| Sourcing Partners | done | done (roster + referral stats) |
| Attendance & Payroll | schema | placeholder |
| Reports | — | placeholder |
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

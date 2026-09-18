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
| Documents | Backblaze B2 (S3-compatible) — keys only in Postgres |

## Local setup

```bash
docker compose up -d                 # Postgres on host port 5433
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

## Module status

| Module | Backend | Frontend |
| --- | --- | --- |
| Auth & roles | done | done (login, route guard, role-aware nav) |
| Dashboard | done | done |
| Leads (+ follow-ups, public intake) | done | done (list, filters, detail, status, follow-ups) |
| Applications | done | done (list, detail, applicants, references, lender) |
| Sanctions | — | placeholder |
| Disbursements | — | placeholder |
| Commissions | — | placeholder |
| Documents | schema | — |
| Lender Directory | read-only list API | placeholder |
| Loan Products / Settings | schema + seed | placeholder |
| Team | schema | placeholder |
| Sourcing Partners | schema | placeholder |
| Attendance & Payroll | schema | placeholder |
| Reports | — | placeholder |

## Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173/crm/ — proxies /crm/api to port 4000
```

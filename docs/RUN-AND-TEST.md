# Run it locally and check the website <-> CRM connection

Read `WEBSITE-INTEGRATION.md` first for what changed. This page is how to run both projects and see each feature working.

## 1. Start the CRM

```bash
cd gcs-crm            # this repo
docker compose up -d  # Postgres on 5433 (and MinIO)
cd backend
cp .env.example .env  # then check CORS_ORIGIN includes http://localhost:8080 (the website) and http://localhost:5173 (CRM UI)
npm install
npx prisma migrate deploy
npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed.ts   # local only; creates the admin login and sample data
npm run dev           # API at http://localhost:4000/crm/api
```

Second terminal, the CRM screens:

```bash
cd gcs-crm/frontend
npm install
npm run dev           # http://localhost:5173/crm/
```

Sign in as `admin@growthcapitalservices.in` / `ChangeMe123!` (from the seed — change it before any real deployment).

If the API starts and says it cannot find `dist/main`, delete `backend/dist` and `backend/tsconfig.tsbuildinfo` and start it again.

## 2. Start the website

```bash
cd gcs-website
npm install            # or bun install; Cloudflare uses bun with a frozen lockfile, so commit bun.lock if dependencies change
npm run dev            # http://localhost:8080
```

`.env.development` points the website at the local CRM (`VITE_CRM_API_URL=http://localhost:4000/crm/api`). If edited wording looks like it is not applying after many code changes, restart `vite dev` (duplicate module instances after hot reload).

## 3. Check each feature

Do these with the CRM API, CRM UI and website all running.

1. **Enquiries reach the CRM.** On `http://localhost:8080/contact` fill and submit the consultation form. In the CRM, open Leads: the new lead has the name, phone, email, city, amount and loan product. Submit again with the same phone number: no second lead is created (it merges).
2. **Content editor.** In the CRM open Settings -> Website content -> FAQs, change the first Contact-page answer, Save and publish, then reload `http://localhost:8080/contact`: the new answer shows. Press Reset to built-in to undo, or History / undo to restore a past save.
3. **Contact & CIBIL.** Change the phone and the report price there; the Contact page and `http://localhost:8080/cibil` update. Clear it with Reset.
4. **Edit directly on the site.** With the CRM open and signed in, the website only recognises you if both share a browser origin. In local dev they do not (ports differ), so paste the CRM token into the website tab's console: `localStorage.setItem('gcs_crm_token', '<token>')` (copy it from the CRM tab's `localStorage`), reload the website, press **Edit text** (bottom-left), click a heading, change it, Save. Visitors (no token) see it after a reload; Settings -> Website content -> Page wording lists it.
5. **Pictures.** In Edit text mode click a picture and choose a PNG/JPG/WebP under 2 MB; Save. Settings -> Website content -> Pictures lists it.
6. **Interest rates.** Settings -> Website content -> Interest rates: add a row, set the EMI starting rate, save. See `/rates` and the EMI calculator on `/tools`.
7. **Search listings.** Settings -> Website content -> Search listings: set a title for `/contact`; open the page and check the browser tab title and the page's `<meta name="description">`.
8. **Client stories and figures.** Client stories: edit or hide one, then see the home page strip. Trust figures: change `75+` to another number and check Home and About.
9. **Page sections.** Settings -> Website content -> Page sections: pick Home -> Hero highlights, reword an item, add one with Add item, remove another, save, then reload the home page. Also try Home -> Who we help (a new item becomes a new tab) and Partner -> Benefits.
10. **New pages.** New pages & articles: create an article, tick Published, save. See it on `/insights` and at `/p/<address>`; an unticked draft does not show.
11. **Hindi / Marathi.** Settings -> Website content -> Hindi: translations appear here. On the website with the token set, the language switcher (EN / हिं / मरा) is visible; choose हिं, press Edit text, click wording, type the Hindi, Save. Reload with `?lang=hi` to see it as a visitor.
12. **Checklists.** Settings -> Website checklists lists the 58 PDFs. Deactivate one or change its file path and download it from the matching service page.
13. **Email alerts.** Settings -> Alerts: add an address. Without SMTP configured nothing is sent. To try it locally run any local SMTP catcher (for example `npx maildev`, SMTP 1025), set `SMTP_HOST=localhost`, `SMTP_PORT=1025` in `backend/.env`, restart the API and submit an enquiry with an email: staff and customer emails arrive.
14. **Rate-limit and Turnstile.** The lead endpoint allows 5 per minute per IP. Turnstile is only enforced when `TURNSTILE_SECRET` is set.

## 4. Where to look when something is off

- API logs in the terminal running `npm run dev` (NestJS prints validation errors with the field that failed).
- The website's network tab: `GET .../public/site-content` should return `200` with only the sections staff have saved.
- Sections not in `GET /public/site-content` mean "use the built-in copy"; an empty response is normal on a fresh database.
- Allowed content keys and their validation: `backend/src/site-content/site-content.controller.ts`.

## 5. Production notes

See section 6 of `WEBSITE-INTEGRATION.md` (migrations, **no full seed on production**, `seed-checklist-documents.ts`, env variables, Nginx).

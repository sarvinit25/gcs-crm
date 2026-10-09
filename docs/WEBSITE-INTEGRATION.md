# Website <-> CRM integration — what changed and how to deploy it

Written for the developers. The website repo is `Jonathannnn3009/gcs-website` (TanStack Start + React, deployed by Cloudflare Workers Builds). This repo is the CRM (NestJS + Prisma + React). In production both sit on one domain: the website at `/`, the CRM at `/crm` (API at `/crm/api`).

**Principle:** the website works on its own. Everything it reads from the CRM has a built-in fallback, so if the CRM is down or an item was never edited, the page shows its original content. Nothing on the website breaks without the CRM.

## 1. What the website now sends to the CRM

| Website form | Source tag | Notes |
| --- | --- | --- |
| Consultation form (home, contact, each service page) | `home-enquiry`, `contact-enquiry`, `service-enquiry-<slug>` | name, phone, email, city, loan product, amount |
| Checklist download gate | `checklist-download` | product slug, amount |
| Partner enquiry | `partner-enquiry` | |
| CIBIL report request | `cibil-report-request` | two captures: before and after payment details |

All go to `POST /crm/api/public/leads` through `src/lib/leads.ts` in the website. If the CRM cannot be reached the enquiry is kept in the visitor's browser (localStorage, 7 days, max 20) and resent on their next visit. Cloudflare Turnstile is supported (`VITE_TURNSTILE_SITE_KEY` on the website, `TURNSTILE_SECRET` in the CRM).

Duplicate handling uses the CRM's own intake logic (same phone merges into the open lead).

## 2. What the website reads from the CRM

Public, read-only endpoints (no login):

| Endpoint | Used for |
| --- | --- |
| `GET /public/site-content` | everything staff edit (see section 3) |
| `GET /public/commission-structure` | partner page commission table |
| `GET /public/checklist-documents` | which PDF a checklist download serves |
| `GET /public/settings` | extra phone numbers (`org.morePhones`) |
| `GET /public/website-ad` | the pop-up ad (already existed) |
| `GET /public/site-images/:id` | pictures staff uploaded |

## 3. What staff can now edit from the CRM

All under **Settings -> Website content** (admins only) unless stated. Each section has **History / undo** and **Reset to built-in**.

- **Page sections:** the repeated blocks on Home, About, Why Us, Partner and Services (hero points, trust ticker, who we help, steps, figures, benefits, reasons, concerns). Reword, add, remove and reorder items; icons are picked from a fixed list.
- **More Page sections:** top menu and Tools drop-down, footer Explore and Loan Products columns, enquiry-form loan types and cities, bank logo strip (upload logos), home goal cards, calculator card names, loan group headings, CIBIL bureau and choice wording, city page intros, stamp-duty rates by state, calculator assumptions (FOIR, working-capital shares, starting LTV, CGTMSE). Lists marked fixed cannot gain or lose items, only be reworded and reordered.
- **Show or hide loan products** (Page sections -> Services): untick a loan and its page, menu entries, cards and goal tiles disappear (its direct address shows 'That product doesn't exist'). Done by `setHiddenProducts` in `src/data/products.ts`, applied once at load.
- **Checklist download questions** (Page sections -> Forms -> Checklist download): the extra questions asked before a checklist downloads. If staff save any questions, the CRM's set replaces the built-in questions for that loan. Keep the `key` of an existing question (for example `loanAmount`, which fills the lead's amount).
- **Enquiry form applicant choices** (Page sections -> Forms). The checklist's own Salaried / Self-Employed / NRI categories are intentionally NOT editable: they select which PDF is served.
- **Social links and analytics** (Contact & CIBIL): Facebook, Instagram, LinkedIn, YouTube, X icons in the footer appear once a link is saved; a Google Analytics ID or Meta Pixel ID switches tracking on. Nothing loads until an ID is saved.
- **Legal pages:** Privacy Policy, Terms & Conditions and Disclaimer are offered as unpublished DRAFTS under New pages & articles. They are general wording and **must be reviewed by a lawyer** before anyone ticks Published. Published pages with 'Link from the website footer' ticked appear in the footer.
- Contact & CIBIL: phone, WhatsApp, email, address, hours, credit report price, UPI ID for the payment QR (the UPI ID is still empty — enter it here)
- Page wording (edited directly on the live site) and Pictures (replaced directly on the live site)
- Hindi and Marathi wording (translated directly on the live site)
- Interest rates (new `/rates` page and the EMI calculator's starting rate)
- Search listings (Google title and description per page)
- Client stories, Trust figures (e.g. "75+" banks, changed everywhere at once)
- New articles and pages (`/insights` and `/p/<address>`)
- FAQs, Loan product pages, CA & legal services, Case studies
- Settings -> **Website checklists** (the 58 downloadable PDFs), Settings -> Commission rate cards, Settings -> Organisation -> Additional phone numbers
- Settings -> **Alerts** (see section 5)

**Editing on the live site:** an admin signed in to the CRM sees an "Edit text" button on every page of the website. Click wording to change it, click a picture to replace it, then Save. This reads the CRM login token from `localStorage` (`gcs_crm_token`), so it only works when the website and CRM share one origin — which is the production plan. On separate origins (local dev) inject the token by hand.

## 4. Where the code is

**Website (`gcs-website`)**
- `src/lib/crm.ts` — `CRM_API` base URL (`/crm/api`, or `VITE_CRM_API_URL` in dev)
- `src/lib/leads.ts`, `captcha.ts`, `lead-dedupe.ts` — sending enquiries
- `src/lib/site-content.ts` — fetches `/public/site-content` once; hooks `useFaqs`, `useProduct`, `useCaseStudies`, `useProfessionalService(s)`, `useBankRates`, `useTestimonials`, `useCustomPages`, `useApplySiteInfo`
- `src/lib/page-text.ts` — applies edited wording, translations, figures and replacement pictures to the page after it has hydrated (waits until the router is idle so React does not discard the page)
- `src/data/legal-drafts.ts`, `src/lib/tracking.ts`, `src/components/site-link.tsx` (link component for addresses staff type)
- `src/data/page-lists.ts` — the built-in items of every editable block plus each block's field definition (`LIST_SPECS`); `src/lib/page-lists.ts` (`useList`); `src/lib/icon-map.ts` (icon names). To make another block editable, add its items and a spec there and call `useList` in the page. The CRM editor builds its forms from the exported specs.
- `src/lib/seo.ts`, `src/lib/language.ts`, `src/lib/commission.ts`, `src/lib/checklist-documents.ts`, `src/lib/public-settings.ts`
- `src/components/inline-editor.tsx` (admin Edit text), `language-switcher.tsx`, `rich-text.tsx`
- New routes: `/rates`, `/insights`, `/p/$slug`
- `scripts/export-site-content.ts` — exports the website's built-in text to `backend/prisma/site-content.defaults.json` in this repo. **Re-run it whenever built-in FAQs, products, services, case studies, stories, rates or page titles change in the website code**, then commit the JSON here:
  `npx tsx scripts/export-site-content.ts ../gcs-crm-vinit/backend/prisma/site-content.defaults.json`

**CRM (this repo)**
- `backend/src/site-content/` — content store, history, public + admin endpoints, picture upload (`site-images.controller.ts`)
- `backend/src/alerts/` — email sending and new-enquiry alerts
- `backend/src/checklist/checklist-documents.controller.ts` — checklist PDF list
- `frontend/src/components/website-content.tsx` — all the editors; `frontend/src/routes/settings.tsx` hosts them
- `GET/PUT/DELETE /settings/site-content/:key` (admin), `GET /settings/site-content/:key/history`, `POST /settings/site-content/:key/restore/:versionId`, `POST /settings/site-images`
- Allowed content keys are listed in `SITE_CONTENT_KEYS` in `site-content.controller.ts`; each key has its own validation there

## 5. Email alerts

Settings -> Alerts: who is emailed when a **new** website lead arrives (repeat enquiries merged into an existing lead send nothing), whether the customer gets an automatic thank-you, and its wording. Needs SMTP in the CRM environment:

```
SMTP_HOST=  SMTP_PORT=587  SMTP_USER=  SMTP_PASS=  SMTP_FROM="Growth Capital Services <alerts@yourdomain.com>"
```

With `SMTP_HOST` empty the feature is off and nothing fails. WhatsApp alerts are **not** sent automatically; the email contains a tap-to-WhatsApp link. Automatic WhatsApp needs a WhatsApp Business API provider account (paid) — not built yet.

## 6. Deploy checklist (production)

1. Merge/deploy the CRM and run `npx prisma migrate deploy` in `backend`. New migrations: `20261008010000_checklist_documents`, `20261009010000_site_content`, `20261010010000_site_content_history`, `20261011010000_site_images`.
2. **Do not run the full seed on production.** It resets lenders, rate cards and products to defaults. Load only the checklist list with:
   `npx ts-node prisma/seed-checklist-documents.ts` (safe to re-run; leaves edited entries alone).
3. `npm install` in `backend` (new dependency: `nodemailer`).
4. CRM `.env`: `CORS_ORIGIN`, `TURNSTILE_SECRET`, the `SMTP_*` variables above, `TRUST_PROXY_HOPS=1` behind Nginx.
5. Website build variable: `VITE_TURNSTILE_SITE_KEY` (Cloudflare Workers Builds -> Variables).
6. Nginx: `/` -> website, `/crm` -> CRM frontend build, `/crm/api` -> backend :4000. Website and CRM must share one domain for the on-site editor.
7. In the CRM: Settings -> Website content -> Contact & CIBIL — enter the real UPI ID; Settings -> Alerts — add the notification emails.

## 7. Known limits (be aware before promising)

- Edited wording, translations, Google titles and pictures are applied **in the browser after the page loads**. Visitors and Google (which runs JavaScript) see them; crawlers that do not run JavaScript see the built-in version.
- Pictures can be replaced (PNG/JPG/WebP, 2 MB). Layout, icons and CSS background images need a code change.
- Edited wording is matched by the exact original sentence. If a developer rewrites that sentence in the code, the old edit stops applying (it is listed under Page wording and can be removed there).
- A section saved in the CRM replaces the built-in content for that section (case studies, client stories, rates, pages). FAQs, loan products, CA/legal services store only the entries staff changed, so unedited ones keep following the website's copy.
- The Hindi/Marathi switcher shows once a translation exists, or to any signed-in admin. Nothing is machine-translated.
- Uploaded pictures are stored in Postgres (small, bounded to 2 MB each).
- Website dev quirk: after many hot reloads, restart `vite dev` if edited wording appears not to apply (duplicate module instances).

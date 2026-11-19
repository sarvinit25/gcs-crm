# Bringing the company's calling data into the CRM

Source: `DCR_Daily_Calling_Report_SEP_2026_NEW_.xlsx` (the firm's own calling workbook, 2011 to 2026).
This page holds figures only. The workbook has customers' phone numbers, names, a few PANs and dates of birth: it is
never committed to git, never emailed, and stays in one access-controlled place until the migration is finished.

## What is in the workbook

| Sheet | What it is | What we do |
|---|---|---|
| **Lead Data** | 46,677 lead rows, 2011 to 2026, one row per enquiry or case, 38 columns | The master. Everything is imported from here |
| **Calling Sheet** | The same people again as a call log (46,641 rows, 26,647 of its 26,648 numbers are in Lead Data) | Not imported separately; used only to cross-check |
| **EMI Calc** | Working calculators and charge tables (IDFC, YES, Federal, property valuation) | Not customer data. Not imported. Its charges can feed the lender policy one-pager later |

### Quality of Lead Data

- **Phone numbers.** 43,632 rows have something in the Mobile column, but only 30,336 are a clean 10-digit mobile. Many
  cells hold several numbers run together (18, 20, 26 digits). Splitting them and using all four phone columns gives
  **39,596 rows with at least one valid mobile**, 4,565 rows with two or more, and **7,081 rows with none**.
- **Duplicates.** 37,693 distinct mobiles. 11,075 rows share a primary mobile with another row (4,713 numbers), so the
  same person was uploaded in several batches. After merging on mobile: **33,234 people**, plus the 7,081 rows with no mobile.
- **The "App ID / FI Code" column is two things.** 22 values used by 40 or more rows are source batches and cover 35,686
  rows (99 Databank 9,325; Kotak 9,147; Shriram 6,715; Aurum 4,284; Edelweiss 2,130; Electronica; Axis; Indostar; exhibition
  lists; "Cold call"). The other 10,991 rows carry 10,494 different codes, which are per-case references.
- **Product** is blank on 16,960 rows (36%). Otherwise BL 11,121, HL 6,627, LAP 4,976, PL 3,021, UBL 1,918, plus lender
  product names (Shriram "POW HL V BRE" and similar).
- **Scheme** doubles as a case outcome: Disbursed 1,070, Policy declined 1,781, Underwriter review 495, Surrogate 446.
- **Loan amount** is a clean number on about 16,400 rows (most between 5 lakh and 1 crore); 9,819 more are text (such as
  "10 L"); 28 are above 10 crore and need a look.
- **Call history** is one row per lead, not one per call: 18,114 rows carry a call date (2017 to 2026), callers Sourish
  (3,136; 48 more spelt "Soursih"), Mahesh (2,935), Sheetal (20), Sneha (4). 40,534 rows have no caller.
- **Remarks**: 12,024 say not interested, 4,415 ringing, 1,230 wrong or unreachable number, 191 mention DND explicitly,
  1,350 mention disbursed, login or sanction.
- **Follow-up dates** are unreliable: 1,416 before 2020, 2,508 in the future, 2,742 in the past.
- **Credit data** (risk score, category A to D, eligibility, DSCR, turnover, CIBIL) is filled on about 2,100 rows.
- **PAN and date of birth** are nearly empty (251 PANs, 131 dates), so little sensitive data is at stake.

## How each column lands in the CRM

| Workbook | CRM |
|---|---|
| Mobile, Resi phone, Office phone, Phone | One primary mobile on the lead; other numbers kept in notes and a "More numbers" answer |
| Customer name, Company name, Designation | Lead name (customer, else company), employer name, designation |
| PRODUCT | Loan product (BL, HL, LAP, PL, UBL, WCL mapped to the CRM's products; unknown left blank) |
| Loan amount | Amount (text amounts parsed; anything above 10 crore held for review) |
| Date | Lead created date (kept, not today's date) |
| App ID / FI Code | Source batch into Channel; a per-case code into a "Legacy reference" |
| Scheme | Case outcome: stored as an answer and in notes; Disbursed also sets the lead Converted |
| Call date, Call person, Remarks | One follow-up entry per lead (dated, by the matching team member, with the remark) |
| Follow up date | Next follow-up only when it is in the future and after 2025; older dates are ignored |
| Remarks (not interested, wrong number, DND) | Lead Lost with a reason, and archived; DND sets a do-not-call flag |
| Risk score, category, eligibility, DSCR, turnover, CIBIL ... | "Form answers" on the lead for now; the Credit evaluation module later |
| Address, PAN, DOB | "Form answers" (only where present) |

## The plan

**Phase 0: safeguards (before anything is imported)**
1. Backup: run `ops/backup.sh` and check the restore (`ops/restore-check.sh`). Do the first runs on a copy of the database.
2. The workbook stays in one place; the migration scripts and their outputs never contain it in git.
3. Decide the open questions below.

**Phase 1: clean and stage (no changes to the CRM)**
A one-time script reads the workbook and writes a clean staging file plus a report: phones split and validated, names,
products mapped, amounts parsed, dates fixed, callers matched to team members, remarks classified, duplicates merged on
mobile (newest call wins, history kept), rows with no mobile listed. The report is reviewed by a person before anything moves.

**Phase 2: small additive changes to the CRM**
New lead fields: company name, legacy reference, import batch, do-not-call (with reason). Reminders, "no owner" alerts and
dashboard counts skip legacy imports until someone is assigned, so 30,000 imported leads do not bury today's work. Nothing
existing is changed or removed.

**Phase 3: pilot of 500**
One batch (for example Kotak 2018) goes in. Check counts against the report, open a sample of leads, review Leads,
Archived leads and the Dashboard. Undo is one step: delete by import batch.

**Phase 4: full import in batches**
Batch by source and year. Each batch is a dry run first (what will be created, merged, skipped), then run for real; it can be
stopped and resumed, never creates the same person twice (key: mobile, then legacy reference), and writes one audit entry.

**Phase 5: afterwards**
Reconcile totals with the report; assign the live leads (not interested and wrong numbers are archived, not assigned);
hand the callable pool to the telecallers; keep the Excel as a frozen archive and stop updating it.

## Rules worth stating
- Imported people are **not** marked as having agreed to WhatsApp messages. No bulk WhatsApp or SMS goes to them until
  consent is recorded. Numbers marked not interested or DND are never called again.
- The 99 Databank and exhibition lists are bought or collected data: they stay in their own batch so they can be filtered, paused or removed.
- Disbursed and declined cases are kept as history on the lead. Application, sanction and disbursement records are **not**
  invented from this sheet, because they drive commissions and reports; they come from the real disbursement register if one exists.

## Questions that need an answer before Phase 1 is final
1. Not interested and wrong-number rows (about 13,000): import as archived history, or leave out?
2. The 7,081 rows with no mobile: import as company-only leads to be completed, or leave out?
3. Callers Sourish, Mahesh, Sheetal, Sneha: are they CRM users, so history is credited to them?
4. Disbursed and declined cases: history only (recommended), or also create application records?
5. Merge people who appear several times by mobile (recommended)?

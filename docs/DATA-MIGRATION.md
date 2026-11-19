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
- Application records are made only for the old Shriram cases (see "Decisions"), never for anything else, and never with
  invented money: no Disbursement, Sanction or Commission records come from this sheet, because they drive the Dashboard's
  money figures and the commission reports and the sheet has no disbursal date or disbursed amount.

## Decisions (made 19 Nov 2026)

1. **Dead leads (about 13,000 not interested, wrong or unreachable numbers):** imported as archived history. Each is a Lost
   lead with its reason in the Archived leads section. They never reach the working list or reminders, and are never called again.
2. **Rows with no mobile (7,081):** imported as their own "Needs phone" batch, kept out of reminders until a number is found.
3. **Case outcomes: also create application records.** What the sheet supports:

   | Outcome | Rows | Amount | Product | Date | Lender |
   |---|---|---|---|---|---|
   | Disbursed | 1,070 | 1,006 | all (BL 843, LAP 225) | 1,069 | Shriram 1,064 |
   | Policy declined | 1,781 | 1,712 | all (BL 1,771) | all | Shriram, all |
   | Underwriter review | 495 | 493 | all | all | Shriram, all |

   All of them are Shriram cases from 2011 to 2014, so they are twelve years old.
   - **Disbursed** becomes an Application with status Disbursed, lender Shriram, the product, the requested amount and the
     sheet's date as its created date. **Policy declined** becomes an Application with status Rejected and the reason.
   - **Underwriter review (495)** is not made an application: a twelve-year-old review that never finished is not a live file.
     It stays as a lead with a note.
   - All of these applications are created archived, so they do not crowd the live Applications list, and carry the import
     batch so they can be filtered or removed in one step.
   - No Disbursement, Sanction or Commission record is created. The Dashboard's disbursed amount and the commission reports
     therefore do not change. If the real disbursement register exists, it is added later as a separate step.
   - The sheet's date is the entry date, not the disbursal date, so reports for a period show these under the entry year.
4. **Duplicates:** one person who appears in several rows is merged on mobile (newest call wins, the history is kept).

## Still needed
- Whether Sourish, Mahesh, Sheetal and Sneha are CRM users, so their calls are credited to them.
- Whether the real disbursement register for the Shriram cases exists.
- Go-ahead for Phase 1, the clean-and-stage run with its report, which changes nothing in the CRM.

## Phase 1 result (19 Nov 2026): clean and stage, built and run

The cleaning rules are in `backend/src/legacy-import/` (with tests) and the command is `npm run legacy:stage`. It reads the
workbook, cleans it, merges repeats on mobile and writes a review report. **It changes nothing in the CRM and never
touches the database.**

```bash
cd backend
npm run legacy:stage -- /path/to/workbook.xlsx /path/to/private-output-folder
```

The output folder must be **outside** the project (the command refuses otherwise): `people.jsonl` holds customer
details and must never be committed. `report.md` and `report.json` hold counts only.

Result on the 19 Nov 2026 workbook:

| | |
|---|---|
| Rows read (plus 54 formula-only rows with no data, skipped) | 46,623 |
| People after merging on mobile | 40,255 (6,368 rows were repeats) |
| Live leads | 22,148 |
| Archived history | 11,151 (not interested 10,407; wrong number 566; do not disturb 178; 185 are do-not-call in all) |
| Needs phone | 6,956 |
| Application records to create (old Shriram cases) | 2,647, of which 2,518 are complete; 129 lack an amount |
| Call history entries | 27,666 |
| People with a city | 8,448 |

What the run taught us:
- **The 99 Databank batch (9,318 rows) was entered with shifted columns.** Its "Loan Amount" column holds the city, so it is
  read as the city, not as an unreadable amount. Unreadable amounts fell from 8,730 to 99.
- 15,084 people have no loan product in the sheet; 396 + 304 + 303 + 235 more carry Shriram product names ("POW HL V BRE"
  and similar) that are left unmapped rather than guessed.
- 21,523 call entries have no caller recorded.

Next: Phase 2 (the additive fields: company name, legacy reference, import batch, do-not-call, and keeping imported
leads out of reminders), then the 500-row pilot on a copy of the database.

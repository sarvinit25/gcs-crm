# Ria, the GCS AI loan assistant: plan and status

Written 21 Nov 2026. This takes Mahesh's improvement plan (the ChatGPT write-up) point by point, says what is already in the CRM, what was done now, and what comes next, with the extra ideas we added. The assistant is called **Ria** everywhere (website chat, WhatsApp, phone script).

## 1. What we already had (so nothing is rebuilt)
- One WhatsApp assistant that asks the **same questions as the website's second forms**, for all **28 products**, with "only ask if an earlier answer says so" rules (35 to 80 questions per product).
- Answers are saved on the lead exactly as the website saves them. Identity numbers (PAN, Aadhaar, OTP, card, account) are hidden before anything goes to the AI and are never stored.
- Lender policy database, lender matching, CAM, lender offers, human take-over, English, Hindi and Marathi.

## 2. Mahesh's points: status

| # | Point in the plan | Status |
|---|---|---|
| 1 | Do not repeat a question (rent asked 4 times) | **Done.** Unusable answer: explained once with an example, then skipped for the expert. |
| 2 | Professional acknowledgements, no opinions ("Mumbai is great", "11% is standard") | **Done.** Neutral wording only; no comment on places, rates, amounts or delays. |
| 3 | Show complete product names | **Done.** Full names are written in the message when a list title has to be short, and titles are never identical. |
| 4 | "Other" without clarification | **Done.** "Other" now always asks what it is. |
| 5 | Do not assume missing information | **Done.** The assistant can no longer turn "Rent" into 0; a figure must come from the customer's own words. |
| 6 | Option for "Not sure / will confirm later" | **Done.** "Not sure", "skip", "I don't know", "need help" (also Hindi and Marathi) are noted for the expert and the chat moves on. |
| 7 | Capture each existing loan properly; separate OD from term loan | **Done for overdraft transfers.** New questions: original and current sanctioned limit, drawing power, fixed or floating, payment structure, monthly interest debit, how the limit comes down, renewal date, overdue now. Also owner willingness to sign and whether loan statement and sanction letter are available. |
| 8 | Confirmation summary before the end | **Done.** A short summary of what was noted, with "reply with any correction". Anything added afterwards is saved for the expert. |
| 9 | Understand ₹1.60 CR, 1.6 crore, 16000000 as one value | **Done.** Also "about 1.5 lakh a month" and "11 percent floating". |
| 10 | Reach all 28 products by tap | **Done.** First list has the popular nine plus "More loan types", which opens the four groups, then the loans in each group. |
| 11 | One question at a time, no sensitive data in chat | Already so. |
| 12 | Never stop the form half way | **Done.** The old stop after 20 answers is gone; the customer can still say "rest on the call". |
| 13 | Welcome message with consent | Next (see section 4). |
| 14 | Conversation memory: resume an unfinished chat | Partly there (answers are kept per lead, so the chat resumes at the next open question). A "Welcome back, shall we continue?" message is next. |
| 15 | Multi-product, reuse the customer profile | Next. |
| 16 | Lead priority (1, 2, 3, Manual review) | Next. |
| 17 | Preliminary CAM and lender shortlist from the chat | Next: the pieces exist (CAM, lender match with per-program fit); the chat answers must feed them. |
| 18 | Follow-up reminders for unfinished chats and pending documents | Next. |
| 19 | Website: Apply Now opens the assistant with the product chosen; Continue Application; product comparison; balance transfer calculator; document checklist; tracking | Next, website work. |
| 20 | "I don't know the product" guided help (property + business money + no EMI) | Next. |

## 3. Phased plan (Mahesh's own three phases, with where we are)
- **Phase 1, smart lead collection:** all 28 flows exist. Done now: the engine fixes above and the overdraft questions. Next: sharpen the other priority products one by one (below).
- **Phase 2, assessment and CAM:** FOIR, LTV and eligibility maths, CAM from the chat answers, document checklist by product.
- **Phase 3, lender matching:** per-lender, per-program rules (started: Bandhan LAP), offers comparison, tracking.

### Priority products (Mahesh's order)
1. Home Loan  2. Loan Against Property  3. Balance Transfer and Top-Up (overdraft part done)  4. Business Loan  5. Working capital, CC, OD and DLOD.
For each of these the plan lists recommended questions. The website forms already hold most of them. Remaining gaps found so far, to add next:
- **DLOD, OD and CC:** monthly stock and debtor figures (CC), expected utilisation of the limit, existing OD/CC exposure per bank.
- **LAP:** whether the property is jointly owned and each owner's willingness to sign, GST and ITR availability as a short check up front.
- **Business Loan:** audited financials available, average monthly bank credit, collateral available.
- **Home Loan:** whether a co-applicant will sign, booking amount paid (exists), own contribution (exists).

## 4. Our own additions (beyond the plan)
1. **Consent line** in the welcome ("by continuing you agree GCS may contact you about this enquiry"), recorded on the lead.
2. **Welcome back** for a returning customer: "You were part way through your Balance Transfer enquiry. Shall we continue?"
3. **Lead priority** set automatically from urgency, how complete the profile is, and risk flags (bounces, overdue, unusual ownership go to Manual Review, never an automatic rejection).
4. **Wrong-product guard:** if the answers do not fit the product chosen (for example a Home Loan Balance Transfer asked for an overdraft), offer the better fit.
5. **Document checklist by product**, sent after the questions (the website already has the checklists).
6. **Staff view of the chat:** a one-screen "what she learned, what is missing, which lenders look right" on the lead, using the program-fit result.
7. **Unfinished-chat nudge** after a day, then after three days, then stop. Never more.
8. **Quality checks for us:** a weekly list of questions that customers skip or answer wrongly most, so the form wording can be fixed.

## 5. How it was tested
A pretend customer (an AI playing Mahesh, with the answers from the real chat above: Chembur, L&T Finance, ₹1.60 Cr, "Rent" typed without a number, property type "Other", "not sure" for the drawing power) chatted with the assistant through the CRM's own message handling, with no real phone and no Meta. Found and fixed during the run: "11 percent floating" not read as a rate; a confirm question mixed into the next question; the AI turning "Rent" into 0; the summary quoting the middle of the chosen amount range as if it were the customer's figure.

Still to do with a real phone: one run each in English, Hindi and Marathi, and one with a customer who goes quiet half way.

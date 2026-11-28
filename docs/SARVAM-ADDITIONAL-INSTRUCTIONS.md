# Sarvam voice agent: the instructions that were missing

These are additions to the agent's prompt (Block 1) and to its post-call data (Block 2). They are written so they can be pasted as they are.
Replace [NAME] style words only where shown. The base prompt is `docs/SARVAM-BLOCK1-PASTE.txt`; the copy live in Sarvam may differ
(the live one says "Jiya", this file's base says "Ria"), so paste by section name, not by line.

## What was found, and what each part fixes

| Found | Fixed by |
|---|---|
| The agent asks Round 2 politely and lets people drop out easily, so it does not firmly carry on | **C** |
| A separate work number, or "call me on this number", was never asked for or saved | **A**, **F**, and the CRM |
| Nothing said whose details are being collected (a son calling for a father, two people on one call) | **B** |
| The shared question list (2-COMMON) was copied from the Personal Loan form: every loan was asked about "a personal loan", and the repayment choices were the personal-loan ones (1 to 5 years) | **D** |
| Only 8 of the 29 loans had their own Round 2 list; the other 21 got "what is the money for, then close" | **E** |
| The lists are 50 to 80 questions long but the call is capped near 12 minutes, and the key ones (income, EMIs, CIBIL) came last | **C** and **D** (most important first) |

## How to apply it

1. In Sarvam, open the agent, edit the prompt (Block 1). Make a new version (do not edit a committed one); the deployment keeps using the old version until you point it at the new one.
2. Paste **A** and **B** just before the "NEVER ASK FOR" section.
3. **Replace** the paragraph "HOW THE QUESTIONS WORK: TWO ROUNDS" with **C**.
4. **Replace** the whole "2-COMMON" section with **D**.
5. Delete the sentence "For a loan type not listed ... use 2-COMMON and ask what the money is for, then close." Paste **E** after "2-BALANCE TRANSFER AND TOP-UP".
6. In the post-call analysis (Block 2) add the two fields in **F**.
7. Commit the new version, then edit the deployment (pause it first) to use it, save and resume. Callers get no answer while it is paused.
8. Make the test calls in **H** before real customers call.

**Size warning.** E is about 31 KB, and the prompt is already about 32 KB. Doubling it makes each reply slower and costlier. Paste E only for the loans you take enquiries for, or keep E in Sarvam's knowledge base if your plan has one. I have not checked Sarvam's limits.

---

## A. Phone numbers (paste)

```
PHONE NUMBERS: WHICH NUMBER TO CALL BACK ON
- You already have the number they are calling from. Never ask for it. At the end of Round 1 ask once: "Is this the best number to reach you on, or is there another number, like your work number?"
- If they say this number is fine, or they give no other number: the team will call this number. Do nothing more.
- If they give a SEPARATE NUMBER FOR WORK (office, shop, or another phone): repeat it back in groups of digits and ask "Is that right?". Note it as the WORK NUMBER. The team keeps the number they called from as the main number and saves the work number as the second number.
- If they ask to be called ON A DIFFERENT NUMBER ("call me on this other number", "call only this number"): take that number, repeat it back, and note it as the CALL-BACK NUMBER.
- For a landline ask for the area code too ("with the 022?"). A mobile number has ten digits.
- Never guess a digit. If you could not catch it after asking twice, say: "No problem, our team will confirm the number when they call." and leave it empty.
- Ask whether that number is also on WhatsApp.
- A number that someone else uses (a spouse or a colleague): note whose it is in a few words.
```

## B. Name and whose details these are (paste)

```
NAME AND WHOSE DETAILS THESE ARE
- Take the person's name first (Round 1, question 1) and say it back once: "Rahul Sharma, is that right?" Ask for the spelling only if it is unusual.
- Use the name EXACTLY as they give it, even if it is different from the name on our records. The call may be from a family member's phone.
- Every detail you take belongs to ONE named person, the applicant. Everything after the name is about that person.
- If someone is calling for a relative ("my father needs the loan"): ask the APPLICANT's name first, then the caller's name and how they are related. Note the applicant's details (age, work, income), not the caller's. Note the caller as the contact.
- If two different people want loans on one call: take the first person fully, then say "I will note [second name] as well, and our team will call about that too". Write the second name and what they need under key concerns. Never mix their details.
- If they mention someone applying with them (a co-applicant), those answers are the co-applicant's. Say clearly whose question it is: "And your wife's monthly income?"
```

## C. Round 2, asked firmly (replaces "HOW THE QUESTIONS WORK: TWO ROUNDS")

```
HOW THE QUESTIONS WORK: TWO ROUNDS
Round 1 is the short enquiry (below). Round 2 is the detailed list for the person's service. You carry on into Round 2 with confidence: it is a normal part of the call, not a favour you ask for.

1. When Round 1 is done, read back the key points once, then go straight on: "Thank you, [NAME]. I will take a few more details now so our expert is fully ready. It takes about five minutes."
2. Ask the loan's own list first, then 2-COMMON. ONE question at a time, in the order written. Skip a question that was already answered, and one whose "(only if: ...)" does not fit.
3. After every answer go to the next question AT ONCE. Do not summarise, do not say "that is enough", and do not hand over to the expert while questions are still left. The only reasons to stop are: the person asks to stop or says they are busy, or the call reaches about 11 minutes.
4. Do not ask "shall I continue?" after each part. If someone hesitates, say once, lightly, "Just a few more, it really helps the expert." and carry on. If they still say no, respect it: "No problem at all." and close.
5. If they answer several questions in one go, take them all and skip those questions.
6. "Not sure" or "I don't know": say "No problem, the expert will help with that.", note it as not sure, and move on. Never press the same question more than twice.
7. If they ask something in the middle: answer in one short line (or "the expert will explain"), then come back: "Coming back to what we were saying: [question]."
8. Keep each question short and natural, in the person's language, in your own words. Do not read out all the choices in [square brackets]; ask naturally and match what they say.
9. If they say they have no time now, offer a call back instead of dropping the questions: "When is a good time for our expert to call you?"
10. Before you close, if Round 2 was not finished, say: "Our expert will take the remaining details when they call." Mark how far you got in round_reached.
```

## D. The shared questions (replaces the whole "2-COMMON")

```
2-COMMON (all loans; asked after the loan's own list, most important first; skip anything already answered)
* Type of income (skip if already asked in Round 1) [Salaried/Self-Employed/NRI]
* Where do you work? (only if: Type of income = Salaried) [Government / PSU/Listed or MNC company/Private limited company/Small firm / proprietorship/Other]
* Time with the current employer (only if: Type of income = Salaried) [Less than 1 year/1 to 3 years/3 to 5 years/More than 5 years]
* Monthly take-home salary (only if: Type of income = Salaried)
* How is the salary paid? (only if: Where do you work = Private limited company/Small firm / proprietorship/Other) [Credited to a bank account/Partly cash/Cash]
* Your business or profession (only if: Type of income = Self-Employed)
* Years in the business or profession (only if: Type of income = Self-Employed) [Less than 2 years/2 to 3 years/3 to 5 years/More than 5 years]
* Is your business registered under GST? (only if: Type of income = Self-Employed) [Yes, and returns are filed regularly/Yes, but returns are irregular/No, GST does not apply to me]
* ITR filed for how many years? (only if: Type of income = Self-Employed) [None/1 year/2 years/3 years or more]
* Annual turnover (last financial year) (only if: Type of income = Self-Employed)
* Net profit as shown in the ITR (last financial year) (only if: ITR filed for how many years = 1 year/2 years/3 years or more)
* Do you have 12 months of business bank statements? (only if: ITR filed for how many years = None) [Yes/No]
* Country you live and work in (only if: Type of income = NRI)
* Monthly income, in rupees (only if: Type of income = NRI)
* Do you have an NRE / NRO account in India? (only if: Type of income = NRI) [Yes/No]
* Do you have any running loans or credit cards? [Yes/No]
* Total EMIs you pay every month (only if: running loans or cards = Yes)
* Bank or NBFC of your biggest running loan (only if: running loans or cards = Yes)
* What kind of loan is it? (only if: running loans or cards = Yes) [Home Loan/Loan Against Property/Business Loan/Personal Loan/Vehicle Loan/Overdraft or Cash Credit/Credit card/Other]
* Amount still to be repaid on it (only if: running loans or cards = Yes)
* Any late or missed EMI or card payments in the last 12 months? (only if: running loans or cards = Yes) [No/Yes, once or twice/Yes, more often/Not sure]
* Roughly what is your CIBIL score? [750 or above/700 to 749/650 to 699/Below 650/I don't know]
* Is there anything on your credit report that worries you? [Nothing that I know of/EMI delay/Overdue/Loan settlement/Write-off/Cheque bounce/Credit card overdue/A mistake in the credit report/Other]
* Other regular monthly income (rent, interest, etc.)
* Have you applied for THIS KIND OF loan with another lender? (say the loan they want: "a home loan", "a business loan") [Yes/No]
* Which bank or NBFC, and where does that application stand? (only if: applied with another lender = Yes)
* Has a loan application of yours been declined before? [Yes/No]
* Which lender, and when? (only if: declined before = Yes)
* Do you own any property today? [Yes/No]
* What kind of property is it, and where? (only if: own property = Yes)
* Do you receive any rent? [Yes/No]
* Rent you receive every month (only if: receive rent = Yes)
* Is there another earning member whose income should be counted? [Yes/No]
* How are they related to you, their age, what they do, and their monthly income? (only if: another earning member = Yes)
* Over how many years would you like to repay? (ask it in years and note the number; do not read out choices)
```

## E. Loan lists for the loans that had none (paste; generated from the website's second form)

Each list is that loan's own questions in form order, up to 14 questions; the expert takes the rest on the call-back. After a list, ask 2-COMMON (D).

```
2-MICRO LOAN AGAINST PROPERTY (ask these first, then 2-COMMON)
* Type of loan [Micro LAP/Micro LAP Top-Up/Micro LAP Balance Transfer/Micro LAP Top-Up + Balance Transfer]
* Location
* Type of income (salaried or self-employed) [Salaried/Self-Employed]
* What do you need the money for? (only if: Type of income (salaried or self-employed) = Self-Employed) [Business expansion or working capital/Buying machinery or stock/Repaying other loans/Buying another property/Personal or family need/Other]
* What do you need the money for? (only if: Type of income (salaried or self-employed) = Salaried) [Repaying other loans/Medical need/Education or marriage/Buying another property/Starting or supporting a business/Other]
* Type of property [Residential (flat / house)/Commercial (shop / office)/Industrial (factory / warehouse)/Mixed-use or specialised property/Plot / land]
* How is the property used today? (only if: Type of property = Residential (flat / house)/Commercial (shop / office)/Industrial (factory / warehouse)) [Self-occupied or self-used/Rented out/Vacant]
* Rent you receive every month (only if: How is the property used today? = Rented out)
* Location of the property
* Approximate market value of the property
* Whose name is the property in? [My own name/Jointly with spouse or family/A parent or family member/My company or firm]
* Will the owner(s) sign the application along with you? (only if: Whose name is the property in? = Jointly with spouse or family/A parent or family member/My company or firm) [Yes/No/Not sure]
* Is there already a loan on this property? [Yes/No]
* Amount still to be repaid on it (only if: Is there already a loan on this property? = Yes)
  (the expert will take the remaining 13 detail questions on the call-back)

2-LEASE RENTAL DISCOUNTING (ask these first, then 2-COMMON)
* Type of loan [Lease Rental Discounting (LRD)/LRD Balance Transfer/LRD Top-Up]
* Location
* Type of property [Office/Shop / retail space/Warehouse/Mall or multi-tenant building/Educational institute/Hotel or service apartments/Other]
* Location of the property
* Approximate market value of the property
* Is the lease registered? [Yes/Registration is under way/No]
* How long does the lease still have to run? [Less than 3 years/3 to 5 years/5 to 10 years/More than 10 years]
* Who is the tenant? [A listed or multinational company/A private limited company/A partnership or proprietorship/Government / PSU/More than one tenant]
* Total rent received every month
* How is the rent paid to you? [By bank transfer/By cheque/In cash]
* Has the rent come in on time? [Always/Mostly, with a few delays/There have been long gaps]
* Is there already a loan on this property? [Yes/No]
* Amount still to be repaid on it (only if: Is there already a loan on this property? = Yes)
* Do you want to refinance it through this loan? (only if: Is there already a loan on this property? = Yes) [Yes/No]
  (the expert will take the remaining 11 detail questions on the call-back)

2-DROP-LINE OVERDRAFT (SECURED) (ask these first, then 2-COMMON)
* Type of loan [Drop-Line Overdraft (DOD)/Drop-Line Overdraft Balance Transfer/Drop-Line Overdraft Top-Up]
* Location
* Type of income (salaried or self-employed) [Salaried/Self-Employed]
* How is your business or practice set up? (only if: Type of income (salaried or self-employed) = Self-Employed) [Professional (doctor, CA, architect, etc.)/Proprietorship/Partnership or LLP/Private limited company/Limited company]
* What do you need the money for? (only if: Type of income (salaried or self-employed) = Self-Employed) [Business expansion or working capital/Buying machinery or stock/Repaying other loans/Buying another property/Personal or family need/Other]
* What do you need the money for? (only if: Type of income (salaried or self-employed) = Salaried) [Repaying other loans/Medical need/Education or marriage/Buying another property/Starting or supporting a business/Other]
* Type of property [Residential (flat / house)/Commercial (shop / office)/Industrial (factory / warehouse)/Mixed-use or specialised property/Plot / land]
* How is the property used today? (only if: Type of property = Residential (flat / house)/Commercial (shop / office)/Industrial (factory / warehouse)) [Self-occupied or self-used/Rented out/Vacant]
* Rent you receive every month (only if: How is the property used today? = Rented out)
* Location of the property
* Approximate market value of the property
* Whose name is the property in? [My own name/Jointly with spouse or family/A parent or family member/My company or firm]
* Will the owner(s) sign the application along with you? (only if: Whose name is the property in? = Jointly with spouse or family/A parent or family member/My company or firm) [Yes/No/Not sure]
* Is there already a loan on this property? [Yes/No]
  (the expert will take the remaining 20 detail questions on the call-back)

2-PROJECT FUNDING (ask these first, then 2-COMMON)
* Type of loan [Land Purchase Loan/Construction Finance/Project Term Loan/Inventory Funding/Lease Rental Discounting/Structured / Mezzanine Funding]
* Location
* What kind of project is it? [Residential project or township/Commercial project, mall or office/Infrastructure/Industrial or manufacturing unit/Other]
* Where is the project?
* Where is the project today? [Still to buy the land/Land bought, approvals pending/Approvals in place, yet to start/Under construction/Built, with units left to sell or let]
* How much of the construction is done? (only if: Where is the project today? = Under construction) [Less than 25%/25% to 50%/50% to 75%/More than 75%]
* How much of the project is already sold or let? (only if: Where is the project today? = Under construction/Built, with units left to sell or let) [Nothing yet/Up to 25%/25% to 50%/50% to 75%/More than 75%]
* Total project cost
* Are the title documents for the land clear? [Yes/Some documents are missing/Not sure]
* When do you expect the project to be complete?
* Is the land in the project's or promoter's name? (only if: Where is the project today? = Land bought, approvals pending/Approvals in place, yet to start/Under construction/Built, with units left to sell or let) [Yes, fully owned/Under a joint development agreement]
* Your own contribution so far
* What security can you offer? (pick all that apply) [The project itself/Other residential property/Commercial property/Industrial property/Land/Plant & machinery/Nothing else]
* Approximate value of the security
  (the expert will take the remaining 15 detail questions on the call-back)

2-LOAN CONSOLIDATION (ask these first, then 2-COMMON)
* Your age [Below 21/21 to 35/36 to 50/51 to 60/Above 60]
* Location
* Where do you live? [In my own house/In a rented house/With my parents/In company accommodation]
* How many active loans do you have? [1/2/3/4/5 or more]
* Total outstanding on all these loans
* What is your total existing EMI every month?
* Roughly what interest rate are you paying now? [Below 12%/12% to 16%/16% to 20%/Above 20%/Not sure]
* How much time is left on these loans? [Less than 1 year/1 to 2 years/2 to 3 years/3 to 5 years/More than 5 years/Not sure]
* Will the current lenders charge anything to close these loans early? [Yes/No/Not sure]
* Do you have credit-card dues you want to include? [Yes/No]
* How many credit cards have an outstanding amount? (only if: Do you have credit-card dues you want to include? = Yes) [1/2/3/4 or more]
* Total outstanding on these credit cards (only if: Do you have credit-card dues you want to include? = Yes)
* Total minimum payment due on these cards every month (only if: Do you have credit-card dues you want to include? = Yes)
* Are you paying only the minimum due on your credit cards? (only if: Do you have credit-card dues you want to include? = Yes) [Yes/No]
  (the expert will take the remaining 9 detail questions on the call-back)

2-MICRO BUSINESS LOAN (ask these first, then 2-COMMON)
* Type of loan [Micro Business Loan/Micro Business Loan Balance Transfer/Micro Business Loan Top-Up/Micro Business Loan Top-Up + Balance Transfer]
* Location
* How is your business set up? [Self-employed individual/Sole proprietorship/Partnership firm/LLP/Private limited company]
* What does your business do? [Manufacturing/Trading or distribution/Retail/Services/Export or import/Construction/Healthcare/Other]
* How long has the business been running? [Less than 1 year/1 to 2 years/2 to 3 years/3 to 5 years/More than 5 years]
* Your age [Below 25/25 to 40/41 to 55/56 to 65/Above 65]
* Can a woman from your family apply with you as co-applicant? [Yes/I am a woman applicant/No]
* Has your business account been in use for at least 6 months? [Yes/No]
* Do you have audited or CA-certified statements for the last 2 to 3 years? [Yes, all years/Some years/No]
* Is your business registered under GST? [Yes, and returns are filed regularly/Yes, but returns are irregular/No, GST does not apply to me]
* ITR filed for how many years? [None/1 year/2 years/3 years or more]
* Do you have 6 months of business bank statements? (only if: ITR filed for how many years? = None) [Yes/No]
* Annual turnover (last financial year)
* Net profit as shown in the ITR (last financial year) (only if: ITR filed for how many years? = 1 year/2 years/3 years or more)
  (the expert will take the remaining 9 detail questions on the call-back)

2-CGTMSE FUNDING (ask these first, then 2-COMMON)
* Type of loan [CGTMSE Term Loan/CGTMSE Working Capital/CGTMSE Composite Loan/CGTMSE for Services/CGTMSE for Trading/Non-Fund Based Facilities]
* Location
* Is your enterprise registered under Udyam? [Yes/Applied/No]
* Which category is your Udyam certificate in? (only if: Is your enterprise registered under Udyam? = Yes) [Micro/Small/Not sure]
* How is your enterprise set up? [Proprietorship/Partnership/LLP/Private limited company/Limited company]
* What does your enterprise do? [Manufacturing/Services/Trading/Retail trade]
* How long has it been running? [Less than 1 year/1 to 2 years/2 to 3 years/3 to 5 years/More than 5 years]
* What kind of facility do you need? [A term loan/A working capital limit/Both/Not sure, advise me]
* Is any collateral already given to another lender for this business? [No/Yes/Not sure]
* What will the term loan be used for? (only if: What kind of facility do you need? = A term loan/Both) [Machinery or equipment/Building or premises/Setting up a new unit/Expanding the unit/Other]
* Is a business or project plan ready? (only if: What will the term loan be used for? = Setting up a new unit/Expanding the unit) [Yes/In process/No]
* Preferred repayment period [Up to 3 years/3 to 5 years/5 to 7 years/More than 7 years/Not sure]
* When do you need it? [Immediately/Within a month/In 1 to 3 months/Just exploring]
* Is your business registered under GST? [Yes, and returns are filed regularly/Yes, but returns are irregular/No, GST does not apply to me]
  (the expert will take the remaining 8 detail questions on the call-back)

2-MACHINE LOAN (ask these first, then 2-COMMON)
* Type of loan [New Machinery Loan/Used Machinery Loan/Medical Equipment Loan/Genset Loan/Equipment Leasing/Loan Against Machinery]
* Type of industry [Engineering & Manufacturing/Automobile/Textile/Food Processing/Pharma / Healthcare/Plastic/Printing & Packaging/Metal Fabrication/Chemicals/Electrical / Electronics/Construction Materials/Agro Processing/Jewellery/Medical / Diagnostic/Wood, Furniture & Plywood/Rubber Products/Cold Storage & Refrigeration]
* Location
* What do you want to finance? [Machinery for production/Medical equipment/A genset/Other/Equipment on lease]
* Is it new or used? [New/Used]
* How old is the machine? (only if: Is it new or used? = Used)
* Do you have a quotation or proforma invoice? [Yes/Not yet]
* Have you finalised the machine vendor? [Yes, finalised/Not finalised yet]
* Who is the vendor? (only if: Have you finalised the machine vendor? = Yes, finalised)
* Total cost of the equipment, including GST
* Your own contribution
* Will the machine be bought in India or imported? [Bought in India/Imported]
* Is the machine already financed or hypothecated to anyone? [No/Yes/Not sure]
* For how long would you like to lease it? (only if: What do you want to finance? = Equipment on lease) [1 year/2 years/3 years]
  (the expert will take the remaining 16 detail questions on the call-back)

2-WORKING CAPITAL TERM LOAN (ask these first, then 2-COMMON)
* Type of loan [Working Capital Term Loan/Cash Credit / Overdraft Regularisation/Debt Consolidation Loan/Seasonal Working Capital/Working Capital Top-Up]
* Location
* How is your business set up? [Proprietorship/Partnership/LLP/Private limited company/Limited company/Self-employed professional]
* What does your business do? [Manufacturing/Trading or distribution/Retail/Services/Export or import/Construction/Healthcare/Other]
* How long has the business been running? [Less than 2 years/2 to 3 years/3 to 5 years/5 to 10 years/More than 10 years]
* What do you need it for? [A gap between paying suppliers and getting paid/To regularise a stretched cash credit or overdraft/To consolidate several short-term dues/A seasonal build-up of stock/Other]
* Which bank has the cash credit or overdraft? (only if: What do you need it for? = To regularise a stretched cash credit or overdraft)
* Amount outstanding on it (only if: What do you need it for? = To regularise a stretched cash credit or overdraft)
* Total of the dues you want to consolidate (only if: What do you need it for? = To consolidate several short-term dues)
* Please say what it is for (only if: What do you need it for? = Other)
* Do you have audited or CA-certified statements for the last 2 to 3 years? [Yes, all years/Some years/No]
* Is your business registered under GST? [Yes, and returns are filed regularly/Yes, but returns are irregular/No, GST does not apply to me]
* ITR filed for how many years? [None/1 year/2 years/3 years or more]
* Do you have 12 months of business bank statements? (only if: ITR filed for how many years? = None) [Yes/No]
  (the expert will take the remaining 9 detail questions on the call-back)

2-CASH CREDIT (ask these first, then 2-COMMON)
* Type of loan [Cash Credit against Stock and Debtors/Cash Credit against Receivables/Secured Cash Credit/Cash Credit Limit Enhancement/Cash Credit Takeover]
* Location
* How is your business set up? [Proprietorship/Partnership/LLP/Private limited company/Limited company]
* What does your business do? [Manufacturing/Trading or distribution/Retail/Services/Export or import/Construction/Healthcare/Other]
* How long has the business been running? [Less than 2 years/2 to 3 years/3 to 5 years/5 to 10 years/More than 10 years]
* Value of the stock you usually hold
* Money customers owe you at any time
* Money you owe your suppliers at any time
* Sales you expect in the coming year
* How long do customers take to pay you? [They pay in cash/Up to 30 days/30 to 60 days/60 to 90 days/More than 90 days]
* Can you give the lender a stock statement every month? [Yes/Yes, with my accountant's help/Not sure]
* Is this a new limit or a move from another lender? [A new limit/Move my present limit to another bank/Raise my present limit]
* Which lender has it now? (only if: Is this a new limit or a move from another lender? = Move my present limit to another bank/Raise my present limit)
* Present limit or outstanding (only if: Is this a new limit or a move from another lender? = Move my present limit to another bank/Raise my present limit)
  (the expert will take the remaining 14 detail questions on the call-back)

2-OVERDRAFT LIMIT (ask these first, then 2-COMMON)
* Type of loan [Overdraft against Property/Overdraft against Fixed Deposits/Overdraft against Securities/Unsecured Overdraft/Drop-Line Overdraft/Overdraft Balance Transfer]
* Location
* Type of income (salaried or self-employed) [Salaried/Self-Employed]
* How is your business or practice set up? (only if: Type of income (salaried or self-employed) = Self-Employed) [Professional (doctor, CA, architect, etc.)/Proprietorship/Partnership or LLP/Private limited company/Limited company]
* How would you like it secured? [Against a property/Against fixed deposits or securities/Without security/Not sure, advise me]
* What kind of property? (only if: How would you like it secured? = Against a property) [Residential/Commercial/Industrial/Other]
* Approximate market value of the property (only if: How would you like it secured? = Against a property)
* Whose name is the property in? (only if: How would you like it secured? = Against a property) [My own name/Jointly with spouse or family/A parent or family member/My company or firm]
* Approximate value of the deposits or securities (only if: How would you like it secured? = Against fixed deposits or securities)
* Is this a new overdraft or a move from another lender? [A fresh overdraft/Move my present overdraft or loan/Move it and add more funding]
* Which lender has it now? (only if: Is this a new overdraft or a move from another lender? = Move my present overdraft or loan/Move it and add more funding)
* Present limit or outstanding (only if: Is this a new overdraft or a move from another lender? = Move my present overdraft or loan/Move it and add more funding)
* Interest rate you pay now (only if: Is this a new overdraft or a move from another lender? = Move my present overdraft or loan/Move it and add more funding)
* How much of the present limit do you use on average? (only if: Is this a new overdraft or a move from another lender? = Move my present overdraft or loan/Move it and add more funding)
  (the expert will take the remaining 8 detail questions on the call-back)

2-BANK GUARANTEE (ask these first, then 2-COMMON)
* Type of loan [Performance Guarantee/Financial Guarantee/Bid Bond / Tender Guarantee (EMD)/Advance Payment Guarantee/Retention Money Guarantee/Shipping Guarantee/Customs and Excise Guarantee/Warranty Guarantee]
* Location
* What kind of guarantee do you need? [Performance guarantee/Financial guarantee/Bid bond or EMD/Advance-payment guarantee/Security deposit/Other]
* Who is it for? [A government department or PSU/A private company/Other]
* Do you have the tender or contract document? [Yes/Not yet]
* For how long does it have to run? [Up to 6 months/6 to 12 months/1 to 2 years/More than 2 years]
* Value of the contract or tender
* Does the guarantee need a claim period after it expires? [Yes/No/Not sure]
* By when do you need it? [Within a week/Within a month/Later]
* How much cash margin can you keep with the bank? [10%/10% to 25%/More than 25%/I cannot give cash margin]
* What collateral can you offer instead? (only if: How much cash margin can you keep with the bank? = I cannot give cash margin) [A property/Fixed deposits or securities/Nothing]
* Which bank do you bank with?
* Do you already have a bank guarantee or working-capital limit? [Yes/No]
* Amount of that limit (only if: Do you already have a bank guarantee or working-capital limit? = Yes)
  (the expert will take the remaining 12 detail questions on the call-back)

2-LETTER OF CREDIT (ask these first, then 2-COMMON)
* Type of loan [Inland Letter of Credit/Import Letter of Credit/Sight Letter of Credit/Usance Letter of Credit/Standby Letter of Credit/Revolving Letter of Credit/Back-to-Back Letter of Credit/Red Clause / Green Clause Credit]
* Location
* What kind of letter of credit do you need? [Inland (within India)/Import]
* Which country are you buying from? (only if: What kind of letter of credit do you need? = Import)
* What are you buying?
* When will you pay the supplier? [At sight, when the documents arrive/Within 90 days/Within 90 to 180 days]
* Do you have a supplier contract or proforma invoice? [Yes/Not yet]
* Do you already have a letter of credit limit? [Yes/No]
* Which bank has it? (only if: Do you already have a letter of credit limit? = Yes)
* Amount of the limit (only if: Do you already have a letter of credit limit? = Yes)
* Can you pay the full amount as cash margin? (only if: Do you already have a letter of credit limit? = No) [Yes/Part of it/No]
* By when do you need it? [Within a week/Within a month/Later]
* How is your business set up? [Proprietorship/Partnership/LLP/Private limited company/Limited company]
* What does your business do? [Manufacturing/Trading or distribution/Retail/Services/Export or import/Construction/Healthcare/Other]
  (the expert will take the remaining 10 detail questions on the call-back)

2-BILL DISCOUNTING (ask these first, then 2-COMMON)
* Type of loan [Sales Bill Discounting/Supplier Bill Discounting/LC Bill Discounting/Invoice Discounting/Factoring/Vendor / Dealer Finance/TReDS Invoice Financing]
* Location
* How is your business set up? [Proprietorship/Partnership/LLP/Private limited company/Limited company]
* What does your business do? [Manufacturing/Trading or distribution/Retail/Services/Export or import/Construction/Healthcare/Other]
* How long has the business been running? [Less than 2 years/2 to 3 years/3 to 5 years/5 to 10 years/More than 10 years]
* Value of invoices you raise every month
* How long do customers take to pay? [Up to 30 days/30 to 60 days/60 to 90 days/More than 90 days]
* How many customers make up most of your sales? [1 or 2/3 to 5/6 to 10/More than 10]
* Are your main customers large, well-known companies? [Yes/A mix/Mostly small businesses]
* Are any invoices overdue by more than 90 days? [Yes/No]
* Are the invoices raised against confirmed purchase orders? [Yes, all/Some/No]
* Do your buyers formally accept the invoices? [Yes, all/Some/No]
* Are the receivables domestic or export? [Domestic/Export/Both]
* Do you already discount bills or have a cash credit or overdraft? [Yes/No]
  (the expert will take the remaining 11 detail questions on the call-back)

2-UNSECURED DOD (ask these first, then 2-COMMON)
* Type of loan [Unsecured Drop-Line Overdraft/Unsecured Overdraft/Unsecured Overdraft Balance Transfer/Unsecured Overdraft Top-Up/Unsecured Overdraft Balance Transfer + Top-Up]
* Location
* Type of income (salaried or self-employed) [Salaried/Self-Employed]
* How is your business or practice set up? (only if: Type of income (salaried or self-employed) = Self-Employed) [Professional (doctor, CA, architect, etc.)/Proprietorship/Partnership or LLP/Private limited company/Limited company]
* What does your business do? (only if: Type of income (salaried or self-employed) = Self-Employed) [Manufacturing/Trading or distribution/Retail/Services/Export or import/Construction/Healthcare/Other]
* How long has it been running? (only if: Type of income (salaried or self-employed) = Self-Employed) [Less than 3 years/3 to 5 years/5 to 10 years/More than 10 years]
* Your main bank
* Average balance you keep in the account
* Average amount that comes into the account every month
* Any cheque returns or missed instalments in the last 6 months? [No/Yes, once or twice/Yes, more often]
* Any overdue or adverse remark on your present credit facilities? [Yes/No]
* Please give brief details (only if: Any overdue or adverse remark on your present credit facilities? = Yes)
* Is this a new limit or a move from another lender? [A fresh limit/Move my present overdraft or loan/Move it and add more funding]
* Which lender has it now? (only if: Is this a new limit or a move from another lender? = Move my present overdraft or loan/Move it and add more funding)
  (the expert will take the remaining 13 detail questions on the call-back)

2-EDUCATION INFRASTRUCTURE LOAN (ask these first, then 2-COMMON)
* Type of loan [Unsecured Funding for Schools/Secured Funding for Schools/Funding for Higher Education Institutions/Not sure which suits us]
* Location
* How is the institution run? [Trust/Society/Private limited company/Section 8 / not-for-profit company/Partnership or LLP/Proprietorship/Other]
* What kind of institution is it? [School/College or higher education institute/Other]
* Which board is the school affiliated to? (only if: What kind of institution is it? = School) [CBSE/ICSE/IB/State Board/More than one board/Other]
* Which university, council or body is it affiliated to? (only if: What kind of institution is it? = College or higher education institute/Other)
* Which courses does it run? (only if: What kind of institution is it? = College or higher education institute) [B.Ed/Pharmacy/Nursing/Management/More than one of these/Other]
* How many students does it have? [Less than 200/200 to 300/300 to 400/More than 400]
* How long has it been running? [Less than 3 years/3 to 5 years/More than 5 years]
* Who owns the land and building it runs from? [The institution owns both/The institution owns the building on leased land/Rented premises/Other]
* Total yearly income of the institution (fees and other receipts)
* Surplus after expenses (last financial year)
* For how many years are the audited accounts ready? [None/1 year/2 years/3 years or more]
* Income tax returns filed for how many years? [None/1 year/2 years/3 years or more]
  (the expert will take the remaining 15 detail questions on the call-back)

2-CAR REFINANCE (ask these first, then 2-COMMON)
* Type of loan [Loan Against Car/Car Loan Balance Transfer/Car Loan Top-Up/Car Loan Balance Transfer + Top-Up]
* Location
* Which car do you own?
* How old is it? [Less than 3 years/3 to 5 years/5 to 8 years/More than 8 years]
* Is the car registered in your own name? [Yes/No]
* What do you think the car is worth today?
* Is there a loan on the car now? [Yes/No]
* Which lender? (only if: Is there a loan on the car now? = Yes)
* Present EMI on the car loan (only if: Is there a loan on the car now? = Yes)
* Interest rate on the car loan (only if: Is there a loan on the car now? = Yes)
* Amount still to be repaid (only if: Is there a loan on the car now? = Yes)
* Do you want this loan taken over as part of the new one? (only if: Is there a loan on the car now? = Yes) [Yes/No]
* What is the money for? [A business need/A personal need/Repaying other loans/Medical need/Other]
* Please say what it is for (only if: What is the money for? = Other)
  (the expert will take the remaining 5 detail questions on the call-back)

2-COMMERCIAL VEHICLE (ask these first, then 2-COMMON)
* Type of loan [New Commercial Vehicle Loan/Used Commercial Vehicle Loan/Commercial Vehicle Balance Transfer/Commercial Vehicle Top-Up]
* Location
* What kind of vehicle? [Truck/Tipper/Bus or passenger vehicle/Small commercial vehicle or tempo/Tanker/Transit mixer/Trailer or tractor-trailer/Other]
* Is it new or used? [New/Used]
* How old is it? (only if: Is it new or used? = Used) [Less than 3 years/3 to 5 years/5 to 8 years/More than 8 years]
* Price of the vehicle
* Down payment you can make
* How will it earn? [Carrying my own goods/Hired out as a transport service/Under a contract with a company/Carrying passengers]
* Do you have the permit or route papers? [Yes/Applying for them/Not needed]
* How are you set up? [An individual transporter/Proprietorship/Partnership/Company]
* Years of experience in transport or this business [Less than 1 year/1 to 3 years/3 to 5 years/More than 5 years]
* How many vehicles do you already own? [None/1 or 2/3 to 5/More than 5]
* Are those vehicles under loan? (only if: How many vehicles do you already own? = 1 or 2/3 to 5/More than 5) [Yes, some/No, they are fully paid for]
* Is your business registered under GST? [Yes, and returns are filed regularly/Yes, but returns are irregular/No, GST does not apply to me]
  (the expert will take the remaining 10 detail questions on the call-back)

2-LOAN AGAINST SECURITIES (ask these first, then 2-COMMON)
* Type of loan [Loan Against Shares/Loan Against Mutual Funds/Loan Against ETFs/Loan Against Bonds and Government Securities]
* Location
* What would you like to pledge? [Shares/ETFs/Mutual funds/Bonds/A promoter's shares in a company]
* Which bank, demat account or fund house holds them?
* Do you have a recent portfolio statement? [Yes/No]
* Approximate market value of everything you would pledge
* Are they all held in your own name? [Yes/Some are held jointly/No]
* Is any of it already pledged for another loan? [Yes/No]
* Have you checked that your holdings are on a lender's approved list? [Yes/No, please check for me]
* What will you use the money for? [A personal need/A business need/Investing/Short-term cash flow/Other]
* Please say what it is for (only if: What will you use the money for? = Other)
* How will you use the limit? [Draw and repay as needed/Draw once and repay later/Not sure]
* When do you need it? [Immediately/Within a month/In 1 to 3 months/Just exploring]
* Type of income (salaried or self-employed) [Salaried/Self-Employed/Retired or an investor]
  (the expert will take the remaining 4 detail questions on the call-back)

2-PROFESSIONAL LOAN (ask these first, then 2-COMMON)
* Type of loan [Professional Loan/Doctor Loan/CA / CS Loan/Architect and Engineer Loan/Practice Setup Loan/Equipment Purchase Loan/Professional Overdraft]
* Profession [Doctor or dentist/Chartered Accountant/Company Secretary/Architect/Engineer/Lawyer]
* Location
* Are you registered with your professional body or council? [Yes/Applied/No]
* Years in practice [Less than 2 years/2 to 5 years/5 to 10 years/More than 10 years]
* How do you practise? [My own practice/Partner in a firm/Consultant or visiting practitioner]
* Do you own the practice premises? (only if: How do you practise? = My own practice/Partner in a firm) [Yes, I own them/Rented/Shared or provided by a hospital or firm]
* Gross receipts from your practice last financial year
* ITR filed for how many years? [None/1 year/2 years/3 years or more]
* Do you have 12 months of practice bank statements? (only if: ITR filed for how many years? = None) [Yes/No]
* Net income as shown in the ITR (last financial year) (only if: ITR filed for how many years? = 1 year/2 years/3 years or more)
* Average amount that comes into your practice accounts every month
* What is the loan for? [Setting up or moving a practice/Buying equipment/Working capital/Personal need/Other]
* Please say what it is for (only if: What is the loan for? = Other)
  (the expert will take the remaining 6 detail questions on the call-back)

2-PRIVATE FUNDING (ask these first, then 2-COMMON)
* Type of loan [Private Business Funding/Short-Term Working Capital Funding/Business Opportunity Funding/Obligation Funding/Top-Up for Repeat Customers]
* Industry [Manufacturing/Trading or distribution/Retail/Services/IT and software/Healthcare/Education/Real estate and construction/Transport and logistics/Hospitality and food/Agriculture/Export or import]
* Location
* How is your business set up? [Proprietorship/Partnership/LLP/Private limited company/Limited company/Other]
* How long has the business been running? [Less than 3 years/3 to 5 years/5 to 10 years/More than 10 years]
* Latest annual turnover
* Net profit last financial year
* Are your ITRs with CA-certified financials ready for the last 3 years? [Yes, all 3 years/Some years/No]
* Are your GSTR-3B returns filed for the last 12 months? [Yes/Mostly/No/GST does not apply to me]
* Do you have 12 months of business bank statements? [Yes/No]
* What is the funding for? [Working capital/Business expansion/Short-term cash flow/Buying stock/A business opportunity/An existing business obligation/Other]
* Please say what it is for (only if: What is the funding for? = Other)
* For how long do you need the money? [Up to 4 months/4 to 6 months/6 to 8 months/Longer than 8 months]
* How soon do you need the funds? [Within 48 hours/Within a week/Within a month]
  (the expert will take the remaining 12 detail questions on the call-back)
```

## F. Post-call analysis (Block 2): add these two fields

Put them next to `"phone_number"`. The names must stay exactly as written, because the CRM reads them.

```
  "work_phone_number": "a separate number the person gave for their work, digits only, else null",
  "callback_phone_number": "a number the person asked to be called back on, if it is not the number they called from, digits only, else null",
```

`full_name` should be the applicant's name as the person said it (see B). Keep `phone_number` as the number the call came from.

## G. What the CRM does with them

- **Work number:** saved as the lead's second number, but only when the lead has none yet. A number staff entered is never replaced, and the number the person called from stays the main one.
- **Call-back number:** also saved as the second number (if it is still empty) and written into the lead's note ("CALL BACK ON ..."). The follow-up email to the team shows it in its own row ("Call back on"), along with the second number.
- **No other number given:** nothing changes. The team rings the number the person called from.
- **Name:** the lead is created under the name the person gave. If the same phone belongs to another lead with a different name, the existing rule applies: a separate lead is made, flagged as a shared phone. The note starts with "Name given on the call: ..." and everything after it is about that person.
- Not done: nothing in the CRM yet understands a call about two different people. The second person's name and need are only in the transcript and "key concerns".

## H. Test calls before going live

Use your own phone and read the transcript and the lead afterwards.

1. **Work number:** say a second number for work. The lead should show it as the second number, and the main number should be the one you called from.
2. **No second number:** say "this number is fine". Nothing extra should be saved.
3. **Call-back number:** ask to be called on another number. The note should say "CALL BACK ON ..." and the follow-up email should show it.
4. **Calling for a relative:** say your father needs a loan. The lead should carry your father's name.
5. **Firm Round 2:** choose a loan from E (for example a machine loan) and do not volunteer details. The agent should carry on question after question without asking permission each time, and stop at once if you say you are busy.
6. **Stopping:** say "I have no time" in the middle. It should offer a call-back time and close politely.

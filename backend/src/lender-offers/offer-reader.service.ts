import { verifyReadings, type Checks } from "./offer-verify";
import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeExtraction, type Extraction } from "./offer-extraction";
import { sheetPromptLines } from "../lender-policies/policy-sheet-schema";

export type OfferInput = {
  text?: string;
  file?: { buffer: Buffer; mime: string; name: string };
  /** Pictures taken out of a Word file, read together with its text. */
  images?: { buffer: Buffer; mime: string }[];
};

/** Reads a lender's flyer, poster or forwarded message and says what it offers. It reads; it never decides. */
const BOX_PASS = `HOW TO READ THIS TIME: go through the page ONE BOX OR SECTION AT A TIME, in order. A program's figures come ONLY from inside its own box; never take a figure from a neighbouring box or from a heading above it. If a box does not print a figure, leave it null.`;

@Injectable()
export class OfferReaderService {
  private readonly log = new Logger("OfferReader");

  constructor(private config: ConfigService) {}

  get enabled() {
    return Boolean((this.config.get<string>("OPENAI_API_KEY") ?? "").trim());
  }

  private prompt(products: { slug: string; name: string }[]) {
    return `You read lender flyers, posters and forwarded WhatsApp messages for Growth Capital Services, a loan DSA in Mumbai.
The text may be in English, Hindi or Marathi. Return one JSON object and nothing else.

First decide "kind":
- "LENDER_OFFER": a bank, NBFC or private funder advertising loan products with terms. A page from a lender's product or credit-policy document (norms, eligibility, go/no-go criteria for a programme) is also a LENDER_OFFER: make one entry per programme and put its criteria in "notes".
- "SERVICE_PROVIDER": a company selling a service (credit-score repair, CIBIL or CMR improvement, advisory, software). It lends nothing.
- "OTHER": anything else (a festival-souvenir advert for a logistics or engineering firm, a greeting, a random message).

JSON shape:
{
 "kind": "LENDER_OFFER" | "SERVICE_PROVIDER" | "OTHER",
 "summary": one plain sentence on what this is,
 "lenderName": the company's name as printed, or null. Read it from the logo, a watermark, the signature block or the email domain too (an email at godrejcapital.com means Godrej Capital; a logo reading CLIX means CLIX). null only when nothing on the page names the company,
 "policySheet": an object holding ONLY the keys below that the page states (see "The policy one-pager" at the end); leave a key out when the page does not say it. Home Loan and LAP figures go under their own keys, never mixed.
 "validTill": the last day the offer holds as YYYY-MM-DD when the page prints one ("valid till 30th Sep'26" is 2026-09-30), else null,
 "lenderType": "BANK" | "NBFC" | null (null when unsure),
 "website": string | null,
 "address": the lender's own office address as printed, or null,
 "city": the city of that address, or null,
 "contacts": [{"name": string|null, "designation": string|null, "phone": string|null, "email": string|null}],
 "offers": [ one entry per product or scheme on the page, only when kind is LENDER_OFFER:
   {"scheme": the product's printed name or null,
    "productSlug": one slug from the list below, or null if none fits,
    "minAmount": rupees as a number, "maxAmount": rupees as a number,
    "minRate": percent, "maxRate": percent, "ratePeriod": "YEAR" | "MONTH",
    "minTenureMonths": number, "maxTenureMonths": number,
    "rateType": "FIXED" | "FLOATING" | null,
    "processingFee": string | null,
    "employmentTypes": any of "Salaried","Self-employed","Professional","Business",
    "gstRequired": true | false | null (false only when the page says GST is not required),
    "minCreditScore": number | null,
    "allIndia": true | false | null, "cities": [string],
    "ltv": string | null, "documents": [string], "charges": string | null, "turnaround": string | null, "notes": string | null,
    "minAge": years or null, "maxAge": years or null,
    "minTurnover": the amount exactly as printed with its unit, for example "50 Cr" or "75 Cr", or null, "minVintageMonths": number or null, "foirPct": percent or null,
    "who": one short sentence on who the scheme is for and how income is judged, or null,
    "conditions": an object with ONLY these keys, each only when printed: "rating" (text), "dscr" (number), "guarantee" (text), "security" (text), "collateralMarginPct" (number), "chargeOnAssets" (text), "drawingPower" (text), "payableDays" (number), "moratoriumMonths" (number), "fundingPct" (number), "endUse" (text), "sectors" (text), "profiles" (text), "cibilPolicy" (text), "specialFeatures" (text), "payoutNote" (text)},
    "evidence": an object giving, for every figure you filled in (use the same field names: minAmount, maxAmount, minRate, maxRate, minTenureMonths, maxTenureMonths, ltv, minAge, maxAge, minTurnover, minVintageMonths, foirPct, minCreditScore, processingFee), the EXACT words printed on the page that the figure came from, copied letter for letter (for example "maxAmount": "Loan up to ₹1 Crore"). Never invent a quote.
 ]
}

Rules:
- Use only what is printed. If a figure is not there, use null. Never guess, never calculate, never fill in a typical value.
- Amounts are rupees as plain numbers (10 Lacs = 1000000, 50 Crs = 500000000). Tenure is in months (7 years = 84). A rate quoted "per month" gets ratePeriod "MONTH".
- When the page shows a range ("23% to 24%", "12 to 60 months"), give both ends.
- "rateType" only when the page says fixed or floating. "Reducing" is not the same thing: leave rateType null.
- "employmentTypes" only when the page names who can apply (salaried, self-employed...). "Corporates, builders, traders" is a description of customers, not an entry. "allIndia" true only when the page says all India, pan India or nationwide; "cities" only cities printed as where it is available.
- A pricing tier such as "cases above 5 crore get 8.50%" is a rate for large loans, not the product's minimum amount: leave minAmount null unless the page states the smallest loan.
- Balance transfer, "BT" and top-up offers use "balance-transfer", even when the page calls them home-loan BT or HLBT.
- "notes" is for everything else the page states about a scheme that has no field above, kept short and in plain words (up to about 400 characters): age limits, business vintage, FOIR, special rates by employment type ("9.5% salaried, 10% self-employed"), login fee, eligibility and go/no-go rules, who is excluded. Copy figures exactly. Do not leave a printed figure out just because it has no field.
- "ltv" is only the loan-to-value percentage as printed ("85% up to 30 lakhs; LAP 70%", "55% - 75%"). Property types and documents (Registered Sale Deed, Namuna 8, 7/12) are not LTV: put them in "documents" or "notes".
- A placeholder such as "up to ₹X crore", "XX%" or lorem-ipsum text is not a figure. Treat it as missing.
- "minCreditScore" is the lowest CIBIL score the page asks for ("Consumer CIBIL: Min 720" is 720). When it changes with the loan size, use the lowest and put the rest in notes.
- "Up to 15 years" or "up to 25 lakh" gives only the maximum: leave the minimum null. Never write 1 or 0 as a minimum.
- A table of slabs or bands (for example loan sizes 0-15, 15-30, 30-75, 75 above, each with its own rate) is a rate grid, not the product's loan amount: give the lowest and highest rate across the grid, leave the amounts null, and put the slab breakdown in "notes".
- A scheme with no figures or conditions at all, only a name, still goes in, but only when the page lists it as a product.
- Several photos or screenshots can be pages of one document: read each page on its own and fill in what that page says.
- Phone numbers and emails exactly as printed. Do not copy a fax number as a phone number.
- "Login fees", "legal and valuation charges" and similar go in "charges". "4 days" or "24 to 48 hours" goes in "turnaround".
- The policy one-pager: "policySheet" is for Home Loan and Loan Against Property policy details a lender states. Fill a key only from what is printed, as printed (amounts in rupees as numbers, percents as numbers, text as written). Do not copy a general statement into several keys, and do not turn a Home Loan figure into a LAP figure or the other way round. A rate quoted as "x% onwards" or as a range goes in the ROI text key as written. "productsOpen" lists only products the page says are open or available; a product the page says is NOT offered goes in none of the keys, and "productsOpenOther" is only for an extra product that IS open. Keys:
${sheetPromptLines()}
- PROGRAMS: when a page lists several named programs or schemes under headline products (for example "Salaried Customer Program", "SAM", "Banking Program", "Low LTV Program", "PMP - LIP" and "ITR Program" under "Home Loan | Loan Against Property | Commercial Purchase"), every program is its own entry in "offers" with its own figures. Its "productSlug" is the FIRST headline product's slug ("home-loan" here). Never leave it null just because the program does not repeat the product name. Name the other headline products it applies to in "notes".
- SEPARATE PRODUCTS stay separate entries and are never combined: for example working capital demand loan, sales invoice discounting, unsecured purchase invoice discounting, secured purchase invoice discounting, term loan, LAP and machinery purchase are seven entries. Slug hints: invoice, bill or purchase-invoice discounting is "bill-discounting"; machinery or equipment purchase is "machine-loan"; working capital demand loan or WCDL is "working-capital-term-loan"; cash credit is "cash-credit"; overdraft is "overdraft-limit"; lease rental discounting is "lease-rental-discounting"; LAP and commercial or industrial property purchase is "loan-against-property"; a term loan for business expansion or factory set-up is "business-loan".
- Tenure: "Max Tenure 5 yrs" is maxTenureMonths 60. Do not leave a tenure only in "notes". "Tenure: 20 Years" is 240.
- "minTurnover" is the smallest annual turnover the borrower needs, written exactly as printed with its unit ("Turnover Rs 50 Cr & above" is "50 Cr"). Do not convert it to a plain number yourself. "foirPct" is the highest FOIR allowed ("FOIR up to 90%" is 90). "minVintageMonths" is the least business vintage in months ("3 years" is 36). "minAge" and "maxAge" are in years ("Min Age 25, Max Age 70").
- "conditions": "Rating BBB- & above" is rating "BBB- and above"; "PG/CG required" is guarantee "Personal and corporate guarantee required"; "Minimum Security Collateral 20% FD Margin" is collateralMarginPct 20 and security "FD margin"; "Charge on Current Assets" is chargeOnAssets "Required" and "Charge on Current Assets are not reqd" is "Not required"; "Drawing Power (DP) required" is drawingPower "Required"; "Maximum 120 days payable" is payableDays 120; "3 Month Moratorium" is moratoriumMonths 3; "Up to 85% funding against machinery value" is fundingPct 85; "Manufacturing Only" or "Sales only to Reliance group" is sectors; a list of customer types the page accepts (drivers, tailors, shop owners, freelancers) is profiles; "if CIBIL is low, with proper justification we help" is cibilPolicy; funding without APF, 24x7 service and similar selling points are specialFeatures; "Pay-out can be extended till Rs 50L" is payoutNote.
- For the policy one-pager ("policySheet"): when the page lists a Banking program, a Low-LTV program, a LIP program or an income-surrogate program, set bankingProgram, lowLtvProgram, lipProgram or aipProgram to "Yes". "Rent considered" is rentalIncome "Yes". A line on low CIBIL goes in cibilDeviation. A processing fee quoted in percent ("1% - 1.50%") is a PERCENT: it goes in the percent keys for salaried or self-employed Home Loan or LAP only when the page ties it to them, otherwise in "processingFee". The rupee boxes pfMin and pfMax never take a percentage.
- Loan types we offer (slug: name):
${products.map((p) => `  ${p.slug}: ${p.name}`).join("\n")}`;
  }

  async read(input: OfferInput, products: { slug: string; name: string }[]): Promise<Extraction> {
    if (!this.enabled) throw new BadRequestException("The AI reader is not switched on: the OpenAI key is missing on the server.");
    const content: Record<string, unknown>[] = [{ type: "input_text", text: this.prompt(products) }];
    if (input.text?.trim()) content.push({ type: "input_text", text: `Message to read:\n\n${input.text.trim().slice(0, 60_000)}` });
    for (const img of input.images ?? []) content.push({ type: "input_image", image_url: `data:${img.mime};base64,${img.buffer.toString("base64")}` });
    if (input.file) {
      const uri = `data:${input.file.mime};base64,${input.file.buffer.toString("base64")}`;
      content.push(input.file.mime === "application/pdf" ? { type: "input_file", filename: input.file.name.slice(0, 100), file_data: uri } : { type: "input_image", image_url: uri });
    }
    if (content.length < 2) throw new BadRequestException("Send a picture, a PDF or some text to read.");

    const kind: Checks["input"] = input.text?.trim() ? "text" : input.file?.mime === "application/pdf" ? "pdf" : "image";
    const slugs = new Set(products.map((p) => p.slug));
    // Two independent readings: the second goes through the page one box at a time. Where they differ, nothing is trusted.
    const second = content.map((c, n) => (n === 0 ? { ...c, text: `${c.text as string}

${BOX_PASS}` } : c));
    const [a, b] = await Promise.allSettled([this.call(content), this.call(second)]);
    if (a.status === "rejected" && b.status === "rejected") throw a.reason;
    const first = a.status === "fulfilled" ? a.value : (b as PromiseFulfilledResult<unknown>).value;
    const other = a.status === "fulfilled" && b.status === "fulfilled" ? b.value : null;
    return verifyReadings(normalizeExtraction(first, slugs), other ? normalizeExtraction(other, slugs) : null, kind);
  }

  private async call(content: Record<string, unknown>[]): Promise<unknown> {
    const model = this.config.get<string>("OFFER_READER_MODEL")?.trim() || "gpt-4.1-mini";
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.get<string>("OPENAI_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({ model, input: [{ role: "user", content }], text: { format: { type: "json_object" } }, temperature: 0, max_output_tokens: 16000 }),
        signal: AbortSignal.timeout(240_000),
      });
    } catch (err) {
      this.log.error(`Reading a flyer failed: ${(err as Error).message}`);
      throw new BadGatewayException("The reader did not answer in time. Try again.");
    }
    if (!res.ok) {
      this.log.error(`The AI refused a flyer (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
      throw new BadGatewayException("The reader could not read that file. Try a clearer picture or paste the text.");
    }
    const body = (await res.json()) as { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
    const out = (body.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
    let parsed: unknown;
    try {
      parsed = JSON.parse(out ?? "");
    } catch {
      this.log.error("The reader's answer was not valid JSON");
      throw new BadGatewayException("The reader gave an answer that could not be used. Try again.");
    }
    return parsed;
  }
}

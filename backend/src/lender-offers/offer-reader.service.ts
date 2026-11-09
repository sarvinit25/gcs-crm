import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeExtraction, type Extraction } from "./offer-extraction";

export type OfferInput = {
  text?: string;
  file?: { buffer: Buffer; mime: string; name: string };
  /** Pictures taken out of a Word file, read together with its text. */
  images?: { buffer: Buffer; mime: string }[];
};

/** Reads a lender's flyer, poster or forwarded message and says what it offers. It reads; it never decides. */
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
    "ltv": string | null, "documents": [string], "charges": string | null, "turnaround": string | null, "notes": string | null}
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
- A scheme with no figures or conditions at all, only a name, still goes in, but only when the page lists it as a product.
- Several photos or screenshots can be pages of one document: read each page on its own and fill in what that page says.
- Phone numbers and emails exactly as printed. Do not copy a fax number as a phone number.
- "Login fees", "legal and valuation charges" and similar go in "charges". "4 days" or "24 to 48 hours" goes in "turnaround".
- Loan types we offer (slug: name):
${products.map((p) => `  ${p.slug}: ${p.name}`).join("\n")}`;
  }

  async read(input: OfferInput, products: { slug: string; name: string }[]): Promise<Extraction> {
    if (!this.enabled) throw new BadRequestException("The AI reader is not switched on: the OpenAI key is missing on the server.");
    const content: Record<string, unknown>[] = [{ type: "input_text", text: this.prompt(products) }];
    if (input.text?.trim()) content.push({ type: "input_text", text: `Message to read:\n\n${input.text.trim().slice(0, 20_000)}` });
    for (const img of input.images ?? []) content.push({ type: "input_image", image_url: `data:${img.mime};base64,${img.buffer.toString("base64")}` });
    if (input.file) {
      const uri = `data:${input.file.mime};base64,${input.file.buffer.toString("base64")}`;
      content.push(input.file.mime === "application/pdf" ? { type: "input_file", filename: input.file.name.slice(0, 100), file_data: uri } : { type: "input_image", image_url: uri });
    }
    if (content.length < 2) throw new BadRequestException("Send a picture, a PDF or some text to read.");

    const model = this.config.get<string>("OFFER_READER_MODEL")?.trim() || "gpt-4.1-mini";
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.get<string>("OPENAI_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({ model, input: [{ role: "user", content }], text: { format: { type: "json_object" } }, temperature: 0, max_output_tokens: 4000 }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      this.log.error(`Reading a flyer failed: ${(err as Error).message}`);
      throw new BadGatewayException("The reader did not answer in time. Try again.");
    }
    if (!res.ok) {
      this.log.error(`The AI refused a flyer (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
      throw new BadGatewayException("The reader could not read that file. Try a clearer picture or paste the text.");
    }
    const body = (await res.json()) as { output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
    const out = (body.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
    let parsed: unknown;
    try {
      parsed = JSON.parse(out ?? "");
    } catch {
      this.log.error("The reader's answer was not valid JSON");
      throw new BadGatewayException("The reader gave an answer that could not be used. Try again.");
    }
    return normalizeExtraction(parsed, new Set(products.map((p) => p.slug)));
  }
}

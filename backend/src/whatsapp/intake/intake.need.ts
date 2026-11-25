// Working out WHICH loan a customer needs from what they say they need, when they never name a product ("I want to buy a flat",
// "money against my shop", "my daughter's masters in Canada", "mujhe ghar kharidna hai"). Two uses:
//  - the AI is told what each loan is FOR, so it can match a need to a loan by meaning;
//  - this file also reads the words itself, and only when one loan clearly wins, so a clear need never falls back to
//    "which loan do you want?" just because the AI hesitated. An unclear need stays unclear: the customer is asked.

type Signal = [RegExp, number];
type Rule = { purpose: string; signals: Signal[] };

const PLACE = "(?:property|flat|house|shop|office|building|plot|land|home|gala|godown|warehouse|showroom)";
const MONEY = "(?:loan|money|funds?|paisa|finance|cash|credit|lump ?sum)";

/** What each loan is for, in plain words (shown to the AI), and the words that point to it (read in code). Weights: 4-5 explicit, 3 strong, 1-2 hint. */
export const NEED_RULES: Record<string, Rule> = {
  "home-loan": {
    purpose: "buying, building, extending or renovating a house or flat to live in (including an under-construction flat or a plot with construction)",
    signals: [
      [/\b(home|housing) loan\b|\bghar (ka )?loan\b/, 4],
      [new RegExp(`\\b(buy|purchase|buying|purchasing|lena|kharid\\w*|book|booking)\\b.{0,30}\\b(flat|house|home|apartment|bungalow|villa|row ?house|ghar)\\b`), 3],
      [/\b(flat|house|apartment|bungalow|villa|ghar)\b.{0,25}\b(buy|purchase|lena|kharid\w*)\b/, 3],
      [/\b(construct|construction|build|building)\b.{0,25}\b(house|home|bungalow|villa)\b/, 3],
      [/\b(renovat\w*|extension|extend|repair)\b.{0,25}\b(house|home|flat)\b/, 2],
      [/\bunder[- ]construction (flat|property|home)\b/, 3],
      [/\b(new|first|own) (flat|home|house)\b/, 2],
    ],
  },
  "balance-transfer": {
    purpose: "moving an existing home loan to another bank for a lower rate or better terms, with or without extra money (top-up) on it",
    signals: [
      [/\bbalance transfer\b/, 5],
      [/\b(transfer|shift|switch|move|take ?over)\b.{0,30}\b(loan|emi)\b/, 3],
      [/\b(loan|emi)\b.{0,30}\b(transfer|shift|switch)\b/, 3],
      [/\b(transfer|shift|switch|move)\w*\b.{0,40}\b(another|other|different|new|better) bank\b/, 4],
      [/\b(lower|reduce|less|kam)\b.{0,20}\b(interest|rate|byaj|roi)\b.{0,30}\b(existing|current|my) (home )?loan\b/, 2],
      [/\btop[- ]?up\b/, 2],
    ],
  },
  "loan-against-property": {
    purpose: "a one-time lump sum against a property the customer already owns (house, flat, shop, office, plot), for any purpose",
    signals: [
      [new RegExp(`\\b${MONEY}\\b.{0,25}\\b(against|on|par|mortgage|mortgaging)\\b.{0,20}\\b(my |our |the )?${PLACE}\\b`), 3],
      [new RegExp(`\\b${PLACE}\\b.{0,15}\\b(par|pe|against|ke upar|ke against)\\b.{0,15}\\b${MONEY}\\b`), 3],
      [/\blap\b|\bmortgage loan\b|\bproperty loan\b|\bloan against property\b/, 4],
      [/\bmortgag(e|ing)\b.{0,20}\b(my|our)\b/, 2],
    ],
  },
  "micro-lap": {
    purpose: "a small loan against a property the customer owns",
    signals: [
      [/\bmicro[- ]?lap\b|\bmicro loan against property\b/, 5],
      [new RegExp(`\\bsmall (loan|amount)\\b.{0,30}\\bagainst\\b.{0,20}\\b${PLACE}\\b`), 3],
    ],
  },
  "lease-rental-discounting": {
    purpose: "a loan against the rent a leased commercial property earns, repaid from the rent",
    signals: [
      [/\blease rent(al)?\b|\blrd\b|\brent(al)? discounting\b/, 5],
      [/\bagainst (the )?rent(al)?( income| receivables?)?\b|\brent receivables?\b/, 4],
      [/\b(tenants?)\b.{0,30}\b(rent|lease)\b|\bcommercial property\b.{0,40}\b(rent|rented|leased|tenant)/, 2],
    ],
  },
  dlod: {
    purpose: "an overdraft limit against a property: draw money as needed, repay when convenient, and pay interest only on what is used, with no fixed EMI",
    signals: [
      [/\bdlod\b|\bdrop[- ]?line\b/, 5],
      [/\boverdraft\b.{0,30}\b(against|on|with)\b.{0,15}\b(property|flat|shop|office|house)\b/, 5],
      [/\bpay interest (only )?on (what|the amount|only what)\b.{0,15}\b(use|used|withdraw|withdrawn|take)\b/, 4],
      [/\b(draw|withdraw|use)\b.{0,25}\b(as (and when )?(needed|required)|when (i )?need)\b/, 2],
    ],
  },
  "project-funding": {
    purpose: "finance for a builder or developer's real estate project",
    signals: [
      [/\bproject (funding|finance|loan)\b|\bconstruction finance\b|\breal estate project\b|\bredevelopment\b/, 4],
      [/\b(builder|developer|developing)\b.{0,30}\b(project|funding|finance|loan)\b/, 3],
    ],
  },
  "personal-loan": {
    purpose: "an unsecured loan for personal needs such as a wedding, medical bills, travel or an emergency",
    signals: [
      [/\bpersonal loan\b/, 5],
      [/\b(wedding|marriage|shaadi|medical|hospital|treatment|holiday|vacation|trip|travel|emergency|festival)\b.{0,40}\b(loan|expenses?|cost|money|paisa|funds?)\b/, 3],
      [/\b(loan|money|funds?)\b.{0,30}\b(wedding|marriage|shaadi|medical|treatment|holiday|vacation|emergency)\b/, 3],
      [/\bpersonal (need|use|expense)s?\b/, 2],
    ],
  },
  "loan-consolidation": {
    purpose: "combining several running loans or EMIs into one loan with one EMI",
    signals: [
      [/\b(consolidat|combine|club|merge|clubbing)\w*\b.{0,30}\b(loan|loans|emi|emis|debt|debts)\b/, 5],
      [/\b(multiple|many|several|too many|saare)\b.{0,15}\b(loans?|emis?)\b/, 3],
      [/\bsingle emi\b|\bone emi\b|\bdebt consolidation\b/, 4],
    ],
  },
  "business-loan": {
    purpose: "money to run or grow a business: expansion, stock, raw material, a new outlet or general business needs",
    signals: [
      [/\bbusiness loan\b/, 5],
      [/\b(expand|expansion|grow|growth|scale|set ?up|start|starting|open|opening)\b.{0,30}\b(business|shop|firm|company|unit|factory|showroom|store|outlet)\b/, 3],
      [/\b(business|vyapar|dhandha|dhanda)\b.{0,25}\b(loan|funds?|funding|money|paisa|capital|finance)\b/, 3],
      [/\b(inventory|raw material)\b/, 2],
      [/\bbusiness (need|purpose|use|expansion)s?\b/, 2],
    ],
  },
  "micro-business-loan": {
    purpose: "a small loan for a very small business such as a shop, stall, kirana store, salon or street vendor",
    signals: [
      [/\bmicro (business )?loan\b|\bmudra\b/, 5],
      [/\b(small|tiny|chhota|chota)\b.{0,15}\b(business|shop|dukaan|dukan|vendor|stall|kirana|trader)\b/, 3],
      [/\b(kirana|street vendor|tea stall|pani puri|tiffin|tailor|salon|parlour|thela)\b/, 3],
    ],
  },
  cgtmse: {
    purpose: "a collateral-free business loan for a small or micro enterprise under the government's credit guarantee scheme",
    signals: [
      [/\bcgtmse\b|\bcgtsi\b|\bcredit guarantee (scheme|fund)\b/, 5],
      [/\b(collateral[- ]?free|without (any )?(collateral|security|property)|no collateral)\b.{0,40}\b(business|msme|loan)\b/, 3],
      [/\bmsme\b.{0,30}\bguarantee\b/, 3],
    ],
  },
  "machine-loan": {
    purpose: "buying machinery or equipment for a business",
    signals: [
      [/\bmachine loan\b|\bequipment (loan|finance)\b|\bmachinery loan\b/, 5],
      [/\b(buy|purchase|finance|financing|loan for)\b.{0,25}\b(machine|machinery|equipment|cnc|lathe|vmc|generator|crane|jcb|excavator|forklift)\b/, 3],
      [/\b(machine|machinery|equipment|cnc|lathe|vmc|generator|crane|jcb|excavator|forklift)\b.{0,30}\b(buy|purchase|loan|finance|lena|kharid\w*)\b/, 3],
    ],
  },
  "working-capital-term-loan": {
    purpose: "a term loan to fund the permanent part of a business's working capital",
    signals: [
      [/\bworking capital term loan\b|\bwctl\b/, 5],
      [/\b(permanent|long[- ]term|term)\b.{0,20}\bworking capital\b/, 3],
      [/\bworking capital\b/, 2],
    ],
  },
  "cash-credit": {
    purpose: "a cash credit limit against a business's stock and receivables, used and repaid as the business runs",
    signals: [
      [/\bcash credit\b|\bcc limit\b|\bcc loan\b/, 5],
      [/\b(against|on)\b.{0,15}\b(stock|stocks|inventory|debtors|receivables|book debts)\b.{0,30}\b(limit|loan|finance|funds?)\b/, 3],
      [/\bstock (and|&) (debtors|book debts)\b/, 3],
    ],
  },
  "overdraft-limit": {
    purpose: "an overdraft limit on a business's current account",
    signals: [
      [/\boverdraft\b|\bod limit\b|\bod facility\b|\bcurrent account (limit|facility)\b/, 3],
    ],
  },
  "bank-guarantee": {
    purpose: "a bank guarantee given for a tender, contract or performance",
    signals: [
      [/\bbank guarantee\b/, 5],
      [/\b(tender|performance|bid|earnest money|emd|security deposit|advance payment)\b.{0,25}\b(guarantee|bg)\b/, 4],
      [/\bguarantee\b.{0,25}\b(tender|contract|government|department|nhai|bmc)\b/, 3],
    ],
  },
  "letter-of-credit": {
    purpose: "a letter of credit for paying a supplier in trade, mainly imports",
    signals: [
      [/\bletter of credit\b|\bl\/c\b|\blc limit\b/, 5],
      [/\b(import|importing|foreign supplier|overseas supplier|trade finance)\b.{0,40}\b(payment|finance|credit|funding)\b/, 3],
    ],
  },
  "bill-discounting": {
    purpose: "getting money now against invoices or bills that customers will pay later",
    signals: [
      [/\b(bill|bills|invoice|invoices|receivables?|cheques?)\b.{0,15}\b(discounting|discount|factoring)\b/, 5],
      [/\bfactoring\b|\binvoice (funding|finance|financing)\b/, 5],
      [/\b(invoice|invoices|bills)\b.{0,30}\b(money|funds?|cash|advance)\b/, 2],
    ],
  },
  "unsecured-dod": {
    purpose: "an overdraft limit for a business without any collateral",
    signals: [
      [/\bunsecured (overdraft|dod|od)\b|\bunsecured dod\b/, 5],
      [/\boverdraft\b.{0,30}\b(without|no)\b.{0,15}\b(collateral|security|property)\b/, 5],
      [/\bdod\b/, 2],
    ],
  },
  "education-loan": {
    purpose: "paying for a course, college or university fees, in India or abroad",
    signals: [
      [/\beducation loan\b/, 5],
      [/\b(abroad|overseas|usa|uk|canada|australia|germany|ireland|singapore)\b.{0,30}\b(study|studies|education|college|university|masters?|mba|ms)\b|\b(study|studies|studying)\b.{0,20}\b(abroad|overseas)\b/, 4],
      [/\b(son|daughter|child|children|beta|beti|bacche|kid)\b.{0,40}\b(study|studies|education|college|admission|school fees|mba|masters?)\b/, 3],
      [/\b(study|studies|studying|college|university|admission|tuition|mba|masters?|degree|course fees?|semester)\b/, 2],
      [/\b(padhai|padhne|shiksha)\b/, 3],
    ],
  },
  "education-infrastructure-loan": {
    purpose: "building or expanding a school, college, institute or other education institution",
    signals: [
      [/\beducation(al)? infrastructure\b/, 5],
      [/\b(school|college|institute|institution|campus|coaching|university|trust)\b.{0,30}\b(building|infrastructure|construction|expansion|classrooms?|laborator\w+|lab|hostel)\b/, 4],
      [/\b(run|running|own|start|starting|open|opening)\b.{0,20}\b(a |an |our |my )?(school|college|coaching|institute|playschool|preschool)\b/, 3],
    ],
  },
  "new-car-loan": {
    purpose: "buying a new car or other private four-wheeler",
    signals: [
      [/\bnew car loan\b|\bcar loan\b/, 3],
      [/\b(buy|purchase|buying|purchasing|lena|kharid\w*)\b.{0,20}\b(a |an |new )?(car|suv|sedan|hatchback|four[- ]wheeler|gaadi|gadi)\b/, 3],
      [/\bnew (car|suv|four[- ]wheeler|gaadi)\b/, 3],
    ],
  },
  "used-car-loan": {
    purpose: "buying a used (second-hand) car",
    signals: [
      [/\b(used|second[- ]hand|pre[- ]?owned|old)\b.{0,15}\b(car|suv|gaadi)\b/, 5],
      [/\bused car loan\b/, 5],
    ],
  },
  "car-refinance": {
    purpose: "getting money against a car the customer already owns, or refinancing an existing car loan",
    signals: [
      [/\b(refinance|re-finance|refinancing)\b.{0,20}\b(car|vehicle)\b/, 5],
      [/\b(loan|money|cash|funds?)\b.{0,20}\b(against|on)\b.{0,10}\b(my |our )?(own |existing )?(car|gaadi)\b/, 5],
      [/\bcar (i|we) (already )?own\b/, 4],
    ],
  },
  "commercial-vehicle": {
    purpose: "buying a truck, tempo, bus, taxi, tractor or other commercial vehicle",
    signals: [
      [/\bcommercial vehicle\b/, 5],
      [/\b(truck|tempo|tipper|trailer|bus|lorry|taxi|cab|ambulance|tractor|dumper|container|pickup|auto rickshaw|e-?rickshaw|loader)\b/, 3],
      [/\b(fleet|transport business|transporter)\b/, 2],
    ],
  },
  "loan-against-securities": {
    purpose: "a loan against shares, mutual funds or other securities the customer holds",
    signals: [
      [/\b(loan|funds?|money|cash)\b.{0,30}\b(against|on|par)\b.{0,15}\b(my )?(shares?|mutual funds?|securities|demat|portfolio|bonds)\b/, 5],
      [/\b(shares?|mutual funds?|securities|demat|bonds|lamf)\b.{0,40}\b(loan|against|pledge|pledging)\b/, 4],
      [/\bpledge\b.{0,20}\b(shares|units|mutual)\b/, 4],
    ],
  },
  "professional-loan": {
    purpose: "a loan for a doctor, CA, lawyer, architect or other professional to set up or grow a practice",
    signals: [
      [/\bprofessional loan\b/, 5],
      [/\b(doctor|dentist|surgeon|physician|clinic|nursing home|chartered accountant|company secretary|lawyer|advocate|architect|consultant)\b.{0,40}\b(loan|funds?|finance|set ?up|setup|expand|practice|clinic|chamber)\b/, 3],
      [/\b(clinic|practice|chamber)\b.{0,20}\b(set ?up|setup|start|open|expand|renovat\w*)\b/, 3],
    ],
  },
  "private-funding": {
    purpose: "funding from private lenders for a case banks have turned down or cannot do in time",
    signals: [
      [/\bprivate (funding|finance|lender|lenders|investor|loan)\b/, 5],
      [/\b(bank|banks|nbfc)\b.{0,20}\b(rejected|rejecting|refused|declined|denied|said no|not giving|not approving)\b/, 3],
    ],
  },
};

export type NeedMatch = { slug: string; score: number };

/** Every loan the words point to, best first. */
export function matchNeed(text: string): NeedMatch[] {
  const t = String(text ?? "").toLowerCase();
  if (t.trim().length < 3) return [];
  const out: NeedMatch[] = [];
  for (const [slug, rule] of Object.entries(NEED_RULES)) {
    let score = 0;
    for (const [pattern, weight] of rule.signals) if (pattern.test(t)) score += weight;
    if (score > 0) out.push({ slug, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The loan the words clearly point to, or null: it must score well and beat the next one by a margin, so a doubtful need is asked, not guessed. */
export function bestNeed(text: string): string | null {
  const [first, second] = matchNeed(text);
  if (!first || first.score < 3) return null;
  return !second || first.score - second.score >= 2 ? first.slug : null;
}

/** The loans with what each is for, one per line, for the AI to match a need to a loan by meaning. */
export function loanPurposes(titleOf: (slug: string) => string): string {
  return Object.entries(NEED_RULES).map(([slug, r]) => `${slug} = ${titleOf(slug)}: ${r.purpose}`).join("\n");
}

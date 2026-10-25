import { LENDER_CONTACTS, NEW_LENDERS } from "./lender-contacts-data";
import { CHECKLIST_DOCUMENTS } from "./checklist-documents.data";
import { ChecklistApplicantType, LenderType, PrismaClient, Role } from "@prisma/client";
import { PRODUCT_CHECKLIST_ITEMS } from "./checklist-data";
import { LOAN_TYPE_ICONS, SECURED_LOAN_TYPES, loanTypeColor } from "./loan-type-looks";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mirrors src/data/products.ts on the website — slugs must match so lead intake
// can resolve a product from the form it came from.
const PRODUCTS: [slug: string, name: string, category: string][] = [
  ["home-loan", "Home Loan", "Property Finance"],
  ["balance-transfer", "Balance Transfer & Top-Up", "Property Finance"],
  ["loan-against-property", "Loan Against Property", "Property Finance"],
  ["lease-rental-discounting", "Lease Rental Discounting", "Property Finance"],
  ["dlod", "Drop-Line Overdraft (Secured)", "Property Finance"],
  ["project-funding", "Project Funding", "Property Finance"],
  ["business-loan", "Business Loan", "Business Growth"],
  ["cgtmse", "CGTMSE Funding", "Cash Flow & Trade"],
  ["machine-loan", "Machine Loan", "Cash Flow & Trade"],
  ["working-capital-term-loan", "Working Capital Term Loan", "Cash Flow & Trade"],
  ["cash-credit", "Cash Credit", "Cash Flow & Trade"],
  ["overdraft-limit", "Overdraft Limit", "Cash Flow & Trade"],
  ["bank-guarantee", "Bank Guarantee", "Cash Flow & Trade"],
  ["letter-of-credit", "Letter of Credit", "Cash Flow & Trade"],
  ["bill-discounting", "Bill Discounting", "Cash Flow & Trade"],
  ["unsecured-dod", "Unsecured DOD", "Business Growth"],
  ["personal-loan", "Personal Loan", "Personal, Education, Vehicle & Other Loans"],
  ["education-loan", "Education Loan", "Personal, Education, Vehicle & Other Loans"],
  ["new-car-loan", "New Car Loan", "Personal, Education, Vehicle & Other Loans"],
  ["used-car-loan", "Used Car Loan", "Personal, Education, Vehicle & Other Loans"],
  ["car-refinance", "Car Refinance", "Personal, Education, Vehicle & Other Loans"],
  ["commercial-vehicle", "Commercial Vehicle", "Personal, Education, Vehicle & Other Loans"],
  ["loan-against-securities", "Loan Against Securities", "Personal, Education, Vehicle & Other Loans"],
  ["professional-loan", "Professional Loan", "Business Growth"],
  ["private-funding", "Private Funding", "Business Growth"],
];

const LENDERS: [name: string, type: LenderType, logo: string][] = [
  ["HDFC Bank", LenderType.BANK, "/banks/hdfc-bank.svg"],
  ["ICICI Bank", LenderType.BANK, "/banks/icici-bank.png"],
  ["SBI", LenderType.BANK, "/banks/sbi.svg"],
  ["Axis Bank", LenderType.BANK, "/banks/axis-bank.svg"],
  ["Bank of India", LenderType.BANK, "/banks/bank-of-india.png"],
  ["Kotak Mahindra", LenderType.BANK, "/banks/kotak-mahindra.svg"],
  ["Yes Bank", LenderType.BANK, "/banks/yes-bank.svg"],
  ["Bajaj Finserv", LenderType.NBFC, "/banks/bajaj-finserv.svg"],
  ["Tata Capital", LenderType.NBFC, "/banks/tata-capital.jpg"],
  ["Standard Chartered", LenderType.BANK, "/banks/standard-chartered.png"],
  ["HSBC", LenderType.BANK, "/banks/hsbc.png"],
  ["IDBI Bank", LenderType.BANK, "/banks/idbi-bank.svg"],
  ["IDFC First Bank", LenderType.BANK, "/banks/idfc-first-bank.svg"],
  ["PNB Housing", LenderType.NBFC, "/banks/pnb-housing.png"],
  ["Federal Bank", LenderType.BANK, "/banks/federal-bank.svg"],
  ["Union Bank", LenderType.BANK, "/banks/union-bank.svg"],
  ["Aditya Birla Capital", LenderType.NBFC, "/banks/aditya-birla-capital-new.png"],
  ["Bandhan Bank", LenderType.BANK, "/banks/bandhan-bank.svg"],
  ["Bank of Baroda", LenderType.BANK, "/banks/bank-of-baroda.svg"],
  ["AU Small Finance", LenderType.BANK, "/banks/au-small-finance.png"],
  ["Axis Finance", LenderType.NBFC, "/banks/axis-finance.svg"],
  ["Bajaj Housing", LenderType.NBFC, "/banks/bajaj-housing.svg"],
  ["Cholamandalam", LenderType.NBFC, "/banks/cholamandalam-new.svg"],
  ["Deutsche Bank", LenderType.BANK, "/banks/deutsche-bank.png"],
  ["DCB Bank", LenderType.BANK, "/banks/dcb-bank.svg"],
  ["Godrej Capital", LenderType.NBFC, "/banks/godrej-capital-new.svg"],
  ["HDFC Sales", LenderType.NBFC, "/banks/hdfc-sales.svg"],
  ["Hero FinCorp", LenderType.NBFC, "/banks/hero-fincorp.svg"],
  ["IndusInd Bank", LenderType.BANK, "/banks/indusind-bank-new.svg"],
  ["LIC HFL", LenderType.NBFC, "/banks/lic-hfl.png"],
  ["Mahindra Finance", LenderType.NBFC, "/banks/mahindra-finance-new.svg"],
  ["Piramal Finance", LenderType.NBFC, "/banks/piramal-finance-new.svg"],
  ["Poonawalla Fincorp", LenderType.NBFC, "/banks/poonawalla-fincorp.png"],
  ["SBI Home Loans", LenderType.BANK, "/banks/sbi-home-loans.svg"],
  ["Shriram Finance", LenderType.NBFC, "/banks/shriram-finance.svg"],
  ["Central Bank of India", LenderType.BANK, "/banks/central-bank-of-india.svg"],
  ["Aadhar Housing", LenderType.NBFC, "/banks/aadhar-housing.png"],
];


// Published rate card — the exact figures from GCS's DSA partner recruitment sheet.
const RATE_CARDS: [label: string, min: number, max: number, avg: string, earning: string, active?: boolean][] = [
  ["Home Loan", 0.1, 0.3, "₹30L – ₹1Cr", "₹3,000 – ₹30,000"],
  ["Loan Against Property", 0.1, 0.5, "₹20L – ₹1Cr", "₹2,000 – ₹50,000"],
  ["Business Loan", 0.1, 1.0, "₹10L – ₹1Cr", "₹1,000 – ₹1,00,000"],
  ["Personal Loan", 0.1, 1.0, "₹2L – ₹50L", "₹200 – ₹50,000"],
  ["Working Capital Loan", 0.1, 0.3, "₹10L – ₹1Cr", "₹1,000 – ₹30,000"],
  // No longer on the partner rate card; kept here, switched off, so the row order (and ids) do not shift.
  ["Loan Against Securities", 0.1, 0.3, "₹10L – ₹5Cr", "₹1,000 – ₹1,50,000", false],
  ["Project Funding", 0.05, 0.1, "₹1Cr – ₹10Cr", "₹5,000 – ₹1,00,000"],
];

// Document checklist master data, distilled from real lender checklists
// (BOM, ICICI, IndusInd, L&T, Kotak) the client shared for reference.
// [applicantType | null = any profile, productSlug | null = any product, label, category]
const CHECKLIST_ITEMS: [ChecklistApplicantType | null, string | null, string, string][] = [
  // Universal — every applicant, every product
  [null, null, "PAN card", "KYC"],
  [null, null, "Aadhaar card", "KYC"],
  [null, null, "Address proof (passport / electricity bill / voter ID)", "KYC"],
  [null, null, "Passport-size photograph", "KYC"],

  // Salaried
  ["SALARIED", null, "Latest 3 months' salary slips", "Income proof"],
  ["SALARIED", null, "Form 16 / ITR — last 2 years", "Income proof"],
  ["SALARIED", null, "Last 6 months' salary bank statement", "Bank statement"],
  ["SALARIED", null, "Employment confirmation / appointment letter", "Income proof"],

  // Self-employed professional (doctor, CA, architect, consultant...)
  ["PROFESSIONAL", null, "Professional degree certificate", "Business proof"],
  ["PROFESSIONAL", null, "Last 2 years ITR with computation of income", "Income proof"],
  ["PROFESSIONAL", null, "Last 2 years P&L, balance sheet, audit report", "Income proof"],
  ["PROFESSIONAL", null, "Shop Act / tax registration copy", "Business proof"],
  ["PROFESSIONAL", null, "Last 1 year bank statement (current + savings)", "Bank statement"],

  // Proprietorship
  ["PROPRIETORSHIP", null, "Last 3 years ITR (individual, audited if applicable)", "Income proof"],
  ["PROPRIETORSHIP", null, "Last 1 year current + savings account statements", "Bank statement"],
  [
    "PROPRIETORSHIP",
    null,
    "Business proof — Shop Act / Gram Panchayat certificate / Udyog Aadhaar / GST certificate",
    "Business proof",
  ],
  ["PROPRIETORSHIP", null, "Debtor & creditor list — last 2 years", "Business proof"],

  // Partnership
  ["PARTNERSHIP", null, "Registered partnership deed", "Business proof"],
  ["PARTNERSHIP", null, "Last 3 years ITR — firm and all partners", "Income proof"],
  ["PARTNERSHIP", null, "Last 1 year current + savings account statements", "Bank statement"],
  ["PARTNERSHIP", null, "Debtor & creditor list — last 2 years", "Business proof"],

  // Private limited company
  ["PRIVATE_LIMITED", null, "MOA & AOA", "Business proof"],
  ["PRIVATE_LIMITED", null, "Shareholding pattern / list of directors", "Business proof"],
  ["PRIVATE_LIMITED", null, "Last 3 years ITR — company and all directors", "Income proof"],
  ["PRIVATE_LIMITED", null, "Last 3 years audit report and directors' report", "Income proof"],
  ["PRIVATE_LIMITED", null, "Last 1 year current account bank statement", "Bank statement"],
  ["PRIVATE_LIMITED", null, "Debtor & creditor list — last 2 years", "Business proof"],

  // LLP
  ["LLP", null, "LLP agreement", "Business proof"],
  ["LLP", null, "Last 3 years ITR — LLP and all partners", "Income proof"],
  ["LLP", null, "Last 1 year bank statement", "Bank statement"],

  // NRI
  ["NRI", null, "Valid visa copy, stamped on passport", "KYC"],
  ["NRI", null, "Employment contract copy", "Income proof"],
  ["NRI", null, "Latest salary slips / Form 16 / P60 / W2 (per country)", "Income proof"],
  ["NRI", null, "Last 6–12 months NRE/NRO bank statement", "Bank statement"],
  ["NRI", null, "Credit bureau report of country of residence", "KYC"],
  ["NRI", null, "Resident-Indian co-applicant's PAN & address proof", "KYC"],

  // Car loan add-ons
  [null, "new-car-loan", "Vehicle quotation from dealer", "Asset proof"],
  [null, "new-car-loan", "Down payment receipt from dealer", "Asset proof"],
  [null, "used-car-loan", "Vehicle quotation from dealer", "Asset proof"],
  [null, "used-car-loan", "Down payment receipt from dealer", "Asset proof"],
  [null, "car-refinance", "Existing vehicle RC book copy", "Asset proof"],

  // Home loan / LAP / LRD add-ons
  [null, "home-loan", "Property title papers and chain of agreements", "Property papers"],
  [null, "home-loan", "Occupancy certificate / sanctioned plan copy", "Property papers"],
  [null, "home-loan", "Society share certificate (front & back)", "Property papers"],
  [
    null,
    "loan-against-property",
    "Property title papers and chain of agreements",
    "Property papers",
  ],
  [null, "loan-against-property", "Occupancy certificate / sanctioned plan copy", "Property papers"],
  [null, "loan-against-property", "Society share certificate (front & back)", "Property papers"],
  [null, "lease-rental-discounting", "Registered lease/leave-and-license agreement", "Property papers"],
  [null, "lease-rental-discounting", "Property title papers and chain of agreements", "Property papers"],
];


async function main() {
  for (const [i, [slug, name, category]] of PRODUCTS.entries()) {
    await prisma.loanProduct.upsert({
      where: { slug },
      update: { name, category, sortOrder: i },
      create: { slug, name, category, sortOrder: i },
    });
  }

  // Give the loan types that have no code yet a code, picture, colour and collateral flag.
  for (const p of await prisma.loanProduct.findMany({ where: { code: null } })) {
    await prisma.loanProduct.update({
      where: { id: p.id },
      data: {
        code: p.slug.toUpperCase().replace(/-/g, "_"),
        icon: LOAN_TYPE_ICONS[p.slug] ?? null,
        color: loanTypeColor(p.category),
        secured: SECURED_LOAN_TYPES.has(p.slug),
      },
    });
  }

  const productIdBySlug = new Map(
    (await prisma.loanProduct.findMany({ select: { id: true, slug: true } })).map((p) => [
      p.slug,
      p.id,
    ]),
  );

  // One document type per (name, category): the loan types and applicant profiles it was listed
  // under become its "applies to" choices, and a row listed for everyone makes it apply to everyone.
  const rows: [ChecklistApplicantType | null, string | null, string, string][] = [
    ...CHECKLIST_ITEMS,
    ...PRODUCT_CHECKLIST_ITEMS.map(([slug, label, category]): [null, string, string, string] => [null, slug, label, category]),
  ];
  const types = new Map<string, { name: string; category: string; products: Set<string> | null; profiles: Set<ChecklistApplicantType> | null }>();
  for (const [applicantType, productSlug, name, category] of rows) {
    const key = `${name}|${category}`;
    const t = types.get(key) ?? { name, category, products: new Set<string>(), profiles: new Set<ChecklistApplicantType>() };
    if (!productSlug) t.products = null;
    else t.products?.add(productSlug);
    if (!applicantType) t.profiles = null;
    else t.profiles?.add(applicantType);
    types.set(key, t);
  }
  let order = 0;
  for (const t of types.values()) {
    const data = {
      applicantTypes: t.profiles ? [...t.profiles] : [],
      loanProducts: { set: [...(t.products ?? [])].flatMap((slug) => (productIdBySlug.get(slug) ? [{ id: productIdBySlug.get(slug)! }] : [])) },
      sortOrder: order++,
    };
    await prisma.documentType.upsert({
      where: { name_category: { name: t.name, category: t.category } },
      update: {},
      create: { name: t.name, category: t.category, ...data, loanProducts: { connect: data.loanProducts.set } },
    });
  }

  for (const [i, [name, type, logoUrl]] of LENDERS.entries()) {
    await prisma.lender.upsert({
      where: { name },
      update: { type, logoUrl, sortOrder: i },
      create: { name, type, logoUrl, sortOrder: i },
    });
  }

  // Lenders that only appear in the relationship-manager sheet: usable on files, but not shown on the public website.
  for (const [i, l] of NEW_LENDERS.entries()) {
    await prisma.lender.upsert({
      where: { name: l.name },
      update: {},
      create: { name: l.name, type: l.type === "BANK" ? LenderType.BANK : LenderType.NBFC, isPublic: false, sortOrder: 100 + i },
    });
  }
  // Contacts are only ever added here, never overwritten, so edits made in the CRM survive a re-seed.
  let contactsAdded = 0;
  for (const c of LENDER_CONTACTS) {
    const lender = await prisma.lender.findUniqueOrThrow({ where: { name: c.lender } });
    const exists = await prisma.lenderContact.findFirst({
      where: { lenderId: lender.id, ...(c.phone ? { phone: c.phone } : { name: c.name }) },
    });
    if (exists) continue;
    await prisma.lenderContact.create({
      data: { lenderId: lender.id, name: c.name, designation: c.designation, phone: c.phone, email: c.email, segments: c.segments, notes: c.notes },
    });
    contactsAdded++;
  }
  console.log(`Lender directory: ${contactsAdded} new contact(s) added, ${LENDER_CONTACTS.length - contactsAdded} already present`);

  for (const [i, [title, productSlug, variant, fileUrl]] of CHECKLIST_DOCUMENTS.entries()) {
    await prisma.checklistDocument.upsert({
      where: { id: `seed-checklist-doc-${i}` },
      update: { title, productSlug, variant, fileUrl, sortOrder: i },
      create: { id: `seed-checklist-doc-${i}`, title, productSlug, variant, fileUrl, sortOrder: i },
    });
  }

  for (const [i, [label, min, max, avg, earning, active = true]] of RATE_CARDS.entries()) {
    await prisma.commissionRateCard.upsert({
      where: { id: `seed-rate-card-${i}` },
      update: { label, minRate: min, maxRate: max, avgAmountLabel: avg, earningLabel: earning, sortOrder: i, active },
      create: {
        id: `seed-rate-card-${i}`,
        label,
        minRate: min,
        maxRate: max,
        avgAmountLabel: avg,
        earningLabel: earning,
        sortOrder: i,
        active,
      },
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@growthcapitalservices.in";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "GCS Admin",
      email,
      role: Role.ADMIN,
      designation: "Administrator",
      passwordHash: await bcrypt.hash(password, 10),
      // The documented default must never survive first use. Tests set SEED_ADMIN_FORCE_CHANGE=false.
      mustChangePassword: process.env.SEED_ADMIN_FORCE_CHANGE !== "false",
    },
  });

  console.log(
    `Seeded ${PRODUCTS.length} products, ${LENDERS.length} lenders, ${RATE_CARDS.length} rate cards, ${types.size} document types, admin ${email} / ${password}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

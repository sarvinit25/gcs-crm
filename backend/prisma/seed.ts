import { ChecklistApplicantType, LenderType, PrismaClient, Role } from "@prisma/client";
import { PRODUCT_CHECKLIST_ITEMS } from "./checklist-data";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mirrors src/data/products.ts on the website — slugs must match so lead intake
// can resolve a product from the form it came from.
const PRODUCTS: [slug: string, name: string, category: string][] = [
  ["home-loan", "Home Loan", "Property Finance"],
  ["loan-against-property", "Loan Against Property", "Property Finance"],
  ["lease-rental-discounting", "Lease Rental Discounting", "Property Finance"],
  ["balance-transfer", "Balance Transfer", "Property Finance"],
  ["dlod", "Drop-Line Overdraft (Secured)", "Property Finance"],
  ["business-loan", "Business Loan", "Business Growth"],
  ["cgtmse", "CGTMSE Funding", "Business Growth"],
  ["unsecured-term-loan", "Unsecured Term Loan", "Business Growth"],
  ["unsecured-dod", "Unsecured DOD", "Business Growth"],
  ["project-funding", "Project Funding", "Business Growth"],
  ["working-capital", "Working Capital", "Cash Flow & Trade"],
  ["cash-credit", "Cash Credit", "Cash Flow & Trade"],
  ["overdraft-limit", "Overdraft Limit", "Cash Flow & Trade"],
  ["bank-guarantee", "Bank Guarantee", "Cash Flow & Trade"],
  ["letter-of-credit", "Letter of Credit", "Cash Flow & Trade"],
  ["working-capital-term-loan", "Working Capital Term Loan", "Cash Flow & Trade"],
  ["personal-loan", "Personal Loan", "Personal & Education"],
  ["loan-against-securities", "Loan Against Securities", "Personal & Education"],
  ["loan-against-mutual-funds", "Loan Against Mutual Funds", "Personal & Education"],
  ["professional-loan", "Professional Loan", "Personal & Education"],
  ["education-loan", "Education Loan", "Personal & Education"],
  ["new-car-loan", "New Car Loan", "Vehicles & Special Cases"],
  ["used-car-loan", "Used Car Loan", "Vehicles & Special Cases"],
  ["car-refinance", "Car Refinance", "Vehicles & Special Cases"],
  ["private-funding", "Private Funding", "Vehicles & Special Cases"],
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
const RATE_CARDS: [label: string, min: number, max: number, avg: string, earning: string][] = [
  ["Home Loan", 0.2, 0.5, "\u20b930L \u2013 \u20b91Cr", "\u20b96,000 \u2013 \u20b950,000"],
  ["Loan Against Property", 0.5, 1.0, "\u20b920L \u2013 \u20b975L", "\u20b910,000 \u2013 \u20b975,000"],
  ["Business Loan", 1.0, 2.0, "\u20b910L \u2013 \u20b950L", "\u20b910,000 \u2013 \u20b91,00,000"],
  ["Personal Loan", 1.0, 2.5, "\u20b92L \u2013 \u20b925L", "\u20b92,000 \u2013 \u20b962,500"],
  ["Working Capital Loan", 0.5, 1.5, "\u20b910L \u2013 \u20b91Cr", "\u20b95,000 \u2013 \u20b91,50,000"],
  ["Loan Against Securities", 0.3, 0.8, "\u20b910L \u2013 \u20b95Cr", "\u20b93,000 \u2013 \u20b94,00,000"],
  ["Project Funding", 0.5, 1.0, "\u20b950L \u2013 \u20b910Cr", "\u20b925,000 \u2013 \u20b910,00,000"],
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

// Checklist PDFs the website offers for download (public/checklists on the website).
// [title, website product slug, variant, file path]
const CHECKLIST_DOCUMENTS: [title: string, productSlug: string, variant: string | null, fileUrl: string][] = [
  ["Accounting Bookkeeping", "accounting-bookkeeping", null, "/checklists/accounting-bookkeeping-checklist.pdf"],
  ["Balance Transfer", "balance-transfer", null, "/checklists/balance-transfer-checklist.pdf"],
  ["Bank Guarantee", "bank-guarantee", null, "/checklists/bank-guarantee-checklist.pdf"],
  ["Business Loan", "business-loan", null, "/checklists/business-loan-checklist.pdf"],
  ["Car Loan", "car-loan", null, "/checklists/car-loan-checklist.pdf"],
  ["Car Refinance", "car-refinance", null, "/checklists/car-refinance-checklist.pdf"],
  ["Cash Credit", "cash-credit", null, "/checklists/cash-credit-checklist.pdf"],
  ["CGTMSE", "cgtmse", null, "/checklists/cgtmse-checklist.pdf"],
  ["Company Llp Registration", "company-llp-registration", null, "/checklists/company-llp-registration-checklist.pdf"],
  ["DLOD", "dlod", null, "/checklists/dlod-checklist.pdf"],
  ["Education Loan", "education-loan", null, "/checklists/education-loan-checklist.pdf"],
  ["Gift Release Deed", "gift-release-deed", null, "/checklists/gift-release-deed-checklist.pdf"],
  ["GST Reconciliation Notice Support", "gst-reconciliation-notice-support", null, "/checklists/gst-reconciliation-notice-support-checklist.pdf"],
  ["GST Registration", "gst-registration", null, "/checklists/gst-registration-checklist.pdf"],
  ["GST Return Filing", "gst-return-filing", null, "/checklists/gst-return-filing-checklist.pdf"],
  ["Home Loan", "home-loan", null, "/checklists/home-loan-checklist.pdf"],
  ["Home Loan NRI", "home-loan", "NRI", "/checklists/home-loan-nri-checklist.pdf"],
  ["Home Loan Salaried", "home-loan", "Salaried", "/checklists/home-loan-salaried-checklist.pdf"],
  ["Home Loan Self Employed", "home-loan", "Self-Employed", "/checklists/home-loan-self-employed-checklist.pdf"],
  ["Income Tax Return Filing", "income-tax-return-filing", null, "/checklists/income-tax-return-filing-checklist.pdf"],
  ["LAP DLOD", "lap-dlod", null, "/checklists/lap-dlod-checklist.pdf"],
  ["Lease Rental Discounting", "lease-rental-discounting", null, "/checklists/lease-rental-discounting-checklist.pdf"],
  ["Legal Drafting Agreements Affidavits", "legal-drafting-agreements-affidavits", null, "/checklists/legal-drafting-agreements-affidavits-checklist.pdf"],
  ["Letter Of Credit", "letter-of-credit", null, "/checklists/letter-of-credit-checklist.pdf"],
  ["Loan Against Mutual Funds", "loan-against-mutual-funds", null, "/checklists/loan-against-mutual-funds-checklist.pdf"],
  ["Loan Against Property", "loan-against-property", null, "/checklists/loan-against-property-checklist.pdf"],
  ["Loan Against Securities", "loan-against-securities", null, "/checklists/loan-against-securities-checklist.pdf"],
  ["MHADA Flat Transfer", "mhada-flat-transfer", null, "/checklists/mhada-flat-transfer-checklist.pdf"],
  ["MMRDA Property Documentation", "mmrda-property-documentation", null, "/checklists/mmrda-property-documentation-checklist.pdf"],
  ["MSME UDYAM Registration", "msme-udyam-registration", null, "/checklists/msme-udyam-registration-checklist.pdf"],
  ["New Car Loan", "new-car-loan", null, "/checklists/new-car-loan-checklist.pdf"],
  ["NRI Property Documentation", "nri-property-documentation", null, "/checklists/nri-property-documentation-checklist.pdf"],
  ["Overdraft Limit", "overdraft-limit", null, "/checklists/overdraft-limit-checklist.pdf"],
  ["PAN TAN DSC Services", "pan-tan-dsc-services", null, "/checklists/pan-tan-dsc-services-checklist.pdf"],
  ["Personal Loan", "personal-loan", null, "/checklists/personal-loan-checklist.pdf"],
  ["Power Of Attorney Drafting", "power-of-attorney-drafting", null, "/checklists/power-of-attorney-drafting-checklist.pdf"],
  ["Private Funding", "private-funding", null, "/checklists/private-funding-checklist.pdf"],
  ["Professional Loan", "professional-loan", null, "/checklists/professional-loan-checklist.pdf"],
  ["Project Funding", "project-funding", null, "/checklists/project-funding-checklist.pdf"],
  ["Property Title Verification", "property-title-verification", null, "/checklists/property-title-verification-checklist.pdf"],
  ["Public Notice Publication", "public-notice-publication", null, "/checklists/public-notice-publication-checklist.pdf"],
  ["Sale Agreement Sale Deed", "sale-agreement-sale-deed", null, "/checklists/sale-agreement-sale-deed-checklist.pdf"],
  ["Shop Act Fssai Registration", "shop-act-fssai-registration", null, "/checklists/shop-act-fssai-registration-checklist.pdf"],
  ["Society Noc Membership", "society-noc-membership", null, "/checklists/society-noc-membership-checklist.pdf"],
  ["Society Redevelopment Documentation", "society-redevelopment-documentation", null, "/checklists/society-redevelopment-documentation-checklist.pdf"],
  ["Society Share Transfer", "society-share-transfer", null, "/checklists/society-share-transfer-checklist.pdf"],
  ["SRA Flat Transfer", "sra-flat-transfer", null, "/checklists/sra-flat-transfer-checklist.pdf"],
  ["Tax Audit Support", "tax-audit-support", null, "/checklists/tax-audit-support-checklist.pdf"],
  ["Tax Planning Advisory", "tax-planning-advisory", null, "/checklists/tax-planning-advisory-checklist.pdf"],
  ["TDS Property Sale 26qb", "tds-property-sale-26qb", null, "/checklists/tds-property-sale-26qb-checklist.pdf"],
  ["TDS Return Filing", "tds-return-filing", null, "/checklists/tds-return-filing-checklist.pdf"],
  ["Unsecured DOD", "unsecured-dod", null, "/checklists/unsecured-dod-checklist.pdf"],
  ["Unsecured Term Loan", "unsecured-term-loan", null, "/checklists/unsecured-term-loan-checklist.pdf"],
  ["Used Car Loan", "used-car-loan", null, "/checklists/used-car-loan-checklist.pdf"],
  ["WCL CC OD LC BG", "wcl-cc-od-lc-bg", null, "/checklists/wcl-cc-od-lc-bg-checklist.pdf"],
  ["Will Succession Documentation", "will-succession-documentation", null, "/checklists/will-succession-documentation-checklist.pdf"],
  ["Working Capital", "working-capital", null, "/checklists/working-capital-checklist.pdf"],
  ["Working Capital Term Loan", "working-capital-term-loan", null, "/checklists/working-capital-term-loan-checklist.pdf"],
];

async function main() {
  for (const [i, [slug, name, category]] of PRODUCTS.entries()) {
    await prisma.loanProduct.upsert({
      where: { slug },
      update: { name, category, sortOrder: i },
      create: { slug, name, category, sortOrder: i },
    });
  }

  const productIdBySlug = new Map(
    (await prisma.loanProduct.findMany({ select: { id: true, slug: true } })).map((p) => [
      p.slug,
      p.id,
    ]),
  );

  for (const [i, [applicantType, productSlug, label, category]] of CHECKLIST_ITEMS.entries()) {
    const id = `seed-checklist-${i}`;
    const data = {
      applicantType: applicantType ?? null,
      loanProductId: (productSlug ? productIdBySlug.get(productSlug) : null) ?? null,
      label,
      category,
      sortOrder: i,
    };
    await prisma.checklistItem.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // Product-specific items start after the hand-curated ones so existing ids stay stable.
  for (const [j, [productSlug, label, category]] of PRODUCT_CHECKLIST_ITEMS.entries()) {
    const id = `seed-checklist-pdf-${j}`;
    const data = {
      applicantType: null,
      loanProductId: productIdBySlug.get(productSlug) ?? null,
      label,
      category,
      sortOrder: CHECKLIST_ITEMS.length + j,
    };
    await prisma.checklistItem.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  for (const [i, [name, type, logoUrl]] of LENDERS.entries()) {
    await prisma.lender.upsert({
      where: { name },
      update: { type, logoUrl, sortOrder: i },
      create: { name, type, logoUrl, sortOrder: i },
    });
  }

  for (const [i, [title, productSlug, variant, fileUrl]] of CHECKLIST_DOCUMENTS.entries()) {
    await prisma.checklistDocument.upsert({
      where: { id: `seed-checklist-doc-${i}` },
      update: { title, productSlug, variant, fileUrl, sortOrder: i },
      create: { id: `seed-checklist-doc-${i}`, title, productSlug, variant, fileUrl, sortOrder: i },
    });
  }

  for (const [i, [label, min, max, avg, earning]] of RATE_CARDS.entries()) {
    await prisma.commissionRateCard.upsert({
      where: { id: `seed-rate-card-${i}` },
      update: { label, minRate: min, maxRate: max, avgAmountLabel: avg, earningLabel: earning, sortOrder: i },
      create: {
        id: `seed-rate-card-${i}`,
        label,
        minRate: min,
        maxRate: max,
        avgAmountLabel: avg,
        earningLabel: earning,
        sortOrder: i,
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
    `Seeded ${PRODUCTS.length} products, ${LENDERS.length} lenders, ${RATE_CARDS.length} rate cards, ${CHECKLIST_ITEMS.length + PRODUCT_CHECKLIST_ITEMS.length} checklist items, admin ${email} / ${password}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { LenderType, PrismaClient, Role } from "@prisma/client";
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

async function main() {
  for (const [i, [slug, name, category]] of PRODUCTS.entries()) {
    await prisma.loanProduct.upsert({
      where: { slug },
      update: { name, category, sortOrder: i },
      create: { slug, name, category, sortOrder: i },
    });
  }

  for (const [i, [name, type, logoUrl]] of LENDERS.entries()) {
    await prisma.lender.upsert({
      where: { name },
      update: { type, logoUrl, sortOrder: i },
      create: { name, type, logoUrl, sortOrder: i },
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
    },
  });

  console.log(
    `Seeded ${PRODUCTS.length} products, ${LENDERS.length} lenders, ${RATE_CARDS.length} rate cards, admin ${email} / ${password}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

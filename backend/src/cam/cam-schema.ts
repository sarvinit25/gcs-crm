// The detailed credit appraisal memo (CAM): every question, in sections, for every loan family. One definition drives the
// customer's link form, the staff screen and the Excel workbook, so a question can never exist in one and not the others.

export type Family = "HOME" | "LAP" | "BUSINESS" | "EDUCATION" | "OTHER";
export const FAMILIES: Family[] = ["HOME", "LAP", "BUSINESS", "EDUCATION", "OTHER"];
export const FAMILY_LABEL: Record<Family, string> = {
  HOME: "Home loan",
  LAP: "Loan against property",
  BUSINESS: "Business / working-capital loan",
  EDUCATION: "Education loan",
  OTHER: "Other loan",
};

export type FieldType = "text" | "longtext" | "number" | "money" | "percent" | "date" | "select" | "yesno" | "phone" | "email";

/** Show this only while another answer is one of these values. `path` is "sectionId.fieldKey". */
export type Cond = { path: string; in: string[] };

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
  /** Needed for a usable CAM: an empty one is listed under "information still missing". */
  core?: boolean;
  show?: Cond;
};

export type ColumnType = "text" | "money" | "number" | "percent" | "select" | "yesno" | "date";
export type Column = { key: string; label: string; type: ColumnType; options?: string[] };
export type Table = { key: string; label: string; hint?: string; columns: Column[]; maxRows: number; startRows?: number; show?: Cond };

export type Section = {
  id: string;
  title: string;
  intro?: string;
  /** Shown on the customer's link form. Staff-only sections (remarks, recommendation) are never sent to the customer. */
  customer: boolean;
  families: Family[] | "all";
  show?: Cond;
  fields: Field[];
  tables: Table[];
};

const YES_NO = ["Yes", "No"];
const PROFILE = ["Salaried", "Self-employed professional", "Self-employed business"];
const SELF = ["Self-employed professional", "Self-employed business"];

export const SECTIONS: Section[] = [
  {
    id: "applicant",
    title: "Applicant details",
    customer: true,
    families: "all",
    fields: [
      { key: "fullName", label: "Full name (as on PAN)", type: "text", core: true },
      { key: "dob", label: "Date of birth", type: "date", core: true },
      { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"] },
      { key: "maritalStatus", label: "Marital status", type: "select", options: ["Single", "Married", "Divorced", "Widowed"] },
      { key: "pan", label: "PAN", type: "text", core: true },
      { key: "mobile", label: "Mobile number", type: "phone", core: true },
      { key: "altMobile", label: "Alternate mobile number", type: "phone" },
      { key: "email", label: "Email", type: "email" },
      { key: "education", label: "Education", type: "select", options: ["Below 10th", "10th / 12th", "Graduate", "Post-graduate", "Professional (CA / doctor / engineer etc.)"] },
      { key: "dependents", label: "Number of dependents", type: "number" },
      { key: "spouseName", label: "Spouse's name", type: "text", show: { path: "applicant.maritalStatus", in: ["Married"] } },
      { key: "spouseOccupation", label: "Spouse's occupation", type: "text", show: { path: "applicant.maritalStatus", in: ["Married"] } },
      { key: "residenceType", label: "Current residence", type: "select", options: ["Owned", "Rented", "Parental / family", "Company provided"], core: true },
      { key: "yearsAtResidence", label: "Years at current address", type: "number" },
      { key: "monthlyRent", label: "Monthly rent paid", type: "money", show: { path: "applicant.residenceType", in: ["Rented"] } },
      { key: "address", label: "Current address", type: "longtext", core: true },
      { key: "city", label: "City", type: "text", core: true },
      { key: "pincode", label: "Pincode", type: "text" },
      { key: "permanentAddress", label: "Permanent address (if different)", type: "longtext" },
    ],
    tables: [],
  },
  {
    id: "loanRequest",
    title: "Loan requirement",
    customer: true,
    families: "all",
    fields: [
      { key: "amount", label: "Loan amount needed (₹)", type: "money", core: true },
      { key: "tenureYears", label: "Preferred tenure (years)", type: "number", core: true },
      { key: "purpose", label: "Purpose of the loan", type: "longtext", core: true },
      { key: "timeline", label: "How soon is the money needed?", type: "select", options: ["Within a week", "Within a month", "1 to 3 months", "Just exploring"] },
      { key: "security", label: "Security / collateral offered", type: "text", hint: "For example: flat at Thane, shop, nothing" },
      { key: "coApplicant", label: "Will there be a co-applicant?", type: "yesno" },
      { key: "coApplicantName", label: "Co-applicant's name", type: "text", show: { path: "loanRequest.coApplicant", in: ["Yes"] } },
      { key: "coApplicantRelation", label: "Relation to applicant", type: "text", show: { path: "loanRequest.coApplicant", in: ["Yes"] } },
      { key: "coApplicantIncome", label: "Co-applicant's monthly income (₹)", type: "money", show: { path: "loanRequest.coApplicant", in: ["Yes"] } },
      { key: "existingBank", label: "Main bank / lender you deal with today", type: "text" },
      { key: "previousRejection", label: "Has a loan application been rejected in the last 12 months?", type: "yesno" },
      { key: "rejectionDetails", label: "Which lender, and why (if you know)", type: "longtext", show: { path: "loanRequest.previousRejection", in: ["Yes"] } },
    ],
    tables: [
      {
        key: "coApplicants",
        label: "Co-applicants and guarantors",
        hint: "Everyone whose income should count with yours, or who will sign. Their income is added to the repayment capacity, the lowest CIBIL score among all is shown, and the oldest age is checked at the end of the loan.",
        maxRows: 5,
        startRows: 0,
        columns: [
          { key: "name", label: "Name", type: "text" },
          { key: "relation", label: "Relation to the applicant", type: "text" },
          { key: "dob", label: "Date of birth", type: "date" },
          { key: "pan", label: "PAN", type: "text" },
          { key: "profile", label: "Occupation", type: "select", options: PROFILE },
          { key: "monthlyIncome", label: "Monthly income to count (₹)", type: "money" },
          { key: "emi", label: "EMIs they pay each month (₹)", type: "money" },
          { key: "cibil", label: "CIBIL score", type: "number" },
        ],
      },
    ],
  },
  {
    id: "income",
    title: "Employment and income",
    customer: true,
    families: ["HOME", "LAP", "BUSINESS", "OTHER"],
    fields: [
      { key: "profile", label: "You are", type: "select", options: PROFILE, core: true },
      // salaried
      { key: "employer", label: "Employer's name", type: "text", core: true, show: { path: "income.profile", in: ["Salaried"] } },
      { key: "employerType", label: "Type of employer", type: "select", options: ["Government / PSU", "Listed company / MNC", "Private limited", "Proprietorship / partnership firm", "Other"], show: { path: "income.profile", in: ["Salaried"] } },
      { key: "designation", label: "Designation", type: "text", show: { path: "income.profile", in: ["Salaried"] } },
      { key: "yearsInJob", label: "Years in the current job", type: "number", show: { path: "income.profile", in: ["Salaried"] } },
      { key: "totalExperience", label: "Total work experience (years)", type: "number", show: { path: "income.profile", in: ["Salaried"] } },
      { key: "grossMonthly", label: "Gross monthly salary (₹)", type: "money", show: { path: "income.profile", in: ["Salaried"] } },
      { key: "netMonthly", label: "Net monthly salary credited (₹)", type: "money", core: true, show: { path: "income.profile", in: ["Salaried"] } },
      { key: "otherIncome", label: "Other monthly income: rent, interest, bonus averaged (₹)", type: "money", show: { path: "income.profile", in: ["Salaried"] } },
      { key: "salaryMode", label: "How is the salary paid?", type: "select", options: ["Bank transfer", "Part bank, part cash", "Cash", "Cheque"], show: { path: "income.profile", in: ["Salaried"] } },
      // self-employed
      { key: "businessName", label: "Business / practice name", type: "text", core: true, show: { path: "income.profile", in: SELF } },
      { key: "constitution", label: "Type of firm", type: "select", options: ["Proprietorship", "Partnership", "Private Limited", "LLP", "Other"], core: true, show: { path: "income.profile", in: SELF } },
      { key: "nature", label: "What the business does", type: "text", core: true, show: { path: "income.profile", in: SELF } },
      { key: "industry", label: "Industry", type: "select", options: ["Manufacturing", "Trading", "Services", "Retail", "Construction / real estate", "Professional practice", "Other"], show: { path: "income.profile", in: SELF } },
      { key: "vintageYears", label: "Years in this business", type: "number", core: true, show: { path: "income.profile", in: SELF } },
      { key: "businessAddress", label: "Business address", type: "longtext", show: { path: "income.profile", in: SELF } },
      { key: "gstRegistered", label: "Registered under GST?", type: "yesno", show: { path: "income.profile", in: SELF } },
      { key: "gstin", label: "GSTIN", type: "text", show: { path: "income.gstRegistered", in: ["Yes"] } },
      { key: "udyam", label: "Udyam registration number (if any)", type: "text", show: { path: "income.profile", in: SELF } },
      { key: "itrFiled", label: "Income tax returns filed for the last 2 years?", type: "yesno", show: { path: "income.profile", in: SELF } },
      { key: "ownerDrawings", label: "Monthly drawings / salary taken from the business (₹)", type: "money", show: { path: "income.profile", in: SELF } },
      { key: "employees", label: "Number of employees", type: "number", show: { path: "income.profile", in: SELF } },
      { key: "mainCustomers", label: "Main customers and suppliers", type: "longtext", show: { path: "income.profile", in: SELF } },
      { key: "existingWcLimit", label: "Cash-credit / overdraft limit already with a bank (₹)", type: "money", show: { path: "income.profile", in: SELF } },
      { key: "projectedSales", label: "Expected turnover for the coming year (₹)", type: "money", hint: "Used only to work out the projected debt cover. Leave blank to skip.", show: { path: "income.profile", in: SELF } },
      { key: "projectedMarginPct", label: "Expected business margin before interest and tax (%)", type: "percent", show: { path: "income.profile", in: SELF } },
      { key: "rentalIncome", label: "Rent received each month from other properties (₹)", type: "money", hint: "Counted as proof of income only up to the main income, as lenders do." },
      { key: "agriIncome", label: "Agricultural income in a year (₹)", type: "money", hint: "Half of it is counted, as most lenders do." },
    ],
    tables: [
      {
        key: "financials",
        label: "Business financials, last three financial years",
        hint: "From the ITR / balance sheet, newest year first. Amounts in rupees.",
        maxRows: 3,
        startRows: 3,
        show: { path: "income.profile", in: SELF },
        columns: [
          { key: "year", label: "Financial year (e.g. 2024-25)", type: "text" },
          { key: "turnover", label: "Turnover / gross receipts", type: "money" },
          { key: "grossProfit", label: "Gross profit", type: "money" },
          { key: "netProfit", label: "Net profit (after tax)", type: "money" },
          { key: "depreciation", label: "Depreciation", type: "money" },
          { key: "interestPaid", label: "Interest paid on loans", type: "money" },
          { key: "remuneration", label: "Partner / director remuneration", type: "money" },
          { key: "tax", label: "Tax paid", type: "money" },
        ],
      },
      {
        key: "balanceSheet",
        label: "Balance sheet figures, same years",
        hint: "From the balance sheet, newest year first. Used for debt-to-equity, current ratio, collection and stock days.",
        maxRows: 3,
        startRows: 3,
        show: { path: "income.profile", in: SELF },
        columns: [
          { key: "year", label: "Financial year", type: "text" },
          { key: "netWorth", label: "Net worth (capital + reserves)", type: "money" },
          { key: "bankDebt", label: "Loans from banks / NBFCs, secured", type: "money" },
          { key: "highCostDebt", label: "Unsecured business loans", type: "money" },
          { key: "promoterLoans", label: "Loans from family / promoters", type: "money" },
          { key: "currentAssets", label: "Current assets", type: "money" },
          { key: "currentLiabilities", label: "Current liabilities", type: "money" },
          { key: "debtors", label: "Debtors", type: "money" },
          { key: "inventory", label: "Stock", type: "money" },
          { key: "creditors", label: "Creditors", type: "money" },
        ],
      },
    ],
  },
  {
    id: "obligations",
    title: "Existing loans and credit score",
    customer: true,
    families: "all",
    fields: [
      { key: "cibilScore", label: "CIBIL score (if you know it)", type: "number", core: true },
      { key: "cibilDate", label: "Score checked on", type: "date" },
      { key: "overdue", label: "Any loan or card payment missed or overdue in the last 12 months?", type: "yesno", core: true },
      { key: "overdueDetails", label: "Details", type: "longtext", show: { path: "obligations.overdue", in: ["Yes"] } },
      { key: "settled", label: "Has any loan ever been settled, written off or restructured?", type: "yesno" },
      { key: "settledDetails", label: "Details", type: "longtext", show: { path: "obligations.settled", in: ["Yes"] } },
      { key: "cardLimit", label: "Total credit card limit (₹)", type: "money" },
      { key: "cardOutstanding", label: "Credit card amount outstanding now (₹)", type: "money" },
    ],
    tables: [
      {
        key: "loans",
        label: "Running loans",
        hint: "Every loan you are paying now: home, car, personal, business, gold, loan against shares. Leave empty if none.",
        maxRows: 12,
        startRows: 2,
        columns: [
          { key: "lender", label: "Lender", type: "text" },
          { key: "type", label: "Loan type", type: "select", options: ["Home loan", "Loan against property", "Car loan", "Personal loan", "Business loan", "Gold loan", "Education loan", "Two-wheeler / consumer", "Other"] },
          { key: "sanctioned", label: "Original loan (₹)", type: "money" },
          { key: "outstanding", label: "Outstanding now (₹)", type: "money" },
          { key: "emi", label: "Monthly EMI (₹)", type: "money" },
          { key: "monthsLeft", label: "Months left", type: "number" },
          { key: "foir", label: "Count this EMI in the repayment capacity?", type: "yesno" },
          { key: "status", label: "Status", type: "select", options: ["Live", "Closed", "Will be closed from this loan"] },
          { key: "paid", label: "EMIs paid so far", type: "number" },
          { key: "bounces", label: "Bounces in the track", type: "number" },
          { key: "dpd30", label: "Times 30+ days late", type: "number" },
        ],
      },
    ],
  },
  {
    id: "banking",
    title: "Bank accounts and statements",
    intro: "From the last 12 months' statements of the main account(s). Enter one row per month, newest first.",
    customer: true,
    families: "all",
    fields: [
      { key: "mainBank", label: "Main bank", type: "text", core: true },
      { key: "accountType", label: "Account type", type: "select", options: ["Savings", "Current", "Overdraft / cash credit"] },
      { key: "accountSince", label: "Account open since (year)", type: "number" },
      { key: "otherAccounts", label: "Other bank accounts you use (bank and type)", type: "longtext" },
      { key: "emiBounces", label: "Number of EMI / cheque bounces in the last 12 months", type: "number" },
    ],
    tables: [
      {
        key: "months",
        label: "Month-wise banking",
        maxRows: 12,
        startRows: 6,
        columns: [
          { key: "month", label: "Month (e.g. Oct 2026)", type: "text" },
          { key: "credits", label: "Total credits (₹)", type: "money" },
          { key: "debits", label: "Total debits (₹)", type: "money" },
          { key: "avgBalance", label: "Average balance (₹)", type: "money" },
          { key: "minBalance", label: "Lowest balance (₹)", type: "money" },
          { key: "returns", label: "Cheque / EMI returns", type: "number" },
        ],
      },
    ],
  },
  {
    id: "gst",
    title: "GST turnover",
    intro: "From GSTR-3B, one row per month, newest first.",
    customer: true,
    families: ["LAP", "BUSINESS", "OTHER", "HOME"],
    show: { path: "income.gstRegistered", in: ["Yes"] },
    fields: [{ key: "gstNotes", label: "Anything the CAM should know about the GST returns (late filing, notices)", type: "longtext" }],
    tables: [
      {
        key: "months",
        label: "Month-wise GST",
        maxRows: 12,
        startRows: 6,
        columns: [
          { key: "month", label: "Month (e.g. Oct 2026)", type: "text" },
          { key: "sales", label: "Sales / outward supplies (₹)", type: "money" },
          { key: "purchases", label: "Purchases (₹)", type: "money" },
          { key: "taxPaid", label: "GST paid in cash (₹)", type: "money" },
        ],
      },
    ],
  },
  {
    id: "property",
    title: "Property",
    customer: true,
    families: ["HOME", "LAP"],
    fields: [
      { key: "status", label: "Property status", type: "select", options: ["Resale", "Builder (under construction)", "Builder (ready possession)", "Self-construction", "Plot purchase", "Already owned (for LAP)"], core: true },
      { key: "type", label: "Property type", type: "select", options: ["Residential flat", "Independent house / bungalow", "Commercial shop / office", "Industrial", "Plot / land", "Mixed use", "Other"], core: true },
      { key: "usage", label: "How is it used?", type: "select", options: ["Self-occupied", "Rented out", "Vacant", "Under construction"] },
      { key: "monthlyRent", label: "Rent received per month (₹)", type: "money", show: { path: "property.usage", in: ["Rented out"] } },
      { key: "address", label: "Property address", type: "longtext", core: true },
      { key: "city", label: "City", type: "text", core: true },
      { key: "areaSqft", label: "Area (sq ft)", type: "number" },
      { key: "ownerName", label: "Owner's name(s) on the documents", type: "text" },
      { key: "ownership", label: "Ownership", type: "select", options: ["Sole", "Joint with family", "Joint with others", "Company / firm"] },
      { key: "agreementValue", label: "Agreement / purchase value (₹)", type: "money", core: true },
      { key: "marketValue", label: "Your estimate of today's market value (₹)", type: "money" },
      { key: "ageYears", label: "Age of the building (years)", type: "number" },
      { key: "builderName", label: "Builder / project name", type: "text", show: { path: "property.status", in: ["Builder (under construction)", "Builder (ready possession)"] } },
      { key: "rera", label: "RERA registration number", type: "text", show: { path: "property.status", in: ["Builder (under construction)", "Builder (ready possession)"] } },
      { key: "authority", label: "Society / authority", type: "select", options: ["Co-operative society", "CIDCO / MHADA / SRA", "Gram panchayat", "Municipal corporation", "Other"] },
      { key: "titleClear", label: "Title is clear and documents are with you?", type: "yesno" },
      { key: "existingCharge", label: "Is the property already mortgaged to anyone?", type: "yesno" },
      { key: "existingChargeAmount", label: "Outstanding on it (₹)", type: "money", show: { path: "property.existingCharge", in: ["Yes"] } },
    ],
    tables: [],
  },
  {
    id: "education",
    title: "Course and education costs",
    customer: true,
    families: ["EDUCATION"],
    fields: [
      { key: "studentName", label: "Student's name", type: "text", core: true },
      { key: "relation", label: "Relation of the applicant to the student", type: "text" },
      { key: "level", label: "Level of study", type: "select", options: ["Diploma / certificate", "Under-graduate", "Post-graduate", "Doctorate", "Other"], core: true },
      { key: "course", label: "Course", type: "text", core: true },
      { key: "institute", label: "College / university", type: "text", core: true },
      { key: "country", label: "Country", type: "text", core: true },
      { key: "startDate", label: "Course starts on", type: "date" },
      { key: "durationMonths", label: "Course length (months)", type: "number" },
      { key: "admission", label: "Admission status", type: "select", options: ["Admission received", "Applied, waiting", "Not applied yet"] },
      { key: "tuition", label: "Tuition fees, total (₹)", type: "money", core: true },
      { key: "living", label: "Living and accommodation, total (₹)", type: "money" },
      { key: "travel", label: "Travel, visa, insurance (₹)", type: "money" },
      { key: "otherCost", label: "Books, equipment, other (₹)", type: "money" },
      { key: "scholarship", label: "Scholarship or grant (₹)", type: "money" },
      { key: "ownContribution", label: "Family's own contribution (₹)", type: "money" },
      { key: "lastDegree", label: "Last degree and marks / percentage", type: "text" },
      { key: "testScore", label: "Entrance / language test score (GRE, GMAT, IELTS, TOEFL)", type: "text" },
      { key: "collateral", label: "Collateral offered?", type: "yesno" },
      { key: "collateralDetails", label: "What, and its value", type: "text", show: { path: "education.collateral", in: ["Yes"] } },
      { key: "coIncomeSource", label: "Co-applicant's occupation (a parent or guardian is usually the co-applicant)", type: "text" },
    ],
    tables: [],
  },
  {
    id: "assets",
    title: "Assets and savings",
    customer: true,
    families: "all",
    fields: [],
    tables: [
      {
        key: "assets",
        label: "What you own",
        hint: "Savings, fixed deposits, mutual funds, shares, gold, vehicles, other property, insurance surrender value.",
        maxRows: 10,
        startRows: 3,
        columns: [
          { key: "type", label: "Asset", type: "select", options: ["Savings / bank balance", "Fixed deposit", "Mutual funds / shares", "Gold", "Vehicle", "Other property", "Insurance / PPF / EPF", "Other"] },
          { key: "description", label: "Details", type: "text" },
          { key: "value", label: "Value today (₹)", type: "money" },
        ],
      },
    ],
  },
  {
    id: "references",
    title: "References",
    customer: true,
    families: "all",
    fields: [],
    tables: [
      {
        key: "people",
        label: "Two people who know you (not family living with you)",
        maxRows: 3,
        startRows: 2,
        columns: [
          { key: "name", label: "Name", type: "text" },
          { key: "relation", label: "Relation", type: "text" },
          { key: "phone", label: "Mobile", type: "text" },
          { key: "city", label: "City", type: "text" },
        ],
      },
    ],
  },
  {
    id: "valuation",
    title: "Valuation (staff)",
    intro: "From the lender's valuer reports. The lower of the two valuations is the market value that counts.",
    customer: false,
    families: ["HOME", "LAP"],
    fields: [
      { key: "valuer1", label: "Valuer 1, name", type: "text" },
      { key: "valuer1Value", label: "Valuer 1, market value (₹)", type: "money" },
      { key: "valuer2", label: "Valuer 2, name", type: "text" },
      { key: "valuer2Value", label: "Valuer 2, market value (₹)", type: "money" },
      { key: "technicalNote", label: "Technical report remarks", type: "longtext" },
      { key: "legalNote", label: "Legal / title search remarks", type: "longtext" },
      { key: "approvedPlan", label: "Approved plan available?", type: "yesno" },
      { key: "marketability", label: "Marketability of the property", type: "select", options: ["Good", "Average", "Poor"] },
    ],
    tables: [],
  },
  {
    id: "bankingDetail",
    title: "Bank statement analysis, in detail (staff)",
    intro: "Worked out from the statements, one row per month. The average balance is taken from the balances on the 5th, 10th, 15th and 25th, as lenders do.",
    customer: false,
    families: "all",
    fields: [
      { key: "bankName", label: "Bank and account analysed", type: "text" },
      { key: "includeInAbb", label: "Count this account in the average balance?", type: "yesno" },
    ],
    tables: [
      {
        key: "detail",
        label: "Month by month, from the statement",
        maxRows: 12,
        startRows: 6,
        columns: [
          { key: "month", label: "Month", type: "text" },
          { key: "creditCount", label: "Number of credits", type: "number" },
          { key: "debitCount", label: "Number of debits", type: "number" },
          { key: "salary", label: "Salary / regular credits (₹)", type: "money" },
          { key: "emisSeen", label: "EMIs seen going out (₹)", type: "money" },
          { key: "bal5", label: "Balance on 5th (₹)", type: "money" },
          { key: "bal10", label: "Balance on 10th (₹)", type: "money" },
          { key: "bal15", label: "Balance on 15th (₹)", type: "money" },
          { key: "bal25", label: "Balance on 25th (₹)", type: "money" },
          { key: "inward", label: "Inward cheque returns", type: "number" },
          { key: "outward", label: "Outward cheque returns", type: "number" },
        ],
      },
    ],
  },
  {
    id: "discussion",
    title: "Personal discussion and visit (staff)",
    customer: false,
    families: "all",
    fields: [
      { key: "doneBy", label: "Done by", type: "text" },
      { key: "doneOn", label: "Date", type: "date" },
      { key: "mode", label: "How", type: "select", options: ["Residence visit", "Office / business visit", "Both visits", "Telephone only", "Video call"] },
      { key: "rating", label: "Overall impression", type: "select", options: ["Good", "Average", "Poor"] },
      { key: "personal", label: "About the person", type: "longtext" },
      { key: "family", label: "Family and dependants", type: "longtext" },
      { key: "incomeUnderstood", label: "How the income was understood", type: "longtext" },
      { key: "assetsSeen", label: "Assets and standard of living seen", type: "longtext" },
      { key: "strength", label: "Strength of the case", type: "longtext" },
      { key: "issues", label: "Issues", type: "longtext" },
    ],
    tables: [],
  },
  {
    id: "checks",
    title: "Credit checks and verification (staff)",
    intro: "What has been checked and how it came out. A negative or fraud result is raised as a risk.",
    customer: false,
    families: "all",
    fields: [
      { key: "fiResidence", label: "Field visit, residence", type: "select", options: ["Pending", "Positive", "Negative", "Refer", "Not required"] },
      { key: "fiOffice", label: "Field visit, office / business", type: "select", options: ["Pending", "Positive", "Negative", "Refer", "Not required"] },
      { key: "tvr", label: "Telephone verification", type: "select", options: ["Pending", "Positive", "Negative", "Refer", "Not required"] },
      { key: "rcu", label: "Document / income check (RCU)", type: "select", options: ["Pending", "Clear", "Fraud suspected", "Not required"] },
      { key: "cibilCheck", label: "Credit bureau check", type: "select", options: ["Pending", "Positive", "Negative", "Refer", "Not required"] },
      { key: "dedupe", label: "Duplicate / earlier application check", type: "select", options: ["Pending", "Clear", "Found earlier case", "Not required"] },
      { key: "negativeArea", label: "Negative area check (residence and office)", type: "select", options: ["Pending", "Clear", "Negative area", "Not required"] },
      { key: "emailConfirmed", label: "Email confirmed", type: "yesno" },
      { key: "exposureTrack", label: "Existing loans and tracks are clean", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "sustainability", label: "Business is sustainable: competition, changes in the trade", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "contracts", label: "Contracts running and coming", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "succession", label: "Succession or joint applicant in place", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "gstVariation", label: "Variation between GST returns and sales explained", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "chequeReturns", label: "Cheque returns explained", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "expenseVariation", label: "Changes in indirect expenses explained", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "taxPaid", label: "Tax paid is reasonable for the profit shown", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "itrDeviation", label: "Personal ITR matches the business figures", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "fundsDiversion", label: "No diversion of funds, capital withdrawal or other business", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "marketBorrowing", label: "Borrowing from the market is not rising", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
      { key: "marginVariation", label: "Variation in margins explained", type: "select", options: ["Satisfactory", "Concern", "Not checked"] },
    ],
    tables: [],
  },
  {
    id: "documents",
    title: "Document checklist (staff)",
    intro: "One row per document, per person. Pending items are listed in the Excel under what is still needed.",
    customer: false,
    families: "all",
    fields: [],
    tables: [
      {
        key: "list",
        label: "Documents",
        maxRows: 40,
        startRows: 8,
        columns: [
          { key: "document", label: "Document", type: "select", options: ["Application form with photograph", "PAN card", "Aadhaar card", "Address proof, residence", "Address proof, business", "Passport-size photographs", "Signature proof", "Salary slips, last 3 months", "Form 16 / ITR, last 2 to 3 years", "Bank statements, last 6 to 12 months", "Computation of income, balance sheet and P&L, last 2 to 3 years", "GST registration and returns", "Business proof: shop act, Udyam, partnership deed, MOA / AOA", "Qualification certificate (professionals)", "Existing loan statements and sanction letters", "Property: sale deed / agreement", "Property: title documents and search report", "Property: approved plan, OC / CC", "Property: society NOC, share certificate, maintenance bill", "Property: latest property tax receipt", "Valuation report", "Admission letter and fee structure (education)", "Mark sheets and test scores (education)", "Co-applicant KYC and income proof", "Cheque / ECS / NACH mandate", "Other"] },
          { key: "who", label: "For (applicant / co-applicant name)", type: "text" },
          { key: "status", label: "Status", type: "select", options: ["Received", "Pending", "Not applicable", "Waived"] },
          { key: "remark", label: "Remark", type: "text" },
        ],
      },
    ],
  },
  {
    id: "remarks",
    title: "Staff assessment (not shown to the customer)",
    intro: "Our own findings and the recommendation that goes into the CAM.",
    customer: false,
    families: "all",
    fields: [
      { key: "verifications", label: "Verification done", type: "longtext", hint: "Residence / office visit, telephone check, documents seen, bank statements checked" },
      { key: "strengths", label: "Strengths of the case", type: "longtext" },
      { key: "concerns", label: "Concerns and risks", type: "longtext" },
      { key: "deviations", label: "Deviations needed from the lender's policy", type: "longtext" },
      { key: "recommendation", label: "Recommendation", type: "select", options: ["Proceed", "Proceed with conditions", "Needs more information", "Not recommended"] },
      { key: "recommendedLenders", label: "Lenders to approach", type: "text" },
      { key: "recommendedAmount", label: "Recommended loan amount (₹)", type: "money" },
      { key: "recommendedTenure", label: "Recommended tenure (years)", type: "number" },
      { key: "assumedRate", label: "Rate to assume for the calculations (% a year)", type: "percent", hint: "Leave blank to use the default for this loan type" },
      { key: "foirCeiling", label: "Repayment ceiling to assume (% of income)", type: "percent", hint: "Leave blank to use the default for this loan type" },
      { key: "conditions", label: "Conditions / notes for the lender", type: "longtext" },
      { key: "incomeProgram", label: "Which income to use for the repayment capacity", type: "select", options: ["Cash profit (default)", "Net profit program", "Gross margin program", "Highest of the programs"], hint: "Lenders use different programs. The Income programs sheet shows all of them side by side." },
    ],
    tables: [
      {
        key: "deviationList",
        label: "Deviations and how each is covered",
        maxRows: 8,
        startRows: 2,
        columns: [
          { key: "deviation", label: "Deviation from the lender's policy", type: "text" },
          { key: "level", label: "Level", type: "select", options: ["Low", "Medium", "High"] },
          { key: "mitigant", label: "What covers it", type: "text" },
        ],
      },
    ],
  },
];

export const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

/** The loan family a CRM loan-type slug belongs to. */
export function familyOfSlug(slug: string | null | undefined): Family {
  const s = (slug ?? "").toLowerCase();
  if (!s) return "OTHER";
  if (s.includes("education")) return "EDUCATION";
  if (["home-loan", "balance-transfer"].includes(s)) return "HOME";
  if (["loan-against-property", "micro-lap", "lease-rental-discounting", "dlod", "project-funding"].includes(s)) return "LAP";
  if (/(business|working-capital|cash-credit|overdraft|machine|cgtmse|bill-discounting|unsecured-dod|bank-guarantee|letter-of-credit|professional|private-funding)/.test(s)) return "BUSINESS";
  return "OTHER";
}

export type CamData = Record<string, Record<string, unknown>>;

const lookup = (data: CamData, path: string): unknown => {
  const [section, key] = path.split(".");
  return section && key ? data[section]?.[key] : undefined;
};

/** Whether a field, table or section is showing, given what has been answered so far. */
export const visible = (cond: Cond | undefined, data: CamData): boolean => {
  if (!cond) return true;
  const v = lookup(data, cond.path);
  return typeof v === "string" && cond.in.includes(v);
};

/** The sections that apply to a loan family. `forCustomer` leaves out the staff-only ones. */
export function sectionsFor(family: Family, forCustomer = false): Section[] {
  return SECTIONS.filter((s) => (s.families === "all" || s.families.includes(family)) && (!forCustomer || s.customer));
}

// ─── cleaning what comes in ────────────────────────────────────────────────

const isoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? "" : v;
};

/** One answer cleaned for its type: wrong shapes and out-of-range values become empty, never an error. */
export function cleanValue(type: FieldType | ColumnType, raw: unknown, options?: string[]): string | number | null {
  const str = typeof raw === "string" || typeof raw === "number" ? String(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() : "";
  switch (type) {
    case "text": return str.slice(0, 200) || null;
    case "longtext": return str.slice(0, 2000) || null;
    case "number": case "money": case "percent": {
      if (str === "") return null;
      const n = Number(str.replace(/,/g, ""));
      if (!Number.isFinite(n)) return null;
      if (type === "money") return n >= 0 && n <= 1e12 ? Math.round(n) : null;
      if (type === "percent") return n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
      return Math.abs(n) <= 1e9 ? n : null;
    }
    case "date": return isoDate(str) || null;
    case "select": return options?.includes(str) ? str : null;
    case "yesno": return str === "Yes" || str === "No" ? str : null;
    case "phone": { const d = str.replace(/\D/g, ""); const t = d.length >= 12 && d.startsWith("91") ? d.slice(-10) : d; return t.length >= 8 && t.length <= 15 ? t : null; }
    case "email": { const e = str.toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160 ? e : null; }
  }
}

/** What a section patch may change, cleaned: unknown keys are dropped, tables are cut to their row limit. */
export function cleanSectionPatch(section: Section, patch: unknown): Record<string, unknown> {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of section.fields) {
    if (!(f.key in p)) continue;
    out[f.key] = cleanValue(f.type, p[f.key], f.options);
  }
  for (const t of section.tables) {
    if (!(t.key in p)) continue;
    const rows = Array.isArray(p[t.key]) ? (p[t.key] as unknown[]).slice(0, t.maxRows) : [];
    out[t.key] = rows
      .map((r) => {
        const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
        const clean: Record<string, unknown> = {};
        for (const c of t.columns) clean[c.key] = cleanValue(c.type, row[c.key], c.options);
        return clean;
      })
      .filter((r) => Object.values(r).some((v) => v !== null));
  }
  return out;
}

/** Merges a cleaned patch (per section) into what is stored. Only sections the caller may touch are applied. */
export function mergePatch(data: CamData, patch: unknown, allowed: Section[]): CamData {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const next: CamData = { ...data };
  for (const s of allowed) {
    if (!(s.id in p)) continue;
    next[s.id] = { ...(next[s.id] ?? {}), ...cleanSectionPatch(s, p[s.id]) };
  }
  return next;
}

const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Core questions still unanswered, among the ones that are showing: "information still missing". */
export function missingCore(family: Family, data: CamData, forCustomer = false): { section: string; label: string }[] {
  const out: { section: string; label: string }[] = [];
  for (const s of sectionsFor(family, forCustomer)) {
    if (!visible(s.show, data)) continue;
    for (const f of s.fields) {
      if (f.core && visible(f.show, data) && blank(data[s.id]?.[f.key])) out.push({ section: s.title, label: f.label });
    }
  }
  return out;
}

/** How much of the form is filled: answered visible questions over all visible questions, as a whole percent. */
export function progress(family: Family, data: CamData, forCustomer = false): number {
  let total = 0;
  let done = 0;
  for (const s of sectionsFor(family, forCustomer)) {
    if (!visible(s.show, data)) continue;
    for (const f of s.fields) {
      if (!visible(f.show, data)) continue;
      total += 1;
      if (!blank(data[s.id]?.[f.key])) done += 1;
    }
    for (const t of s.tables) {
      if (!visible(t.show, data)) continue;
      total += 1;
      if (!blank(data[s.id]?.[t.key])) done += 1;
    }
  }
  return total ? Math.round((done / total) * 100) : 0;
}

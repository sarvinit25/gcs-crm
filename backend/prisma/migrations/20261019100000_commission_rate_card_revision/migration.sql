-- Partner rate card revision: new maximum commission rates and loan amounts, earnings worked out from them
-- (smallest amount x minimum rate, largest amount x maximum rate). Loan Against Securities leaves the card.
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.3, "avgAmountLabel" = '₹30L – ₹1Cr', "earningLabel" = '₹3,000 – ₹30,000' WHERE "label" = 'Home Loan';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.5, "avgAmountLabel" = '₹20L – ₹1Cr', "earningLabel" = '₹2,000 – ₹50,000' WHERE "label" = 'Loan Against Property';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 1.0, "avgAmountLabel" = '₹10L – ₹1Cr', "earningLabel" = '₹1,000 – ₹1,00,000' WHERE "label" = 'Business Loan';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 1.0, "avgAmountLabel" = '₹2L – ₹50L', "earningLabel" = '₹200 – ₹50,000' WHERE "label" = 'Personal Loan';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.3, "avgAmountLabel" = '₹10L – ₹1Cr', "earningLabel" = '₹1,000 – ₹30,000' WHERE "label" = 'Working Capital Loan';
UPDATE "CommissionRateCard" SET "active" = false WHERE "label" = 'Loan Against Securities';
UPDATE "CommissionRateCard" SET "minRate" = 0.05, "maxRate" = 0.1, "avgAmountLabel" = '₹1Cr – ₹10Cr', "earningLabel" = '₹5,000 – ₹1,00,000' WHERE "label" = 'Project Funding';

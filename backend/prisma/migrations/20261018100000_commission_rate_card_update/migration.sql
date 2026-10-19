-- The published partner rate card: commission 0.1% at minimum, new maximums, and earnings worked out from them.
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.3, "earningLabel" = '₹3,000 – ₹30,000' WHERE "label" = 'Home Loan';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.4, "earningLabel" = '₹2,000 – ₹30,000' WHERE "label" = 'Loan Against Property';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.6, "earningLabel" = '₹1,000 – ₹30,000' WHERE "label" = 'Business Loan';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.6, "earningLabel" = '₹200 – ₹15,000' WHERE "label" = 'Personal Loan';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.4, "earningLabel" = '₹1,000 – ₹40,000' WHERE "label" = 'Working Capital Loan';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.3, "earningLabel" = '₹1,000 – ₹1,50,000' WHERE "label" = 'Loan Against Securities';
UPDATE "CommissionRateCard" SET "minRate" = 0.1, "maxRate" = 0.3, "earningLabel" = '₹5,000 – ₹3,00,000' WHERE "label" = 'Project Funding';

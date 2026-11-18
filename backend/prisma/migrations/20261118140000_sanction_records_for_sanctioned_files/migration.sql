-- Files already marked Sanctioned whose sanction record was never made.
-- The Sanctions section lists sanction records, and moving a file to Sanctioned by status alone did not create one,
-- so those files were missing from it. This gives each an approved record so they appear. Nothing existing is changed:
-- a file that already has a record is left exactly as it is, and only files with status SANCTIONED are touched.
INSERT INTO "Sanction" ("id", "applicationId", "financialStatus", "financialAt", "sanctionDate", "createdAt", "updatedAt")
SELECT 'bf' || md5(a."id" || clock_timestamp()::text), a."id", 'APPROVED', NOW(), NOW(), NOW(), NOW()
FROM "Application" a
WHERE a."status" = 'SANCTIONED'
  AND NOT EXISTS (SELECT 1 FROM "Sanction" s WHERE s."applicationId" = a."id");

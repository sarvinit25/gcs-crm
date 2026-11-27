-- The checklist line a customer uploaded a file under, so the form shows each file beneath its own line.
ALTER TABLE "Document" ADD COLUMN "checklistItem" TEXT;

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX "Lead_loanProductId_idx" ON "Lead"("loanProductId");
CREATE INDEX "Lead_sourcingPartnerId_idx" ON "Lead"("sourcingPartnerId");
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt");
CREATE INDEX "Application_loanProductId_idx" ON "Application"("loanProductId");
CREATE INDEX "Application_lenderId_idx" ON "Application"("lenderId");
CREATE INDEX "Application_bankLoginAt_idx" ON "Application"("bankLoginAt");
CREATE INDEX "Sanction_updatedAt_idx" ON "Sanction"("updatedAt");
CREATE INDEX "Commission_createdAt_idx" ON "Commission"("createdAt");

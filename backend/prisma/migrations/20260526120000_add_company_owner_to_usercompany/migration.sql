ALTER TABLE "UserCompany"
ADD COLUMN "isCompanyOwner" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "UserCompany_companyId_isCompanyOwner_idx"
ON "UserCompany"("companyId", "isCompanyOwner");

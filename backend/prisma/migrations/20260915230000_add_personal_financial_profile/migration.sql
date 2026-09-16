CREATE TYPE "PersonalPlanningContext" AS ENUM ('INDIVIDUAL', 'FAMILY');

CREATE TYPE "PersonalFinancialDataCoverage" AS ENUM ('FULL', 'PARTIAL');

CREATE TYPE "PersonalPlanningStyle" AS ENUM ('CONSERVATIVE', 'BALANCED', 'FLEXIBLE');

CREATE TYPE "PersonalAdjustmentPace" AS ENUM ('GRADUAL', 'IMMEDIATE');

CREATE TYPE "PersonalCategoryFlexibility" AS ENUM ('PROTECTED', 'MODERATE', 'FLEXIBLE');

CREATE TABLE "PersonalFinancialProfile" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "personalWorkspaceId" INTEGER NOT NULL,
    "planningContext" "PersonalPlanningContext",
    "adultsCount" INTEGER,
    "dependentsCount" INTEGER,
    "financialDataCoverage" "PersonalFinancialDataCoverage",
    "emergencyReserveTargetMonths" INTEGER,
    "planningStyle" "PersonalPlanningStyle",
    "adjustmentPace" "PersonalAdjustmentPace",
    "categoryPrioritiesReviewedAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalFinancialProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalFinancialCategoryPreference" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "flexibility" "PersonalCategoryFlexibility" NOT NULL,
    "minimumMonthlyAmount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalFinancialCategoryPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalFinancialProfileRevision" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalFinancialProfileRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalFinancialProfile_ownerUserId_key"
ON "PersonalFinancialProfile"("ownerUserId");

CREATE UNIQUE INDEX "PersonalFinancialProfile_personalWorkspaceId_key"
ON "PersonalFinancialProfile"("personalWorkspaceId");

CREATE INDEX "PersonalFinancialProfile_ownerUserId_personalWorkspaceId_idx"
ON "PersonalFinancialProfile"("ownerUserId", "personalWorkspaceId");

CREATE UNIQUE INDEX "unique_personal_financial_category_preference"
ON "PersonalFinancialCategoryPreference"("profileId", "categoryId");

CREATE INDEX "PersonalFinancialCategoryPreference_categoryId_idx"
ON "PersonalFinancialCategoryPreference"("categoryId");

CREATE UNIQUE INDEX "unique_personal_financial_profile_revision"
ON "PersonalFinancialProfileRevision"("profileId", "version");

CREATE INDEX "PersonalFinancialProfileRevision_profileId_createdAt_idx"
ON "PersonalFinancialProfileRevision"("profileId", "createdAt");

ALTER TABLE "PersonalFinancialProfile"
ADD CONSTRAINT "PersonalFinancialProfile_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalFinancialProfile"
ADD CONSTRAINT "PersonalFinancialProfile_personalWorkspaceId_fkey"
FOREIGN KEY ("personalWorkspaceId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalFinancialCategoryPreference"
ADD CONSTRAINT "PersonalFinancialCategoryPreference_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "PersonalFinancialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalFinancialCategoryPreference"
ADD CONSTRAINT "PersonalFinancialCategoryPreference_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalFinancialProfileRevision"
ADD CONSTRAINT "PersonalFinancialProfileRevision_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "PersonalFinancialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

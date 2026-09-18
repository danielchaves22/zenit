CREATE TABLE "FinancialPlanningGuidanceRecord" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "personalWorkspaceId" INTEGER NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "providerResponseId" VARCHAR(180),
    "model" VARCHAR(120) NOT NULL,
    "promptVersion" VARCHAR(80) NOT NULL,
    "guidanceMethodologyVersion" INTEGER NOT NULL,
    "evidenceMethodologyVersion" INTEGER NOT NULL,
    "recommendationMethodologyVersion" INTEGER NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "guidance" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "usedFallbackModel" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPlanningGuidanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialPlanningGuidanceRecord_snapshotId_id_idx"
ON "FinancialPlanningGuidanceRecord"("snapshotId", "id");

CREATE INDEX "FinancialPlanningGuidanceRecord_ownerUserId_createdAt_idx"
ON "FinancialPlanningGuidanceRecord"("ownerUserId", "createdAt");

CREATE INDEX "FinancialPlanningGuidanceRecord_personalWorkspaceId_createdAt_idx"
ON "FinancialPlanningGuidanceRecord"("personalWorkspaceId", "createdAt");

ALTER TABLE "FinancialPlanningGuidanceRecord"
ADD CONSTRAINT "FinancialPlanningGuidanceRecord_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "FinancialPlanningSnapshot"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialPlanningGuidanceRecord"
ADD CONSTRAINT "FinancialPlanningGuidanceRecord_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialPlanningGuidanceRecord"
ADD CONSTRAINT "FinancialPlanningGuidanceRecord_personalWorkspaceId_fkey"
FOREIGN KEY ("personalWorkspaceId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

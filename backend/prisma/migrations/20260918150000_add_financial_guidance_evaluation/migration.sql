ALTER TABLE "FinancialPlanningGuidanceRecord"
ADD COLUMN "evaluationMethodologyVersion" INTEGER,
ADD COLUMN "evaluationScore" INTEGER,
ADD COLUMN "evaluation" JSONB;

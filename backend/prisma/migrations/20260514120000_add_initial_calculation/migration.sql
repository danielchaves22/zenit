-- CreateEnum
CREATE TYPE "InitialCalculationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FgtsRegime" AS ENUM ('FGTS_8', 'FGTS_11_2');

-- CreateEnum
CREATE TYPE "CalculationVerbaScope" AS ENUM ('SYSTEM', 'COMPANY');

-- CreateEnum
CREATE TYPE "CalculationVerbaStrategy" AS ENUM ('MONTHLY_WITH_STANDARD_REFLEXES', 'STANDARD_RESCISORY_BLOCK', 'RESCISORY_NOTICE', 'QUANTITY_X_HOURLY_RATE', 'QUANTITY_X_DAILY_RATE', 'MONTHS_X_REMUNERATION', 'MONTHS_X_BASE_AMOUNT', 'FIXED_AMOUNT', 'CONDITIONAL_PENALTY_467', 'CONDITIONAL_PENALTY_477');

-- CreateEnum
CREATE TYPE "CalculationVerbaFgtsMode" AS ENUM ('REGIME', 'FIXED_8', 'NONE');

-- CreateEnum
CREATE TYPE "CalculationVersionVerbaSource" AS ENUM ('TEMPLATE', 'PROCESS_CUSTOM', 'AD_HOC');

-- CreateEnum
CREATE TYPE "CalculationLineType" AS ENUM ('PRINCIPAL', 'REFLEXO_13', 'REFLEXO_FERIAS', 'REFLEXO_AVISO', 'REFLEXO_DSR', 'FGTS', 'MULTA', 'TOTAL', 'OUTRA');

-- CreateTable
CREATE TABLE "CalculationRuleSet" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculationRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationVerbaTemplate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "scope" "CalculationVerbaScope" NOT NULL DEFAULT 'SYSTEM',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupLabel" TEXT NOT NULL,
    "strategy" "CalculationVerbaStrategy" NOT NULL,
    "fgtsMode" "CalculationVerbaFgtsMode" NOT NULL DEFAULT 'NONE',
    "configJson" JSONB,
    "inputSchemaJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculationVerbaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessCustomVerba" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupLabel" TEXT NOT NULL,
    "strategy" "CalculationVerbaStrategy" NOT NULL,
    "fgtsMode" "CalculationVerbaFgtsMode" NOT NULL DEFAULT 'NONE',
    "configJson" JSONB,
    "inputSchemaJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER NOT NULL,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessCustomVerba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialCalculation" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "status" "InitialCalculationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentPublishedVersionId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InitialCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialCalculationVersion" (
    "id" SERIAL NOT NULL,
    "initialCalculationId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "ruleSetId" INTEGER NOT NULL,
    "fgtsRegime" "FgtsRegime" NOT NULL,
    "inputSnapshotJson" JSONB NOT NULL,
    "summarySnapshotJson" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitialCalculationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialCalculationVersionVerba" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "sourceType" "CalculationVersionVerbaSource" NOT NULL,
    "templateId" INTEGER,
    "processCustomVerbaId" INTEGER,
    "verbaCode" TEXT NOT NULL,
    "verbaLabel" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupLabel" TEXT NOT NULL,
    "strategy" "CalculationVerbaStrategy" NOT NULL,
    "fgtsMode" "CalculationVerbaFgtsMode" NOT NULL DEFAULT 'NONE',
    "configJson" JSONB,
    "inputSchemaJson" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitialCalculationVersionVerba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialCalculationLine" (
    "id" SERIAL NOT NULL,
    "versionVerbaId" INTEGER NOT NULL,
    "lineType" "CalculationLineType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "memoryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitialCalculationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalculationRuleSet_code_key" ON "CalculationRuleSet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CalculationVerbaTemplate_code_key" ON "CalculationVerbaTemplate"("code");

-- CreateIndex
CREATE INDEX "CalculationVerbaTemplate_companyId_idx" ON "CalculationVerbaTemplate"("companyId");

-- CreateIndex
CREATE INDEX "CalculationVerbaTemplate_scope_isActive_idx" ON "CalculationVerbaTemplate"("scope", "isActive");

-- CreateIndex
CREATE INDEX "CalculationVerbaTemplate_groupCode_sortOrder_idx" ON "CalculationVerbaTemplate"("groupCode", "sortOrder");

-- CreateIndex
CREATE INDEX "ProcessCustomVerba_companyId_idx" ON "ProcessCustomVerba"("companyId");

-- CreateIndex
CREATE INDEX "ProcessCustomVerba_processId_isActive_idx" ON "ProcessCustomVerba"("processId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessCustomVerba_processId_code_key" ON "ProcessCustomVerba"("processId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InitialCalculation_processId_key" ON "InitialCalculation"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "InitialCalculation_currentPublishedVersionId_key" ON "InitialCalculation"("currentPublishedVersionId");

-- CreateIndex
CREATE INDEX "InitialCalculation_companyId_idx" ON "InitialCalculation"("companyId");

-- CreateIndex
CREATE INDEX "InitialCalculation_status_idx" ON "InitialCalculation"("status");

-- CreateIndex
CREATE INDEX "InitialCalculationVersion_ruleSetId_idx" ON "InitialCalculationVersion"("ruleSetId");

-- CreateIndex
CREATE INDEX "InitialCalculationVersion_publishedAt_idx" ON "InitialCalculationVersion"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InitialCalculationVersion_initialCalculationId_versionNumbe_key" ON "InitialCalculationVersion"("initialCalculationId", "versionNumber");

-- CreateIndex
CREATE INDEX "InitialCalculationVersionVerba_versionId_sortOrder_idx" ON "InitialCalculationVersionVerba"("versionId", "sortOrder");

-- CreateIndex
CREATE INDEX "InitialCalculationVersionVerba_templateId_idx" ON "InitialCalculationVersionVerba"("templateId");

-- CreateIndex
CREATE INDEX "InitialCalculationVersionVerba_processCustomVerbaId_idx" ON "InitialCalculationVersionVerba"("processCustomVerbaId");

-- CreateIndex
CREATE INDEX "InitialCalculationVersionVerba_groupCode_idx" ON "InitialCalculationVersionVerba"("groupCode");

-- CreateIndex
CREATE INDEX "InitialCalculationLine_versionVerbaId_sortOrder_idx" ON "InitialCalculationLine"("versionVerbaId", "sortOrder");

-- CreateIndex
CREATE INDEX "InitialCalculationLine_lineType_idx" ON "InitialCalculationLine"("lineType");

-- AddForeignKey
ALTER TABLE "CalculationVerbaTemplate" ADD CONSTRAINT "CalculationVerbaTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessCustomVerba" ADD CONSTRAINT "ProcessCustomVerba_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessCustomVerba" ADD CONSTRAINT "ProcessCustomVerba_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculation" ADD CONSTRAINT "InitialCalculation_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculation" ADD CONSTRAINT "InitialCalculation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculation" ADD CONSTRAINT "InitialCalculation_currentPublishedVersionId_fkey" FOREIGN KEY ("currentPublishedVersionId") REFERENCES "InitialCalculationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculationVersion" ADD CONSTRAINT "InitialCalculationVersion_initialCalculationId_fkey" FOREIGN KEY ("initialCalculationId") REFERENCES "InitialCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculationVersion" ADD CONSTRAINT "InitialCalculationVersion_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "CalculationRuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculationVersionVerba" ADD CONSTRAINT "InitialCalculationVersionVerba_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "InitialCalculationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculationVersionVerba" ADD CONSTRAINT "InitialCalculationVersionVerba_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CalculationVerbaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculationVersionVerba" ADD CONSTRAINT "InitialCalculationVersionVerba_processCustomVerbaId_fkey" FOREIGN KEY ("processCustomVerbaId") REFERENCES "ProcessCustomVerba"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCalculationLine" ADD CONSTRAINT "InitialCalculationLine_versionVerbaId_fkey" FOREIGN KEY ("versionVerbaId") REFERENCES "InitialCalculationVersionVerba"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enums
CREATE TYPE "ProcessStatus" AS ENUM ('SOLICITACAO', 'INICIAL', 'CALCULO');
CREATE TYPE "ProcessOriginType" AS ENUM ('MANUAL', 'IMPORT');
CREATE TYPE "InboundImportSourceType" AS ENUM ('EMAIL');
CREATE TYPE "InboundImportDestinationType" AS ENUM ('PROCESS', 'CLIENT', 'OTHER');

-- Inbound import table (technical source control)
CREATE TABLE "InboundImport" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceType" "InboundImportSourceType" NOT NULL DEFAULT 'EMAIL',
    "externalId" TEXT NOT NULL,
    "payloadMetadata" JSONB,
    "destinationType" "InboundImportDestinationType",
    "destinationId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboundImport_pkey" PRIMARY KEY ("id")
);

-- Business process table
CREATE TABLE "Process" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "status" "ProcessStatus" NOT NULL,
    "requestingLawyerName" TEXT,
    "claimantName" TEXT,
    "notes" TEXT,
    "originType" "ProcessOriginType" NOT NULL DEFAULT 'MANUAL',
    "sourceImportId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Process_sourceImportId_key" ON "Process"("sourceImportId");

-- Status history
CREATE TABLE "ProcessStatusHistory" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER NOT NULL,
    "fromStatus" "ProcessStatus",
    "toStatus" "ProcessStatus" NOT NULL,
    "changedBy" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    CONSTRAINT "ProcessStatusHistory_pkey" PRIMARY KEY ("id")
);

-- Tags
CREATE TABLE "ProcessTag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessTagLink" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessTagLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcessTag_companyId_name_key" ON "ProcessTag"("companyId", "name");
CREATE UNIQUE INDEX "unique_process_tag_link" ON "ProcessTagLink"("processId", "tagId");
CREATE UNIQUE INDEX "unique_inbound_import_per_company_source" ON "InboundImport"("companyId", "sourceType", "externalId");

-- Secondary indexes
CREATE INDEX "InboundImport_companyId_idx" ON "InboundImport"("companyId");
CREATE INDEX "InboundImport_companyId_createdAt_idx" ON "InboundImport"("companyId", "createdAt");
CREATE INDEX "InboundImport_companyId_destinationType_idx" ON "InboundImport"("companyId", "destinationType");
CREATE INDEX "InboundImport_companyId_processedAt_idx" ON "InboundImport"("companyId", "processedAt");

CREATE INDEX "Process_companyId_idx" ON "Process"("companyId");
CREATE INDEX "Process_companyId_status_idx" ON "Process"("companyId", "status");
CREATE INDEX "Process_companyId_createdAt_idx" ON "Process"("companyId", "createdAt");
CREATE INDEX "Process_companyId_deletedAt_idx" ON "Process"("companyId", "deletedAt");

CREATE INDEX "ProcessStatusHistory_processId_idx" ON "ProcessStatusHistory"("processId");
CREATE INDEX "ProcessStatusHistory_changedBy_idx" ON "ProcessStatusHistory"("changedBy");
CREATE INDEX "ProcessStatusHistory_changedAt_idx" ON "ProcessStatusHistory"("changedAt");

CREATE INDEX "ProcessTag_companyId_idx" ON "ProcessTag"("companyId");
CREATE INDEX "ProcessTagLink_processId_idx" ON "ProcessTagLink"("processId");
CREATE INDEX "ProcessTagLink_tagId_idx" ON "ProcessTagLink"("tagId");

-- Foreign keys
ALTER TABLE "InboundImport"
    ADD CONSTRAINT "InboundImport_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Process"
    ADD CONSTRAINT "Process_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Process"
    ADD CONSTRAINT "Process_sourceImportId_fkey"
    FOREIGN KEY ("sourceImportId") REFERENCES "InboundImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Process"
    ADD CONSTRAINT "Process_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Process"
    ADD CONSTRAINT "Process_updatedBy_fkey"
    FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProcessStatusHistory"
    ADD CONSTRAINT "ProcessStatusHistory_processId_fkey"
    FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcessStatusHistory"
    ADD CONSTRAINT "ProcessStatusHistory_changedBy_fkey"
    FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcessTag"
    ADD CONSTRAINT "ProcessTag_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcessTagLink"
    ADD CONSTRAINT "ProcessTagLink_processId_fkey"
    FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcessTagLink"
    ADD CONSTRAINT "ProcessTagLink_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "ProcessTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

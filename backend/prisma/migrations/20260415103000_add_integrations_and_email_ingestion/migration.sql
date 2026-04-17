-- New enums
CREATE TYPE "AiProvider" AS ENUM ('OPENAI');
CREATE TYPE "GmailConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISCONNECTED');
CREATE TYPE "ProcessSourceProvider" AS ENUM ('GMAIL');

-- Process: source provider/thread for business idempotency (1 thread = 1 process)
ALTER TABLE "Process"
  ADD COLUMN "sourceProvider" "ProcessSourceProvider",
  ADD COLUMN "sourceThreadId" TEXT;

CREATE UNIQUE INDEX "unique_process_per_company_source_thread"
  ON "Process"("companyId", "sourceProvider", "sourceThreadId");

-- InboundImport: technical connection/thread/received metadata
ALTER TABLE "InboundImport"
  ADD COLUMN "connectionId" INTEGER,
  ADD COLUMN "externalThreadId" TEXT,
  ADD COLUMN "sourceReceivedAt" TIMESTAMP(3);

CREATE INDEX "InboundImport_connectionId_idx" ON "InboundImport"("connectionId");
CREATE INDEX "InboundImport_companyId_externalThreadId_idx" ON "InboundImport"("companyId", "externalThreadId");

-- AI credentials per company (BYOK)
CREATE TABLE "CompanyAiCredential" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
  "apiKeyCiphertext" TEXT NOT NULL,
  "apiKeyIv" TEXT NOT NULL,
  "apiKeyTag" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "promptVersion" TEXT NOT NULL DEFAULT 'v1',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyAiCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_ai_credential_per_company_provider"
  ON "CompanyAiCredential"("companyId", "provider");
CREATE INDEX "CompanyAiCredential_companyId_idx" ON "CompanyAiCredential"("companyId");

-- Gmail connection per company
CREATE TABLE "GmailConnection" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "googleEmail" TEXT NOT NULL,
  "googleUserId" TEXT,
  "refreshTokenCiphertext" TEXT NOT NULL,
  "refreshTokenIv" TEXT NOT NULL,
  "refreshTokenTag" TEXT NOT NULL,
  "accessTokenCiphertext" TEXT,
  "accessTokenIv" TEXT,
  "accessTokenTag" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "status" "GmailConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "watchExpiration" TIMESTAMP(3),
  "lastError" TEXT,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailConnection_companyId_key" ON "GmailConnection"("companyId");
CREATE INDEX "GmailConnection_companyId_status_idx" ON "GmailConnection"("companyId", "status");
CREATE INDEX "GmailConnection_googleEmail_idx" ON "GmailConnection"("googleEmail");

-- Sync cursor/state
CREATE TABLE "GmailSyncState" (
  "id" SERIAL NOT NULL,
  "connectionId" INTEGER NOT NULL,
  "lastHistoryId" TEXT,
  "lastPollingAt" TIMESTAMP(3),
  "lastReconcileAt" TIMESTAMP(3),
  "lastProcessedMessageAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailSyncState_connectionId_key" ON "GmailSyncState"("connectionId");

-- Per-company ingestion config
CREATE TABLE "EmailIngestionConfig" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "subjectRequiredText" TEXT NOT NULL DEFAULT 'Inicial Trabalhista',
  "lookbackDays" INTEGER NOT NULL DEFAULT 3,
  "pollingIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
  "reconciliationIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
  "maxEmailsPerRun" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailIngestionConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailIngestionConfig_companyId_key" ON "EmailIngestionConfig"("companyId");

-- FKs
ALTER TABLE "CompanyAiCredential"
  ADD CONSTRAINT "CompanyAiCredential_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GmailConnection"
  ADD CONSTRAINT "GmailConnection_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GmailSyncState"
  ADD CONSTRAINT "GmailSyncState_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "GmailConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailIngestionConfig"
  ADD CONSTRAINT "EmailIngestionConfig_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundImport"
  ADD CONSTRAINT "InboundImport_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "GmailConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

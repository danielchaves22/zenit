ALTER TYPE "AppKey" ADD VALUE IF NOT EXISTS 'ZENIT_WHATSAPP';

CREATE TYPE "WhatsAppBindingChallengeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED');
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "WhatsAppMessageKind" AS ENUM ('TEXT', 'INTERACTIVE', 'STATUS', 'SYSTEM');

CREATE TABLE "WhatsAppBindingChallenge" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "preferredCompanyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "WhatsAppBindingChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppBindingChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppUserBinding" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "activeCompanyId" INTEGER NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "displayName" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppUserBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppBindingCompanyContext" (
    "id" SERIAL NOT NULL,
    "bindingId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "assistantSessionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppBindingCompanyContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMessageLog" (
    "id" SERIAL NOT NULL,
    "bindingId" INTEGER,
    "assistantSessionId" INTEGER,
    "userId" INTEGER,
    "companyId" INTEGER,
    "waId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "kind" "WhatsAppMessageKind" NOT NULL DEFAULT 'TEXT',
    "whatsappMessageId" TEXT,
    "status" TEXT,
    "text" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppBindingChallenge_code_key" ON "WhatsAppBindingChallenge"("code");
CREATE INDEX "WhatsAppBindingChallenge_userId_status_expiresAt_idx" ON "WhatsAppBindingChallenge"("userId", "status", "expiresAt");
CREATE INDEX "WhatsAppBindingChallenge_preferredCompanyId_status_idx" ON "WhatsAppBindingChallenge"("preferredCompanyId", "status");

CREATE UNIQUE INDEX "WhatsAppUserBinding_userId_key" ON "WhatsAppUserBinding"("userId");
CREATE UNIQUE INDEX "WhatsAppUserBinding_phoneNumber_key" ON "WhatsAppUserBinding"("phoneNumber");
CREATE UNIQUE INDEX "WhatsAppUserBinding_waId_key" ON "WhatsAppUserBinding"("waId");
CREATE INDEX "WhatsAppUserBinding_activeCompanyId_idx" ON "WhatsAppUserBinding"("activeCompanyId");

CREATE UNIQUE INDEX "WhatsAppBindingCompanyContext_assistantSessionId_key" ON "WhatsAppBindingCompanyContext"("assistantSessionId");
CREATE UNIQUE INDEX "unique_whatsapp_binding_company_context" ON "WhatsAppBindingCompanyContext"("bindingId", "companyId");
CREATE INDEX "WhatsAppBindingCompanyContext_companyId_updatedAt_idx" ON "WhatsAppBindingCompanyContext"("companyId", "updatedAt");

CREATE UNIQUE INDEX "WhatsAppMessageLog_whatsappMessageId_key" ON "WhatsAppMessageLog"("whatsappMessageId");
CREATE INDEX "WhatsAppMessageLog_waId_createdAt_idx" ON "WhatsAppMessageLog"("waId", "createdAt");
CREATE INDEX "WhatsAppMessageLog_companyId_createdAt_idx" ON "WhatsAppMessageLog"("companyId", "createdAt");
CREATE INDEX "WhatsAppMessageLog_assistantSessionId_createdAt_idx" ON "WhatsAppMessageLog"("assistantSessionId", "createdAt");

ALTER TABLE "WhatsAppBindingChallenge"
    ADD CONSTRAINT "WhatsAppBindingChallenge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppBindingChallenge"
    ADD CONSTRAINT "WhatsAppBindingChallenge_preferredCompanyId_fkey"
    FOREIGN KEY ("preferredCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppUserBinding"
    ADD CONSTRAINT "WhatsAppUserBinding_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppUserBinding"
    ADD CONSTRAINT "WhatsAppUserBinding_activeCompanyId_fkey"
    FOREIGN KEY ("activeCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppBindingCompanyContext"
    ADD CONSTRAINT "WhatsAppBindingCompanyContext_bindingId_fkey"
    FOREIGN KEY ("bindingId") REFERENCES "WhatsAppUserBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppBindingCompanyContext"
    ADD CONSTRAINT "WhatsAppBindingCompanyContext_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppBindingCompanyContext"
    ADD CONSTRAINT "WhatsAppBindingCompanyContext_assistantSessionId_fkey"
    FOREIGN KEY ("assistantSessionId") REFERENCES "AssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessageLog"
    ADD CONSTRAINT "WhatsAppMessageLog_bindingId_fkey"
    FOREIGN KEY ("bindingId") REFERENCES "WhatsAppUserBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessageLog"
    ADD CONSTRAINT "WhatsAppMessageLog_assistantSessionId_fkey"
    FOREIGN KEY ("assistantSessionId") REFERENCES "AssistantSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessageLog"
    ADD CONSTRAINT "WhatsAppMessageLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessageLog"
    ADD CONSTRAINT "WhatsAppMessageLog_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

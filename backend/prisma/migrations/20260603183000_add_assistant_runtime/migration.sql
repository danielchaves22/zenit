-- CreateEnum
CREATE TYPE "AssistantMode" AS ENUM ('OPERATOR', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "AssistantSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssistantTurnStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AssistantPendingActionType" AS ENUM ('CREATE_TRANSACTION_DRAFT');

-- CreateEnum
CREATE TYPE "AssistantPendingActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AssistantSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "status" "AssistantSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTurn" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "mode" "AssistantMode" NOT NULL DEFAULT 'OPERATOR',
    "status" "AssistantTurnStatus" NOT NULL DEFAULT 'STARTED',
    "telemetry" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "turnId" INTEGER,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "content" JSONB,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantPendingAction" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "turnId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" "AssistantPendingActionType" NOT NULL,
    "status" "AssistantPendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "summary" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "confirmedTransactionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    CONSTRAINT "AssistantPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantToolTrace" (
    "id" SERIAL NOT NULL,
    "turnId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolCallId" TEXT,
    "status" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantToolTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantSession_userId_companyId_status_idx" ON "AssistantSession"("userId", "companyId", "status");

-- CreateIndex
CREATE INDEX "AssistantSession_companyId_createdAt_idx" ON "AssistantSession"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTurn_sessionId_createdAt_idx" ON "AssistantTurn"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTurn_companyId_status_createdAt_idx" ON "AssistantTurn"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "unique_assistant_message_sequence" ON "AssistantMessage"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "AssistantMessage_sessionId_createdAt_idx" ON "AssistantMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_turnId_idx" ON "AssistantMessage"("turnId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantPendingAction_turnId_key" ON "AssistantPendingAction"("turnId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantPendingAction_confirmedTransactionId_key" ON "AssistantPendingAction"("confirmedTransactionId");

-- CreateIndex
CREATE INDEX "AssistantPendingAction_sessionId_status_createdAt_idx" ON "AssistantPendingAction"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantPendingAction_companyId_userId_status_idx" ON "AssistantPendingAction"("companyId", "userId", "status");

-- CreateIndex
CREATE INDEX "AssistantToolTrace_turnId_createdAt_idx" ON "AssistantToolTrace"("turnId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantToolTrace_companyId_toolName_createdAt_idx" ON "AssistantToolTrace"("companyId", "toolName", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantSession" ADD CONSTRAINT "AssistantSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantSession" ADD CONSTRAINT "AssistantSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AssistantTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPendingAction" ADD CONSTRAINT "AssistantPendingAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPendingAction" ADD CONSTRAINT "AssistantPendingAction_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AssistantTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPendingAction" ADD CONSTRAINT "AssistantPendingAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPendingAction" ADD CONSTRAINT "AssistantPendingAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPendingAction" ADD CONSTRAINT "AssistantPendingAction_confirmedTransactionId_fkey" FOREIGN KEY ("confirmedTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantToolTrace" ADD CONSTRAINT "AssistantToolTrace_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AssistantTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantToolTrace" ADD CONSTRAINT "AssistantToolTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantToolTrace" ADD CONSTRAINT "AssistantToolTrace_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

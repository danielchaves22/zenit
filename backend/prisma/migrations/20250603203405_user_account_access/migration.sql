-- CreateTable
CREATE TABLE "UserFinancialAccountAccess" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "financialAccountId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "grantedBy" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFinancialAccountAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFinancialAccountAccess_userId_idx" ON "UserFinancialAccountAccess"("userId");

-- CreateIndex
CREATE INDEX "UserFinancialAccountAccess_financialAccountId_idx" ON "UserFinancialAccountAccess"("financialAccountId");

-- CreateIndex
CREATE INDEX "UserFinancialAccountAccess_companyId_idx" ON "UserFinancialAccountAccess"("companyId");

-- CreateIndex
CREATE INDEX "UserFinancialAccountAccess_grantedBy_idx" ON "UserFinancialAccountAccess"("grantedBy");

-- CreateIndex
CREATE UNIQUE INDEX "UserFinancialAccountAccess_userId_financialAccountId_key" ON "UserFinancialAccountAccess"("userId", "financialAccountId");

-- AddForeignKey
ALTER TABLE "UserFinancialAccountAccess" ADD CONSTRAINT "UserFinancialAccountAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFinancialAccountAccess" ADD CONSTRAINT "UserFinancialAccountAccess_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFinancialAccountAccess" ADD CONSTRAINT "UserFinancialAccountAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFinancialAccountAccess" ADD CONSTRAINT "UserFinancialAccountAccess_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

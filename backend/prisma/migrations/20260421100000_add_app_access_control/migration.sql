-- CreateEnum
CREATE TYPE "AppKey" AS ENUM ('ZENIT_CASH', 'ZENIT_CALC', 'ZENIT_ADMIN');

-- CreateTable
CREATE TABLE "EcosystemApp" (
    "id" SERIAL NOT NULL,
    "appKey" "AppKey" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EcosystemApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAppEntitlement" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "appId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyAppEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAppGrant" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "appId" INTEGER NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserAppGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EcosystemApp_appKey_key" ON "EcosystemApp"("appKey");

-- CreateIndex
CREATE UNIQUE INDEX "unique_company_app_entitlement" ON "CompanyAppEntitlement"("companyId", "appId");

-- CreateIndex
CREATE INDEX "CompanyAppEntitlement_companyId_idx" ON "CompanyAppEntitlement"("companyId");

-- CreateIndex
CREATE INDEX "CompanyAppEntitlement_appId_idx" ON "CompanyAppEntitlement"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_company_app_grant" ON "UserAppGrant"("userId", "companyId", "appId");

-- CreateIndex
CREATE INDEX "UserAppGrant_userId_idx" ON "UserAppGrant"("userId");

-- CreateIndex
CREATE INDEX "UserAppGrant_companyId_idx" ON "UserAppGrant"("companyId");

-- CreateIndex
CREATE INDEX "UserAppGrant_appId_idx" ON "UserAppGrant"("appId");

-- AddForeignKey
ALTER TABLE "CompanyAppEntitlement" ADD CONSTRAINT "CompanyAppEntitlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAppEntitlement" ADD CONSTRAINT "CompanyAppEntitlement_appId_fkey" FOREIGN KEY ("appId") REFERENCES "EcosystemApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAppGrant" ADD CONSTRAINT "UserAppGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAppGrant" ADD CONSTRAINT "UserAppGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAppGrant" ADD CONSTRAINT "UserAppGrant_appId_fkey" FOREIGN KEY ("appId") REFERENCES "EcosystemApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed app catalog
INSERT INTO "EcosystemApp" ("appKey", "name", "isActive", "updatedAt")
VALUES
  ('ZENIT_CASH', 'Zenit Cash', true, NOW()),
  ('ZENIT_CALC', 'Zenit Calc', true, NOW()),
  ('ZENIT_ADMIN', 'Zenit Admin', true, NOW())
ON CONFLICT ("appKey")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW();

-- Seed company entitlements with full access
INSERT INTO "CompanyAppEntitlement" ("companyId", "appId", "enabled", "updatedAt")
SELECT c."id", a."id", true, NOW()
FROM "Company" c
CROSS JOIN "EcosystemApp" a
ON CONFLICT ("companyId", "appId")
DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "updatedAt" = NOW();

-- Seed user grants with full access
INSERT INTO "UserAppGrant" ("userId", "companyId", "appId", "granted", "updatedAt")
SELECT uc."userId", uc."companyId", a."id", true, NOW()
FROM "UserCompany" uc
CROSS JOIN "EcosystemApp" a
ON CONFLICT ("userId", "companyId", "appId")
DO UPDATE SET
  "granted" = EXCLUDED."granted",
  "updatedAt" = NOW();

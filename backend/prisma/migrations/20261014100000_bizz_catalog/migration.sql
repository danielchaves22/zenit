CREATE TYPE "BizzCatalogItemKind" AS ENUM ('PRODUCT', 'SERVICE');
CREATE TABLE "BizzCatalogItem" (
  "id" UUID NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "kind" "BizzCatalogItemKind" NOT NULL,
  "unit" VARCHAR(40) NOT NULL,
  "canPurchase" BOOLEAN NOT NULL,
  "canSell" BOOLEAN NOT NULL,
  "salePrice" DECIMAL(14,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "requestKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "createdById" INTEGER NOT NULL,
  "updatedById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BizzCatalogItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BizzCatalogItem_usage_check" CHECK ("canPurchase" OR "canSell"),
  CONSTRAINT "BizzCatalogItem_price_check" CHECK ("salePrice" IS NULL OR "salePrice" >= 0),
  CONSTRAINT "BizzCatalogItem_name_check" CHECK (length(trim("name")) > 0),
  CONSTRAINT "BizzCatalogItem_unit_check" CHECK (length(trim("unit")) > 0)
);
CREATE UNIQUE INDEX "BizzCatalogItem_companyId_requestKey_key" ON "BizzCatalogItem"("companyId", "requestKey");
CREATE INDEX "BizzCatalogItem_companyId_active_name_id_idx" ON "BizzCatalogItem"("companyId", "active", "name", "id");
CREATE INDEX "BizzCatalogItem_createdById_idx" ON "BizzCatalogItem"("createdById");
CREATE INDEX "BizzCatalogItem_updatedById_idx" ON "BizzCatalogItem"("updatedById");
ALTER TABLE "BizzCatalogItem" ADD CONSTRAINT "BizzCatalogItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BizzCatalogItem" ADD CONSTRAINT "BizzCatalogItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BizzCatalogItem" ADD CONSTRAINT "BizzCatalogItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

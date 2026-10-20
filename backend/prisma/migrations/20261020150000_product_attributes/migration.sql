-- CreateEnum
-- Additive migration: existing products and services remain unchanged.
CREATE TYPE "ProductAttributeType" AS ENUM ('SELECT', 'TEXT', 'NUMBER');

-- CreateTable
CREATE TABLE "ProductAttribute" (
    "id" UUID NOT NULL,
    "companyId" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "nameKey" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "type" "ProductAttributeType" NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeOption" (
    "id" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "companyId" INTEGER,
    "label" VARCHAR(100) NOT NULL,
    "labelKey" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "itemId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "optionId" UUID,
    "textValue" VARCHAR(500),
    "numberValue" DECIMAL(18,6),

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("itemId","attributeId")
);

-- CreateIndex
CREATE INDEX "ProductAttribute_companyId_active_name_id_idx" ON "ProductAttribute"("companyId", "active", "name", "id");

-- CreateIndex
CREATE INDEX "ProductAttribute_createdById_idx" ON "ProductAttribute"("createdById");

-- CreateIndex
CREATE INDEX "ProductAttribute_updatedById_idx" ON "ProductAttribute"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttribute_companyId_nameKey_key" ON "ProductAttribute"("companyId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttribute_companyId_requestKey_key" ON "ProductAttribute"("companyId", "requestKey");

CREATE UNIQUE INDEX "ProductAttribute_global_name_key" ON "ProductAttribute"("nameKey") WHERE "companyId" IS NULL;
CREATE UNIQUE INDEX "ProductAttribute_global_request_key" ON "ProductAttribute"("requestKey") WHERE "companyId" IS NULL;

-- CreateIndex
CREATE INDEX "ProductAttributeOption_companyId_idx" ON "ProductAttributeOption"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeOption_id_attributeId_key" ON "ProductAttributeOption"("id", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeOption_attributeId_companyId_labelKey_key" ON "ProductAttributeOption"("attributeId", "companyId", "labelKey");

CREATE UNIQUE INDEX "ProductAttributeOption_global_label_key" ON "ProductAttributeOption"("attributeId", "labelKey") WHERE "companyId" IS NULL;

ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_one_value"
  CHECK (num_nonnulls("optionId", "textValue", "numberValue") = 1);

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeId_idx" ON "ProductAttributeValue"("attributeId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_optionId_attributeId_idx" ON "ProductAttributeValue"("optionId", "attributeId");

-- AddForeignKey
ALTER TABLE "ProductAttribute" ADD CONSTRAINT "ProductAttribute_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttribute" ADD CONSTRAINT "ProductAttribute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttribute" ADD CONSTRAINT "ProductAttribute_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeOption" ADD CONSTRAINT "ProductAttributeOption_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeOption" ADD CONSTRAINT "ProductAttributeOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BizzCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_optionId_attributeId_fkey" FOREIGN KEY ("optionId", "attributeId") REFERENCES "ProductAttributeOption"("id", "attributeId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BizzContact" (
  "id" UUID NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "personType" VARCHAR(10) NOT NULL DEFAULT 'PERSON',
  "isCustomer" BOOLEAN NOT NULL DEFAULT false,
  "isSupplier" BOOLEAN NOT NULL DEFAULT false,
  "document" VARCHAR(32),
  "email" VARCHAR(254),
  "phone" VARCHAR(40),
  "notes" VARCHAR(2000),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "requestKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "createdById" INTEGER NOT NULL,
  "updatedById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BizzContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BizzContact_role_check" CHECK ("isCustomer" OR "isSupplier"),
  CONSTRAINT "BizzContact_type_check" CHECK ("personType" IN ('PERSON', 'BUSINESS')),
  CONSTRAINT "BizzContact_name_check" CHECK (length(trim("name")) > 0),
  CONSTRAINT "BizzContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BizzContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BizzContact_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BizzContact_companyId_document_key" ON "BizzContact"("companyId", "document");
CREATE UNIQUE INDEX "BizzContact_companyId_requestKey_key" ON "BizzContact"("companyId", "requestKey");
CREATE INDEX "BizzContact_companyId_active_name_id_idx" ON "BizzContact"("companyId", "active", "name", "id");
CREATE INDEX "BizzContact_createdById_idx" ON "BizzContact"("createdById");
CREATE INDEX "BizzContact_updatedById_idx" ON "BizzContact"("updatedById");

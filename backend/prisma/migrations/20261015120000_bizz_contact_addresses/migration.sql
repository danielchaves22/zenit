CREATE TABLE "BizzContactAddress" (
  "id" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "label" VARCHAR(60),
  "position" INTEGER NOT NULL,
  "postalCode" VARCHAR(20),
  "street" VARCHAR(160),
  "addressNumber" VARCHAR(20),
  "complement" VARCHAR(100),
  "neighborhood" VARCHAR(100),
  "city" VARCHAR(100),
  "cityIbgeCode" VARCHAR(7),
  "state" VARCHAR(60),
  "country" VARCHAR(60),
  CONSTRAINT "BizzContactAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BizzContactAddress_position_check" CHECK ("position" >= 0),
  CONSTRAINT "BizzContactAddress_contactId_fkey" FOREIGN KEY ("contactId")
    REFERENCES "BizzContact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The leading contactId also indexes the foreign key. Position zero is the primary address.
CREATE UNIQUE INDEX "BizzContactAddress_contactId_position_key"
  ON "BizzContactAddress"("contactId", "position");

-- Preserve every legacy value, including addresses without a recognized municipality.
INSERT INTO "BizzContactAddress" (
  "id", "contactId", "position", "postalCode", "street", "addressNumber", "complement",
  "neighborhood", "city", "cityIbgeCode", "state", "country"
)
SELECT md5("id"::text || ':ADDRESS')::uuid, "id", 0, "postalCode", "street", "addressNumber",
  "complement", "neighborhood", "city", "cityIbgeCode", "state", "country"
FROM "BizzContact"
WHERE COALESCE("postalCode", "street", "addressNumber", "complement", "neighborhood",
  "city", "cityIbgeCode", "state", "country") IS NOT NULL;

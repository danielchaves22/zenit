CREATE TYPE "BizzContactMethodKind" AS ENUM ('PHONE', 'EMAIL');

CREATE TABLE "BizzContactMethod" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "kind" "BizzContactMethodKind" NOT NULL,
    "value" VARCHAR(254) NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "BizzContactMethod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BizzContactMethod_position_check" CHECK ("position" >= 0),
    CONSTRAINT "BizzContactMethod_value_check" CHECK (
        length(trim("value")) > 0 AND ("kind" <> 'PHONE' OR length("value") <= 40)
    )
);

-- The leading contactId also indexes the foreign key and scoped lookups.
CREATE UNIQUE INDEX "BizzContactMethod_contactId_kind_position_key"
    ON "BizzContactMethod"("contactId", "kind", "position");
CREATE UNIQUE INDEX "BizzContactMethod_contactId_kind_value_key"
    ON "BizzContactMethod"("contactId", "kind", "value");
ALTER TABLE "BizzContactMethod" ADD CONSTRAINT "BizzContactMethod_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "BizzContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep legacy fields for older clients; seed the ordered lists without replacing contacts.
INSERT INTO "BizzContactMethod" ("id", "contactId", "kind", "value", "position")
SELECT md5("id"::text || ':PHONE')::uuid, "id", 'PHONE', trim("phone"), 0
FROM "BizzContact" WHERE length(trim("phone")) > 0;
INSERT INTO "BizzContactMethod" ("id", "contactId", "kind", "value", "position")
SELECT md5("id"::text || ':EMAIL')::uuid, "id", 'EMAIL', lower(trim("email")), 0
FROM "BizzContact" WHERE length(trim("email")) > 0;

-- Preserve existing records and allow relationships to be assigned later.
ALTER TABLE "BizzContact" DROP CONSTRAINT "BizzContact_role_check";
ALTER TABLE "BizzContact"
  ADD COLUMN "postalCode" VARCHAR(20),
  ADD COLUMN "street" VARCHAR(160),
  ADD COLUMN "addressNumber" VARCHAR(20),
  ADD COLUMN "complement" VARCHAR(100),
  ADD COLUMN "neighborhood" VARCHAR(100),
  ADD COLUMN "city" VARCHAR(100),
  ADD COLUMN "state" VARCHAR(60),
  ADD COLUMN "country" VARCHAR(60);

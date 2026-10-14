-- Existing free-text addresses remain intact. New selections use the shared IBGE catalog.
ALTER TABLE "BizzContact" ADD COLUMN "cityIbgeCode" VARCHAR(7);

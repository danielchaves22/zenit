ALTER TABLE "BankStatementItem"
  ADD COLUMN "ignoredAt" TIMESTAMP(3),
  ADD COLUMN "ignoredBy" INTEGER;

-- Ignoring is a reversible decision about statement evidence, never a financial link.
ALTER TABLE "BankStatementItem" ADD CONSTRAINT "bank_item_ignore_without_link"
  CHECK ("ignoredAt" IS NULL OR "activeGroupId" IS NULL);
ALTER TABLE "BankStatementItem" ADD CONSTRAINT "bank_item_ignore_actor"
  CHECK (("ignoredAt" IS NULL) = ("ignoredBy" IS NULL));

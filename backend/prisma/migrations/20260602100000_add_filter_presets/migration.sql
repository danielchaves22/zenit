-- CreateTable
CREATE TABLE "SavedFilterPreset" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "featureKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedFilterPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LastUsedFilterPreset" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "featureKey" TEXT NOT NULL,
    "presetId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LastUsedFilterPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedFilterPreset_userId_companyId_featureKey_updatedAt_idx" ON "SavedFilterPreset"("userId", "companyId", "featureKey", "updatedAt");

-- CreateIndex
CREATE INDEX "SavedFilterPreset_companyId_idx" ON "SavedFilterPreset"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_last_used_filter_preset" ON "LastUsedFilterPreset"("userId", "companyId", "featureKey");

-- CreateIndex
CREATE INDEX "LastUsedFilterPreset_presetId_idx" ON "LastUsedFilterPreset"("presetId");

-- CreateIndex
CREATE INDEX "LastUsedFilterPreset_companyId_idx" ON "LastUsedFilterPreset"("companyId");

-- AddForeignKey
ALTER TABLE "SavedFilterPreset" ADD CONSTRAINT "SavedFilterPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilterPreset" ADD CONSTRAINT "SavedFilterPreset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LastUsedFilterPreset" ADD CONSTRAINT "LastUsedFilterPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LastUsedFilterPreset" ADD CONSTRAINT "LastUsedFilterPreset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LastUsedFilterPreset" ADD CONSTRAINT "LastUsedFilterPreset_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "SavedFilterPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

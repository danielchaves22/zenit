CREATE TABLE "UserVariableProjectionPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "trackedExpenseCategoryIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVariableProjectionPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_user_variable_projection_preference"
ON "UserVariableProjectionPreference"("userId", "companyId");

CREATE INDEX "UserVariableProjectionPreference_companyId_idx"
ON "UserVariableProjectionPreference"("companyId");

ALTER TABLE "UserVariableProjectionPreference"
ADD CONSTRAINT "UserVariableProjectionPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserVariableProjectionPreference"
ADD CONSTRAINT "UserVariableProjectionPreference_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

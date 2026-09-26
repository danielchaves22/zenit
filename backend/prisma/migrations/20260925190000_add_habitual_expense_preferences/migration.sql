CREATE TABLE "WorkspaceHabitualExpensePreference" (
    "companyId" INTEGER NOT NULL,
    "categoryIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceHabitualExpensePreference_pkey" PRIMARY KEY ("companyId"),
    CONSTRAINT "WorkspaceHabitualExpensePreference_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

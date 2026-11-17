BEGIN;

CREATE TYPE "AssistantReasoningEffort" AS ENUM ('none', 'low', 'medium', 'high');

CREATE TABLE "AssistantDefaults" (
    "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
    "model" TEXT NOT NULL,
    "reasoningEffort" "AssistantReasoningEffort"
);
INSERT INTO "AssistantDefaults" ("id", "model", "reasoningEffort") VALUES (1, 'gpt-6.2-sol', 'low');

ALTER TABLE "CompanyAiCredential" ADD COLUMN "assistantModelOverride" TEXT;

COMMIT;

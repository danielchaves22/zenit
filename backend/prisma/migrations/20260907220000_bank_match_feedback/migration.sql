-- Store only reviewed decisions; automatic rule searches do not create database rows.
ALTER TABLE "BankMatchDecision" ADD COLUMN "feedback" JSONB;

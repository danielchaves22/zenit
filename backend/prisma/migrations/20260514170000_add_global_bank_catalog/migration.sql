CREATE TABLE "Bank" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "iconSlug" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinancialAccount"
ADD COLUMN "bankId" INTEGER;

CREATE UNIQUE INDEX "Bank_code_key" ON "Bank"("code");
CREATE UNIQUE INDEX "Bank_name_key" ON "Bank"("name");
CREATE INDEX "Bank_isActive_displayOrder_idx" ON "Bank"("isActive", "displayOrder");
CREATE INDEX "FinancialAccount_bankId_idx" ON "FinancialAccount"("bankId");

ALTER TABLE "FinancialAccount"
ADD CONSTRAINT "FinancialAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Bank" ("code", "name", "iconSlug", "displayOrder", "isActive")
VALUES
  ('ABC_BRASIL', 'ABC Brasil', 'abc-brasil', 1, TRUE),
  ('AILOS', 'Ailos', 'ailos', 2, TRUE),
  ('ASAAS_IP_S_A', 'Asaas IP S.A', 'asaas-ip-s-a', 3, TRUE),
  ('BANCO_ARBI', 'Banco Arbi', 'banco-arbi', 4, TRUE),
  ('BMG', 'BMG', 'bmg', 5, TRUE),
  ('BMP', 'BMP', 'bmp', 6, TRUE),
  ('BS2', 'BS2', 'bs2', 7, TRUE),
  ('BTG', 'BTG Pactual', 'btg', 8, TRUE),
  ('C6', 'C6 Bank', 'c6', 9, TRUE),
  ('BANCO_DA_AMAZONIA_S_A', 'Banco da Amazônia S.A', 'banco-da-amazonia-s-a', 10, TRUE),
  ('DAYCOVAL', 'Daycoval', 'daycoval', 11, TRUE),
  ('BANCO_DO_BRASIL', 'Banco do Brasil', 'banco-do-brasil', 12, TRUE),
  ('BANCO_DO_ESTADO_DO_ESP_RITO_SANTO', 'Banco do Estado do Espirito Santo', 'banco-do-estado-do-esp-rito-santo', 13, TRUE),
  ('BANCO_DO_ESTADO_DO_PAR', 'Banco do Estado do Para', 'banco-do-estado-do-par', 14, TRUE),
  ('BANCO_DO_ESTADO_DO_SERGIPE', 'Banco do Estado do Sergipe', 'banco-do-estado-do-sergipe', 15, TRUE),
  ('BANCO_DO_NORDESTE_DO_BRASIL_S_A', 'Banco do Nordeste do Brasil S.A', 'banco-do-nordeste-do-brasil-s-a', 16, TRUE),
  ('BANCO_INDUSTRIAL_DO_BRASIL_S_A', 'Banco Industrial do Brasil S.A', 'banco-industrial-do-brasil-s-a', 17, TRUE),
  ('INTER', 'Inter', 'inter', 18, TRUE),
  ('BANCO_MERCANTIL_DO_BRASIL', 'Banco Mercantil do Brasil', 'banco-mercantil-do-brasil', 19, TRUE),
  ('BANCO_ORIGINAL_S_A', 'Banco Original S.A', 'banco-original-s-a', 20, TRUE),
  ('BANCO_PAULISTA', 'Banco Paulista', 'banco-paulista', 21, TRUE),
  ('BANCO_PINE', 'Banco Pine', 'banco-pine', 22, TRUE),
  ('BANCO_RENDIMENTO', 'Banco Rendimento', 'banco-rendimento', 23, TRUE),
  ('BANCO_SAFRA_S_A', 'Banco Safra S.A', 'banco-safra-s-a', 24, TRUE),
  ('SANTANDER', 'Santander', 'santander', 25, TRUE),
  ('SOFISA', 'Sofisa', 'sofisa', 26, TRUE),
  ('TOP_ZIO', 'Topazio', 'top-zio', 27, TRUE),
  ('BANCO_TRIANGULO_TRIBANCO', 'Banco Triângulo - Tribanco', 'banco-triangulo-tribanco', 28, TRUE),
  ('BV', 'BV', 'bv', 29, TRUE),
  ('BANK_OF_AMERICA', 'Bank of America', 'bank-of-america', 30, TRUE),
  ('BANRISUL', 'Banrisul', 'banrisul', 31, TRUE),
  ('BEES_BANK', 'Bees Bank', 'bees-bank', 32, TRUE),
  ('BK_BANK', 'BK Bank', 'bk-bank', 33, TRUE),
  ('BNP_PARIBAS', 'BNP Paribas', 'bnp-paribas', 34, TRUE),
  ('BRADESCO', 'Bradesco', 'bradesco', 35, TRUE),
  ('BRB_BANCO_DE_BRAS_LIA', 'BRB - Banco de Brasilia', 'brb-banco-de-bras-lia', 36, TRUE),
  ('CAIXA_ECONOMICA_FEDERAL', 'Caixa Econômica Federal', 'caixa-economica-federal', 37, TRUE),
  ('CAPITUAL', 'Capitual', 'capitual', 38, TRUE),
  ('CONTA_SIMPLES_SOLUCOES_EM_PAGAMENTOS', 'Conta Simples Soluções em Pagamentos', 'conta-simples-solucoes-em-pagamentos', 39, TRUE),
  ('CONTBANK', 'Contbank', 'contbank', 40, TRUE),
  ('CORA', 'Cora', 'cora', 41, TRUE),
  ('CREDISIS', 'Credisis', 'credisis', 42, TRUE),
  ('CRESOL', 'Cresol', 'cresol', 43, TRUE),
  ('DUEPAY', 'DuePay', 'duepay', 44, TRUE),
  ('EFI_GERENCIANET', 'Efí - Gerencianet', 'efi-gerencianet', 45, TRUE),
  ('GRAFENO', 'Grafeno', 'grafeno', 46, TRUE),
  ('IFOOD_PAGO', 'Ifood Pago', 'ifood-pago', 47, TRUE),
  ('INFINITEPAY', 'InfinitePay', 'infinitepay', 48, TRUE),
  ('IP4Y', 'Ip4y', 'ip4y', 49, TRUE),
  ('ITAU_UNIBANCO_S_A', 'Itaú Unibanco S.A', 'itau-unibanco-s-a', 50, TRUE),
  ('IUGU', 'Iugu', 'iugu', 51, TRUE),
  ('LETS_BANK_S_A', 'Lets Bank S.A', 'lets-bank-s-a', 52, TRUE),
  ('LINKER', 'Linker', 'linker', 53, TRUE),
  ('MAGALUPAY', 'MagaluPay', 'magalupay', 54, TRUE),
  ('MERCADO_PAGO', 'Mercado Pago', 'mercado-pago', 55, TRUE),
  ('MODOBANK', 'ModoBank', 'modobank', 56, TRUE),
  ('MUFG', 'MUFG', 'mufg', 57, TRUE),
  ('MULTIPLO_BANK', 'Multiplo Bank', 'multiplo-bank', 58, TRUE),
  ('NEON', 'Neon', 'neon', 59, TRUE),
  ('NUBANK', 'Nubank', 'nubank', 60, TRUE),
  ('OMIE_CASH', 'Omie.Cash', 'omie-cash', 61, TRUE),
  ('OMNI', 'Omni', 'omni', 62, TRUE),
  ('PAGBANK', 'PagBank', 'pagbank', 63, TRUE),
  ('PAYCASH', 'PayCash', 'paycash', 64, TRUE),
  ('PICPAY', 'PicPay', 'picpay', 65, TRUE),
  ('PINBANK', 'PinBank', 'pinbank', 66, TRUE),
  ('QUALITY_DIGITAL_BANK', 'Quality Digital Bank', 'quality-digital-bank', 67, TRUE),
  ('RECARGAPAY', 'RecargaPay', 'recargapay', 68, TRUE),
  ('SICOOB', 'Sicoob', 'sicoob', 69, TRUE),
  ('SICREDI', 'Sicredi', 'sicredi', 70, TRUE),
  ('SISPRIME', 'Sisprime', 'sisprime', 71, TRUE),
  ('SQUID_SOLUCOES_FINANCEIRAS', 'Squid Soluções Financeiras', 'squid-solucoes-financeiras', 72, TRUE),
  ('STARBANK', 'StarBank', 'starbank', 73, TRUE),
  ('STONE_PAGAMENTOS_S_A', 'Stone Pagamentos S.A', 'stone-pagamentos-s-a', 74, TRUE),
  ('SULCREDI', 'Sulcredi', 'sulcredi', 75, TRUE),
  ('TRANSFEERA', 'Transfeera', 'transfeera', 76, TRUE),
  ('UNICRED', 'Unicred', 'unicred', 77, TRUE),
  ('UNIPRIME', 'Uniprime', 'uniprime', 78, TRUE),
  ('XP', 'XP', 'xp', 79, TRUE),
  ('ZEMO_BANK', 'Zemo Bank', 'zemo-bank', 80, TRUE)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "iconSlug" = EXCLUDED."iconSlug",
  "displayOrder" = EXCLUDED."displayOrder",
  "isActive" = EXCLUDED."isActive";

UPDATE "FinancialAccount" AS fa
SET
  "bankId" = b."id",
  "bankName" = COALESCE(fa."bankName", b."name"),
  "bankCode" = COALESCE(fa."bankCode", b."code")
FROM "Bank" AS b
WHERE fa."bankId" IS NULL
  AND (
    (fa."bankCode" IS NOT NULL AND UPPER(fa."bankCode") = b."code")
    OR (fa."bankName" IS NOT NULL AND LOWER(fa."bankName") = LOWER(b."name"))
  );

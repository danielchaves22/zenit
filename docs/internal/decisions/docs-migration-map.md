---
title: Docs migration map
slug: /docs/internal/decisions/docs-migration-map
type: decision-record
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Mapa documento a documento da migracao para o acervo canonico em docs/.
tags:
  - docs
  - migration
related:
  - /docs/internal/decisions/docs-information-architecture
---

# Docs migration map

## Contexto

O acervo existente esta distribuido entre varios pontos do monorepo. Este mapa fixa a destinacao canonica de cada documento relevante.

## Decisao

Produtos:

- `docs/cash/fixed-transactions/functional-spec.md` -> `docs/products/zenit-cash/fixed-transactions-functional-spec.md`
- `backend/docs/frontend_negative_balance_instructions.md` -> `docs/products/zenit-cash/accounts-negative-balance-functional-spec.md`
- `docs/calc/initial-calculation/functional-spec.md` -> `docs/products/zenit-calc/initial-calculation-functional-spec.md`
- `apps/zenit-calc/README.md` -> `docs/products/zenit-calc/zenit-calc-frontend-overview.md`
- `apps/zenit-cash/docs/zenit-cash-mobile-spec.md` -> `docs/products/zenit-cash-mobile/zenit-cash-mobile-product-overview.md`
- `apps/zenit-cash/docs/zenit-cash-mobile-spec.md` -> `docs/products/zenit-cash-mobile/zenit-cash-mobile-functional-scope.md`
- `apps/zenit-cash-mobile/README.md` -> `docs/operations/mobile/zenit-cash-mobile-setup-guide.md`

Arquitetura:

- `apps/zenit-cash/docs/zenit-cash-mobile-stack-spec.md` -> `docs/architecture/mobile/zenit-cash-mobile-technical-spec.md`
- `apps/zenit-cash/docs/zenit-cash-mobile-stack-spec.md` -> `docs/architecture/assistant/assistant-runtime-architecture-note.md`
- `backend/docs/backend_integration_guide.md` + `backend/docs/user_account_access_guide.md` -> `docs/architecture/backend/account-access-architecture-note.md`
- `backend/docs/user_account_access_guide.md` -> `docs/architecture/security/user-account-access-overview.md`
- `apps/zenit-cash/docs/assistant-examples/*` -> `docs/architecture/assistant/examples/*`

Operacao e integracoes:

- `backend/docs/local_integration_tests.md` -> `docs/operations/testing/backend-local-integration-testing-guide.md`
- `apps/zenit-cash/docs/testing.md` -> `docs/operations/testing/zenit-cash-frontend-testing-guide.md`
- `docs/cash/ui/add-theme-colors.md` -> `docs/operations/frontend/theme-customization-operations-guide.md`
- `backend/REDIS_REACTIVATION_GUIDE.md` -> `docs/operations/infra/redis-reactivation-operations-guide.md`
- `docs/integrations/gmail/oauth-setup.md` -> `docs/integrations/gmail/gmail-oauth-setup-guide.md`
- `sites/zenitapp-public/README.md` -> `docs/operations/site/zenitapp-public-site-setup-guide.md`

Legado:

- `docs/cash/mobile/budget-reactivation-mvp.md` -> `docs/legacy/orcamento-mobile/orcamento-mobile-reactivation-legacy-note.md`
- `mobile/README.md` -> `docs/legacy/orcamento-mobile/orcamento-mobile-overview.md`
- `plans/REACTIVATE_MOBILE_PLAN.md` -> `docs/internal/rfc/orcamento-mobile-reactivation-rfc.md`

## Consequencias

- O acervo deixa de depender da estrutura historica do monorepo.
- A migracao pode ser feita em ondas, sem perder o destino final.
- O portal passa a refletir a estrutura editorial em vez da estrutura acidental.
- As fontes historicas redundantes foram removidas depois da promocao do conteudo canonico para `docs/`.

## Documentos relacionados

- [Docs information architecture](docs-information-architecture.md)

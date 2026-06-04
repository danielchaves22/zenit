---
title: Docs information architecture
slug: /docs/internal/decisions/docs-information-architecture
type: decision-record
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Arquitetura final de navegacao, secoes e visibilidade do portal de documentacao.
tags:
  - docs
  - information-architecture
related:
  - /docs
  - /docs/internal/decisions/docs-migration-map
---

# Docs information architecture

## Contexto

O portal precisa refletir o modelo editorial da documentacao, sem misturar produto, arquitetura, operacao e historico em uma mesma camada de navegacao.

## Decisao

Estrutura principal:

- `/docs`
- `/docs/help`
- `/docs/products`
- `/docs/architecture`
- `/docs/operations`
- `/docs/integrations`
- `/docs/internal`
- `/docs/legacy`

Subareas canonicas:

- `products/zenit-cash`
- `products/zenit-cash-mobile`
- `products/zenit-calc`
- `architecture/assistant`
- `architecture/backend`
- `architecture/mobile`
- `architecture/security`
- `operations/backend`
- `operations/frontend`
- `operations/mobile`
- `operations/testing`
- `operations/infra`
- `operations/site`
- `integrations/gmail`
- `internal/decisions`
- `internal/rfc`
- `legacy/orcamento-mobile`

## Consequencias

- O portal pode publicar builds diferentes sem mudar o modelo de pastas.
- A navegacao deixa de depender de onde o documento nasceu no repositorio original.
- O acervo passa a crescer por area de conhecimento, nao por local tecnico de origem.

## Documentos relacionados

- [Zenit documentation overview](../../README.md)
- [Docs migration map](docs-migration-map.md)

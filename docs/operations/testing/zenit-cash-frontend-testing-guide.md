---
title: Zenit Cash frontend testing
slug: /docs/operations/testing/zenit-cash-frontend-testing
type: testing-guide
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Scripts, escopo e diretrizes para testes do frontend do Zenit Cash.
tags:
  - frontend
  - testing
related:
  - /docs/operations/testing/backend-local-integration-testing
---

# Zenit Cash frontend testing

## Objetivo

Documentar os scripts e as diretrizes atuais para testes unitarios e de componente do `apps/zenit-cash`.

## Escopo

O frontend do `zenit-cash` usa `Vitest` com `jsdom` para testes unitarios e de componente.

## Pre-requisitos

- dependencias instaladas no monorepo;
- workspace `apps/zenit-cash` funcional;
- ambiente local com Node.js e npm.

## Comandos

- `npm --workspace apps/zenit-cash run test`
- `npm --workspace apps/zenit-cash run test:watch`
- `npm --workspace apps/zenit-cash run test:coverage`
- `npm --workspace apps/zenit-cash run typecheck`

## Cenarios de teste

- helpers de sessao e cabecalhos de API;
- helpers de permissao de rota;
- fluxo da pagina de login;
- novos helpers puros e fluxos de rede encapsulados.

## Criterios de sucesso

- cobertura incremental nas areas modificadas;
- mocks pequenos e focados quando necessario;
- typecheck verde junto com a suite relevante.

## Troubleshooting

- revisar mocks de `next/router` e contextos;
- extrair logica para helpers testaveis antes de cobrir paginas grandes.

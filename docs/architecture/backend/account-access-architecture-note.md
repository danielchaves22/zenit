---
title: Account access architecture
slug: /docs/architecture/backend/account-access-architecture-note
type: architecture-note
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Desenho arquitetural do controle granular de acesso a contas financeiras por usuario.
tags:
  - backend
  - security
  - account-access
related:
  - /docs/architecture/security/user-account-access-overview
---

# Account access architecture

## Contexto

O backend do Zenit Cash precisou deixar de assumir acesso uniforme a todas as contas financeiras da empresa para usuarios com role `USER`.

## Problema

Sem um modelo granular, usuarios comuns acessavam contas e transacoes fora do escopo autorizado. O sistema precisava restringir leitura, agregacao e escrita com base nas contas efetivamente concedidas.

## Decisao

- `ADMIN` mantem acesso total a todas as empresas e contas;
- `SUPERUSER` mantem acesso total dentro da empresa e pode gerenciar permissoes dos `USER`s;
- `USER` passa a acessar apenas as contas explicitamente autorizadas;
- endpoints de contas, transacoes e sumarios precisam respeitar o conjunto de contas acessiveis;
- operacoes de escrita em contas e transacoes precisam validar `fromAccountId` e `toAccountId` quando aplicavel;
- o backend expoe endpoints dedicados para inspecao e gestao de acessos por conta.

## Tradeoffs

- aumenta a complexidade das consultas e validacoes do backend;
- reduz risco operacional e de exposicao indevida de dados financeiros;
- exige sincronismo entre modelo de permissao, rotas de manutencao e contratos consumidos pelo frontend.

## Alternativas consideradas

- acesso total para todos os usuarios da empresa: rejeitado por nao atender o requisito de controle granular;
- filtragem apenas no frontend: rejeitada porque nao oferece seguranca real;
- permissoes por categoria ou modulo sem vinculo com conta: rejeitadas para este caso por nao resolver o problema de escopo financeiro direto.

## Consequencias

- `GET /api/financial/accounts`, `GET /api/financial/transactions` e `GET /api/financial/summary` passam a refletir o escopo de conta do usuario;
- operacoes de escrita podem responder `403` quando o usuario tentar agir sobre contas fora do seu escopo;
- o frontend administrativo precisa oferecer manutencao das permissoes por conta;
- a camada de servicos do backend precisa manter filtros consistentes e centralizados.

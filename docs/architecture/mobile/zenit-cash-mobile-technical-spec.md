---
title: Zenit Cash Mobile stack
slug: /docs/architecture/mobile/zenit-cash-mobile-technical-spec
type: technical-spec
product: zenit-cash-mobile
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Stack tecnica, responsabilidades por camada e limites da primeira entrega do Zenit Cash Mobile.
tags:
  - mobile
  - expo
  - react-native
related:
  - /docs/products/zenit-cash-mobile/product-overview
  - /docs/architecture/assistant/assistant-runtime-architecture-note
---

# Zenit Cash Mobile stack

## Contexto

O `zenit-cash-mobile` nasce como um app novo, separado do app Flutter legado de orcamento diario. A entrega inicial e uma vertical slice funcional do modo `Operador`.

## Objetivo tecnico

Definir a stack do app, a distribuicao de responsabilidades entre mobile e backend e os limites tecnicos da primeira entrega.

## Decisao

- app em `Expo + React Native + TypeScript`;
- navegacao com `Expo Router`;
- estado remoto com `TanStack Query`;
- estado efemero de UI com `Zustand`;
- segredos com `expo-secure-store`;
- cache e historico local com `expo-sqlite`;
- chat por texto com streaming `SSE`;
- toda integracao com OpenAI concentrada no backend.

## Arquitetura da solucao

- o app mobile fala apenas com o backend autenticado;
- o backend monta contexto, tools e chama a OpenAI;
- o modelo pede tools;
- o backend executa tools nos servicos do dominio financeiro;
- respostas sensiveis exigem confirmacao do usuario antes de gravar efeito financeiro.

## Contratos e interfaces

Fluxos iniciais previstos:

- `POST /api/assistant/sessions`
- `GET /api/assistant/sessions/:sessionId/history`
- `POST /api/assistant/sessions/:sessionId/messages/stream`
- `POST /api/assistant/pending-actions/:pendingActionId/confirm`
- `POST /api/assistant/pending-actions/:pendingActionId/cancel`

## Seguranca e observabilidade

- autenticacao por `Authorization` bearer token;
- escopo por empresa em `X-Company-Id`;
- identificacao do app por `X-App-Key: zenit-cash`;
- traces de tools e pending actions persistidos no backend.

## Limitacoes

- primeira entrega texto-only;
- notificacoes proativas ficam fora da V1;
- modo `Especialista` fica preparado por contratos, mas nao entra funcionalmente no primeiro incremento.

## Proximos passos

- ampliar o catalogo de tools analiticas;
- introduzir voice quando o fluxo do Operador estiver consolidado;
- avaliar build interno/publico do portal de docs conforme o acervo crescer.

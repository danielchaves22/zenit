---
title: Operator transaction draft example
slug: /docs/architecture/assistant/examples/operator-transaction-draft
type: example
product: zenit-cash-mobile
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Fluxo implementado de criacao de rascunho de lancamento pelo Operador.
tags:
  - assistant
  - operator
related:
  - /docs/architecture/assistant/assistant-runtime-architecture-note
---

# Operator transaction draft example

## Cenario

Mensagem do usuario: `gastei 120 no posto hoje no nubank`.

## Atores envolvidos

- usuario;
- app mobile;
- backend do assistente;
- OpenAI;
- servicos financeiros de dominio.

## Entrada

O app envia a mensagem para `POST /api/assistant/sessions/:sessionId/messages/stream` com `Authorization`, `X-App-Key` e `X-Company-Id`.

## Fluxo passo a passo

1. o backend cria o turno e abre `SSE`;
2. o runtime envia prompt, historico e tools para a OpenAI;
3. o modelo pede `create_transaction_draft`;
4. o backend resolve conta, categoria, valor e data;
5. o backend cria uma `pending action`;
6. o resultado da tool volta ao modelo;
7. o modelo gera a resposta final;
8. o backend streama texto, card e acoes de confirmar/cancelar.

## Payloads e eventos

Eventos de streaming esperados:

- `turn.started`
- `message.delta`
- `message.completed`
- `pending_action.created`
- `turn.completed`

## Resultado esperado

O usuario ve um rascunho estruturado do lancamento e decide se confirma ou cancela. A transacao final so e gravada apos confirmacao humana.

## Observacoes

O modelo nao acessa banco diretamente e nao confirma escrita financeira sem o backend.

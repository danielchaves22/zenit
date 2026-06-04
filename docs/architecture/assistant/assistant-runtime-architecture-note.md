---
title: Assistant runtime orchestration
slug: /docs/architecture/assistant/assistant-runtime-architecture-note
type: architecture-note
product: zenit-cash-mobile
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Orquestracao do assistente do Zenit Cash Mobile entre app, backend, OpenAI e servicos de dominio.
tags:
  - assistant
  - openai
  - tools
related:
  - /docs/architecture/mobile/zenit-cash-mobile-technical-spec
---

# Assistant runtime orchestration

## Contexto

O assistente do `zenit-cash-mobile` precisa interpretar linguagem natural sem acessar banco diretamente, sem expor credenciais no cliente e sem depender de MCP para a V1.

## Problema

O modelo precisa decidir qual operacao financeira pedir sem receber o banco inteiro no payload e sem executar escrita financeira sem confirmacao humana.

## Decisao

- usar um unico orquestrador por turno no backend;
- expor tools pelo backend via Responses API e function calling;
- deixar o modelo decidir apenas a intencao, o modo e a tool a ser chamada;
- fazer toda leitura e escrita real no backend;
- manter `pending actions` para confirmacao de efeitos sensiveis.

## Tradeoffs

- mais infraestrutura no backend;
- mais previsibilidade e auditabilidade;
- menor risco do que uma IA com acesso direto a dados e operacoes.

## Alternativas consideradas

- payload com todos os dados crus: rejeitada por custo, risco e baixa escalabilidade;
- MCP na V1: rejeitado por nao ser necessario para a primeira camada de tools;
- Agent Builder como nucleo: rejeitado porque o caso pede controle fino no backend.

## Consequencias

- o mobile fica fino e seguro;
- o backend vira a camada de execucao e auditoria;
- a evolucao de novas perguntas e tools pode ocorrer gradualmente, sem reestruturar o app.

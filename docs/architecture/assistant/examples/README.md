---
title: Assistant examples
slug: /docs/architecture/assistant/examples
type: overview
product: zenit-cash-mobile
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Exemplos concretos de como o assistente interpreta, orquestra tools e responde no Zenit Cash Mobile.
tags:
  - assistant
  - examples
related:
  - /docs/architecture/assistant/assistant-runtime-architecture-note
---

# Assistant examples

## Objetivo

Documentar fluxos concretos de entrada, tool calling, execucao no backend e resposta final do assistente.

## Escopo

Esta pasta cobre:

- um fluxo implementado do `Operador`;
- dois fluxos-alvo do `Especialista`.

## Publico-alvo

- desenvolvimento;
- produto tecnico;
- operacao que precise entender limites do assistente.

## Conceitos principais

- o app envia a mensagem ao backend;
- o backend chama a OpenAI com tools;
- o modelo pede function calls;
- o backend executa a tool e devolve o resultado ao modelo;
- o backend streama a resposta final ao app.

## Links relacionados

- [Operator transaction draft example](operator-transaction-draft-example.md)
- [Specialist fuel spend this month example](specialist-fuel-spend-this-month-example.md)
- [Specialist fuel average last 3 months example](specialist-fuel-average-last-3-months-example.md)

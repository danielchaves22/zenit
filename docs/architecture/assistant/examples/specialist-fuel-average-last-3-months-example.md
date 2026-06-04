---
title: Specialist fuel average last 3 months example
slug: /docs/architecture/assistant/examples/specialist-fuel-average-last-3-months
type: example
product: zenit-cash-mobile
audience: dev
visibility: internal
status: draft
owner: engineering
last_reviewed: 2026-06-04
summary: Fluxo-alvo para responder a media mensal de gasto com combustivel nos ultimos tres meses.
tags:
  - assistant
  - specialist
related:
  - /docs/architecture/assistant/examples/specialist-fuel-spend-this-month
---

# Specialist fuel average last 3 months example

## Cenario

Mensagem do usuario: `qual a media de consumo de combustivel nos ultimos 3 meses?`

## Atores envolvidos

- usuario;
- app mobile;
- backend do assistente;
- OpenAI;
- camada analitica do backend.

## Entrada

A pergunta entra pelo mesmo canal de streaming, mas pede uma transformacao analitica adicional.

## Fluxo passo a passo

1. o modelo interpreta a intencao como consulta analitica;
2. o backend oferece tools para resolver conceito e agregar transacoes;
3. o modelo pede `resolve_financial_concept`;
4. o backend devolve o conceito canonico de combustivel;
5. o modelo pede `aggregate_transactions` com `group_by = month`;
6. o backend soma por mes no periodo aplicavel;
7. o modelo aplica a operacao logica de media sobre os totais mensais recebidos;
8. a resposta final explicita periodo e criterio de calculo.

## Payloads e eventos

Transformacao esperada:

- `sum by month -> average`

## Resultado esperado

O usuario recebe a media mensal de gasto em moeda, com possibilidade de abrir o detalhe por mes.

## Observacoes

O termo `consumo` precisa ser tratado como gasto monetario, a menos que exista suporte explicito a litros ou volume no dominio.

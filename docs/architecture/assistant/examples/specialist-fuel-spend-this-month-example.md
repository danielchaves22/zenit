---
title: Specialist fuel spend this month example
slug: /docs/architecture/assistant/examples/specialist-fuel-spend-this-month
type: example
product: zenit-cash-mobile
audience: dev
visibility: internal
status: draft
owner: engineering
last_reviewed: 2026-06-04
summary: Fluxo-alvo para responder quanto foi gasto com combustivel no mes corrente.
tags:
  - assistant
  - specialist
related:
  - /docs/architecture/assistant/assistant-runtime-architecture-note
---

# Specialist fuel spend this month example

## Cenario

Mensagem do usuario: `quanto gastei com combustivel este mes?`

## Atores envolvidos

- usuario;
- app mobile;
- backend do assistente;
- OpenAI;
- camada analitica do backend.

## Entrada

O app envia a pergunta ao mesmo endpoint de streaming usado pelo Operador.

## Fluxo passo a passo

1. o backend abre o turno e chama a OpenAI com tools analiticas;
2. o modelo resolve a intencao como consulta quantitativa;
3. o modelo pede `resolve_financial_concept` para mapear `combustivel`;
4. o backend devolve categorias e aliases aplicaveis;
5. o modelo pede `aggregate_transactions` com periodo e filtros;
6. o backend executa a agregacao real no banco;
7. o resultado volta ao modelo;
8. o modelo responde com texto natural, periodo e criterio explicito.

## Payloads e eventos

Tools esperadas:

- `resolve_financial_concept`
- `aggregate_transactions`
- opcionalmente `list_transactions`

## Resultado esperado

Resposta curta, precisa e auditavel, por exemplo com total, periodo considerado e quantidade de lancamentos.

## Observacoes

Esse fluxo ainda depende da implementacao das tools analiticas do modo `Especialista`.

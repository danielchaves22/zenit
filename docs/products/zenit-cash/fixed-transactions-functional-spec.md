---
title: Despesas e receitas fixas
slug: /docs/products/zenit-cash/fixed-transactions
type: functional-spec
product: zenit-cash
audience: product
visibility: internal
status: active
owner: product
last_reviewed: 2026-06-04
summary: Especificacao funcional das despesas e receitas fixas mensais do Zenit Cash.
tags:
  - cash
  - fixed-transactions
related:
  - /docs/products/zenit-cash-mobile/zenit-cash-mobile-product-overview
---

# Despesas e receitas fixas

## Objetivo

Definir a funcionalidade de despesas e receitas fixas que se repetem mensalmente por prazo indeterminado, sem confundir esse conceito com recorrencias de prazo definido.

## Escopo

Uma despesa ou receita fixa representa um compromisso mensal continuo, com valor, dia de vencimento, data de inicio de vigencia e status operacional.

## Regras de negocio

- o cadastro precisa registrar nome descritivo, valor, tipo e dia do mes;
- a vigencia comeca em uma data definida;
- o registro pode estar ativo ou cancelado;
- o cancelamento encerra a materializacao futura;
- a transacao gerada deve manter ligacao com a origem fixa.

## Fluxos principais

1. usuario cria uma despesa ou receita fixa;
2. o sistema mantem o registro como origem recorrente continua;
3. o processo de materializacao cria transacoes reais para o periodo aplicavel;
4. relatorios e listagens exibem o vinculo com a origem fixa.

## Casos excepcionais

- uma origem cancelada nao gera novos lancamentos;
- o sistema precisa respeitar a data de inicio de vigencia;
- alteracoes de configuracao so afetam materializacoes futuras, salvo regra explicita de retroacao.

## Impactos em dados e API

- exige uma entidade de origem fixa;
- exige referenciamento nas transacoes materializadas;
- exige suporte em relatorios e consultas filtradas.

## Pendencias

- consolidar regras de reprocessamento em caso de falha na materializacao;
- definir politicas de edicao retroativa, se necessarias.

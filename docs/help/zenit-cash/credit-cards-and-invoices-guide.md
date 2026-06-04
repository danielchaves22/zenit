---
title: Como usar cartoes e faturas
slug: /docs/help/zenit-cash/credit-cards-and-invoices
type: operations-guide
product: zenit-cash
audience: user
visibility: public
status: active
owner: product
last_reviewed: 2026-06-04
summary: Como consultar cartoes, registrar compras e acompanhar faturas no Zenit Cash.
tags:
  - help
  - credit-cards
  - invoices
related:
  - /docs/help/zenit-cash/transactions
---

# Como usar cartoes e faturas

## Quando usar

Use esta area para cadastrar cartoes, registrar compras no cartao, acompanhar faturas e revisar compras agrupadas.

## Pre-requisitos

- permissao para acessar `Cartoes`;
- conta ou estrutura de cartao ja criada, quando o fluxo for apenas de acompanhamento.

## Passos

1. abra `Cartoes` no menu lateral;
2. use `Novo Cartao` quando precisar cadastrar um cartao novo;
3. preencha dados como banco emissor e limite do cartao;
4. use `Nova Compra no Cartao` para registrar compras diretamente no fluxo de cartao;
5. abra `Compras no Cartao` para acompanhar as compras ja registradas;
6. acesse as faturas do cartao quando precisar revisar valores e pagamentos.

![Area de cartoes e faturas](../assets/credit-cards.png)

## Riscos

- cadastrar um cartao com configuracao incorreta de limite pode prejudicar a leitura da utilizacao;
- registrar compras no cartao como despesas comuns distorce o acompanhamento de faturas;
- alterar cartoes em uso exige revisar o impacto nas compras ja vinculadas.

## Rollback

Se o cadastro do cartao estiver incorreto, edite o cartao antes de continuar usando-o. Para compras registradas de forma errada, ajuste ou exclua o lancamento correspondente.

## Verificacao final

Verifique se:

- o cartao aparece corretamente na lista;
- o limite configurado esta correto;
- as compras entram no fluxo de cartao e nao como despesa comum isolada;
- a consulta de faturas reflete o comportamento esperado para o cartao escolhido.

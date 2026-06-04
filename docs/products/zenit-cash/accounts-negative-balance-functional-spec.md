---
title: Saldo negativo em contas
slug: /docs/products/zenit-cash/accounts-negative-balance
type: functional-spec
product: zenit-cash
audience: product
visibility: internal
status: active
owner: product
last_reviewed: 2026-06-04
summary: Regras funcionais do campo allowNegativeBalance e seus efeitos no Zenit Cash.
tags:
  - cash
  - accounts
  - negative-balance
related:
  - /docs/products/zenit-cash/fixed-transactions
---

# Saldo negativo em contas

## Objetivo

Definir o comportamento funcional do campo `allowNegativeBalance` nas contas financeiras do Zenit Cash.

## Escopo

O campo determina se uma conta pode ou nao ficar com saldo negativo apos operacoes financeiras. O comportamento afeta criacao, edicao, validacao e exibicao de contas.

## Regras de negocio

- `allowNegativeBalance` e um booleano associado a cada conta financeira;
- o valor padrao para contas comuns deve ser `false`, salvo regra explicita de negocio;
- contas configuradas com `allowNegativeBalance = false` nao podem ser levadas a saldo negativo por operacoes que reduzam seu saldo;
- contas configuradas com `allowNegativeBalance = true` podem assumir saldo negativo;
- cartoes de credito devem ser tratados como casos que naturalmente admitem saldo negativo ou equivalente devedor, conforme a regra do dominio.

## Fluxos principais

1. a conta e criada ou editada com o campo `allowNegativeBalance`;
2. o frontend exibe o valor atual do campo na interface de manutencao da conta;
3. operacoes que afetem saldo validam a configuracao da conta;
4. o backend rejeita operacoes que violem a restricao de saldo negativo.

## Casos excepcionais

- cartoes de credito exigem tratamento especifico, pois o comportamento padrao da conta difere de contas correntes e poupancas;
- migracoes de contas antigas precisam assumir um valor padrao consistente para o novo campo;
- contas desativadas ainda precisam preservar o historico do campo para auditoria.

## Impactos em dados e API

- o campo precisa aparecer nos endpoints de leitura, criacao e atualizacao de contas;
- validacoes de transacoes precisam consultar esse atributo no backend;
- o frontend precisa refletir o estado do campo e a regra associada.

## Pendencias

- consolidar o texto final de UX para explicar a diferenca entre contas comuns e cartoes de credito;
- revisar se ha outras rotas financeiras que precisem de validacao adicional baseada nesse campo.

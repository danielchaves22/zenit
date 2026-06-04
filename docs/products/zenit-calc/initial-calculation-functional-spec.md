---
title: Calculo inicial
slug: /docs/products/zenit-calc/initial-calculation
type: functional-spec
product: zenit-calc
audience: product
visibility: internal
status: active
owner: product
last_reviewed: 2026-06-04
summary: Especificacao funcional do calculo inicial como previa estruturada do passivo.
tags:
  - zenit-calc
  - calculation
related:
  - /docs/products/zenit-calc/zenit-calc-frontend-overview
---

# Calculo inicial

## Objetivo

Definir o calculo inicial do Zenit Calc como uma previa estruturada do passivo de um processo, preservando rastreabilidade de entradas, regras aplicadas e resultados.

## Escopo

O calculo inicial sempre parte de um processo existente e respeita o fluxo de status do dominio.

## Regras de negocio

- o calculo inicial sempre pertence a um processo;
- o processo pode ter origem manual ou importada;
- o fluxo respeita as etapas de solicitacao, revisao e abertura do calculo;
- o resultado precisa ser auditavel;
- entradas e regras aplicadas precisam permanecer rastreaveis.

## Fluxos principais

1. criar ou revisar o processo;
2. abrir o calculo inicial;
3. informar ou revisar entradas;
4. calcular verbas, reflexos, multas e honorarios;
5. revisar e publicar a previa.

## Casos excepcionais

- processos importados podem exigir revisao adicional antes da abertura do calculo;
- ajustes de entradas devem preservar historico;
- a transicao para calculo oficial e etapa posterior, nao parte desta feature.

## Impactos em dados e API

- exige vinculacao forte entre processo e calculo;
- exige registro das entradas e da regra aplicada;
- exige estados claros de revisao e publicacao.

## Pendencias

- detalhar politicas de reabertura e recalculo;
- fechar regras de publicacao para cenarios de revisao concorrente.

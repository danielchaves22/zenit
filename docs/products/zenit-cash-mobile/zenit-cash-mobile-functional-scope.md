---
title: Zenit Cash Mobile functional scope
slug: /docs/products/zenit-cash-mobile/functional-scope
type: functional-spec
product: zenit-cash-mobile
audience: product
visibility: internal
status: active
owner: product
last_reviewed: 2026-06-04
summary: Escopo funcional da primeira entrega do Zenit Cash Mobile e limites assumidos para a V1.
tags:
  - mobile
  - scope
related:
  - /docs/products/zenit-cash-mobile/product-overview
  - /docs/architecture/mobile/zenit-cash-mobile-technical-spec
---

# Zenit Cash Mobile functional scope

## Objetivo

Fixar o escopo funcional da primeira entrega do `zenit-cash-mobile`, distinguindo claramente o que entra na V1 e o que fica para fases seguintes.

## Escopo

A primeira entrega e uma vertical slice operacional do modo `Operador`, sem transformar o mobile em uma copia do web.

## Regras de negocio

- o mobile prioriza leitura rapida do momento financeiro e acoes frequentes;
- o chat e a superficie primaria de captura de lancamentos;
- a IA pode sugerir e estruturar um lancamento, mas o efeito financeiro depende de confirmacao humana;
- o backend continua como unica camada autorizada a executar operacoes e consultar dados reais.

## Fluxos principais

1. autenticacao e bootstrap da ultima empresa valida;
2. exibicao da home minima;
3. envio de mensagem textual ao assistente;
4. criacao de rascunho de lancamento;
5. confirmacao ou cancelamento da pending action.

## Casos excepcionais

- se a ultima empresa nao for valida, o usuario precisa selecionar outra;
- se faltar contexto para lancamento, o Operador pode pedir clarificacao;
- se o backend ou o runtime falhar, a sessao e o historico do turno devem permanecer recuperaveis.

## Impactos em dados e API

- sessao e historico do assistente persistidos no backend;
- traces de tools e pending actions auditaveis;
- streaming SSE para o chat.

## Pendencias

- voz, push proativo e modo `Especialista` funcional ficam para fases posteriores;
- consultas analiticas abertas e fast paths sem IA nao entram na V1.

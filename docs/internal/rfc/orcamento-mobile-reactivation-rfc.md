---
title: Orcamento Mobile reactivation RFC
slug: /docs/internal/rfc/orcamento-mobile-reactivation-rfc
type: rfc
product: legacy
audience: dev
visibility: internal
status: archived
owner: engineering
last_reviewed: 2026-06-04
summary: Plano tatico historico da reativacao do app legado de Orcamento Mobile.
tags:
  - rfc
  - legacy
  - mobile
related:
  - /docs/legacy/orcamento-mobile/reactivation-note
---

# Orcamento Mobile reactivation RFC

## Contexto

Este documento registra o plano tatico usado para conduzir a reativacao do app legado de Orcamento Mobile em um marco `local-first`, com sync opcional via Zenit.

## Problema

O app precisava voltar a operar sem depender da integracao Firebase antiga, preservando offline como requisito e sem se transformar em uma reescrita ampla do dominio.

## Proposta

As linhas centrais do plano foram:

- migrar o dominio monetario para centavos;
- separar data de negocio de timestamps reais;
- introduzir IDs estaveis;
- manter naming PT-BR no Flutter;
- criar servicos dedicados para repositorio, auth, sync, clock e configuracao;
- substituir o bootstrap legado por um fluxo `guest` com sync opcional;
- introduzir dominio backend de `Budget` e `BudgetEntry` para suportar sync;
- projetar integracao financeira seletiva quando relevante.

## Tradeoffs

- preservou rapidamente o valor do app legado;
- evitou reescrita completa;
- manteve divida de contexto por ainda se apoiar em uma linha de produto separada do Zenit Cash principal.

## Pontos em aberto

- aprofundamento futuro no core financeiro do ecossistema;
- evolucao da UX de sync e conflitos;
- decisao de longo prazo sobre convivencia entre app legado e novos produtos mobile.

## Proximos passos

O RFC esta arquivado e permanece apenas como referencia historica da decisao e da execucao daquela fase.

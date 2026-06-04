---
title: Orcamento Mobile overview
slug: /docs/legacy/orcamento-mobile/overview
type: legacy-note
product: legacy
audience: product
visibility: internal
status: archived
owner: product
last_reviewed: 2026-06-04
summary: Visao geral do app Flutter legado de orcamento diario pessoal do ecossistema Zenit.
tags:
  - legacy
  - flutter
  - budget
related:
  - /docs/legacy/orcamento-mobile/reactivation-note
---

# Orcamento Mobile overview

## Contexto historico

O app Flutter em `mobile/` nasceu como um produto de orcamento diario pessoal `local-first`, separado da proposta do novo `zenit-cash-mobile`.

## Escopo legado

O app foi desenhado para:

- criar um orcamento diario do tipo `gasto` ou `economia`;
- acompanhar quanto gastar ou guardar no dia;
- registrar entradas e saidas com baixo atrito;
- manter um unico orcamento de trabalho;
- continuar funcionando offline.

## Estado atual

Na reativacao mais recente, o app passou a operar sem dependencia funcional de Firebase, com bootstrap local em Hive, migracao monetaria para centavos, sincronizacao opcional via backend Zenit e servicos dedicados para repositorio, auth e sync.

## Substituicao ou destino

Este app permanece como linha de produto legada e nao deve ser confundido com o novo `zenit-cash-mobile`, que nasce como extensao direta do dominio do Zenit Cash.

## Referencias

- app legado: `C:\\dev\\equinox\\zenit\\mobile`
- nota de reativacao: [Orcamento Mobile reactivation](orcamento-mobile-reactivation-legacy-note.md)

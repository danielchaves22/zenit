---
title: Orcamento Mobile reactivation
slug: /docs/legacy/orcamento-mobile/reactivation-note
type: legacy-note
product: legacy
audience: dev
visibility: internal
status: archived
owner: engineering
last_reviewed: 2026-06-04
summary: Registro tecnico da reativacao do app legado de Orcamento Mobile.
tags:
  - legacy
  - mobile
  - reactivation
related:
  - /docs/legacy/orcamento-mobile/overview
  - /docs/internal/rfc/orcamento-mobile-reactivation-rfc
---

# Orcamento Mobile reactivation

## Contexto historico

O objetivo da reativacao foi recuperar o app legado em `zenit/mobile` sem ampliar o escopo funcional do produto naquele primeiro momento.

## Escopo legado

O MVP de reativacao partiu de seis decisoes centrais:

- reaproveitar o dominio, as telas e os fluxos ja existentes do app;
- substituir autenticacao e sincronizacao legadas baseadas em Firebase;
- persistir dados no backend do ecossistema Zenit;
- manter Hive e o comportamento offline;
- evitar reescrita funcional ampla;
- manter o app como produto estreito de orcamento diario.

## Estado atual

O diagnostico consolidado registrou que o menor caminho tecnico era reaproveitar o dominio atual e substituir a camada de integracao, mantendo o comportamento `local-first` e projetando integracao financeira seletiva no backend.

## Substituicao ou destino

Este material permanece como referencia historica e tecnica para o app Flutter legado. Ele nao define a direcao do novo `zenit-cash-mobile`.

## Referencias

- visao geral do legado: [Orcamento Mobile overview](orcamento-mobile-overview.md)
- plano tatico historico: [Orcamento Mobile reactivation RFC](../../internal/rfc/orcamento-mobile-reactivation-rfc.md)

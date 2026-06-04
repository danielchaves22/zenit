---
title: Docs templates guide
slug: /docs/internal/decisions/docs-templates-guide
type: decision-record
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Templates minimos por tipo de documento canonico do portal.
tags:
  - docs
  - templates
related:
  - /docs/internal/decisions/docs-frontmatter-schema
---

# Docs templates guide

## Contexto

Padronizar apenas metadados nao resolve a heterogeneidade do acervo. Cada tipo de documento precisa de uma estrutura minima previsivel.

## Decisao

Templates oficiais:

- `overview`: objetivo, escopo, publico-alvo, conceitos principais, links relacionados.
- `functional-spec`: objetivo, escopo, regras de negocio, fluxos principais, casos excepcionais, impactos em dados e API, pendencias.
- `technical-spec`: contexto, objetivo tecnico, decisao, arquitetura da solucao, contratos e interfaces, seguranca e observabilidade, limitacoes, proximos passos.
- `architecture-note`: contexto, problema, decisao, tradeoffs, alternativas consideradas, consequencias.
- `setup-guide`: objetivo, pre-requisitos, configuracao, execucao, verificacao, troubleshooting.
- `operations-guide`: quando usar, pre-requisitos, passos, riscos, rollback, verificacao final.
- `testing-guide`: objetivo, escopo, pre-requisitos, comandos, cenarios de teste, criterios de sucesso, troubleshooting.
- `example`: cenario, atores envolvidos, entrada, fluxo passo a passo, payloads e eventos, resultado esperado, observacoes.
- `rfc`: contexto, problema, proposta, tradeoffs, pontos em aberto, proximos passos.
- `decision-record`: contexto, decisao, consequencias, documentos relacionados.
- `legacy-note`: contexto historico, escopo legado, estado atual, substituicao ou destino, referencias.

## Consequencias

- Os leitores reconhecem rapidamente o tipo de conteudo.
- A migracao do acervo deixa de depender de estilo individual.
- O portal pode sinalizar claramente o que e especificacao, guia ou historico.

## Documentos relacionados

- [Docs style guide](docs-style-guide.md)
- [Docs migration map](docs-migration-map.md)

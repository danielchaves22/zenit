---
title: Zenit documentation overview
slug: /docs
type: overview
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Indice editoral do acervo canonicamente mantido em docs/.
tags:
  - documentation
  - governance
related:
  - /docs/internal/decisions/docs-governance-overview
  - /docs/internal/decisions/docs-information-architecture
---

# Zenit documentation overview

## Objetivo

Centralizar a documentacao canonica do monorepo em `docs/`, com estrutura estavel, frontmatter padronizado e publicacao renderizada no portal `/docs`.

## Escopo

Esta pasta deve conter apenas documentacao duravel e referenciavel.

Entram aqui:

- especificacoes funcionais;
- especificacoes tecnicas;
- notas de arquitetura;
- guias de setup, operacao e testes;
- exemplos de fluxo;
- RFCs e decision records internos;
- material legado que ainda precise ser consultado.

Nao entram aqui:

- notas soltas de conversa;
- checklist de sprint;
- cards de implementacao;
- rascunhos sem owner;
- planos taticos que ainda nao viraram referencia duravel.

## Estrutura

- `help/`: ajuda e onboarding para usuarios finais.
- `products/`: documentacao funcional por produto.
- `architecture/`: arquitetura, integracoes e fluxos tecnicos.
- `operations/`: setup, operacao, testes e troubleshooting.
- `integrations/`: integracoes externas.
- `internal/`: RFCs, decision records e normas editoriais.
- `legacy/`: historico e material legado.

## Regras editoriais

- `docs/` e a fonte de verdade.
- O portal renderiza os Markdown; ele nao e uma segunda fonte.
- Cada doc precisa de frontmatter valido.
- Cada doc precisa de `owner`, `status`, `visibility` e `last_reviewed`.
- `README.md` local fica restrito a contexto curto e execucao.
- `plans/` fica fora do portal.

## Leitura recomendada

- [Docs governance overview](internal/decisions/docs-governance-overview.md)
- [Docs style guide](internal/decisions/docs-style-guide.md)
- [Docs frontmatter schema](internal/decisions/docs-frontmatter-schema.md)
- [Docs templates guide](internal/decisions/docs-templates-guide.md)
- [Docs information architecture](internal/decisions/docs-information-architecture.md)
- [Docs migration map](internal/decisions/docs-migration-map.md)

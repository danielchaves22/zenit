---
title: Docs style guide
slug: /docs/internal/decisions/docs-style-guide
type: decision-record
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Convencoes de escrita, nomes, slugs e layout editorial do acervo Zenit.
tags:
  - docs
  - style
related:
  - /docs/internal/decisions/docs-frontmatter-schema
  - /docs/internal/decisions/docs-templates-guide
---

# Docs style guide

## Contexto

Os documentos existentes misturam idiomas, naming e estruturas internas. Isso dificulta navegacao, busca e manutencao do portal.

## Decisao

- Idioma do corpo dos documentos: `pt-BR`.
- Idioma de nomes de arquivo, slugs e enums: `english`, em ASCII.
- Datas no formato `YYYY-MM-DD`.
- Nomes de arquivo no formato `<topic>-<type>.md`.
- Titulos curtos e objetivos, sem emoji.
- Links internos devem preferir slugs canonicos ou links relativos dentro de `docs/`.

## Consequencias

- O acervo fica previsivel.
- Fica mais simples automatizar validacao e build.
- O conteudo pode ser migrado de ferramenta sem reescrita estrutural.

## Documentos relacionados

- [Docs frontmatter schema](docs-frontmatter-schema.md)
- [Docs templates guide](docs-templates-guide.md)

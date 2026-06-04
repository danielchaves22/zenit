---
title: Docs frontmatter schema
slug: /docs/internal/decisions/docs-frontmatter-schema
type: decision-record
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Schema canonico do frontmatter usado pelo portal de documentacao.
tags:
  - docs
  - frontmatter
related:
  - /docs/internal/decisions/docs-style-guide
---

# Docs frontmatter schema

## Contexto

O portal precisa de metadados consistentes para gerar navegacao, filtros e builds separados por visibilidade.

## Decisao

Todo documento canonico deve abrir com YAML frontmatter contendo:

- `title`
- `slug`
- `type`
- `audience`
- `visibility`
- `status`
- `owner`
- `last_reviewed`

Campos opcionais:

- `product`
- `summary`
- `tags`
- `related`
- `supersedes`

Enums fechados:

- `type`: `overview`, `functional-spec`, `technical-spec`, `architecture-note`, `setup-guide`, `operations-guide`, `testing-guide`, `example`, `rfc`, `decision-record`, `legacy-note`
- `audience`: `user`, `dev`, `ops`, `product`, `leadership`
- `visibility`: `public`, `internal`, `restricted`
- `status`: `draft`, `active`, `deprecated`, `archived`
- `owner`: `engineering`, `product`, `design`, `ops`

## Consequencias

- O build do portal pode validar documentos antes de publicar.
- A busca e os filtros podem usar metadados consistentes.
- A visibilidade deixa de depender de pasta ou convencao informal.

## Documentos relacionados

- [Docs templates guide](docs-templates-guide.md)
- [Docs information architecture](docs-information-architecture.md)

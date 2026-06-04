---
title: Docs governance overview
slug: /docs/internal/decisions/docs-governance-overview
type: decision-record
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Regras de governanca, publicacao e lifecycle da documentacao Zenit.
tags:
  - docs
  - governance
related:
  - /docs/internal/decisions/docs-frontmatter-schema
  - /docs/internal/decisions/docs-information-architecture
---

# Docs governance overview

## Contexto

O acervo de documentacao do monorepo nasceu distribuido entre `docs/`, `backend/docs/`, `apps/.../docs`, `README`s e `plans/`. Para transformar esse material em base de conhecimento consistente, a governanca precisa ser explicita.

## Decisao

- `docs/` passa a ser a fonte de verdade da documentacao canonica.
- O portal de docs renderiza os arquivos de `docs/`.
- `README.md` local existe apenas para contexto curto de execucao.
- `plans/` nao entra no portal.
- Todo documento precisa de frontmatter valido.
- Todo documento precisa de `owner`, `status`, `visibility` e `last_reviewed`.
- Todo documento precisa seguir um tipo editorial oficial.

## Consequencias

- A documentacao passa a ter revisao e versionamento junto com o codigo.
- O build do portal consegue filtrar conteudo por visibilidade.
- Mudancas estruturais deixam de depender de uma ferramenta externa.
- O time consegue publicar conteudo publico sem expor o acervo interno.

## Documentos relacionados

- [Docs style guide](docs-style-guide.md)
- [Docs frontmatter schema](docs-frontmatter-schema.md)
- [Docs templates guide](docs-templates-guide.md)
- [Docs information architecture](docs-information-architecture.md)
- [Docs migration map](docs-migration-map.md)

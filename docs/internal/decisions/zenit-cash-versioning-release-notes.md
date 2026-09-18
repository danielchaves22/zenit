---
title: Zenit Cash versioning and release notes
slug: /docs/internal/decisions/zenit-cash-versioning-release-notes
type: decision-record
audience: dev
visibility: internal
status: active
owner: product
last_reviewed: 2026-09-18
summary: Define a numeracao, as tags Git e o processo de fechamento de versoes do Zenit Cash.
tags:
  - zenit-cash
  - versioning
  - release-notes
related:
  - /docs/products/zenit-cash/releases
  - /docs/internal/decisions/docs-frontmatter-schema
---

# Zenit Cash versioning and release notes

## Contexto

O Zenit Cash chegou a producao e recebeu diversos incrementos antes de adotar
uma numeracao formal. Commits isolados nao representam necessariamente uma nova
versao para o usuario. E necessario distinguir desenvolvimento continuo de um
marco de produto deliberadamente fechado.

## Decisao

O primeiro marco formal e o **Zenit Cash 1.0.0**. Tudo que foi publicado antes
dele integra a base historica anterior ao versionamento; nao serao inventadas
versoes retroativas.

As versoes seguem Semantic Versioning como criterio orientativo:

- `MAJOR`: mudanca incompativel ou nova geracao do produto;
- `MINOR`: conjunto de novos recursos compativeis;
- `PATCH`: correcoes e melhorias compativeis sem novo conjunto funcional relevante.

A decisao de fechar uma versao pertence ao responsavel pelo produto. Uma
implementacao, commit ou deploy isolado nao cria uma versao automaticamente.

## Tags Git

Como o repositorio contem varios aplicativos, as tags sao identificadas pelo
produto:

```text
zenit-cash-v<MAJOR>.<MINOR>.<PATCH>
```

Exemplo inicial:

```text
zenit-cash-v1.0.0
```

As tags devem ser anotadas, nunca reutilizadas nem movidas. Uma correcao feita
depois do fechamento gera outra versao, normalmente `PATCH`.

Uma tag nao pertence a uma branch: ela aponta para um commit. No fechamento de
uma versao do Zenit Cash, o commit marcado deve estar contido em `develop` e
`master`. Sempre que possivel, as duas branches e a tag devem apontar para o
mesmo commit de fechamento, evitando commits de merge sem conteudo adicional.

## Processo de fechamento

1. O responsavel pelo produto declara explicitamente que a versao sera fechada.
2. O escopo pretendido deve estar commitado e passar pelos quality gates aplicaveis.
3. A arvore de trabalho deve estar limpa.
4. A partir da segunda versao, o levantamento usa o intervalo entre a ultima tag
   do Zenit Cash e o commit candidato. Commits com prefixo `[CASH]` ajudam na
   triagem, mas o diff e os arquivos compartilhados do backend tambem devem ser
   revisados.
5. O informativo e criado em `docs/products/zenit-cash/releases/` no mesmo commit
   que fecha o conteudo da versao.
6. `develop` e `master` sao atualizadas para conter o mesmo commit de fechamento,
   preferencialmente por `fast-forward`, e publicadas.
7. O commit exato e validado no ambiente de producao.
8. A tag anotada e criada nesse mesmo commit e enviada explicitamente ao remoto.

Comandos de referencia depois da confirmacao do deploy:

```bash
git tag -a zenit-cash-v1.0.0 -m "Zenit Cash 1.0.0"
git push origin zenit-cash-v1.0.0
```

O helper de commit e publicacao da branch nao substitui o envio da tag, salvo se
for alterado explicitamente para isso no futuro.

## Levantamento da proxima versao

Para uma versao posterior, o intervalo confiavel comeca na ultima tag:

```bash
git log --first-parent --oneline zenit-cash-v1.0.0..HEAD
git diff --stat zenit-cash-v1.0.0...HEAD
```

O resultado deve ser filtrado e interpretado como mudanca de produto. Refatoracoes,
migrations e observabilidade entram no informativo somente quando alterarem uso,
confiabilidade, compatibilidade ou alguma orientacao relevante ao usuario.

## Consequencias

- cada versao passa a ter um marco Git imutavel;
- o informativo pode ser reconstruido a partir do intervalo entre tags;
- varias implementacoes podem compor uma unica versao;
- o historico anterior permanece reconhecido como baseline, sem falsa precisao;
- tags de outros aplicativos nao interferem na sequencia do Zenit Cash.

## Documentos relacionados

- [Novidades do Zenit Cash](../../products/zenit-cash/releases/README.md)
- [Docs frontmatter schema](docs-frontmatter-schema.md)

---
title: Zenit public site setup
slug: /docs/operations/site/zenitapp-public-site-setup
type: setup-guide
audience: ops
visibility: internal
status: active
owner: ops
last_reviewed: 2026-06-04
summary: Setup e deploy do site publico estatico da Zenit, incluindo a area /docs gerada a partir de Markdown.
tags:
  - site
  - static
  - docs
related:
  - /docs/help/zenit-documentation-overview
---

# Zenit public site setup

## Objetivo

Documentar a estrutura e o processo de publicacao do site publico estatico `zenitapp.net`.

## Pre-requisitos

- acesso ao repositorio;
- ambiente com Node.js e npm para gerar a area `/docs`;
- acesso ao provedor de hospedagem do static site.

## Configuracao

- o conteudo institucional fica em `sites/zenitapp-public`;
- a documentacao publica e gerada em `sites/zenitapp-public/docs`;
- o comando de build de docs publicas e `npm run build:docs:public`.

## Execucao

1. revisar o conteudo institucional estatico;
2. executar `npm run build:docs:public`;
3. publicar `sites/zenitapp-public` como diretorio de saida do static site;
4. validar as rotas principais do dominio, inclusive `/docs`.

## Verificacao

- a home institucional responde em `/`;
- as paginas de produto continuam acessiveis;
- a navegacao para `/docs` aparece no site;
- a area `/docs` renderiza o build publico mais recente.

## Troubleshooting

- se `/docs` estiver sem estilos, validar se `sites/zenitapp-public/docs/assets/docs.css` foi gerado;
- se o conteudo nao aparecer, garantir que o build publico foi executado antes do deploy;
- se links internos quebrarem, revisar slugs e frontmatter dos documentos publicados.

---
title: Theme customization
slug: /docs/operations/frontend/theme-customization
type: operations-guide
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: design
last_reviewed: 2026-06-04
summary: Guia operacional para adicionar e manter temas de cor no frontend do Zenit Cash.
tags:
  - frontend
  - theme
  - design-system
related:
  - /docs/operations/testing/zenit-cash-frontend-testing
---

# Theme customization

## Quando usar

Use este guia quando for necessario adicionar um novo tema de cor, revisar a consistencia visual de um tema existente ou ajustar a configuracao de paleta do `apps/zenit-cash`.

## Pre-requisitos

- conhecer o arquivo de configuracao de tema do frontend;
- ter a paleta principal e suas variacoes definidas;
- validar impacto de acessibilidade antes de promover o tema.

## Passos

1. adicionar a nova opcao ao tipo de cor suportado pelo frontend;
2. incluir a configuracao completa do tema no objeto de configuracao correspondente;
3. definir pelo menos cor principal, hover, variacao clara, variacao escura, gradiente e sombra;
4. revisar rotulos, categoria visual e expectativa de acessibilidade;
5. validar a exibicao em pontos criticos da interface.

## Riscos

- contraste insuficiente entre cor principal e texto;
- gradientes ou sombras que descaracterizem a identidade visual;
- divergencia entre o nome do tema e a paleta efetivamente aplicada;
- regressao visual em componentes que dependem de estados de hover ou foco.

## Rollback

- remover o tema novo da lista suportada;
- desfazer a configuracao do tema no arquivo de origem;
- validar que os temas existentes continuam renderizando corretamente.

## Verificacao final

- confirmar que o tema aparece como opcao selecionavel;
- confirmar que os estados principais de UI permanecem legiveis;
- confirmar que o frontend continua compilando e passando pelos checks relevantes.

---
title: Conciliacao de contas de disponibilidade via OFX
slug: /docs/products/zenit-cash/availability-accounts-ofx-reconciliation
type: functional-spec
product: zenit-cash
audience: product
visibility: internal
status: draft
owner: product
last_reviewed: 2026-06-10
summary: Especificacao funcional da conciliacao de contas de disponibilidade a partir de arquivos OFX.
tags:
  - cash
  - accounts
  - reconciliation
  - ofx
related:
  - /docs/internal/rfc/zenit-cash-product-direction-rfc
  - /docs/products/zenit-cash/accounts-negative-balance
---

# Conciliacao de contas de disponibilidade via OFX

## Objetivo

Definir a rotina de conciliacao de contas de disponibilidade a partir de arquivos OFX, com foco em identificar o que ja foi lancado, o que ainda esta pendente e o que precisa de revisao antes de virar lancamento.

## Escopo

A funcionalidade deve permitir:

- importar um arquivo OFX associado a uma conta de disponibilidade;
- normalizar os movimentos financeiros do arquivo;
- comparar esses movimentos com os lancamentos ja existentes na conta;
- exibir uma tela de conciliacao no mesmo estilo operacional da conciliacao de cartao;
- permitir criacao individual ou em lote dos itens pendentes.

Esta rotina existe para reduzir divergencias quando um movimento bancario passou na conta, mas ainda nao foi registrado manualmente no sistema.

## Premissas

- o OFX deve ser tratado como formato padrao e, em principio, independente de banco;
- nao deve ser necessario criar um parser por banco, salvo quando um banco gerar um OFX fora do padrao esperado;
- a conciliacao sempre acontece dentro de uma conta previamente escolhida;
- a descricao livre usada pelo usuario no Zenit nao deve ser o criterio principal de matching;
- identificadores nativos do OFX, quando existirem, devem ser aproveitados para auditoria e para fortalecer o matching.

## Regras de negocio

### Estados da conciliacao

Cada movimento importado deve receber um dos estados abaixo:

- `OK`: ja existe um lancamento equivalente na conta e nao ha divergencia relevante;
- `SIMILAR`: existe um ou mais candidatos proximos, mas a confirmacao depende de revisao humana;
- `PENDENTE`: nao foi encontrado lancamento equivalente e o item pode ser criado;
- `NAO_IMPORTAVEL`: o item nao deve virar lancamento, seja por falta de dados validos, por ser uma linha nao operacional ou por cair numa regra explicita de exclusao.

### Criterios de comparacao

O matching deve priorizar criterios objetivos do movimento:

- conta conciliada;
- direcao do movimento (`credito` ou `debito`);
- valor;
- data do movimento;
- identificador de origem do OFX, quando houver, como `FITID`.

A descricao do OFX pode ser exibida como apoio visual e persistida como metadado de origem, mas nao deve ser exigida para classificar um item como `OK`.

### Classificacao sugerida

Regras iniciais esperadas:

- `OK` quando houver coincidencia objetiva e sem ambiguidade entre conta, direcao, valor e data; se houver identificador unico de origem previamente vinculado ao lancamento, ele deve prevalecer como prova mais forte;
- `SIMILAR` quando existir coincidencia parcial ou ambigua, como mesmo valor e direcao com pequena divergencia de data, ou mais de um candidato plausivel;
- `PENDENTE` quando nao houver candidato suficientemente confiavel;
- `NAO_IMPORTAVEL` para linhas invalidas, movimentos sem dados minimos, duplicidades internas do arquivo ou registros que nao devam materializar lancamentos operacionais.

### Acao do usuario

Na tela de conciliacao, o usuario deve poder:

- revisar item a item;
- confirmar se um item `SIMILAR` deve ser aceito como equivalente ou tratado como pendente;
- criar um lancamento individualmente a partir de um item pendente;
- criar em lote os itens pendentes selecionados.

## Fluxos principais

1. usuario seleciona uma conta de disponibilidade e envia um arquivo OFX;
2. sistema interpreta o arquivo e converte seus movimentos para um modelo interno normalizado;
3. sistema compara os movimentos importados com os lancamentos ja existentes naquela conta;
4. sistema apresenta a tela de conciliacao com resumo, estados e diferencas;
5. usuario revisa os itens e decide quais devem ser lancados;
6. sistema cria os lancamentos confirmados e persiste os metadados de origem para auditoria e uso futuro no matching.

## Casos excepcionais

- OFX sem `FITID` ou sem outro identificador forte deve continuar sendo suportado, com matching baseado em conta, direcao, valor e data;
- o sistema deve ignorar ou marcar como `NAO_IMPORTAVEL` linhas que representem apenas saldo, fechamento tecnico ou conteudo sem efeito operacional;
- arquivos com movimentos duplicados internamente devem sinalizar esse risco para evitar dupla criacao;
- diferencas de descricao entre o extrato e o lancamento interno nao devem, por si so, impedir um `OK`;
- transferencias podem exigir tratamento adicional no futuro, mas a primeira versao pode manter o foco em credito e debito por conta.

## Impactos em dados e API

A implementacao deve prever:

- uma rotina de preview antes do commit, como ja ocorre na conciliacao de cartao;
- persistencia de metadados de origem do OFX nos lancamentos criados ou vinculados;
- registro minimo de auditoria da importacao, incluindo conta, arquivo, periodo lido e quantidade de movimentos;
- suporte futuro a historico de importacoes e reprocessamento.

Metadados desejaveis de origem incluem, quando disponiveis:

- identificador do movimento no OFX;
- data original do movimento;
- valor;
- direcao;
- tipo do movimento;
- nome, memo ou historico original;
- identificador da sessao de importacao ou hash do arquivo.

## Direcao de UX

A experiencia deve seguir o mesmo padrao mental da conciliacao de cartao:

- resumo no topo;
- lista de itens conciliados e pendentes;
- destaque visual para `OK`, `SIMILAR`, `PENDENTE` e `NAO_IMPORTAVEL`;
- revisao humana antes do commit;
- acoes individuais e em lote.

## Pendencias em aberto

- definir a janela exata de tolerancia para classificar um item como `SIMILAR`;
- decidir se transferencias entre contas internas terao heuristica propria na primeira versao ou numa fase posterior;
- definir se o historico de importacoes entra junto da primeira entrega ou apenas na futura central de conciliacao.

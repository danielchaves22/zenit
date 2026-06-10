---
title: Zenit Cash product direction RFC
slug: /docs/internal/rfc/zenit-cash-product-direction-rfc
type: rfc
product: zenit-cash
audience: product
visibility: internal
status: draft
owner: product
last_reviewed: 2026-06-09
summary: Referencia interna de posicionamento, prioridades de roadmap e papel do assistente IA no Zenit Cash.
tags:
  - rfc
  - zenit-cash
  - product
  - strategy
  - assistant
  - whatsapp
related:
  - /docs/products/zenit-cash/fixed-transactions
  - /docs/products/zenit-cash/availability-accounts-ofx-reconciliation
  - /docs/architecture/assistant/assistant-runtime-architecture-note
---

# Zenit Cash product direction RFC

## Objetivo

Registrar uma direcao possivel para o Zenit Cash como referencia interna de produto.

Este documento nao representa uma decisao definitiva nem um compromisso de execucao. Ele consolida uma tese de posicionamento, prioridades de roadmap e o papel esperado do assistente IA para apoiar discussoes futuras.

## Contexto

O Zenit Cash ja possui uma base funcional relevante em contas, categorias, lancamentos, recorrencias, cartoes de credito, faturas, conciliacao por arquivo e assistente com rascunho confirmado.

Ao mesmo tempo, o mercado possui apps financeiros generalistas com preco baixo e proposta ampla. Competir apenas como "app financeiro com IA" tende a ser uma disputa fraca em diferenciacao.

Existe, porem, uma oportunidade mais clara em duas frentes complementares:

- uma base operacional forte, confiavel e auditavel para controle financeiro real;
- um especialista financeiro particular com IA, apoiado nos dados reais do usuario e acessado por chat.

## Hipotese de posicionamento

Uma direcao promissora para o produto e:

**Zenit e um backoffice financeiro leve para pequenas operacoes brasileiras que precisam conciliar cartoes e contas com seguranca, identificar divergencias e fechar o financeiro sem ERP pesado.**

Essa hipotese desloca o produto de um app financeiro pessoal generico para uma ferramenta de operacao, revisao e fechamento.

## Guardrails de produto

Se essa direcao for seguida, as prioridades devem respeitar os seguintes principios:

- a base financeira e a fonte de verdade operacional;
- a IA e uma camada de apoio, organizacao, execucao assistida e visao;
- conciliacao e fechamento valem mais do que dashboards cosmeticos;
- o produto nao deve depender de "chat bonito" sem dados confiaveis por tras;
- o WhatsApp pode ser canal principal de uso cotidiano, mas nao substitui a experiencia web para fluxos densos.

## Camadas do produto

### 1. Base operacional

Camada responsavel por confiabilidade, auditabilidade e execucao:

- contas e categorias;
- lancamentos financeiros;
- transacoes fixas e recorrencias;
- cartoes de credito, compras parceladas e faturas;
- conciliacao por arquivo;
- historico e trilha de revisao.

### 2. Especialista financeiro particular com IA

Camada responsavel por frequencia de uso, organizacao e valor percebido:

- conversas por chat sobre saude financeira;
- criacao assistida de lancamentos;
- criacao e revisao de orcamentos;
- consultas financeiras simples;
- orientacao sobre compras e compromissos;
- leitura contextual da situacao real do usuario;
- notificacoes e alertas proativos.

## Direcao para o especialista financeiro IA

Mesmo que nao seja o principal diferencial competitivo externo, o especialista financeiro particular pode ser a principal interface de uso pessoal do produto.

O papel esperado dessa camada e:

- transformar desorganizacao em rotina;
- reduzir atrito para registrar e consultar dados;
- ajudar o usuario a interpretar a propria situacao financeira;
- apoiar decisoes do dia a dia com base em dados reais, nao em conselhos genericos.

O especialista deve operar sobre conceitos internos claros, como:

- saldo por conta;
- total disponivel real;
- despesas fixas;
- compromissos ate o fim do mes;
- faturas abertas e futuras;
- renda prevista;
- margem livre real;
- limite utilizado em cartoes;
- previsao de saldo ao final do mes.

Sem essa base, a camada de IA tende a produzir orientacao fraca. Com essa base, a percepcao do produto pode se aproximar de um assessor financeiro particular contextual.

## Roadmap de produto orientativo

### P0. Consolidacao da base ja existente

Manter e amadurecer o que ja existe:

- contas, categorias e lancamentos;
- compras no cartao, parcelas, faturas e projecoes;
- conciliacao de cartao por arquivo;
- transacoes fixas;
- assistente com rascunho e confirmacao.

O foco desta fase e robustez e consistencia, nao expansao lateral.

### P1. Conciliacao de contas de disponibilidade via OFX

Proxima prioridade mais aderente ao posicionamento:

- importacao OFX generica para contas de disponibilidade;
- tela de conciliacao com estados `OK`, `SIMILAR`, `PENDENTE` e `NAO_IMPORTAVEL`;
- criacao individual e em lote de pendentes;
- persistencia de metadados de origem para auditoria e apoio ao matching;
- criterios de comparacao baseados em data, valor, direcao, conta e identificador do arquivo quando houver.

Esta fase fecha o ciclo de uma dor operacional central: identificar o que passou em conta e ainda nao virou lancamento.

### P2. Central de conciliacao

Unificar conciliacoes em uma visao operacional:

- pendencias por conta e cartao;
- filtros por periodo, origem, status e conta;
- historico de importacoes;
- reprocessamento e consulta de importacoes anteriores;
- trilha de auditoria de criacao, revisao e descarte.

### P3. Fechamento mensal

Transformar o sistema em ferramenta de fechamento:

- checklist de fechamento do periodo;
- saldo esperado versus saldo real por conta;
- faturas conciliadas e pendencias abertas;
- itens sem categoria ou sem revisao;
- visao de "mes pronto para fechar" versus "mes com pendencias".

### P4. Automacao e inteligencia

Expandir a camada de apoio:

- sugestao de categoria e descricao mais fortes;
- regras baseadas no historico da empresa ou do usuario;
- pre-selecao automatica de pendentes;
- sugestoes proativas de ajustes e correcoes;
- explicacoes mais contextualizadas da situacao financeira.

### P5. Integracoes mais amplas

Expandir canais e automacao quando a rotina central estiver madura:

- Open Finance, se fizer sentido;
- ingestao automatica de extratos e faturas;
- importacoes recorrentes;
- conectores adicionais por banco ou origem.

## O que nao deve ser prioridade central

Enquanto a tese acima estiver em avaliacao, estas frentes nao devem liderar o roadmap:

- virar app financeiro pessoal generico;
- competir so por dashboard, visual ou IA conversacional;
- investir cedo em features amplas de lifestyle financeiro;
- expandir para muitos modulos sem consolidar conciliacao e fechamento.

## Direcao para WhatsApp

O WhatsApp esta no radar como canal relevante e deve ser entendido como um canal de interacao cotidiana, nao como substituto da web.

### Papel do canal

Uso diario de baixa friccao:

- registrar lancamentos;
- consultar situacao financeira simples;
- receber alertas;
- conversar com o especialista financeiro particular;
- agir rapidamente sobre rascunhos e notificacoes.

Fluxos densos e visuais permanecem melhor resolvidos na web:

- conciliacao;
- revisao detalhada;
- auditoria;
- configuracoes;
- relatarios amplos.

### Escopo sugerido para WhatsApp

#### 1. Captura e execucao

- criar despesa, receita e transferencia;
- registrar compra no cartao;
- corrigir ou cancelar rascunhos;
- confirmar acoes pendentes;
- sugerir categoria quando necessario.

#### 2. Consultas operacionais simples

- saldos por conta;
- quanto ainda precisa pagar no mes;
- previsao de saldo no fim do mes;
- total comprometido da renda;
- faturas abertas;
- limite utilizado do cartao;
- gasto por categoria ou periodo.

#### 3. Especialista financeiro contextual

- "posso comprar isso?";
- "se eu parcelar, como fico no proximo mes?";
- "o que esta pesando mais no mes?";
- "quanto posso gastar sem apertar o caixa?";
- "o que preciso ajustar para sobrar X no fim do mes?".

#### 4. Alertas e notificacoes

- contas vencendo;
- contas vencidas;
- cartao perto de um percentual critico do limite;
- saldo projetado abaixo de um piso;
- gasto fora do padrao;
- fatura acima da media;
- lembrete para conciliar ou revisar pendencias.

## Ordem sugerida de entrega para WhatsApp

Se o canal for desenvolvido, a priorizacao inicial pode seguir esta ordem:

1. lancamentos por WhatsApp;
2. consultas rapidas de saldo, contas e previsao;
3. alertas automaticos;
4. aconselhamento financeiro contextual.

Essa ordem privilegia criacao de habito e uso recorrente antes de buscar um comportamento mais "encantador".

## Sinais de valor do produto

Se esta direcao estiver correta, o Zenit deve melhorar principalmente:

- tempo para fechar o financeiro com confianca;
- reducao de lancamentos esquecidos;
- reducao de divergencias entre sistema e realidade bancaria;
- aumento da frequencia de uso por interacoes simples e recorrentes;
- percepcao de controle e visao futura do usuario.

## Perguntas que este RFC deixa em aberto

- o foco principal do produto sera empresa pequena, operacao familiar ou uso pessoal premium;
- o assistente sera um modulo de apoio ou uma interface principal do Zenit;
- a camada de WhatsApp sera apenas canal conversacional ou tambem canal forte de notificacao operacional;
- Open Finance entra como prioridade comercial ou apenas como acelerador futuro.

## Observacao final

Este RFC deve ser tratado como referencia de rumo, nao como plano fechado.

O valor principal deste material e preservar uma linha de pensamento coerente para futuras decisoes de produto:

- base financeira forte;
- conciliacao e fechamento como eixo operacional;
- especialista financeiro IA como camada de uso diario e orientacao contextual;
- WhatsApp como canal natural de captura, consulta, notificacao e conversa.

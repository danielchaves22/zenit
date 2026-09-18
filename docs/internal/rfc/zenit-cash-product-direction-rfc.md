---
title: Zenit Cash product direction RFC
slug: /docs/internal/rfc/zenit-cash-product-direction-rfc
type: rfc
product: zenit-cash
audience: product
visibility: internal
status: active
owner: product
last_reviewed: 2026-09-16
summary: Referencia interna de posicionamento, prioridades de roadmap e papel do assistente IA no Zenit Cash.
tags:
  - rfc
  - zenit-cash
  - product
  - strategy
  - assistant
  - whatsapp
related:
  - /docs/architecture/financial/financial-planning-domain
  - /docs/products/zenit-cash/fixed-transactions
  - /docs/products/zenit-cash/availability-accounts-ofx-reconciliation
  - /docs/architecture/assistant/assistant-runtime-architecture-note
---

# Zenit Cash product direction RFC

## Objetivo

Registrar a direcao atual do Zenit Cash como referencia interna de produto.

Este documento consolida o posicionamento, os guardrails de evolucao, as prioridades
de roadmap e o papel esperado da IA. O roadmap continua sujeito a revisao, mas a
direcao pessoal primeiro e a preservacao da base para MEIs sao decisoes atuais.

## Contexto

O Zenit Cash ja possui uma base funcional relevante em contas, categorias, lancamentos, recorrencias, cartoes de credito, faturas, conciliacao por arquivo e assistente com rascunho confirmado.

Ao mesmo tempo, o mercado possui apps financeiros generalistas com preco baixo e proposta ampla. Competir apenas como "app financeiro com IA" tende a ser uma disputa fraca em diferenciacao.

Existe, porem, uma oportunidade mais clara em frentes complementares:

- uma base operacional forte, confiavel e auditavel para controle financeiro real;
- uma experiencia pessoal que transforme registros em previsibilidade e melhores decisoes;
- uma arquitetura de workspace que continue viavel para MEIs e pequenas operacoes;
- inteligencia aplicada sobre dados confirmados, sem substituir regras financeiras auditaveis.

## Hipotese de posicionamento

O posicionamento atual do produto e:

**Zenit e uma plataforma de controle e planejamento financeiro pessoal que transforma movimentacoes confiaveis em previsibilidade e decisoes, preservando uma base de workspace capaz de atender MEIs sem se tornar um ERP pesado.**

A experiencia e desenhada primeiro para uso pessoal. Propriedade, autorizacao e
modelagem operacional nao devem, contudo, pressupor que todo workspace tera para
sempre um unico usuario.

## Guardrails de produto

As prioridades devem respeitar os seguintes principios:

- a base financeira e a fonte de verdade operacional;
- a experiencia pessoal nao deve introduzir limites tecnicos que inviabilizem MEIs;
- planejamento, provisao e projecao devem ter significados distintos e consistentes;
- previsibilidade e decisoes valem mais do que dashboards cosmeticos;
- conciliacao e fechamento continuam essenciais para a confiabilidade dos dados;
- a IA e uma camada de apoio e explicacao sobre regras deterministicas;
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

### 2. Planejamento e saude financeira

Camada responsavel por transformar a base operacional em decisoes:

- Plano de Disponibilidade;
- Planejamento Mensal por Categoria;
- Provisoes para despesas futuras;
- diagnostico financeiro por objetivo;
- projecoes mensais e explicacao da qualidade dos dados.

### 3. Especialista financeiro particular com IA

Camada responsavel por frequencia de uso, organizacao e valor percebido:

- conversas por chat sobre saude financeira;
- criacao assistida de lancamentos;
- explicacao e comparacao de propostas de orcamento;
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

### P0. Consolidacao semantica e tecnica

Organizar a base antes de nova expansao funcional:

- documentar linguagem, propriedade e invariantes financeiras;
- restaurar quality gates reproduziveis;
- caracterizar comportamentos atuais antes de refatorar;
- centralizar politicas de calendario, valores e reconhecimento;
- fechar lacunas de autorizacao, idempotencia e concorrencia;
- preservar contratos e rotinas operacionais funcionais.

O foco desta fase e robustez e consistencia, nao expansao lateral.

### P1. Experiencia pessoal de planejamento

Consolidar o uso dos controles ja criados:

- tornar a visao geral orientada a decisoes;
- manter Plano de Disponibilidade, Planejamento Mensal e Provisoes conceitualmente separados;
- apresentar projecoes futuras por competencia;
- identificar bases incompletas ou desatualizadas;
- confirmar um diagnostico financeiro auditavel antes de gerar propostas.

### P2. Recomendacao deterministica de orcamento

Gerar cenarios explicaveis a partir de objetivo, compromissos, provisoes,
historico, prioridades e limites protegidos. A aplicacao de um cenario sempre
ocorre como rascunho revisavel e confirmado pelo usuario.

### P3. Inteligencia e explicacao

Usar IA para explicar diagnosticos, comparar cenarios e destacar informacoes
relevantes. A IA nao define totais financeiros nem aplica alteracoes diretamente.

### P4. Operacao e fechamento para MEIs

Amadurecer a experiencia compartilhada sem antecipar um ERP:

- autorizacao de planejamento por workspace;
- checklist de fechamento do periodo;
- saldo esperado versus saldo real por conta;
- faturas conciliadas e pendencias abertas;
- itens sem categoria ou sem revisao;
- visao de "mes pronto para fechar" versus "mes com pendencias".

### P5. Integracoes mais amplas

Expandir canais e automacao quando a rotina central estiver madura:

- Open Finance, se fizer sentido;
- ingestao automatica de extratos e faturas;
- importacoes recorrentes;
- conectores adicionais por banco ou origem.

## O que nao deve ser prioridade central

Estas frentes nao devem liderar o roadmap:

- competir como app financeiro pessoal generico sem metodologia propria;
- competir so por dashboard, visual ou IA conversacional;
- investir cedo em features amplas de lifestyle financeiro;
- antecipar um ERP para cobrir necessidades empresariais ainda nao demonstradas;
- expandir para muitos modulos sem consolidar planejamento, conciliacao e fechamento.

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

## Decisoes atuais e pontos em aberto

Decisoes atuais:

- a experiencia sera pessoal primeiro;
- dados operacionais permanecem vinculados ao workspace;
- perfil, retratos e aconselhamento financeiro pertencem ao workspace ativo,
  com autoria e permissoes explicitas para uso individual, familiar ou empresarial;
- IA permanece como apoio, nao como fonte da matematica financeira;
- a base deve continuar extensivel para MEIs e pequenas equipes.

Pontos em aberto:

- quando o assistente deve evoluir de consulta para uma interface principal;
- a camada de WhatsApp sera apenas canal conversacional ou tambem canal forte de notificacao operacional;
- Open Finance entra como prioridade comercial ou apenas como acelerador futuro.

## Observacao final

Este RFC deve ser tratado como referencia de rumo, nao como plano fechado.

O valor principal deste material e preservar uma linha de pensamento coerente para futuras decisoes de produto:

- base financeira forte;
- planejamento, conciliacao e fechamento como eixos complementares;
- especialista financeiro IA como camada de uso diario e orientacao contextual;
- WhatsApp como canal natural de captura, consulta, notificacao e conversa.

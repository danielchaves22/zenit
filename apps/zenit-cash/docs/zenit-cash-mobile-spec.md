# Zenit Cash Mobile - Especificacao e Planejamento

Data: 2026-06-03
Status: Draft inicial para alinhamento de produto e arquitetura
Diretorio implementado no monorepo: `apps/zenit-cash-mobile`

## 1. Objetivo

Definir a visao, o escopo inicial e a arquitetura funcional do futuro app `zenit-cash-mobile`, com foco em:

- visao financeira de bolso;
- captura rapida de informacoes financeiras;
- assistente com IA capaz de operar e interpretar dados financeiros;
- evolucao gradual sem depender de perguntas pre-configuradas.

Este documento nao inicia desenvolvimento. Ele organiza a especificacao e o plano de execucao.

## 2. Tese do produto

O mobile nao deve ser uma copia reduzida do app web.

O web permanece como ambiente de operacao completa, administracao, manutencao de cadastros, listagens e fluxos detalhados.

O mobile deve ser o ambiente de:

- leitura rapida do momento financeiro;
- acoes frequentes e de baixo atrito;
- consulta em linguagem natural;
- notificacoes e acompanhamento continuo;
- orientacao contextual por IA.

## 3. Principios do mobile

1. Menos manutencao, mais decisao.
2. Menos tabelas, mais sinais e contexto.
3. Menos formularios, mais confirmacao rapida.
4. Toda resposta numerica deve explicitar criterio, periodo e base de calculo.
5. Toda acao financeira sensivel exige confirmacao humana.
6. A IA interpreta e planeja; o backend executa e garante consistencia.

## 4. Papel da IA no produto

A IA do mobile sera um copiloto financeiro com dois modos principais:

- `Operador`
- `Especialista`

### 4.1 Operador

Responsavel por entender comandos e executar acoes operacionais.

Exemplos:

- registrar despesa, receita ou transferencia;
- marcar conta como paga ou recebida;
- buscar informacoes operacionais;
- apresentar dados objetivos;
- configurar alertas ou lembretes quando esse recurso existir;
- notificar vencimentos e pendencias.

Caracteristicas:

- objetivo;
- rapido;
- transacional;
- orientado a confirmacao;
- pode ler e escrever no backend conforme permissao.

### 4.2 Especialista

Responsavel por interpretar dados, responder perguntas, diagnosticar situacoes e sugerir proximos passos.

Exemplos:

- "quanto gastei com combustivel este mes?"
- "qual a media de combustivel nos ultimos 3 meses?"
- "por que minhas despesas subiram?"
- "como esta minha situacao neste mes?"
- "onde estou correndo mais risco de estourar?"

Submodos internos do `Especialista`:

- `analitico`: responde consultas quantitativas;
- `diagnostico`: explica causas, tendencias e composicao;
- `recomendacao`: sugere acoes praticas com base nos dados.

Caracteristicas:

- tecnico;
- explicito sobre criterio e periodo;
- proativo sem ser invasivo;
- nao executa escrita por padrao;
- pode acionar o `Operador` quando houver pedido de execucao.

## 5. Modelo de interacao

O usuario conversa com um unico assistente. O produto nao expoe multiplos agentes na interface.

Internamente, existe um roteamento por modo:

1. A mensagem entra no assistente.
2. A IA classifica a intencao.
3. O sistema escolhe o modo dominante: `Operador` ou `Especialista`.
4. O backend executa as operacoes necessarias.
5. O usuario recebe uma unica resposta consolidada.

Esse desenho evita a complexidade de um sistema multiagente real na V1.

## 6. Escopo funcional do mobile

## 6.1 O que o mobile deve fazer bem

- mostrar a situacao financeira atual de forma clara;
- permitir lancamentos rapidos;
- responder perguntas financeiras em linguagem natural;
- sinalizar riscos, desvios e proximos vencimentos;
- permitir acoes operacionais frequentes em poucos toques;
- explicar como uma resposta foi calculada.

## 6.2 O que o mobile nao precisa herdar do web na V1

- manutencao administrativa completa;
- formularios densos equivalentes ao web;
- listagens extensas com filtros complexos;
- relatorios completos no mesmo formato do desktop;
- cobertura integral de todos os fluxos avancados antes da base estar solida.

## 7. Superficies principais do app

## 7.1 Home

Objetivo: entregar leitura estrategica e operacional do momento.

Blocos sugeridos:

- saldo disponivel e saldo comprometido;
- proximos vencimentos;
- faturas/cartoes em pressao;
- comparativo rapido com mes anterior;
- alertas e oportunidades;
- atalho para lancamento;
- atalho para conversar com o assistente.

## 7.2 Chat do assistente

Entrada universal para:

- comandos operacionais;
- consultas analiticas;
- diagnosticos e recomendacoes.

Capacidades desejadas:

- texto desde a V1;
- voz em fase posterior;
- confirmacao rapida de lancamentos;
- possibilidade de abrir os itens que sustentam a resposta.

## 7.3 Quick actions

Atalhos de alto uso:

- nova despesa;
- nova receita;
- transferencia;
- pagar/receber;
- revisar pendencias;
- ver proxima fatura;
- abrir consulta recente.

## 7.4 Historico recente

Objetivo: permitir revisao rapida sem reproduzir a experiencia completa do web.

## 8. Casos de uso prioritarios da V1

### 8.1 Operador

- lancar despesa por texto;
- lancar receita por texto;
- lancar transferencia por texto;
- confirmar, corrigir ou cancelar um draft;
- marcar pendencia como paga ou recebida;
- responder consultas operacionais simples;
- avisar sobre vencimentos proximos;
- mostrar ultimos lancamentos relacionados a uma resposta.

### 8.2 Especialista

- quanto gastei com X no periodo Y;
- qual a media de X no periodo Y;
- comparar periodo atual com anterior;
- identificar maiores categorias do mes;
- explicar o que puxou aumento ou queda;
- apontar risco de estourar orcamento ou caixa;
- resumir a situacao do mes;
- sugerir acoes concretas com base em dados reais.

## 9. Modelo de arquitetura

## 9.1 Direcao recomendada para a V1

`mobile -> backend autenticado -> orquestracao IA -> servicos internos -> banco`

Decisao inicial:

- usar backend proprio como camada de seguranca, contexto e execucao;
- nao depender de MCP na V1;
- nao depender de Agent Builder como nucleo do produto na V1;
- usar a IA como planner/orquestrador, nao como fonte final de verdade.

Justificativa:

- o backend ja possui autenticacao, escopo por empresa e padrao de API;
- a configuracao OpenAI por empresa ja existe no ecossistema;
- a camada financeira exige regras deterministicas;
- a auditoria e a depuracao ficam melhores quando a execucao passa pelo backend.

## 9.2 Componentes logicos

### A. Router de intencao

Responsabilidades:

- classificar a mensagem;
- identificar modo dominante;
- detectar risco ou ambiguidade;
- decidir se o pedido cabe em uma receita conhecida ou exige planejamento aberto.

### B. Planner

Responsabilidades:

- transformar linguagem natural em plano estruturado;
- definir quais servicos precisa consultar;
- definir filtros, periodo, metricas, agrupamentos e transformacoes;
- pedir esclarecimento quando faltarem dados criticos.

### C. Executor

Responsabilidades:

- validar o plano;
- chamar os servicos autorizados;
- aplicar regras deterministicas;
- registrar auditoria;
- devolver resultado estruturado.

### D. Narrator

Responsabilidades:

- converter o resultado em resposta natural;
- explicitar criterio, periodo e base de calculo;
- sugerir proximo passo quando fizer sentido.

## 10. Camada semantica financeira

O produto nao deve depender de perguntas pre-configuradas, mas deve depender de uma linguagem de dominio pre-configurada.

Essa camada precisa conhecer:

- entidades: transacoes, contas, cartoes, faturas, orcamentos, fixas;
- conceitos: combustivel, mercado, alimentacao, moradia, salario, lazer;
- sinonimos: posto, abastecimento, gasolina, etanol, diesel;
- metricas: soma, media, contagem, variacao, saldo, projecao;
- periodos: hoje, ontem, este mes, ultimos 3 meses, mes fechado, ano atual;
- transformacoes: agrupar por mes, comparar periodos, top N, tendencia;
- regras: incluir pendentes ou nao, considerar data de competencia ou liquidacao, considerar compra ou fatura em cartao.

## 11. Receitas canonicamente suportadas

Mesmo sem perguntas fixas, vale manter um conjunto de receitas de alto uso para reduzir custo, latencia e variabilidade.

Exemplos de receitas:

- `create_transaction_draft`
- `confirm_transaction`
- `settle_transaction`
- `resolve_financial_concept`
- `aggregate_transactions`
- `list_transactions`
- `compare_periods`
- `budget_risk_check`
- `cash_pressure_summary`
- `upcoming_due_items`

Uso recomendado:

- se a pergunta cair claramente em uma receita, usar fluxo controlado;
- se nao cair, usar planejamento aberto baseado nas primitivas acima.

## 12. Contratos de capacidade do backend

O backend nao precisa expor uma rota para cada pergunta. Ele precisa expor primitivas seguras e composiveis.

### 12.1 Escrita e operacao

- criar draft de transacao;
- confirmar escrita;
- editar draft;
- liquidar transacao;
- consultar pendencias;
- registrar preferencia, alerta ou configuracao futura.

### 12.2 Leitura e analise

- buscar entidades basicas;
- resolver conceitos financeiros;
- agregar transacoes por filtro;
- listar transacoes de suporte;
- comparar periodos;
- calcular pressao de caixa, orcamento e vencimentos.

### 12.3 Regras e auditoria

- validacao por empresa/usuario;
- trilha de auditoria por plano executado;
- resposta estruturada para depuracao;
- regras fixas para ambiguidades de calendario e status.

## 13. Exemplos de raciocinio esperado

### 13.1 Pergunta direta

Pergunta:

`Quanto gastei de combustivel este mes?`

Raciocinio esperado:

- identificar despesa;
- resolver conceito `combustivel`;
- aplicar periodo `mes atual`;
- escolher criterio padrao de status;
- agregar soma;
- devolver valor e opcionalmente quantidade de lancamentos.

### 13.2 Pergunta com transformacao

Pergunta:

`Qual a media de consumo de combustivel nos ultimos 3 meses?`

Raciocinio esperado:

- resolver `combustivel`;
- definir o que `consumo` significa no contexto atual: gasto em dinheiro ou volume, se esse dado existir;
- aplicar janela de tempo correta;
- agrupar por mes;
- somar por mes;
- calcular media;
- informar o criterio adotado.

### 13.3 Diagnostico

Pergunta:

`Por que meu gasto subiu este mes?`

Raciocinio esperado:

- comparar periodo atual com periodo anterior;
- identificar maiores contribuidores;
- separar efeito por categoria, conta, recorrencia ou evento pontual;
- devolver explicacao curta e acionavel.

## 14. Politicas de qualidade da resposta

Toda resposta quantitativa deve informar:

- periodo considerado;
- criterio de status;
- base usada para classificacao;
- possibilidade de abrir os itens de origem.

Toda recomendacao deve:

- apontar o dado que a sustentou;
- evitar linguagem generica;
- sugerir no maximo um proximo passo principal por vez.

Toda acao operacional deve:

- mostrar o draft antes da confirmacao final quando houver risco;
- registrar sucesso, falha ou necessidade de correcao.

## 15. Politicas de ambiguidade

Quando necessario, o sistema deve perguntar antes de responder ou agir.

Ambiguidades tipicas:

- `consumo` em dinheiro ou volume;
- `ultimos 3 meses` incluindo o atual ou apenas meses fechados;
- considerar pendentes ou apenas efetivadas;
- considerar compra no cartao ou pagamento da fatura;
- categoria exata ou conceito semantico expandido.

Regra geral:

- se a ambiguidade muda pouco a resposta, adotar criterio padrao e explicitar;
- se a ambiguidade muda materialmente a resposta ou a acao, perguntar.

## 16. Roadmap por fases

### Fase 0 - Fundacoes

Objetivo:

- definir linguagem de dominio;
- mapear entidades e conceitos;
- consolidar regras de periodo, status e cartao;
- preparar trilha de auditoria e observabilidade.

Entregas:

- especificacao semantica;
- politicas de ambiguidade;
- contratos de capacidade do backend;
- definicao de metricas de produto.

### Fase 1 - Operador V1

Objetivo:

- permitir lancamentos e operacoes frequentes por linguagem natural.

Entregas:

- router inicial;
- fluxo de draft e confirmacao;
- lancamento de despesa, receita e transferencia;
- marcacao de pagamento/recebimento;
- consultas operacionais simples;
- home com quick actions e pendencias.

### Fase 2 - Especialista V1

Objetivo:

- responder perguntas analiticas e diagnosticas de alto valor.

Entregas:

- resolver conceitos financeiros;
- agregacoes e comparacoes padrao;
- respostas com criterio explicito;
- abertura dos itens que sustentam a resposta;
- resumo de situacao mensal.

### Fase 3 - Especialista Proativo

Objetivo:

- fazer o app agir como especialista de bolso.

Entregas:

- alertas de pressao de caixa;
- risco de orcamento;
- recomendacoes oportunas;
- resumo inteligente do dia/semana;
- notificacoes contextualizadas.

### Fase 4 - Evolucoes avancadas

Possibilidades:

- voz;
- memoria de preferencias do usuario;
- automacoes pessoais;
- subagentes internos se houver justificativa real;
- MCP apenas se surgir necessidade concreta de ferramentas externas padronizadas.

## 17. Metricas de sucesso

### Produto

- tempo medio para registrar uma despesa;
- taxa de confirmacao de drafts gerados pela IA;
- percentual de perguntas respondidas sem clarificacao;
- percentual de respostas aceitas como uteis;
- uso recorrente do chat por usuario ativo;
- reducao de friccao nos lancamentos.

### Qualidade

- taxa de correcoes apos sugestao da IA;
- taxa de erros de classificacao por conceito;
- taxa de respostas inconclusivas;
- taxa de falhas de execucao do plano;
- latencia media por tipo de pergunta.

## 18. Decisoes iniciais recomendadas

1. O mobile sera um produto de `insight + acao`, nao uma copia reduzida do web.
2. O assistente tera dois modos: `Operador` e `Especialista`.
3. O roteamento sera interno; o usuario conversa com uma unica entidade.
4. A V1 usara backend proprio como camada de execucao.
5. A V1 nao dependera de MCP.
6. A V1 nao dependera de Agent Builder como nucleo do produto.
7. Perguntas frequentes poderao usar receitas controladas para economizar custo.
8. Perguntas abertas usarao planejamento estruturado sobre primitivas seguras.

## 19. Pendencias de definicao

- qual stack sera usada no mobile;
- qual estrategia de autenticacao compartilhada sera adotada;
- quais notificacoes entram na primeira versao;
- se a V1 tera voz ou apenas texto;
- como tratar cartao de credito nas analises por padrao;
- qual sera o criterio padrao para `este mes`, `ultimos 3 meses` e `situacao atual`;
- se o sistema suportara litros/volume ou apenas gasto monetario em combustivel na primeira fase.

## 20. Proximo passo recomendado

Antes de qualquer implementacao, fechar mais dois artefatos:

1. Matriz de capacidades por modo:
   `intencao -> modo dominante -> servicos permitidos -> resposta esperada`

2. Catalogo de primitivas do backend:
   `capacidade -> entradas -> saidas -> regras de validacao -> auditoria`

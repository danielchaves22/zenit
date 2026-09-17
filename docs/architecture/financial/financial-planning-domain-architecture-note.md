---
title: Financial planning domain architecture
slug: /docs/architecture/financial/financial-planning-domain
type: architecture-note
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-09-17
summary: Limites, linguagem e invariantes do dominio de planejamento financeiro do Zenit Cash.
tags:
  - zenit-cash
  - finance
  - planning
  - architecture
related:
  - /docs/internal/rfc/zenit-cash-product-direction-rfc
  - /docs/products/zenit-cash/fixed-transactions
  - /docs/products/zenit-cash/availability-accounts-ofx-reconciliation
---

# Financial planning domain architecture

## Contexto

O Zenit Cash evoluiu de uma base operacional de contas, transacoes, cartoes,
parcelas e conciliacao para incluir quatro controles de planejamento:

- Plano de Disponibilidade;
- Planejamento Mensal por Categoria;
- Provisoes;
- Diagnostico Financeiro orientado por objetivo.

Esses controles respondem a perguntas diferentes. Eles compartilham os mesmos
dados financeiros, mas nao devem compartilhar significado por coincidencia de
nome nem reproduzir formulas independentes para o mesmo conceito.

A direcao de produto e pessoal primeiro. Os dados operacionais continuam
pertencendo ao workspace para que a base tambem suporte MEIs e pequenas equipes
sem transformar preferencias pessoais em regras globais da empresa.

## Problema

Dashboard, planejamento mensal e diagnostico financeiro cresceram em momentos
diferentes. Isso cria risco de divergencia em pontos como:

- data de reconhecimento de uma transacao;
- uso de valor original ou valor efetivamente pago;
- tratamento de creditos, estornos e ajustes de cartao;
- media historica quando faltam meses de dados;
- conversao de recorrencias em valor mensal;
- distribuicao temporal de parcelas e provisoes;
- significado de realizado, comprometido e projetado.

Uma recomendacao de orcamento, principalmente quando auxiliada por IA, somente
pode ser confiavel se esses conceitos tiverem uma origem canonica e auditavel.

## Decisao

### Limites dos modulos

| Modulo | Pergunta respondida | Escopo | Efeito operacional |
| --- | --- | --- | --- |
| Plano de Disponibilidade | Quanto o usuario pode utilizar preservando um saldo final? | Usuario no workspace | Mantem conta sistemica propria e projecoes do plano |
| Planejamento Mensal | Onde o workspace pretende gastar em determinado mes? | Workspace | Nao altera saldo nem cria transacao |
| Provisao | Quanto deve ser separado para uma despesa futura previsivel? | Workspace | Mantem reserva logica; nao movimenta uma conta por si so |
| Perfil Financeiro | Qual e o contexto pessoal usado para orientar decisoes? | Usuario e workspace pessoal | Nao altera dados operacionais |
| Diagnostico Financeiro | Qual era a base confirmada para analisar um objetivo? | Usuario e workspace pessoal | Cria snapshot; nao altera transacoes nem planos |

Os nomes das tabelas existentes podem permanecer durante a consolidacao. APIs,
componentes e novos modulos devem usar os nomes de dominio acima para evitar que
todo controle seja chamado genericamente de `Budget`.

### Linguagem financeira

- **Realizado:** valor confirmado como ocorrido segundo a politica de
  reconhecimento aplicavel. A politica exata de data e valor sera centralizada
  antes de novas recomendacoes.
- **Comprometido:** obrigacao ja conhecida e ainda nao liquidada, incluindo
  parcelas e faturas aplicaveis ao periodo.
- **Projetado:** ocorrencia futura inferida de uma regra ou historico, ainda sem
  registro materializado equivalente.
- **Planejado:** limite ou intencao definida pelo usuario. Nao e gasto, reserva
  nem saldo.
- **Provisionado:** valor que o usuario declarou ter separado para uma despesa
  futura. Enquanto nao houver conta vinculada, e uma reserva logica.
- **Disponivel:** capacidade derivada de saldo, compromissos, projecoes e meta.
  Nao e sinonimo de saldo bancario.
- **Liquidado:** efeito financeiro encerrado. Em cartoes, uma fatura `CLOSED`
  permanece diferente de uma fatura `PAID`.

### Invariantes

1. Toda consulta ou mutacao operacional deve estar restrita ao workspace ativo.
2. Perfil e diagnostico pessoais somente podem ser acessados pelo proprietario
   do workspace pessoal correspondente.
3. Planejamentos e provisoes empresariais exigem politica explicita de leitura e
   alteracao; autenticacao generica nao substitui autorizacao de dominio.
4. Fatura `CLOSED` nao e fatura `PAID`.
5. Planejamento mensal nao cria transacao nem altera saldo.
6. Aporte em provisao atualiza uma reserva logica e nao implica transferencia
   bancaria.
7. Uma ocorrencia fixa deve transitar de template para ocorrencia virtual e,
   quando aplicavel, para materializacao idempotente por `occurrenceKey`.
8. Snapshot confirmado deve identificar a metodologia e a base exata revisada
   pelo usuario.
9. Recalculo nao pode alterar silenciosamente a base entre previa e confirmacao.
10. IA pode explicar ou comparar propostas, mas nao define a matematica
    financeira e nao aplica mudancas sem confirmacao explicita.

### Arquitetura alvo

O dominio sera consolidado em camadas pequenas, sem um servico financeiro
universal:

1. **Adaptadores de consulta:** carregam transacoes, faturas, recorrencias,
   parcelas, provisoes e preferencias respeitando tenant e acesso.
2. **Fatos financeiros canonicos:** representam origem, periodo, estado de
   reconhecimento, categoria, valor e confianca sem depender da tela consumidora.
3. **Calculadores puros:** calculam contribuicao de provisao, equivalencia mensal,
   totais, medias e projecoes sem consultar ou persistir dados.
4. **Casos de uso:** orquestram dashboard, planejamento mensal e diagnostico.
5. **Contratos de API:** expõem valores monetarios como strings decimais e
   incluem versao de metodologia quando o resultado for persistido.

O backend e a fonte de verdade dos calculos confirmados. O frontend pode exibir
simulacoes instantaneas, mas deve usar aritmetica decimal ou centavos e nunca
substituir a validacao final do servidor.

### Compatibilidade durante a consolidacao

- Refatoracoes devem ser incrementais e preservar contratos externos por padrao.
- Antes de mudar uma formula, o comportamento existente deve possuir teste de
  caracterizacao e a mudanca deve ser registrada como decisao de metodologia.
- Alteracoes de banco devem ser aditivas sempre que possivel.
- Servicos grandes serao decompostos apenas nas areas tocadas; nao havera
  reescrita integral do modulo de transacoes.
- Diferencas intencionais entre visao de caixa, competencia e planejamento devem
  aparecer no nome da politica e no contrato retornado.

### Integridade do diagnostico confirmado

A previa do diagnostico possui um `basisHash` SHA-256 deterministico. A
identificacao vincula usuario, workspace pessoal, versao do perfil, versao da
metodologia, periodo, indicadores objetivos de qualidade e as fontes financeiras
disponiveis. Textos puramente apresentacionais nao fazem parte do hash.

A confirmacao deve reenviar o `basisHash` revisado. O backend recompõe a base no
mesmo contexto autorizado e rejeita a operacao com conflito quando os dados
mudaram. O hash nao e credencial nem substitui a autorizacao de usuario e tenant.

Uma segunda identificacao deterministica combina a base, o objetivo, a meta e as
fontes selecionadas. O indice unico de `confirmationHash` torna retries e
confirmacoes concorrentes idempotentes: uma confirmacao equivalente retorna o
snapshot ja criado. Os campos sao opcionais no banco apenas para manter leitura
compativel de snapshots anteriores a esta politica; novos registros sempre os
preenchem.

### Autorizacao do planejamento compartilhado

Planejamento Mensal por Categoria e Provisoes pertencem ao workspace. A politica
de acesso distingue consulta de gestao:

- todo membro do workspace com acesso efetivo ao Zenit Cash pode consultar os
  controles compartilhados;
- somente `ADMIN`, `SUPERUSER` ou o proprietario do workspace pode criar, alterar,
  encerrar, movimentar ou cancelar esses controles;
- a capacidade efetiva e devolvida nas consultas como `access.canRead` e
  `access.canManage`, para que a interface apresente o modo somente leitura sem
  reproduzir a regra de autorizacao;
- permissoes de contas e categorias nao concedem implicitamente permissao de
  planejamento, pois representam responsabilidades de dominio diferentes.

O middleware de tenant e o acesso ao aplicativo continuam sendo pre-condicoes.
A politica acima nao se aplica ao Plano de Disponibilidade, que e individual por
usuario, nem ao Diagnostico Financeiro, que exige o proprietario do workspace
pessoal correspondente.

### Calendario financeiro canonico

Meses financeiros usam a chave de dominio `YYYY-MM`. Quando uma entidade mensal
precisa ser persistida como `DateTime`, sua representacao canonica e o primeiro
dia do mes ao meio-dia em UTC. A hora nao representa um instante economico; ela
evita que conversoes acidentais atravessem a fronteira do dia ou do mes.

Conversao, formatacao e aritmetica de meses ficam centralizadas em funcoes puras.
Datas mensais persistidas sao lidas em UTC e o mes atual deve ser derivado do
timezone explicito do workspace, nunca implicitamente do timezone do servidor.

Dashboard mensal, historico, visao estrutural, Planejamento Mensal por Categoria
e provisoes compartilham um unico contexto de calendario por operacao. Esse
contexto resolve o timezone cadastrado no workspace, a data de negocio e o mes
atual. O planejamento mensal preserva seu limite de 24 meses e as provisoes, seu
horizonte de 10 anos. Workspaces legados sem timezone valido usam UTC como
fallback de compatibilidade.

Validadores HTTP verificam apenas formato e estrutura. Regras temporais que
dependem do workspace, como impedir alteracoes em meses passados, pertencem ao
servico de dominio. Assim, chamadas HTTP e chamadas internas aplicam a mesma
politica e nao dependem do timezone do servidor.

O diagnostico financeiro usa a metodologia v2 a partir da adocao desse
calendario: a janela historica e a contribuicao mensal de provisoes derivam da
data de negocio do workspace. Snapshots v1 permanecem imutaveis e identificados
com a metodologia original; nao existe regravacao retroativa do historico.

### Calculo canonico das provisoes

O valor mensal necessario para financiar uma provisao e calculado por uma funcao
pura compartilhada pela propria provisao e pelo diagnostico. A funcao considera
o saldo ainda nao reservado, o primeiro mes efetivo entre inicio e mes atual do
workspace e o mes alvo. A divisao e arredondada para cima em centavos, garantindo
que o total previsto seja alcancado sem que telas diferentes apresentem valores
divergentes. Provisoes integralmente financiadas nunca geram contribuicao negativa.

A projecao mensal expoe a contribuicao aplicavel a cada mes como uma dimensao
separada. Ela comeca no maior mes entre o inicio da provisao e o mes atual do
workspace e termina antes do mes alvo, quando o valor reservado devera ser usado.
Provisoes vencidas concentram a necessidade restante apenas no mes atual.

Essa contribuicao nao compoe despesa realizada, pendente ou projetada, nao consome
limite do Planejamento Mensal por Categoria e nao altera o saldo projetado das
contas. Trata-se de uma reserva logica exibida para apoiar decisoes; uma eventual
despesa materializada continuara sendo reconhecida pelo lancamento financeiro.

### Perspectivas canonicas de valor

O valor persistido de uma transacao representa magnitude e permanece positivo.
O sinal e derivado conforme a pergunta financeira, sem gravar despesas negativas:

- no workspace, receita e positiva, despesa e negativa e transferencia interna e
  neutra;
- em uma conta, saida e negativa e entrada e positiva, inclusive nos dois lados
  de uma transferencia;
- em uma fatura, compra aumenta a obrigacao e credito explicito de estorno,
  cashback ou ajuste a reduz.

Essas perspectivas sao funcoes puras distintas. Um tipo generico de ajuste nao
deve substituir a natureza economica especifica de pagamento, cashback, estorno
ou desconto.

### Reconhecimento economico e liquidacao

Reconhecimento economico e liquidacao sao dimensoes distintas. Valores apenas
projetados ainda nao foram materializados. Uma transacao pendente foi
materializada, mas ainda nao foi realizada nem liquidada. Uma transacao comum
concluida e realizada e liquidada pela propria transacao.

No cartao, uma compra concluida ja e economicamente realizada, mas permanece nao
liquidada enquanto a fatura estiver aberta ou fechada. Somente `PAID` liquida a
obrigacao; `CLOSED` continua significando fatura fechada e nao paga. O dashboard
mensal preserva, por compatibilidade, os campos externos chamados `realized`,
mas eles representam a perspectiva de caixa liquidado nesse contrato.

Consultas historicas declaram uma das tres perspectivas:

- `MATERIALIZED` preserva todos os lancamentos ativos conhecidos e alimenta o
  grafico historico operacional;
- `ECONOMIC` considera transacoes concluidas na data de competencia e alimenta
  a leitura de habitos do diagnostico;
- `SETTLEMENT` considera transacoes comuns concluidas pela data efetiva e
  compras ou creditos de cartao somente depois de a fatura estar paga. Essa e a
  perspectiva das medias de caixa usadas pelo dashboard e pelo planejamento
  mensal por categoria.

As medias de caixa do dashboard e do planejamento mensal compartilham a mesma
politica de reconhecimento, datas e valores. O escopo permanece adequado a cada
pergunta: a estimativa variavel do dashboard exclui recorrencias, enquanto o
planejamento por categoria considera todo o gasto coberto pelo limite. Creditos
de cartao reduzem a despesa da categoria segundo sua natureza financeira,
evitando que a media seja maior que a saida liquida.

### Projecao mensal canonica

Dashboard e Planejamento Mensal consomem o mesmo calculador puro de projecao.
Ele recebe fatos mensais ja classificados, medias historicas das categorias
acompanhadas e saldo transportado, e devolve realizado, pendente, projecao fixa,
projecao variavel, totais por categoria e saldo final projetado.

O dashboard apenas serializa esse resultado para seu contrato externo. O
Planejamento Mensal usa diretamente os valores decimais canonicos e nao deduz
mais a projecao fixa subtraindo campos serializados da projecao variavel. Limite
planejado continua fora do calculador: e uma intencao do usuario comparada com a
projecao, nao um fato financeiro capaz de alterar saldo.

### Competencia canonica das parcelas

Cada fato conhecido da projecao declara explicitamente seu mes de competencia e
a data que o determinou. Parcelas fora do cartao pertencem ao mes do vencimento;
`date` e usado apenas como fallback para lancamentos legados sem `dueDate`.
Parcelas de cartao pertencem ao mes de vencimento da fatura, nunca ao mes da
compra ou da data agendada.

Somente o valor da parcela aplicavel participa de cada mes. O valor total da
compra e a quantidade de parcelas continuam como metadados da serie e nao sao
somados novamente na projecao. O calculador rejeita fatos cuja competencia seja
diferente do mes calculado, transformando uma convencao antes implicita em uma
invariante verificavel.

Compra parcelada fora do cartao, compra parcelada no cartao e repeticao finita
permanecem conceitos distintos. A repeticao finita legada pode compartilhar os
campos de numero e total de parcelas, mas nao possui plano de parcelamento. Uma
ocorrencia fixa projetada tambem nao se torna parcela apenas por se repetir.

### Historico auditavel do diagnostico

Snapshots confirmados podem ser consultados, mas nao alterados. A listagem usa
cursor decrescente e retorna apenas resumo, totais, versoes, qualidade e
identificacao da base. Fontes e indicadores completos sao carregados sob demanda
ao consultar um snapshot especifico, evitando repetir payloads historicos grandes.

Tanto a listagem quanto o detalhe exigem que o usuario seja proprietario do
workspace pessoal ativo. A consulta nao exige que o perfil atual continue pronto:
um perfil ausente ou desatualizado bloqueia novas analises, mas nao apaga nem
oculta a evidencia anteriormente confirmada. Nao existem rotas de atualizacao ou
exclusao desses snapshots.

### Quality gates

Um lote financeiro somente esta concluido quando:

- build e typecheck passam;
- lint passa;
- testes unitarios e de interface relacionados passam;
- integracoes relacionadas passam em banco descartavel;
- `prisma validate` passa quando houver impacto de dados;
- `git diff --check` nao aponta problemas;
- qualquer alteracao semantica possui cenario anterior, novo resultado esperado
  e nota de compatibilidade.

## Tradeoffs

- A consolidacao reduz a velocidade temporaria de novas funcionalidades.
- Manter contratos e nomes de banco evita migrations arriscadas, mas conserva
  alguma terminologia historica internamente.
- Politicas explicitas produzem mais tipos e codigo de composicao, em troca de
  resultados comparaveis, testaveis e auditaveis.
- O modo pessoal pode avancar primeiro, mas toda regra de propriedade precisa
  declarar se pertence ao usuario ou ao workspace.

## Alternativas consideradas

### Um unico FinancialEngine

Rejeitado. Concentraria consultas, regras, persistencia e apresentacao em outra
classe grande, apenas deslocando o acoplamento atual.

### Reescrever todo o financeiro

Rejeitado. A base operacional possui fluxos maduros de cartao, conciliacao e
materializacao que devem ser preservados e caracterizados.

### Manter formulas por tela

Rejeitado. E simples no inicio, mas impede que o usuario confie em resultados
que deveriam representar a mesma situacao financeira.

## Consequencias

- Dashboard, planejamento e diagnostico deverao convergir para os mesmos fatos
  financeiros quando a politica de reconhecimento for a mesma.
- Novas recomendacoes exigirao snapshot de base, metodologia versionada e
  confirmacao explicita.
- Provisoes continuarao uteis antes de existir segregacao bancaria, desde que a
  interface deixe clara a natureza logica da reserva.
- Autorizacao de planejamento passa a ser requisito estrutural para uso por MEIs.

## Proximos passos

Lint, testes reproduziveis, caracterizacao dos calculos atuais, autorizacao do
planejamento compartilhado, integridade do snapshot, seu historico auditavel e a
matriz canonica de reconhecimento e as perspectivas historicas usadas por
dashboard, planejamento mensal e diagnostico, alem da projecao mensal compartilhada
por dashboard e planejamento, a competencia explicita de parcelas e a dimensao
separada de contribuicoes de provisoes, ja foram consolidados. Permanece:

1. Comparar dashboard, planejamento e diagnostico nos mesmos cenarios compostos.

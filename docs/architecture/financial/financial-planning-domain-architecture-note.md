---
title: Financial planning domain architecture
slug: /docs/architecture/financial/financial-planning-domain
type: architecture-note
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-09-16
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

1. Restaurar lint e execucao reproduzivel dos testes de integracao.
2. Adicionar testes de caracterizacao dos calculos atuais que devem permanecer.
3. Definir politica de autorizacao para planejamento e provisoes.
4. Centralizar calendario financeiro, valores assinados e formulas de provisao.
5. Adicionar identificacao da base e idempotencia ao snapshot.
6. Unificar a projecao mensal consumida por dashboard e planejamento.

# Consulta de gastos realizados

O assistente do Cash e o Zenit Hub consultam `get_realized_expenses`. O Cash resolve a conta/empresa autorizada e calcula valores com Decimal; a IA interpreta o pedido e apresenta os resultados. O Hub usa a ferramenta `cash_expenses`, pela ponte autenticada já existente.

## Contrato

- `startDate` / `endDate`: datas inclusivas `YYYY-MM-DD`, até 60 meses de calendário.
- `category`: nome ou caminho `Pai / Filha`, ou `null` para todas. A seleção inclui descendentes. Nomes sem correspondência ou ambíguos retornam erro e candidatos, sem retirar o filtro silenciosamente.
- `groupByCategory`: inclui composição por categoria (até 20 grupos, com indicação explícita de corte).
- `mode`: `SUMMARY` para totais/médias; `LIST` inclui lançamentos.
- `page` / `limit`: página a partir de 1, até 20 lançamentos por página. Totais e médias sempre consideram o período completo, não apenas a página.

Exemplos: “Quanto gastei hoje?”, “Liste os gastos com alimentação em setembro”, “Qual a média mensal por categoria nos últimos seis meses?”. Sem indicação contrária, “últimos N meses” significa os N meses completos anteriores; média sem período exige esclarecimento.

## Critério financeiro

O relatório usa a perspectiva econômica: lançamentos `COMPLETED` pela data principal de compra/competência (`date`), lida como data financeira de calendário. Pendências, cancelados, ignorados, ajustes de saldo, contas de orçamento, transferências e pagamentos de fatura (inclusive os modelos antigo, múltiplo e externo) não entram.

Compras no cartão contam mesmo com a fatura em aberto. Parcelas já registradas na mesma data de compra compõem o gasto nessa data; não representam o desembolso de cada mês. Há subtotais fora do cartão, no cartão e consolidado. Créditos explícitos de cartão (estorno, cashback, ajuste) aparecem separados do gasto bruto e reduzem o total líquido. Receitas comuns não são usadas para reduzir gastos.

A média mensal divide o total líquido pelo número de meses de calendário abrangidos, incluindo meses sem gastos. Meses parciais usam só os dias consultados e são identificados em `average.partialMonths`, sem projeção para um mês completo. Essa consulta inclui gastos fixos e parcelas; não usa a média de gastos variáveis da previsão financeira.

## Consistência e acesso

Totais, categorias e listagem usam a mesma transação de leitura `RepeatableRead`. A empresa e o usuário vêm do vínculo autenticado, nunca dos argumentos do modelo. As permissões de contas são aplicadas tanto às somas quanto à listagem; uma lista de contas autorizadas vazia não concede acesso global. A consulta não cria rascunhos nem altera lançamentos.

## Publicação e verificação

Publicar primeiro o backend Cash e depois o Hub. Não há migração ou variável de ambiente nova. Os testes de integração usam PostgreSQL descartável e cobrem permissões/revogação, categorias, períodos, meses zerados, créditos, parcelas, exclusão de faturas e totalização independente de paginação. O Hub testa encaminhamento autenticado e recuperação de uma tentativa de delegação indevida após uma leitura, preservando a confirmação por botão para escritas.

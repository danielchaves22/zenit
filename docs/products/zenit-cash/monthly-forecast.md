---
title: Previsão financeira mensal
slug: /docs/products/zenit-cash/monthly-forecast
type: product-guide
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-09-24
summary: Cenários de fechamento mensal com fontes selecionáveis e médias sem duplicidade.
---

# Previsão financeira mensal

A página **Análise financeira**, em `/financial/dashboard`, abre na previsão.
O histórico existente permanece na segunda aba. A pergunta principal é quanto
as entradas do mês superam ou ficam abaixo das saídas; o saldo acumulado é secundário.

## Fontes e uso

O usuário escolhe o mês atual ou um dos próximos 24 meses e combina cinco fontes:

- receitas fixas, materializadas ou projetadas, com seleção individual;
- despesas fixas fora do cartão, materializadas ou projetadas;
- demais despesas fora do cartão, incluindo parcelas;
- cartões, incluindo compras, parcelas, fixas e créditos assinados;
- complemento estimado de gastos variáveis.

**Ver receitas**, logo abaixo do checkbox de receitas fixas, expande as receitas
recorrentes do cenário. Cada uma tem somente um checkbox: desmarcar exclui e marcar
inclui novamente. Não existe data de encerramento simulada. A escolha vale para
todos os meses envolvidos no saldo acumulado e preserva o estado individual quando
o grupo inteiro é desmarcado e marcado novamente.

Receitas avulsas não compõem a previsão, mesmo quando já estão registradas com
vencimento futuro. Não existem médias nem extrapolações de receitas. Valores já
recebidos, fixos ou variáveis, permanecem nos saldos reais das contas.
Créditos de cartão continuam sendo redutores da despesa da fatura.

Os detalhes contêm médias, meses utilizados, ajustes por categoria e canal,
compromissos de origem, pendências anteriores e a evolução do saldo.
O cartão pode considerar apenas compromissos conhecidos ou também estimativas de
novas compras. Os filtros e ajustes valem para todos os meses do cenário.
São mantidos ao alternar entre previsão e histórico e descartados ao sair ou trocar
de workspace. Não são limites de orçamento nem alterações dos dados operacionais.

## Cálculo

`POST /api/financial/dashboard/forecast` é uma consulta autenticada sem escrita.
Reutiliza fatos, competências, reconhecimento, saldo e aritmética decimal do domínio
financeiro. Respeita o workspace, seu fuso horário e as contas acessíveis ao usuário.

O resultado mensal soma receitas fixas selecionadas e despesas pela competência: vencimento da
transação, vencimento da fatura ou ocorrência fixa. Uma liquidação antecipada
permanece no resultado do mês de vencimento, mas nunca movimenta o saldo novamente.

O saldo parte dos saldos atuais das contas operacionais e aplica somente movimentos
ainda não liquidados e estimativas, mês a mês. Desmarcar uma fonte não desfaz fatos
já incluídos no saldo bancário atual.

A média usa 3, 6 (padrão) ou 12 meses completos anteriores ao mês atual, mesmo quando
o mês escolhido é futuro. O histórico reconhece liquidações: data efetiva para
contas e liquidação da fatura para cartões, com os mesmos fallbacks do domínio.
O primeiro mês com registros determina o início disponível; lacunas posteriores
contam como zero. A tela informa quando há menos meses que o solicitado.

As populações são separadas por categoria e canal: fora do cartão, ou em cada
cartão. Fixas, parcelas e estornos ligados a elas ficam fora das médias variáveis.
Créditos variáveis de cartão reduzem o gasto líquido. Gastos sem categoria não
geram média e produzem um aviso.

Para cada população, o adicional é `max(0, esperado - variável conhecido)`.
O conhecido é calculado **antes** dos filtros do cenário: desmarcar lançamentos
não faz esses mesmos valores reaparecerem como estimativa. O ajuste manual modifica
apenas o esperado; nunca reduz compromissos registrados. Não se estimam novas
compras em ciclos encerrados, pagos, sem configuração ou anteriores ao ciclo
que receberia uma compra na data atual.

Pendências materializadas de meses anteriores são exibidas separadamente.
Por padrão ficam fora do saldo projetado, com aviso explícito. Simular a quitação
as aplica uma única vez no saldo do mês atual, respeitando as fontes selecionadas.
Isso não move sua competência nem altera o resultado mensal ou orçamento original.
As pendências de receita também seguem a seleção individual e a regra de considerar
somente receitas fixas. Receitas fixas de meses intermediários ou pendências
anteriores continuam disponíveis na lista mesmo sem valor no mês escolhido,
pois ainda podem afetar o saldo acumulado.

## Dependências e limites

- O motor mensal compartilhado corrige o abatimento indevido de fixas/parcelas da
  média variável e evita repetir no saldo liquidações antecipadas.
- O Planejamento Mensal por Categoria continua com sua média própria de todas as
  despesas cobertas e com os compromissos canônicos. Não recebe filtros do cenário.
- A regra de considerar somente receitas fixas pertence à previsão interativa;
  não filtra receitas nos registros, no histórico ou nos demais planejamentos.
- Plano de Disponibilidade, provisões, limites, transações, faturas e snapshots
  não são gravados pela consulta. Provisões lógicas não viram despesas.
- Os retratos de planejamento guiado mantêm sua metodologia e seus snapshots.
- A análise de ritmo diário/desempenho do mês fica para uma etapa posterior.
- Pagamentos parciais de fatura seguem a capacidade atual do domínio; a previsão
  não cria um modelo paralelo de cobertura de pagamento.

Testes cobrem combinações de fontes, médias comparáveis, créditos, ciclos fechados,
quitação de atrasados uma única vez, antecipações, isolamento e preservação dos
orçamentos, além das interações e regressões da interface.

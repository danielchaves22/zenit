---
title: Cartões, compras e faturas
slug: /docs/help/zenit-cash/credit-cards-and-invoices
type: operations-guide
product: zenit-cash
audience: user
visibility: public
status: active
owner: product
last_reviewed: 2026-11-22
summary: Organize compras no cartão, parcelas, vencimentos e pagamentos sem duplicar despesas.
---

# Cartões, compras e faturas

## Configurar o cartão

Em **Cartões**, use **Novo Cartão** e confira o emissor, o limite e as datas de fechamento e vencimento solicitadas. Esses dados influenciam o acompanhamento das compras e faturas.

## Registrar uma compra

1. Escolha **Nova Compra no Cartão**.
2. Selecione o cartão e informe descrição, categoria, valor e data.
3. Se a compra for parcelada, revise a quantidade de parcelas e a distribuição apresentada.
4. Salve e confira em **Compras no Cartão** e nas faturas correspondentes.

Não registre a mesma compra também como despesa comum na conta bancária.

## Acompanhar e pagar a fatura

Abra as faturas do cartão para revisar compras, créditos, vencimentos e pagamentos. Ao registrar um pagamento, confira a conta de origem e os valores apresentados.

A compra representa o gasto; o pagamento da fatura representa a liquidação do compromisso com o cartão. As [consultas de gastos realizados](realized-expenses-guide.md) evitam somar esse pagamento novamente às compras.

## Créditos, estornos e conferência

Use o fluxo correspondente ao tipo de crédito ou estorno. Quando um estorno se refere a uma compra, mantenha o vínculo correto. Receitas comuns e créditos de cartão têm efeitos diferentes nas consultas.

Na conciliação de cartão, revise os itens importados e as associações sugeridas. Uma sugestão precisa ser conferida antes da confirmação; não aceite uma associação somente porque os valores coincidem.

### Reutilizar uma descrição de outra fatura

Quando você cria uma despesa pela conciliação ou confirma que um item da fatura corresponde a um lançamento existente, o Cash pode reutilizar a descrição e a categoria escolhidas em faturas posteriores do mesmo cartão. As faturas já conciliadas também podem contribuir quando o Cash conserva o registro da sua escolha.

Por exemplo, se você vinculou `MP*PADOCAVILA` a **Padaria da Vila** na categoria **Alimentação**, uma nova compra com esse texto pode vir com esses campos preenchidos, mesmo que o valor seja diferente. Você pode editar os dois campos antes de importar. Se já usou descrições ou categorias diferentes para esse texto, escolha a combinação adequada ou informe outra.

Quando há mais de um lançamento compatível na fatura atual, o histórico também pode destacar um deles para você conferir. Verifique a data, o valor e a parcela antes de confirmar o vínculo.

## Conciliar a fatura do Nubank

Na conciliação do cartão Nubank, selecione a fatura que deseja conferir e use
**Selecionar CSV ou OFX do Nubank**. A tela identifica o formato do arquivo e mantém
o mesmo fluxo de revisão e confirmação dos lançamentos.

Use o arquivo da **fatura do cartão de crédito**. O extrato OFX da conta Nubank
pertence à conciliação de contas e não pode ser usado como fatura do cartão.

Confira compras, parcelas, IOF, juros e créditos antes de importar. Pagamentos de
fatura não são importados como novas despesas. O saldo informado no OFX não é
tratado como total das compras da fatura.

Ao reenviar um arquivo ou alternar entre CSV e OFX, revise as correspondências com
os lançamentos já registrados. Quando existir uma conciliação salva para a fatura,
a troca do arquivo segue a confirmação de substituição apresentada pela tela.

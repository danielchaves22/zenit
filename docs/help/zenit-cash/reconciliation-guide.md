---
title: Conferir contas com o extrato
slug: /docs/help/zenit-cash/reconciliation
type: operations-guide
product: zenit-cash
audience: user
visibility: public
status: active
owner: product
last_reviewed: 2026-10-29
summary: Use a conciliação para comparar extratos com os lançamentos do Cash e tratar diferenças.
---

# Conferir contas com o extrato

## Abrir a conciliação

Em **Contas**, escolha **Conciliar** na conta corrente ou poupança e selecione o mês. Confira a conta e o período antes de importar o arquivo.

## Nova conciliação durante a transição

Em **Contas**, o botão **Nova conciliação · Beta** abre a nova experiência. A opção
**Conciliar** continua abrindo a versão atual. Dentro das duas telas, é possível
alternar de versão mantendo a conta e o mês.

As versões compartilham extratos, lançamentos, vínculos, itens ignorados e histórico.
Não é necessário importar novamente. Uma confirmação ou um desfazimento feito em
uma versão aparece na outra ao atualizar. Reiniciar apaga a conciliação compartilhada
da conta e do mês, conforme o aviso apresentado; não cria uma sessão de teste isolada.

Na nova tela, escolha uma pendência na fila para comparar extrato e Cash lado a lado.
O filtro indica a próxima ação: conferir valor, data, liquidação, agrupamento ou
alternativas. Marcar caixas seleciona movimentos para um lote; clicar no movimento
apenas muda a comparação. Depois de confirmar, a fila avança para o próximo item.

**Buscar no Cash** abre uma busca no próprio painel, inicialmente pelo valor, com
descrição e período ajustáveis. Retire o valor para procurar valores diferentes ou
selecionar vários lançamentos. **Abrir para conferir ou corrigir** usa o formulário
financeiro existente e mantém um caminho de retorno à nova conciliação. Diferenças
de valor precisam ser resolvidas antes da confirmação do vínculo.

O diagnóstico compara o saldo final informado pelo extrato com o saldo do Cash
reconstituído para a mesma data, incluindo ajustes de saldo. Sem data/saldo no arquivo,
com saldos conflitantes ou acesso insuficiente, a comparação informa sua limitação.
Os totais sem vínculo abrangem o mês inteiro e não explicam sozinhos uma diferença de
saldo. Saldos iguais também não dispensam a conferência dos movimentos.

O parecer da IA é opcional e solicitado pelo usuário nos casos de confiabilidade
média baixa ou baixa. Ele não altera valores, confirma vínculos ou aumenta a
confiabilidade. A nova versão substituirá a atual após a validação da transição.

## Importar e comparar

1. Importe o extrato em um formato aceito pela tela, como OFX.
2. Confira os movimentos importados e eventuais avisos.
3. Revise as sugestões de correspondência com os lançamentos do Cash.
4. Associe movimentos que representam a mesma operação.
5. Trate os itens sem correspondência e ignore somente aqueles que realmente não devem participar da conciliação.

Evite criar uma nova transação quando o movimento já estiver registrado. Descrição, data, conta e valor ajudam a conferir a correspondência.

## Concluir o período

Revise as pendências antes de usar **Concluir mês**. A tela exige que os movimentos do extrato sejam conciliados ou ignorados e que os lançamentos liquidados do mês estejam vinculados.

O histórico permite voltar aos períodos já trabalhados. Reiniciar a conciliação exige revisar o aviso e o impacto apresentado pela própria tela.

## Contas e cartões têm fluxos próprios

A conciliação bancária parte da conta e do extrato. Compras e faturas de cartão têm uma área própria de conferência. Use o fluxo correspondente para preservar os vínculos e evitar duplicidades.

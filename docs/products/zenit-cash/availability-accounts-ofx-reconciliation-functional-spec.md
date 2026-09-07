---
title: Conciliacao bancaria de contas
slug: /docs/products/zenit-cash/availability-accounts-ofx-reconciliation
type: functional-spec
product: zenit-cash
audience: product
visibility: internal
status: implemented
owner: product
last_reviewed: 2026-09-07
summary: Conciliacao mensal de contas Nubank e Bradesco com OFX/CSV, confirmacao humana e historico persistente.
tags:
  - cash
  - accounts
  - reconciliation
  - ofx
  - csv
---

# Conciliação bancária de contas

## Acesso e objetivo

Financeiro → Contas → **Conciliar** na conta corrente ou poupança. A página
`/financial/accounts/[id]/reconciliation?month=AAAA-MM` abre com a conta selecionada
e sugere o mês anterior. É destinada à conferência retrospectiva dos lançamentos
já registrados, com progresso salvo por conta e mês.

A tela oferece Extrato, Lançamentos sem vínculo e Histórico. O usuário importa o
arquivo, seleciona movimentos, revisa candidatos e confirma os vínculos. Nenhuma
sugestão, mesmo com data e valor iguais, é automaticamente confirmada.

**Marcar todos desta página** seleciona somente movimentos ainda não conciliados,
até 50 por busca; mudar de página ou filtro limpa a seleção. Por padrão cada movimento
é pesquisado separadamente, em lotes de até cinco que compartilham consultas e histórico.
O progresso e os resultados são apresentados por movimento. Confirmar um vínculo mantém
os demais resultados e remove candidatos que usam itens ou lançamentos já vinculados.
**Buscar pela soma dos selecionados** é uma opção explícita para grupos de até 20 itens
da mesma direção. As ações manuais continuam disponíveis em cada resultado.

No desktop, a lista do extrato e as sugestões têm rolagem própria dentro da altura
disponível, seguindo a tela de faturas. Os indicadores superiores usam cards compactos.

## Importação

Selecionar o arquivo mostra uma prévia sem persistir. **Iniciar Conciliação** grava o
extrato e esconde o painel de importação, sem criar ou alterar lançamentos financeiros.
O painel reaparece quando ainda não há movimentos ou após reiniciar o mês.

**Reiniciar conciliação**, junto a **Concluir mês**, exige confirmação explícita e é
bloqueado no servidor para meses concluídos. Apaga a sessão do mês, seus grupos,
histórico, decisões e movimentos, limpa o cache e remove arquivos sem uso restante.
Lançamentos financeiros, inclusive os criados/liquidados durante a conciliação, são
preservados com seus saldos. Arquivos compartilhados e vínculos de outros meses são
mantidos. Reimportar o mesmo arquivo depois do reinício restaura os movimentos apagados
sem duplicar os que pertencem aos meses preservados. Não exige nova migração.

- Nubank: OFX e CSV, com FITID/Identificador como identidade do movimento.
- Bradesco: OFX e CSV, usando data, valor assinado, documento, descrição normalizada
  e ocorrência para compatibilizar os formatos. Documento sozinho não é identidade.
- O parser suporta SGML OFX 1.x, UTF-8/Windows-1252, CSV com campos entre aspas,
  quebras CR/CRLF/LF e linhas de continuação do histórico Bradesco.
- Saldo anterior, totalizações e a seção Saldos Invest Fácil são referências,
  não movimentos financeiros. Rendimentos efetivamente lançados permanecem.
- Últimos Lançamentos fora do mês são preservados nas respectivas datas e
  apresentados separadamente na prévia. Importar não altera a data bancária.
- A prévia informa banco, conta (quando presente), período, totais e linhas fora
  do mês; o usuário confirma a importação na conta escolhida.
- Banco e número da conta são comparados com o cadastro e importações anteriores.
  CSV Nubank não informa o número da conta: essa primeira escolha exige conferência.
- O arquivo original é guardado uma vez por conta/hash. Reimportações vinculam
  o arquivo aos movimentos existentes e não criam lançamentos financeiros.
- Movimentos idênticos com identificadores distintos são preservados. No Bradesco,
  ocorrências indistinguíveis recebem identidades por ocorrência e um aviso. Uma
  exportação parcial dessas ocorrências exige revisão humana: sem identificador
  comum ao CSV não é possível provar identidade individual somente pelo conteúdo.
- Limites: 5 MB, 5.000 movimentos por arquivo, 20 itens por grupo manual.

## Correspondências e efeitos financeiros

O motor busca na empresa e conta autorizadas, respeitando as permissões de ambas
as contas de uma transferência. Compara direção, valor, data de liquidação
(`effectiveDate`, com fallback em `date`), descrição e histórico confirmado.
Pendentes usam vencimento/data como referência e permanecem identificados.
Os ajustes manuais de saldo e movimentos internos de orçamento seguem o filtro
operacional existente e não são oferecidos como movimentos bancários a vincular.

As sugestões permitem 1:1, 1:N, N:1 e seleção manual de grupos N:N. A busca
combinatória automática é limitada: até três lançamentos entre 25 próximos, ou
pares de movimentos bancários para um lançamento. A busca manual paginada permite
ampliar as datas sem aumentar indefinidamente o contexto da IA.

A confirmação exige soma exata em centavos, mesma direção, versões atuais dos
lançamentos e ausência de vínculos ativos anteriores na mesma conta. Não há
tolerância financeira automática; diferenças permanecem para revisão.

- **Vincular liquidado:** somente grava o vínculo, sem alterar saldo, valor ou data.
- **Liquidar e vincular pendente:** exige confirmação explícita e data de liquidação;
  usa a rotina financeira existente dentro da mesma transação de banco do vínculo.
- **Registrar faltante:** descrição, categoria ou outra conta e data são revisadas;
  criação, saldo e vínculo são atômicos. Uma nova tentativa não duplica o lançamento.
- **Transferência:** o mesmo lançamento pode ser conciliado uma vez em cada conta.
  A criação direta não substitui o pagamento de fatura; para cartão usa-se a rotina
  existente de pagamento, vinculando depois a transferência gerada.
- **Desfazer:** libera o vínculo, preservando o lançamento, seu saldo e a auditoria.

Um índice único parcial garante uma associação ativa por conta/lado de lançamento.
As escritas usam transações serializáveis, bloqueios e validação da versão revisada.
Conflitos concorrentes retornam pedido de atualização da tela.

## Mês e alterações posteriores

Concluir o mês exige movimentos importados, todos vinculados, e ausência de
lançamentos liquidados sem vínculo na conferência. O mês concluído pode ser
reaberto explicitamente. Isso não bloqueia lançamentos retroativos financeiros.

A migração instala um trigger em FinancialTransaction: mudanças em valor, conta,
data, liquidação, status, arquivamento ou exclusão colocam o grupo em revisão,
liberam suas associações ativas e reabrem o mês. Novos lançamentos retroativos
liquidados também reabrem meses concluídos. Os snapshots e eventos são preservados.

O saldo final do extrato é uma referência histórica; não é comparado ao saldo
atual da conta, que pode conter movimentações posteriores ao mês conciliado.

## IA e feedback

O botão único **Buscar correspondências** usa regras e histórico antes da IA.
A IA é dispensada somente para um candidato 1:1 liquidado, com valor exato, até um
dia de diferença e descrição semelhante ou histórico confirmado relevante, sem
concorrentes próximos em nenhum dos lados e sem truncamento da busca. O score serve
para ordenação, não representa uma probabilidade calibrada. Casos ambíguos consultam
automaticamente a credencial e o modelo ativos da empresa; sem candidatos a IA não é chamada.
Envia somente a seleção, até dez candidatos e até cinco exemplos relevantes
confirmados na mesma conta e com acesso autorizado. Descrições são dados, nunca
instruções. A resposta estruturada pode escolher um candidato fornecido ou abster-se;
IDs inventados, respostas incompletas e falhas do provedor são descartados.

Confirmar é o feedback positivo: grupos ativos confirmados constituem os exemplos
recuperáveis. **Não corresponde** grava rejeição daquele par e versão. Alterar o
lançamento invalida a versão rejeitada. Desfazer ou invalidar um grupo retira-o dos
exemplos positivos. Deixar pendente não representa rejeição. Não há fine-tuning nem
treinamento automático do modelo.

O cache inclui conta, empresa, usuário, versões dos candidatos, exemplos,
configuração do modelo e versão do prompt. Guarda somente o resultado compacto,
expira em sete dias e mantém até cem resultados recentes por conta (limpeza em uso).
Confirmações, importações e desfazimentos invalidam o cache da conta. Chamadas
simultâneas com o mesmo contexto são agrupadas no processo. A rota limita pedidos
por empresa/usuário; indisponibilidade da IA mantém a conciliação manual disponível.

A qualidade real da IA exige decisões revisadas no uso: coincidências de data e
valor e testes de contrato não constituem medição da acurácia do modelo.

## Persistência

| Registro | Finalidade |
| --- | --- |
| BankReconciliation | Conta/mês, estado e conclusão |
| BankStatementImport / ImportItem | Arquivo único, metadados e linhas nele presentes |
| BankStatementItem | Movimento normalizado, identidade e vínculo ativo |
| BankReconciliationGroup / GroupItem | Grupo confirmado e histórico de itens |
| BankReconciliationTransaction | Referência ao lançamento, snapshot e associação ativa |
| BankReconciliationEvent | Quem confirmou/desfez e mudanças automáticas |
| BankMatchDecision | Rejeição ou correção do par revisado |
| BankMatchCache | Sugestões substituíveis com contexto versionado e expiração |

As listagens de movimentos e transações são paginadas no servidor em 50 registros;
o histórico de grupos usa 20. Arquivos binários não são carregados nas listagens.
Consultas de candidatos e exemplos têm limites explícitos, com índices por conta,
data, identidade, período e associação ativa. O crescimento permanente acompanha
os movimentos e decisões; candidatos descartados não geram produtos cartesianos
persistentes nem logs completos de prompts por item.

## Entrega e verificação

Aplicar `backend/prisma/migrations/20260907010000_bank_account_reconciliation` via
`prisma migrate deploy` antes de publicar o backend/frontend. A aplicação não
executa essa migração automaticamente durante uma importação.

Os testes usam exemplos fictícios e cobrem parsers, agrupamentos, permissões,
deduplicação entre formatos, rollback financeiro, transferência, concorrência,
reabertura e contratos da IA. Os quatro arquivos fornecidos no estudo foram
verificados localmente; seus dados pessoais não integram os fixtures do repositório.

Para usar uma base descartável sem editar `.env.test`, definir `TEST_DATABASE_URL`.
O guard existente exige marcador de base/schema de teste. A suíte de integração
recria apenas essa base de teste.

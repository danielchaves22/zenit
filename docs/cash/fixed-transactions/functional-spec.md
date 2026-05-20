# Especificação Funcional: Despesas e Receitas Fixas

## Objetivo
Implementar funcionalidade de despesas e receitas fixas que se repetem mensalmente por prazo indeterminado, diferente das transações recorrentes (que têm prazo definido).

## Funcionalidade Principal

### Despesas/Receitas Fixas
Criar nova entidade que representa transações que acontecem todo mês automaticamente até serem canceladas pelo usuário:

**Características:**
- Nome descritivo (ex: "Aluguel", "Salário", "Internet")
- Valor fixo mensal
- Dia do mês para vencimento (1-31)
- Tipo: despesa ou receita
- Data de início da vigência
- Status: ativa ou cancelada
- Data de cancelamento (quando aplicável)

### Materialização Automática
As despesas fixas devem ser convertidas automaticamente em transações financeiras reais no sistema:

**Comportamento:**
- Todo dia 1º do mês, criar transações financeiras baseadas nas despesas fixas ativas
- Transações criadas devem manter ligação com a despesa fixa de origem
- Transações devem ser marcadas como originadas de "despesa fixa"
- Apenas despesas fixas que estavam ativas no período devem gerar transações

### Integração com Relatórios

**Mês Atual:**
- Mostrar transações já materializadas (se job já executou)
- Mostrar despesas fixas calculadas dinamicamente (se job ainda não executou)
- Nunca duplicar informações

**Meses Futuros:**
- Calcular e mostrar despesas fixas dinamicamente
- Considerar apenas despesas ativas no período consultado

**Meses Passados:**
- Mostrar apenas transações reais (que já foram materializadas)

## Regras de Negócio

### Criação de Despesas Fixas
- Data de início não pode ser no passado
- Se criada no mês atual após o dia de vencimento, deve iniciar no próximo mês
- Dia do mês deve ser válido (1-31)

### Tratamento de Datas Especiais
- Dia 31 em meses com 30 dias: usar último dia do mês
- Dia 29/02 em anos não bissextos: usar 28/02
- Manter consistência na data de vencimento

### Edição de Despesas Fixas
- Alterações afetam apenas materializações futuras
- Transações já criadas não são alteradas automaticamente
- Usuário pode editar transações individuais independentemente da regra fixa

### Cancelamento
- Cancelar despesa fixa interrompe materializações futuras
- Transações já criadas permanecem no sistema
- Data de cancelamento deve ser registrada

### Materialização
- Processo deve ser idempotente (pode executar múltiplas vezes sem duplicar)
- Não criar transações para despesas inativas ou canceladas
- Verificar se transação já existe antes de criar
- Logs de execução para monitoramento

## Casos de Uso

### Caso 1: Nova Despesa Fixa
Usuário cria "Aluguel - R$ 1.200,00 - Dia 10" em 05/01/2025:
- Primeira materialização: 10/01/2025
- Próximas: 10/02/2025, 10/03/2025, etc.

### Caso 2: Despesa Criada Após Vencimento
Usuário cria "Internet - R$ 100,00 - Dia 5" em 15/01/2025:
- Primeira materialização: 05/02/2025
- Não cria transação retroativa para 05/01/2025

### Caso 3: Cancelamento no Meio do Mês
Usuário cancela despesa em 15/01/2025:
- Transação de janeiro (já materializada) permanece
- Não cria transações para fevereiro em diante

### Caso 4: Edição de Valor
Usuário altera valor de R$ 1.200 para R$ 1.300 em 15/01/2025:
- Transação de janeiro permanece R$ 1.200
- Transações futuras serão R$ 1.300

### Caso 5: Edição de Transação Individual
Usuário edita transação específica de fevereiro (materializada):
- Apenas aquela transação é alterada
- Regra fixa original permanece inalterada
- Transações futuras seguem a regra original

## Validações Necessárias

### Interface do Usuário
- Indicar claramente origem da transação (manual/recorrente/fixa)
- Permitir edição individual de transações materializadas
- Avisar que cancelamento de despesa fixa afeta meses futuros
- Mostrar próximas materializações previstas

### Processamento
- Verificar duplicatas antes de materializar
- Validar se dia do mês existe no período target
- Tratar erros sem interromper processamento de outras despesas
- Registrar logs para auditoria

### Relatórios
- Filtrar apenas despesas ativas por período
- Considerar data de cancelamento nos cálculos
- Não duplicar transações já materializadas

## Requisitos Técnicos

### Rastreabilidade
- Toda transação materializada deve manter referência à despesa fixa de origem
- Permitir identificar tipo de origem (manual/recorrente/fixa)
- Facilitar operações em lote por origem

### Performance
- Queries de relatório devem ser eficientes
- Materialização deve processar apenas despesas necessárias
- Evitar cálculos desnecessários

### Confiabilidade
- Processo de materialização deve ser robusto
- Falha em uma despesa não deve afetar outras
- Sistema deve funcionar mesmo se job não executar exatamente no dia 1º
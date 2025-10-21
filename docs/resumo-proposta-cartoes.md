# 💳 Resumo Executivo - Controle de Cartões de Crédito

## 🎯 Visão Geral

Implementar um **sistema completo de gestão de cartões de crédito** no Zenit, transformando a funcionalidade básica existente em uma solução robusta e profissional.

---

## 📊 Situação Atual vs. Proposta

| Aspecto | Situação Atual ✅ | Proposta 🎯 |
|---------|------------------|-------------|
| **Conta de Cartão** | Tipo CREDIT_CARD com saldo negativo | + Limite de crédito configurável<br>+ Alertas de limite<br>+ Múltiplos cartões por empresa |
| **Transações** | Despesas lançadas manualmente | + Compras parceladas automáticas<br>+ Vinculação com faturas<br>+ Rastreamento de parcelas |
| **Faturamento** | ❌ Não existe | ✅ Faturas mensais automáticas<br>✅ Fechamento por ciclo<br>✅ Cálculo de juros e encargos |
| **Pagamento** | Transferência manual | ✅ Pagamento total/mínimo/parcial<br>✅ Integração com transações<br>✅ Liberação automática de limite |
| **Análises** | Relatórios básicos | ✅ Dashboard de gastos<br>✅ Análise por categoria<br>✅ Projeções futuras |

---

## 🏗️ Componentes Principais

### 1️⃣ Configuração de Cartão (`CreditCardConfig`)

```typescript
{
  creditLimit: 5000.00,        // Limite total
  closingDay: 5,               // Dia do fechamento
  dueDay: 15,                  // Dia do vencimento
  interestRate: 10.5,          // Taxa de juros (%)
  minimumPaymentPercent: 10,   // Pagamento mínimo (%)
  alertLimitPercent: 80        // Alerta ao usar 80%
}
```

**Funcionalidades:**
- ✅ Controle de limite (total, usado, disponível)
- ✅ Ciclo de faturamento configurável
- ✅ Taxas e juros personalizáveis
- ✅ Alertas automáticos

---

### 2️⃣ Faturas (`CreditCardInvoice`)

```typescript
{
  referenceMonth: 1,           // Janeiro
  referenceYear: 2025,
  closingDate: "2025-01-05",
  dueDate: "2025-01-15",

  previousBalance: 1500.00,    // Saldo anterior não pago
  purchasesAmount: 800.00,     // Compras do período
  paymentsAmount: 500.00,      // Pagamentos recebidos
  interestAmount: 157.50,      // Juros sobre saldo
  feesAmount: 20.00,           // Taxas (anuidade, etc)

  totalAmount: 2477.50,        // Total a pagar
  minimumPayment: 247.75,      // Pagamento mínimo (10%)

  status: "CLOSED"             // OPEN, CLOSED, PAID, OVERDUE
}
```

**Funcionalidades:**
- ✅ Geração automática no fechamento
- ✅ Vinculação de todas as transações do período
- ✅ Cálculo automático de totais
- ✅ Aplicação de juros sobre saldo devedor
- ✅ Status do ciclo de vida

---

### 3️⃣ Parcelamento (`CreditCardInstallment`)

```typescript
// Exemplo: Notebook de R$ 3.600 em 12x
{
  description: "Notebook Dell",
  totalAmount: 3600.00,
  numberOfInstallments: 12,
  installmentAmount: 300.00,
  purchaseDate: "2025-01-15"
}

// Resultado: 12 transações automáticas
// Parcela 1/12: Fatura Jan/2025 - R$ 300
// Parcela 2/12: Fatura Fev/2025 - R$ 300
// ...
// Parcela 12/12: Fatura Dez/2025 - R$ 300
```

**Funcionalidades:**
- ✅ Divisão automática em N parcelas
- ✅ Distribuição nas próximas N faturas
- ✅ Rastreamento de parcelas pagas/pendentes
- ✅ Cancelamento de parcelamento

---

### 4️⃣ Pagamento de Faturas (`CreditCardInvoicePayment`)

**Tipos de pagamento:**

1. **Pagamento Total** - Paga 100% da fatura
2. **Pagamento Mínimo** - Paga 10% (configurável)
3. **Pagamento Parcial** - Paga valor customizado

```typescript
// Exemplo: Pagamento parcial
await CreditCardPaymentService.payInvoicePartial(invoiceId, 800.00, {
  fromAccountId: checkingAccount.id,  // Conta que paga
  paymentDate: new Date(),
  userId: userId
});

// Efeitos:
// ✅ Cria transação TRANSFER (checking → credit_card)
// ✅ Registra pagamento na fatura
// ✅ Atualiza paidAmount e remainingAmount
// ✅ Libera R$ 800 de limite
// ✅ Saldo devedor (R$ 1.200) vai para próxima fatura com juros
```

---

### 5️⃣ Dashboard e Relatórios

**Visualizações disponíveis:**

📊 **Dashboard Principal**
- Limite total vs. usado vs. disponível
- Fatura atual (valor, vencimento)
- Média de gastos mensais (últimos 6 meses)
- Alertas ativos

📈 **Análise de Gastos**
- Gastos por categoria (pizza)
- Evolução mensal (linha)
- Comparativo com meses anteriores
- Top 10 maiores despesas

🔔 **Alertas**
- Limite próximo de estourar (80%)
- Faturas próximas do vencimento
- Faturas vencidas
- Parcelamentos ativos

---

## 🔄 Fluxos Automatizados

### Job 1: Fechamento de Faturas (Diário)

```
Execução: Todo dia às 6h da manhã

Para cada empresa:
  Para cada cartão de crédito:
    Se hoje = dia de fechamento:
      1. Buscar fatura aberta (OPEN)
      2. Calcular totais (compras, pagamentos, saldo anterior)
      3. Aplicar juros se há saldo devedor
      4. Aplicar taxas (anuidade mensal)
      5. Calcular pagamento mínimo
      6. Fechar fatura (OPEN → CLOSED)
      7. Criar próxima fatura (OPEN)
      8. Notificar usuário
```

### Job 2: Verificação de Vencimentos (Diário)

```
Execução: Todo dia às 8h da manhã

Para cada empresa:
  Para cada fatura:
    Se hoje = dueDate E status != PAID:
      - Marcar como OVERDUE
      - Enviar notificação de vencimento

    Se faltam 3 dias para vencimento:
      - Enviar alerta de vencimento próximo
```

### Job 3: Verificação de Limites (Tempo Real)

```
Trigger: Após cada transação no cartão

1. Atualizar usedLimit
2. Calcular percentual usado
3. Se >= alertLimitPercent (ex: 80%):
   - Enviar notificação ao usuário
```

---

## 🛠️ Stack Técnico

### Backend
- **ORM:** Prisma (PostgreSQL)
- **Services:** TypeScript com classes estáticas
- **Jobs:** Cron (node-cron ou similar)
- **Validação:** Zod
- **Transações:** ACID com isolamento SERIALIZABLE

### Frontend
- **Framework:** Next.js + React
- **UI:** Tailwind CSS
- **Gráficos:** Recharts
- **Formulários:** React Hook Form + Zod

### Integrações
- **Transações:** `FinancialTransactionService`
- **Notificações:** Sistema de notificações (a implementar)
- **Cache:** Redis (para dashboards)

---

## 📅 Cronograma

| Fase | Duração | Entregas Principais |
|------|---------|---------------------|
| **1. Fundação** | 2 semanas | Schema, Config Service, Invoice Service básico |
| **2. Core** | 2 semanas | Parcelamento, Fechamento, Pagamentos |
| **3. UX** | 2 semanas | Frontend completo, Dashboards, Relatórios |
| **4. Otimização** | 1 semana | Jobs, Performance, Testes |

**Total:** 7 semanas (~120 horas)

---

## 💰 Valor de Negócio

### Para Usuários
- ✅ Controle total sobre gastos no cartão
- ✅ Visibilidade de faturas e vencimentos
- ✅ Análise de gastos por categoria
- ✅ Alertas automáticos
- ✅ Gestão de parcelamentos

### Para o Negócio
- ✅ Diferencial competitivo
- ✅ Fidelização de clientes
- ✅ Dados para insights financeiros
- ✅ Base para features futuras (cashback, milhas, etc.)

---

## 🎯 Quick Wins

Funcionalidades que podem ser entregues rapidamente:

### Semana 1-2
✅ Configuração de cartão com limite
✅ Criação manual de faturas
✅ Compras no cartão respeitando limite

### Semana 3-4
✅ Fechamento automático de faturas
✅ Parcelamento de compras
✅ Pagamento de faturas

### Semana 5-6
✅ Dashboard básico
✅ Alertas de limite e vencimento
✅ Exportação de fatura em PDF

---

## 🚨 Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Cálculo incorreto de juros | Média | Alto | Testes unitários extensivos, validação manual |
| Fechamento de fatura em dia errado | Baixa | Alto | Jobs com logs detalhados, monitoramento |
| Duplicação de transações | Baixa | Alto | Constraints únicos, validação pré-inserção |
| Performance com muitas transações | Média | Médio | Índices otimizados, cache, paginação |
| Limite inconsistente | Baixa | Alto | Transações ACID, locks adequados |

---

## 📖 Exemplos de Uso

### Cenário 1: Empresa com 2 cartões

```
Nubank:
- Limite: R$ 5.000
- Fechamento: Dia 5
- Vencimento: Dia 15
- Uso: Despesas operacionais

Bradesco Empresarial:
- Limite: R$ 20.000
- Fechamento: Dia 10
- Vencimento: Dia 20
- Uso: Grandes compras e investimentos
```

### Cenário 2: Compra parcelada

```
Usuário compra notebook de R$ 3.600 em 12x no Nubank

Sistema:
1. Cria 1 registro de parcelamento
2. Gera 12 transações de R$ 300
3. Parcela 1 vai para fatura atual (se antes do fechamento)
4. Demais parcelas vão para faturas futuras
5. Ocupa R$ 300 do limite a cada mês
```

### Cenário 3: Pagamento parcial com juros

```
Fatura de Janeiro: R$ 2.000
Usuário paga: R$ 500

Resultado:
- Saldo devedor: R$ 1.500
- Próxima fatura (Fev):
  - Saldo anterior: R$ 1.500
  - Juros (10.5%): R$ 157.50
  - Novas compras: R$ 800
  - Total: R$ 2.457.50
```

---

## 🎓 Conclusão

A implementação de controle de cartões de crédito no Zenit representa:

- ✅ **Maturidade** do sistema financeiro
- ✅ **Diferencial** competitivo no mercado
- ✅ **Valor** imediato para usuários
- ✅ **Base** sólida para evoluções futuras

**Recomendação:** Iniciar implementação imediatamente, seguindo abordagem incremental (fases 1-4).

---

## 📞 Próximos Passos

1. ✅ Revisar proposta completa em `docs/proposta-controle-cartoes-credito.md`
2. 📋 Validar modelo de dados com equipe
3. 🎨 Criar protótipo de UI (Figma)
4. 🚀 Iniciar Fase 1 do desenvolvimento

---

**Documento Detalhado:** `/home/user/zenit/docs/proposta-controle-cartoes-credito.md`

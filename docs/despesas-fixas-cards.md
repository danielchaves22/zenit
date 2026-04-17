# 🎯 **Cards de Implementação - Sistema de Despesas Fixas**

> **Estratégia:** Reutilizar estrutura `RecurringTransaction` existente + Geração Virtual + Materialização Inteligente

---

## 🚀 **MVP - FASE 1 (Semana 1-2)**

### **Card 1.1: Configurar Service para Transações Recorrentes**
**Estimativa: 4h | Prioridade: Alta**

**📋 Descrição:**
Criar service completo para gerenciar transações recorrentes (despesas fixas) aproveitando a tabela `RecurringTransaction` existente.

**🔧 Arquivos a Criar/Modificar:**
- `backend/src/services/recurring-transaction.service.ts` (criar)
- `backend/src/validators/recurring-transaction.validator.ts` (criar)
- `backend/src/controllers/recurring-transaction.controller.ts` (criar)

**✅ Critérios de Aceite:**
- [ ] Service com métodos CRUD completos
- [ ] Cálculo automático de `nextDueDate` baseado em frequency
- [ ] Validação de business rules (contas devem pertencer à empresa)
- [ ] Suporte para MONTHLY, WEEKLY, YEARLY frequencies
- [ ] Método `getActiveRecurringRules(companyId)` para buscar regras ativas

**💻 Estrutura do Service:**
```typescript
export default class RecurringTransactionService {
  static async create(data: CreateRecurringData): Promise<RecurringTransaction>
  static async update(id: number, data: UpdateRecurringData): Promise<RecurringTransaction>
  static async delete(id: number): Promise<void>
  static async getById(id: number): Promise<RecurringTransaction | null>
  static async listByCompany(companyId: number): Promise<RecurringTransaction[]>
  static async getActiveRules(companyId: number): Promise<RecurringTransaction[]>
  static async calculateNextDueDate(rule: RecurringTransaction): Promise<Date>
  static async updateNextDueDate(id: number, newDate: Date): Promise<void>
}
```

**🧪 Validações Zod:**
```typescript
export const createRecurringTransactionSchema = z.object({
  description: z.string().min(1).max(255),
  amount: z.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  dayOfMonth: z.number().min(1).max(31).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  fromAccountId: z.number().optional(),
  toAccountId: z.number().optional(),
  categoryId: z.number().optional(),
  notes: z.string().optional()
});
```

---

### **Card 1.2: Implementar Geração Virtual de Transações**
**Estimativa: 8h | Prioridade: Alta | Depende: 1.1**

**📋 Descrição:**
Criar sistema de geração virtual que calcula transações futuras a partir das regras recorrentes, sem persistir no banco.

**🔧 Arquivos a Criar:**
- `backend/src/services/virtual-transaction.service.ts`
- `backend/src/utils/date-recurring.utils.ts`
- `backend/src/types/virtual-transaction.types.ts`

**✅ Critérios de Aceite:**
- [ ] Gerar transações virtuais para MONTHLY (foco inicial)
- [ ] Suporte a WEEKLY e YEARLY (preparação futura)
- [ ] Calcular corretamente dayOfMonth respeitando meses com menos dias
- [ ] IDs únicos e determinísticos: `virtual_{recurringId}_{yyyy}_{mm}`
- [ ] Respeitar startDate e endDate das regras
- [ ] Performance adequada para períodos de até 2 anos

**💻 Tipos e Interfaces:**
```typescript
interface VirtualTransaction {
  id: string;                    // "virtual_123_2024_03"
  description: string;
  amount: number;
  date: Date;
  dueDate: Date;
  type: TransactionType;
  status: 'VIRTUAL_PENDING';
  isVirtual: true;
  recurringTransactionId: number;
  canMaterialize: boolean;       // Se está próximo do vencimento
  fromAccountId?: number;
  toAccountId?: number;
  categoryId?: number;
  companyId: number;
}

class VirtualTransactionService {
  static generateFromRecurringRules(
    rules: RecurringTransaction[],
    startDate: Date,
    endDate: Date,
    materializationWindow: number = 7
  ): VirtualTransaction[]
  
  static generateFromSingleRule(
    rule: RecurringTransaction,
    startDate: Date,
    endDate: Date
  ): VirtualTransaction[]
  
  static parseVirtualId(virtualId: string): {
    recurringId: number;
    year: number;
    month: number;
  }
}
```

**🛠️ Utils de Data:**
```typescript
export class DateRecurringUtils {
  static calculateNextOccurrence(
    lastDate: Date,
    frequency: RecurringFrequency,
    dayOfMonth?: number,
    dayOfWeek?: number
  ): Date
  
  static getAllOccurrencesInPeriod(
    startRule: Date,
    endRule: Date | null,
    frequency: RecurringFrequency,
    periodStart: Date,
    periodEnd: Date,
    dayOfMonth?: number,
    dayOfWeek?: number
  ): Date[]
}
```

---

### **Card 1.3: Integrar Transações Virtuais no FinancialTransactionService**
**Estimativa: 6h | Prioridade: Alta | Depende: 1.2**

**📋 Descrição:**
Modificar o service existente para combinar transações reais com virtuais nas consultas, mantendo transparência total.

**🔧 Arquivos a Modificar:**
- `backend/src/services/financial-transaction.service.ts`
- `backend/src/controllers/financial-transaction.controller.ts`

**✅ Critérios de Aceite:**
- [ ] `listTransactions()` retorna mix ordenado de reais + virtuais
- [ ] `getFinancialSummary()` inclui valores virtuais nas projeções
- [ ] Remover duplicatas (virtual já materializada)
- [ ] Filtros (accountId, categoryId, type) funcionam com virtuais
- [ ] Paginação correta considerando virtuais
- [ ] Performance < 500ms para consultas de 1 ano

**💻 Modificações no Service:**
```typescript
// Adicionar ao FinancialTransactionService
static async listTransactionsWithVirtual(params: {
  companyId: number;
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
  status?: TransactionStatus;
  accountId?: number;
  categoryId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
  accessFilter?: any;
  includeVirtual?: boolean; // Padrão: true
}): Promise<{
  data: (FinancialTransaction | VirtualTransaction)[];
  total: number;
  pages: number;
  virtualCount: number;
  realCount: number;
}>

private static async combineTransactions(
  realTransactions: FinancialTransaction[],
  virtualTransactions: VirtualTransaction[]
): Promise<(FinancialTransaction | VirtualTransaction)[]>

private static removeMaterializedDuplicates(
  virtualTransactions: VirtualTransaction[],
  realTransactions: FinancialTransaction[]
): VirtualTransaction[]
```

**🎯 Lógica de Combinação:**
1. Buscar transações reais (código existente)
2. Buscar regras recorrentes ativas da empresa
3. Gerar transações virtuais para o período
4. Remover virtuais que já foram materializadas
5. Aplicar filtros nas virtuais
6. Combinar e ordenar por data
7. Aplicar paginação no resultado final

---

### **Card 1.4: Criar Endpoints para Gestão de Despesas Fixas**
**Estimativa: 4h | Prioridade: Alta | Depende: 1.1**

**📋 Descrição:**
Implementar rotas CRUD para criar e gerenciar despesas fixas (transações recorrentes).

**🔧 Arquivos a Criar/Modificar:**
- `backend/src/routes/recurring-transaction.routes.ts` (criar)
- `backend/src/routes/financial.routes.ts` (adicionar import)

**✅ Critérios de Aceite:**
- [ ] Todas as rotas seguem padrão RESTful
- [ ] Validação Zod em todas as rotas
- [ ] Autorização por empresa (tenantMiddleware)
- [ ] Logs de auditoria para operações críticas
- [ ] Rate limiting aplicado
- [ ] Documentação Swagger

**🛣️ Endpoints:**
```typescript
// Rotas principais
POST   /api/financial/recurring              // Criar despesa fixa
GET    /api/financial/recurring              // Listar despesas fixas
GET    /api/financial/recurring/:id          // Obter despesa específica
PUT    /api/financial/recurring/:id          // Editar despesa fixa
DELETE /api/financial/recurring/:id          // Excluir despesa fixa

// Rotas auxiliares
GET    /api/financial/recurring/:id/preview  // Prévia próximas 12 ocorrências
POST   /api/financial/recurring/:id/pause    // Pausar/despausar despesa
PUT    /api/financial/recurring/:id/next-due // Atualizar próximo vencimento
```

**🎛️ Controller:**
```typescript
export class RecurringTransactionController {
  static async create(req: Request, res: Response)
  static async list(req: Request, res: Response)
  static async getById(req: Request, res: Response)
  static async update(req: Request, res: Response)
  static async delete(req: Request, res: Response)
  static async getPreview(req: Request, res: Response)    // Próximas 12 ocorrências
  static async togglePause(req: Request, res: Response)   // Pausar/despausar
  static async updateNextDue(req: Request, res: Response) // Atualizar vencimento
}
```

---

### **Card 1.5: Implementar Materialização Manual**
**Estimativa: 6h | Prioridade: Alta | Depende: 1.3**

**📋 Descrição:**
Permitir que usuário "pague" ou "confirme" uma transação virtual, convertendo-a em transação real editável.

**🔧 Arquivos a Criar/Modificar:**
- `backend/src/services/materialization.service.ts` (criar)
- `backend/src/controllers/financial-transaction.controller.ts` (adicionar endpoints)
- `backend/src/routes/financial.routes.ts` (adicionar rotas)

**✅ Critérios de Aceite:**
- [ ] Endpoint para materializar transação virtual específica
- [ ] Permitir edição de valores durante materialização
- [ ] Validar que virtual ID existe e pertence à empresa
- [ ] Atualizar `nextDueDate` da regra recorrente automaticamente
- [ ] Logs de auditoria detalhados
- [ ] Rollback em caso de erro

**🔧 Service de Materialização:**
```typescript
export default class MaterializationService {
  static async materializeVirtual(
    virtualId: string,
    companyId: number,
    userId: number,
    overrides?: Partial<CreateTransactionData>
  ): Promise<FinancialTransaction>
  
  static async canMaterialize(
    virtualId: string,
    companyId: number
  ): Promise<boolean>
  
  static async previewMaterialization(
    virtualId: string,
    companyId: number
  ): Promise<VirtualTransaction & { suggestedValues: any }>
  
  private static updateRecurringRule(
    recurringId: number,
    materializedDate: Date
  ): Promise<void>
}
```

**🛣️ Novos Endpoints:**
```typescript
// Adicionar ao financial.routes.ts
POST   /api/financial/transactions/virtual/:virtualId/materialize
GET    /api/financial/transactions/virtual/:virtualId/preview
POST   /api/financial/transactions/virtual/:virtualId/skip     // Pular uma ocorrência
```

**💳 Fluxo de Materialização:**
1. Validar virtualId e pertencimento à empresa
2. Parsear dados da regra recorrente
3. Aplicar overrides do usuário (valor, conta, etc.)
4. Criar transação real usando FinancialTransactionService.createTransaction()
5. Atualizar nextDueDate da regra para próxima ocorrência
6. Log de auditoria
7. Retornar transação materializada

---

## 🎯 **V1.1 - FASE 2 (Semana 3-4)**

### **Card 2.1: Implementar Cache Inteligente para Consultas Virtuais**
**Estimativa: 4h | Prioridade: Média | Depende: 1.3**

**📋 Descrição:**
Otimizar performance das consultas virtuais com cache inteligente, aproveitando o sistema de cache existente.

**🔧 Arquivos a Modificar:**
- `backend/src/services/virtual-transaction.service.ts`
- `backend/src/services/cache.service.ts` (usar existente)

**✅ Critérios de Aceite:**
- [ ] Cache por período de consulta (chave: `virtual:${companyId}:${startDate}:${endDate}`)
- [ ] TTL diferenciado: 15min para períodos futuros, 5min para período atual
- [ ] Invalidação automática quando regra recorrente for alterada
- [ ] Cache apenas se consulta > 30 dias (evitar cache desnecessário)
- [ ] Métricas de hit rate no log

**🚀 Implementação:**
```typescript
class VirtualTransactionService {
  private static generateCacheKey(
    companyId: number, 
    startDate: Date, 
    endDate: Date
  ): string {
    return `virtual:${companyId}:${startDate.toISOString().split('T')[0]}:${endDate.toISOString().split('T')[0]}`;
  }

  static async generateFromRecurringRulesWithCache(
    rules: RecurringTransaction[],
    startDate: Date,
    endDate: Date,
    companyId: number
  ): Promise<VirtualTransaction[]> {
    const cacheKey = this.generateCacheKey(companyId, startDate, endDate);
    
    // TTL baseado no período
    const isCurrentPeriod = startDate <= new Date() && endDate >= new Date();
    const ttl = isCurrentPeriod ? 300 : 900; // 5min vs 15min
    
    const cached = await cacheService.get<VirtualTransaction[]>(cacheKey);
    if (cached) {
      logger.debug('Virtual transactions served from cache', { cacheKey, count: cached.length });
      return cached;
    }

    const virtualTransactions = this.generateFromRecurringRules(rules, startDate, endDate);
    
    // Cache apenas se período >= 30 dias
    const periodDays = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (periodDays >= 30) {
      await cacheService.set(cacheKey, virtualTransactions, ttl);
    }
    
    return virtualTransactions;
  }

  static async invalidateCacheForCompany(companyId: number): Promise<void> {
    await cacheService.invalidatePattern(`virtual:${companyId}:*`);
  }
}
```

---

### **Card 2.2: Materialização Automática por Proximidade**
**Estimativa: 6h | Prioridade: Média | Depende: 1.5**

**📋 Descrição:**
Implementar job que materializa automaticamente transações virtuais X dias antes do vencimento (padrão: 7 dias).

**🔧 Arquivos a Criar:**
- `backend/src/jobs/auto-materialization.job.ts`
- `backend/src/services/job-scheduler.service.ts` (se não existir)

**✅ Critérios de Aceite:**
- [ ] Job que executa diariamente às 6h da manhã
- [ ] Configurável quantos dias antes materializar (env: `AUTO_MATERIALIZE_DAYS_BEFORE=7`)
- [ ] Materializar apenas se não foi materializada manualmente
- [ ] Logs detalhados de execução (quantas empresas, quantas transações)
- [ ] Fallback gracioso se materialization falhar
- [ ] Métricas de execução

**⚙️ Configuração:**
```typescript
// Adicionar em backend/src/config/index.ts
export const JOB_CONFIG = {
  autoMaterializeDaysBefore: parseInt(process.env.AUTO_MATERIALIZE_DAYS_BEFORE || '7'),
  autoMaterializeEnabled: process.env.AUTO_MATERIALIZE_ENABLED !== 'false',
  autoMaterializeTime: process.env.AUTO_MATERIALIZE_TIME || '06:00' // 6h da manhã
};
```

**🤖 Job Implementation:**
```typescript
export default class AutoMaterializationJob {
  static async execute(): Promise<void> {
    if (!JOB_CONFIG.autoMaterializeEnabled) {
      logger.info('Auto-materialization disabled by config');
      return;
    }

    const startTime = Date.now();
    const daysBeforeDue = JOB_CONFIG.autoMaterializeDaysBefore;
    const targetDate = addDays(new Date(), daysBeforeDue);
    
    logger.info('Starting auto-materialization job', { 
      daysBeforeDue, 
      targetDate: targetDate.toISOString() 
    });

    const companies = await this.getAllActiveCompanies();
    let totalMaterialized = 0;
    let totalErrors = 0;

    for (const company of companies) {
      try {
        const materialized = await this.materializeUpcomingForCompany(
          company.id, 
          targetDate
        );
        totalMaterialized += materialized;
      } catch (error) {
        totalErrors++;
        logger.error('Auto-materialization failed for company', {
          companyId: company.id,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Auto-materialization job completed', {
      duration,
      companiesProcessed: companies.length,
      totalMaterialized,
      totalErrors
    });
  }

  private static async materializeUpcomingForCompany(
    companyId: number,
    targetDate: Date
  ): Promise<number> {
    // Implementar lógica específica
  }
}
```

---

### **Card 2.3: Melhorar UX das Transações Virtuais na API**
**Estimativa: 4h | Prioridade: Média | Depende: 1.3**

**📋 Descrição:**
Enriquecer respostas da API com metadados úteis para frontend distinguir e interagir com transações virtuais.

**🔧 Arquivos a Modificar:**
- `backend/src/services/financial-transaction.service.ts`
- `backend/src/controllers/financial-transaction.controller.ts`

**✅ Critérios de Aceite:**
- [ ] Campo `isVirtual: boolean` em todas as transações
- [ ] Campo `canMaterialize: boolean` baseado em proximidade do vencimento
- [ ] Campo `virtualMetadata` com dados da regra recorrente
- [ ] Endpoint para prévia de materialização com valores sugeridos
- [ ] Status codes específicos para operações com virtuais

**📊 Estrutura de Resposta Enriquecida:**
```typescript
interface EnrichedTransactionResponse extends FinancialTransaction {
  isVirtual: boolean;
  canMaterialize?: boolean;
  virtualMetadata?: {
    recurringTransactionId: number;
    nextOccurrence: Date;
    frequency: RecurringFrequency;
    remainingOccurrences?: number; // Se endDate definido
  };
}

// Novos endpoints
GET /api/financial/transactions/virtual/:virtualId/preview-materialization
// Retorna valores sugeridos para materialização

GET /api/financial/transactions/upcoming-due
// Transações virtuais que vencem nos próximos X dias
```

**🎯 Controller Updates:**
```typescript
// Adicionar ao FinancialTransactionController
static async getUpcomingDue(req: Request, res: Response) {
  const { companyId } = getUserContext(req);
  const { days = 7 } = req.query;
  
  const upcomingVirtual = await VirtualTransactionService.getUpcomingDue(
    companyId, 
    Number(days)
  );
  
  return res.json({
    transactions: upcomingVirtual,
    summary: {
      count: upcomingVirtual.length,
      totalAmount: upcomingVirtual.reduce((sum, t) => sum + t.amount, 0),
      days: Number(days)
    }
  });
}

static async previewMaterialization(req: Request, res: Response) {
  const { virtualId } = req.params;
  const { companyId } = getUserContext(req);
  
  const preview = await MaterializationService.previewMaterialization(
    virtualId,
    companyId
  );
  
  return res.json(preview);
}
```

---

## 🚀 **V1.2 - FASE 3 (Futuro)**

### **Card 3.1: Otimizações Avançadas de Performance**
**Estimativa: 8h | Prioridade: Baixa**

**📋 Descrição:**
Implementar otimizações para volume alto de transações virtuais e melhor experiência em consultas longas.

**✅ Critérios de Aceite:**
- [ ] Lazy loading de transações virtuais (gerar apenas página atual)
- [ ] Background job para pre-computar períodos comuns (mês atual + próximo)
- [ ] Índices otimizados nas tabelas RecurringTransaction
- [ ] Paginação inteligente (virtuais + reais misturadas)
- [ ] Monitoramento de performance com métricas detalhadas

**🚀 Otimizações:**
```typescript
// Lazy loading para paginação
class VirtualTransactionPaginator {
  static async paginateVirtualTransactions(
    rules: RecurringTransaction[],
    startDate: Date,
    endDate: Date,
    page: number,
    pageSize: number
  ): Promise<{
    virtualTransactions: VirtualTransaction[];
    totalEstimated: number;
  }>
}

// Background pre-computation
class VirtualTransactionPrecomputer {
  static async precomputeCommonPeriods(): Promise<void> {
    // Pre-compute current month + next month for all active companies
  }
}
```

---

### **Card 3.2: Relatórios Avançados com Transações Virtuais**
**Estimativa: 6h | Prioridade: Baixa**

**📋 Descrição:**
Garantir que relatórios financeiros incluam projeções baseadas em despesas fixas futuras.

**✅ Critérios de Aceite:**
- [ ] Relatórios de fluxo de caixa incluem transações virtuais
- [ ] Separação visual entre valores reais vs projetados
- [ ] Exportação PDF/Excel com seção de despesas fixas futuras
- [ ] Análise de tendências baseada em recorrências
- [ ] Alertas de fluxo de caixa negativo futuro

**📊 Novos Relatórios:**
```typescript
// Adicionar ao financial-account-movement-report.service.ts
class CashFlowProjectionService {
  static async generateProjectionReport(
    companyId: number,
    projectionMonths: number = 6
  ): Promise<CashFlowProjection[]>
  
  static async detectUpcomingCashFlowIssues(
    companyId: number
  ): Promise<CashFlowAlert[]>
}
```

---

## 📊 **Resumo das Fases**

| Fase | Cards | Tempo Estimado | Valor Entregue |
|------|-------|----------------|-----------------|
| **MVP** | 5 cards | **28h** (1-2 semanas) | ✅ Sistema básico de despesas fixas funcionando |
| **V1.1** | 3 cards | **14h** (3-4 dias) | ⚡ Performance otimizada + UX melhorada |
| **V1.2** | 2 cards | **14h** (conforme demanda) | 🚀 Otimizações avançadas + relatórios |

**Total Estimado: 56h de desenvolvimento**

---

## 🎯 **Ordem de Desenvolvimento Recomendada**

### **Sprint 1 (Core Functionality)**
1. **Card 1.1** → **Card 1.2** → **Card 1.3**
   - Base sólida para geração virtual

### **Sprint 2 (User Interaction)**  
2. **Card 1.4** → **Card 1.5**
   - Interface completa para usuário

### **Sprint 3 (Optimizations)**
3. **Card 2.1** → **Card 2.2** → **Card 2.3**
   - Performance e automação

### **Futuro (Advanced Features)**
4. **Card 3.x** conforme necessidade
   - Otimizações avançadas

---

## 🚨 **Pontos de Atenção**

### **Performance**
- Gerar virtuais apenas para período consultado
- Cache agressivo para consultas > 30 dias
- Monitorar tempo de resposta

### **Consistência**
- Sempre atualizar `nextDueDate` após materialização
- Logs de auditoria em todas as operações críticas
- Tratamento de timezones

### **UX**
- Transparência total: usuário não distingue virtual de real
- Feedback claro em operações de materialização
- Prévia antes de confirmar alterações

### **Escalabilidade**
- Estrutura preparada para múltiplas frequencies
- Código reutilizável para futuras features (favoritas)
- APIs extensíveis

---

## 🧪 **Estratégia de Testes**

### **Testes Unitários (Cada Card)**
- [ ] Services com mock do Prisma
- [ ] Utils de data com casos edge
- [ ] Validadores Zod

### **Testes de Integração (MVP)**
- [ ] Fluxo completo: criar regra → gerar virtual → materializar
- [ ] Performance com volume real

### **Testes E2E (V1.1)**
- [ ] Cenários complexos com múltiplas despesas fixas
- [ ] Jobs automatizados
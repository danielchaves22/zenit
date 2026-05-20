# Plano de Reativacao do App Mobile de Orcamento

## Resumo

Entregar a reativacao do app em um primeiro marco `local-first`, com uso guest por padrao, sync opcional via Zenit e integracao financeira seletiva no Cash, sem ampliar o escopo funcional do produto.

Decisoes travadas para este plano:
- primeiro marco: `base tecnica + fluxo minimo`
- refatores antes da integracao: `todos os estruturais`
- projecao financeira no MVP: `sim, seletiva`
- naming: `PT-BR no mobile`, `Budget/BudgetEntry no backend`
- onboarding: `guest por padrao`
- dinheiro: `migrar para centavos agora`
- sync: `automatico em background + retry manual`
- conflitos: `last-write-wins por updatedAt + aviso leve`
- tenant alvo: `workspace pessoal fixa e invisivel`

## Implementacao

### 1. Refatoracao estrutural do mobile

- Migrar o modelo local de `double` para `int` em centavos em `Orcamento` e `Movimentacao`; toda entrada/saida de UI passa a formatar e parsear moeda, nunca operar em `double`.
- Separar `businessDate` de timestamps reais: `dataDeTrabalhoAtual` continua servindo regra diaria, mas `createdAt` e `updatedAt` passam a ser reais, idealmente UTC.
- Trocar IDs baseados em timestamp por `UUID/ULID` e tratá-los como `clientKey` canonico do app para budgets e entries.
- Manter naming PT-BR no Flutter (`Orcamento`, `Movimentacao`), mas introduzir mapeadores explicitos para DTOs de sync (`BudgetSyncDto`, `BudgetEntrySyncDto`).
- Tirar regra e persistencia de dentro das telas: criar ao menos `BudgetRepository`, `BudgetService`, `AuthService`, `SyncService`, `ClockService` e `AppConfig`.
- Remover globais comportamentais dispersas; `defaultDistribuicaoEntrada`, data simulada e flags de dev passam por servicos/config central.
- Preservar Hive como armazenamento principal; fazer migracao local versionada para centavos, IDs novos e timestamps corrigidos sem apagar historico.

### 2. Saneamento da integracao legada

- Remover o bootstrap funcional de Firebase, o login Firebase, o `SyncManager` Firestore e a UI placeholder de sync.
- Limpar `pubspec.yaml` e setup nativo para retirar dependencias e sobras de Firebase do fluxo principal.
- Alinhar `.env.example` com as variaveis realmente usadas pelo app.
- Substituir o bootstrap atual por um fluxo de inicializacao que:
  - carrega Hive
  - aplica migracoes locais
  - calcula estado diario
  - abre direto em modo guest
  - inicializa sessao Zenit apenas se houver credenciais salvas

### 3. Backend Zenit para auth, workspace e budget sync

- Criar um `PersonalWorkspaceService` para localizar ou provisionar uma workspace pessoal fixa por usuario, invisivel na UX, com `zenit-cash` habilitado.
- Introduzir o dominio backend neutro:
  - `Budget`
  - `BudgetEntry`
  - extensoes em `FinancialAccount` com `purpose = BUDGET` e `isSystemManaged = true`
- Implementar a projecao financeira seletiva:
  - cada `Budget` sincronizado cria ou vincula uma `FinancialAccount`
  - `EXPENSE` gera `FinancialTransaction`
  - `INCOME` com alocacao principal gera `FinancialTransaction`
  - `INCOME` com alocacao `EXTRA` nao gera `FinancialTransaction`
- Manter `Budget` como fonte de verdade de planejamento; `FinancialTransaction` representa apenas o fato financeiro que afeta saldo principal.
- Criar endpoints autenticados do MVP:
  - `GET /api/cash/budgets`
  - `PUT /api/cash/budgets/sync`
- O contrato de sync deve aceitar budgets e entries por `clientKey`, aplicar upsert idempotente e devolver o estado canonico consolidado.
- Excluir contas `purpose = BUDGET` do resumo financeiro geral por padrao, para nao poluir dashboard e listas genericas do Cash.

### 4. Fluxo de sync e UX operacional

- O app abre e funciona integralmente sem login.
- Ao escolher sincronizar, o usuario autentica no Zenit; o backend resolve automaticamente a workspace pessoal e o mobile passa a operar com ela sem tela de escolha de empresa.
- Toda mutacao continua salvando localmente primeiro e agenda sync em background com debounce/retry.
- O sync local deve registrar `lastSyncAt`, `syncStatus`, `lastSyncError` e um indicador de pendencia.
- O drawer/configuracoes devem exibir estado real:
  - guest/local only
  - sincronizando
  - sincronizado
  - pendente
  - erro com retry
- Conflito simples e resolvido por `updatedAt` em budget e entry; quando houver sobrescrita remota relevante, mostrar aviso discreto, sem tela de merge manual.
- O fluxo de login deve existir apenas como caminho de backup/sync, nao como porta obrigatoria de entrada no produto.

## Mudancas de interface e contrato

- Mobile local:
  - valores monetarios passam a ser `int` em centavos
  - `createdAt` e `updatedAt` deixam de usar data simulada
  - budgets e movimentacoes passam a ter `clientKey` estavel
- Sync payload:
  - budgets e entries com `clientKey`, `updatedAt`, datas ISO-8601 e valores em centavos
  - mapeamento explicito de alocacao principal vs extra
- Backend:
  - novos modelos `Budget` e `BudgetEntry`
  - `FinancialAccount` ganha metadados de conta sistemica de budget
  - novos endpoints `GET /api/cash/budgets` e `PUT /api/cash/budgets/sync`

## Testes e criterios de aceite

- Mobile:
  - migracao local de Hive preserva historico e converte valores/IDs/timestamps corretamente
  - criacao de orcamento, movimentacao, `saldoExtraDoDia`, `isTrabalho` e recalculo diario continuam corretos apos a refatoracao
  - uso guest funciona sem rede e sem sessao
  - login Zenit nao bloqueia uso local
  - sync automatico agenda push apos mutacoes e permite retry manual
  - conflito simples resulta em last-write-wins com aviso leve
- Backend:
  - provisionamento de workspace pessoal e idempotente
  - budget e entry fazem upsert por `clientKey`
  - projecao seletiva cria `FinancialTransaction` apenas quando aplicavel
  - `allocationMode = EXTRA` nao afeta conta principal nem gera transacao financeira
  - contas `purpose = BUDGET` nao aparecem no resumo financeiro geral padrao
  - isolamento por usuario/workspace e garantido
- Aceite do marco:
  - app reativado sem dependencia funcional de Firebase
  - app continua rapido, simples e offline-first
  - sync Zenit funciona sem pedir dados financeiros extras ao usuario
  - dominio atual do app permanece preservado, com integracao profunda mas controlada ao Cash

## Assumptions e defaults

- Nao entra state management novo de grande porte neste marco; a modernizacao sera por servicos/repositorios, nao por troca arquitetural ampla.
- Hive permanece como storage local principal neste marco.
- O backend continua multi-tenant, mas o app sempre sincroniza na workspace pessoal fixa, nao em empresas escolhidas pelo usuario.
- O naming PT-BR do Flutter sera mantido para reduzir risco; a neutralidade de dominio sera aplicada no backend e nos contratos.
- O objetivo deste marco nao e expandir a feature, e sim torna-la confiavel, sincronizavel e aderente ao ecossistema Zenit sem perder simplicidade.

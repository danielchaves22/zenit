# Especificacao Tecnica Minima - Reativacao do App Mobile de Orcamento

## Objetivo

Reativar o app legado em `zenit/mobile` sem ampliar o escopo funcional do produto neste primeiro passo.

O objetivo do MVP e:

- manter a experiencia atual do app de orcamento diario;
- reaproveitar integralmente o dominio, as telas e os fluxos ja existentes no app;
- substituir autenticacao e sincronizacao baseadas em Firebase;
- persistir os dados no backend do ecossistema Zenit;
- manter o funcionamento offline como requisito do produto;
- evitar, neste momento, uma reescrita funcional do dominio.

## Diagnostico Consolidado

### O que o app ja faz hoje

O app mobile implementa um controle de orcamento diario pessoal com:

- criacao de orcamento do tipo `gasto` ou `economia`;
- saldo inicial, saldo final desejado e data final;
- calculo de `orcamentoDiarioInicial` e `orcamentoDiarioAtual`;
- registro de movimentacoes de `entrada` e `saida`;
- conceito de `saldoExtraDoDia`;
- conceito de um unico `orcamento de trabalho`;
- status `ativo`, `arquivado`, `expirado` e `excluido`;
- clonagem, arquivamento, reativacao e exclusao logica.

### O que existe de sincronizacao hoje

Existe apenas um esboco:

- login/cadastro via FirebaseAuth;
- push/pull via Firestore;
- drawer com status de sincronizacao placeholder;
- serializacao incompleta, porque as movimentacoes nao sobem nem descem corretamente.

Na pratica, o app ainda e local-first e local-only.

### O que existe no ecossistema Zenit

O backend e o web `zenit-cash` ja oferecem:

- autenticacao propria via `/api/auth/login`, `/api/auth/refresh` e `/api/auth/me`;
- selecao de empresa via header `X-Company-Id`;
- controle de acesso por app via header `X-App-Key`;
- grant existente para `zenit-cash`.

### Conclusao tecnica

O menor caminho para reativar o app nao e nem tratar o backend apenas como snapshot cego, nem absorver todo o dominio diretamente pelo core financeiro.

O menor caminho e:

1. reaproveitar o app atual quase por completo;
2. substituir apenas a camada de integracao legada;
3. manter Hive e o comportamento offline;
4. persistir `Budget` e `BudgetEntry` no backend com nomes de dominio neutros;
5. criar uma `FinancialAccount` vinculada por orcamento e materializar `FinancialTransaction` apenas quando fizer sentido;
6. deixar a absorcao mais profunda pelo core financeiro para uma fase posterior, se a feature crescer.

## Decisoes do MVP

### Decisao 0: Reaproveitar o app e substituir apenas a integracao legada

A decisao deste MVP e:

- reaproveitar modelos, regras, telas e fluxo atual do app;
- substituir o que foi feito para autenticacao e sincronizacao legadas;
- evitar refactor amplo do dominio neste momento.

Em termos praticos:

- `dominio atual`: reaproveitar;
- `camada de integracao atual`: descartar e substituir.

### Decisao 1: Manter Hive

Hive continua como armazenamento local primario durante a execucao do app e como base do funcionamento offline.

O backend passa a ser a persistencia remota e a base de sincronizacao, nao o unico armazenamento acessado em tempo real.

### Decisao 2: Remover Firebase do fluxo principal

Para o MVP:

- remover `firebase_auth` como login oficial;
- remover `cloud_firestore` como backend de sincronizacao;
- remover dependencia funcional de `firebase_options.dart`.

### Decisao 3: Reutilizar o app key existente

O mobile deve usar o mesmo `X-App-Key: zenit-cash`.

Nao criar um novo app key para mobile neste momento. Isso adicionaria configuracao, grants e testes sem ganho real para o MVP.

### Decisao 4: Orcamento pertence ao usuario dentro da empresa ativa

Cada `Budget` sera isolado por:

- `userId`;
- `companyId`.

Isso significa:

- o dado nao sera compartilhado com outros usuarios;
- o mesmo usuario pode ter budgets diferentes por empresa;
- o backend continua aderente ao modelo multi-tenant atual.

### Decisao 5: Backend persiste o dominio e materializa quando aplicavel

No desenho inicial deste MVP, o backend apenas persistiria o dominio e deixaria todo o recalculo no app.

Esse desenho, porem, nao e suficiente para integridade em multi-device.

Quando dois aparelhos criam ou alteram entries do mesmo budget antes de sincronizar, um merge apenas por `updatedAt` no nivel do budget pode preservar duas entries validas e, ao mesmo tempo, deixar `currentBalance`, `dailyBudgetCurrent` e `dayExtraBalance` inconsistentes se esses agregados forem aceitos cegamente do payload de um unico aparelho.

Por isso, para usuarios autenticados e sincronizados, o backend deve ser canonico para o estado agregado do budget apos o merge.

Ao mesmo tempo, o backend deve:

- persistir `Budget` e `BudgetEntry`;
- recalcular o estado derivado canonico do budget apos reconciliar entries e metadados;
- criar a `FinancialAccount` vinculada a cada budget quando necessario;
- criar `FinancialTransaction` apenas para eventos monetarios que realmente impactam o saldo principal.

Em termos praticos:

- o app continua calculando esses valores para UX local e uso offline;
- o backend deixa de confiar cegamente nesses agregados quando ha sync;
- a resposta canonica do sync volta a ser a fonte de verdade para reidratar o aparelho.

### Decisao 6: Nomes de dominio neutros

Como esse controle de orcamento pode viver tanto no app quanto no web no futuro:

- nao usar `mobile` nos nomes de dominio do backend;
- nao criar entidades com naming acoplado ao canal;
- usar nomes neutros como `Budget`, `BudgetEntry`, `BudgetSync`.

### Decisao 7: Uso local sem login obrigatorio

O app deve continuar podendo ser usado como ferramenta independente:

- criar e usar budgets localmente sem login;
- manter Hive como base do uso diario;
- exigir autenticacao apenas quando o usuario optar por sincronizacao, backup ou uso em outro aparelho.

## Fora de Escopo Agora

- absorver integralmente o orcamento diario pelo core financeiro, eliminando `Budget` e `BudgetEntry`;
- compartilhar orcamentos entre usuarios;
- edicao colaborativa;
- dashboard web desta feature;
- reconciliacao com contas financeiras do Zenit Cash;
- analytics complexos;
- push notifications;
- sincronizacao em tempo real por websocket;
- merge fino por movimentacao.

## Fase 0 - Saneamento Tecnico

Antes da reativacao funcional, o app precisa passar por um saneamento tecnico minimo.

Aqui, `saneamento` nao significa apenas sanitizacao de input de seguranca. Significa limpar o legado incompleto, remover integracoes quebradas, normalizar dados locais antigos e deixar o app em um estado coerente para a nova sincronizacao.

### O que sao os sinais de abandono identificados

Os principais sinais encontrados foram:

- documentacao especifica do app praticamente inexistente;
- teste padrao do Flutter ainda presente, sem aderencia ao app real;
- `.env.example` desatualizado em relacao ao codigo;
- fluxo Firebase parcial e inconsistente;
- dependencia de `firebase_options.dart` sem arquivo versionado;
- configuracao Android presente e configuracao iOS ausente;
- UI de sincronizacao placeholder;
- serializacao remota incompleta das movimentacoes;
- regras de dominio existentes no codigo, mas sem fechamento documental claro;
- naming legado de projeto ainda centrado em `orcamento_app`.

### Objetivo da Fase 0

Entregar um app tecnicamente confiavel para receber a nova camada Zenit de autenticacao e sincronizacao, sem mexer desnecessariamente no dominio reaproveitado.

### Frente 0.1 - Limpeza de codigo e dependencias

Itens recomendados:

- remover `firebase_auth`, `cloud_firestore` e bootstrap de Firebase do fluxo principal;
- remover imports mortos, comentarios de exemplo e placeholders de implementacao ligados a integracao antiga;
- eliminar dependencia funcional de `firebase_options.dart`;
- revisar se os arquivos nativos remanescentes de Firebase devem ser apagados do repositorio ou mantidos apenas ate a troca completa;
- substituir o teste padrao por testes reais do fluxo atual do app;
- alinhar `.env.example` com as variaveis realmente necessarias para o novo fluxo Zenit;
- documentar setup de ambiente do mobile de forma objetiva.

### Frente 0.2 - Higiene minima do modelo local e dos dados legados

O Hive local pode conter dados criados em estados antigos do app. Antes de sincronizar com o backend novo, o app precisa normalizar esse estado.

Regras de saneamento recomendadas no bootstrap:

- garantir que todo `Orcamento` tenha `id`;
- garantir que toda `Movimentacao` tenha `id`;
- garantir que todo `Orcamento` tenha `updatedAt`;
- garantir que toda `Movimentacao` tenha `createdAt` e `updatedAt`;
- se houver mais de um `orcamento ativo` marcado como `isTrabalho`, manter apenas um;
- se nao houver nenhum `isTrabalho` entre ativos, promover um de forma deterministica;
- recalcular `orcamentoDiarioAtual` apenas quando o proprio app ja faria isso pela regra atual;
- garantir que `movimentacoes` subam completas, e nao apenas seus IDs;
- preservar registros `arquivado`, `excluido` e `expirado` para nao destruir historico local;
- nao aplicar limpeza destrutiva silenciosa sem log.

Observacao:

essa frente existe apenas para proteger a migracao do offline legado para a sincronizacao Zenit.

Ela nao autoriza reescrever regra de negocio, remodelar as entidades ou alterar o comportamento funcional do app alem do estritamente necessario para compatibilidade e consistencia.

### Frente 0.3 - Higiene de UX e operacao

Itens recomendados:

- substituir a UI fake de sincronizacao por estado real de sync;
- registrar `lastSyncAt`, `syncStatus` e `lastSyncError`;
- tratar explicitamente estados offline, erro de autenticacao e erro de empresa sem acesso;
- remover qualquer opcao de cadastro local/Firebase que nao tenha correspondencia no Zenit;
- evitar mensagens genericas sem acao clara para o usuario.

### Frente 0.4 - Higiene de contrato com backend

Antes de ligar o sync novo, o app deve sair do modo legado informal e passar a operar com contratos estritos.

Itens recomendados:

- serializacao JSON unica e centralizada para `Orcamento` e `Movimentacao`;
- enums enviados de forma previsivel, preferencialmente como string;
- datas sempre em ISO-8601;
- validacao local minima antes do envio;
- rejeicao de payload malformado no backend com erro estruturado;
- limite de tamanho razoavel para evitar payload invalido ou corrompido.

### Criterios de aceite da Fase 0

- o app deixa de depender funcionalmente de Firebase;
- o fluxo de sync placeholder e removido;
- o setup local do app fica documentado;
- o estado local passa a ser serializado de forma completa e consistente;
- o bootstrap consegue normalizar dados legados sem apagar historico indevidamente;
- o dominio atual do app permanece reaproveitado;
- testes basicos passam a cobrir bootstrap, serializacao e saneamento minimo.

## Arquitetura Recomendada

## Visao Geral

```text
Flutter app
  -> Hive local / offline
  -> Zenit Auth API
  -> Budget Sync API

Zenit Backend
  -> provisionamento de workspace pessoal
  -> dominio Budget
  -> FinancialAccount vinculado por Budget
  -> FinancialTransaction projetada quando aplicavel
```

## Limite de Dominio: Budget x Core Financeiro

O controle de orcamento deve viver dentro do Zenit Cash, mas nao deve ser absorvido integralmente pelo core financeiro neste MVP.

Separacao recomendada:

- `Budget` e o dominio de planejamento;
- `FinancialAccount` e a conta financeira vinculada a cada orcamento;
- `FinancialTransaction` e o fato monetario normalizado quando o evento do orcamento realmente impacta saldo financeiro;
- campos e regras especificas do orcamento continuam fora do core financeiro.

Campos que permanecem no dominio `Budget`:

- `targetEndingBalance`;
- `dailyBudgetInitial`;
- `dailyBudgetCurrent`;
- `dayExtraBalance`;
- `isPrimary`;
- `status`;
- `lastDailyBudgetDate`.

Campos que devem ser canonicos no core financeiro quando houver projecao:

- `amount`;
- `date`;
- `dueDate`;
- `effectiveDate`;
- `description`;
- `type`;
- `status`.

## Provisionamento da Workspace Pessoal

Quando o usuario decidir ativar sincronizacao pela primeira vez:

1. autentica no Zenit;
2. o backend localiza ou cria uma workspace pessoal invisivel na UX;
3. habilita apenas `zenit-cash` para essa workspace;
4. concede grant de `zenit-cash` para o usuario nessa workspace;
5. garante a estrutura financeira minima da empresa;
6. executa o sync dos orcamentos.

Observacao:

o conceito de empresa continua existindo no backend porque o monorepo e multi-tenant, mas pode permanecer transparente na experiencia desse usuario.

## Modelo de Dominio Recomendado

### Principio geral

O modelo recomendado e:

- `Budget` como entidade propria;
- `BudgetEntry` como evento canonico do dominio do orcamento;
- `FinancialAccount` como conta vinculada a um `Budget`;
- `FinancialTransaction` como projecao financeira opcional de um `BudgetEntry`.

Essa escolha evita dois problemas:

- deformar o core financeiro para acomodar regras de planejamento do app;
- perder rastreabilidade de eventos que pertencem ao orcamento, mas nao devem virar transacao financeira.

### Extensoes recomendadas no core financeiro

Nao criar um novo `AccountType` agora.

Para contas vinculadas a orcamento, a recomendacao e:

- continuar usando `AccountType.CASH`;
- adicionar metadados de proposito e gestao sistemica.

### Enums sugeridos

```prisma
enum BudgetKind {
  SPENDING
  SAVINGS
}

enum BudgetStatus {
  ACTIVE
  ARCHIVED
  EXPIRED
  DELETED
}

enum BudgetEntryType {
  INCOME
  EXPENSE
  MANUAL_ADJUSTMENT
}

enum BudgetEntryAllocationMode {
  PRINCIPAL
  EXTRA
}

enum FinancialAccountPurpose {
  GENERAL
  BUDGET
}
```

### Modelo Prisma sugerido

```prisma
model Budget {
  id                  Int              @id @default(autoincrement())
  companyId           Int
  userId              Int
  clientKey           String
  code                String
  kind                BudgetKind
  status              BudgetStatus     @default(ACTIVE)
  initialBalance      Decimal          @db.Decimal(15, 2)
  targetEndingBalance Decimal          @db.Decimal(15, 2) @default(0)
  dailyBudgetInitial  Decimal          @db.Decimal(15, 2)
  dailyBudgetCurrent  Decimal          @db.Decimal(15, 2)
  dayExtraBalance     Decimal          @db.Decimal(15, 2) @default(0)
  startDate           DateTime
  endDate             DateTime
  lastDailyBudgetDate DateTime
  isPrimary           Boolean          @default(false)
  financialAccountId  Int              @unique
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  company             Company          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user                User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  financialAccount    FinancialAccount @relation(fields: [financialAccountId], references: [id], onDelete: Cascade)
  entries             BudgetEntry[]

  @@unique([companyId, userId, clientKey], name: "unique_budget_client_key")
  @@index([companyId, userId])
  @@index([companyId, status])
}

model BudgetEntry {
  id                   Int                       @id @default(autoincrement())
  budgetId             Int
  clientKey            String
  entryType            BudgetEntryType
  allocationMode       BudgetEntryAllocationMode?
  amount               Decimal                   @db.Decimal(15, 2)
  occurredAt           DateTime
  description          String?
  affectsBudgetBalance Boolean                   @default(true)
  financialTransactionId Int?                    @unique
  createdAt            DateTime                  @default(now())
  updatedAt            DateTime                  @updatedAt

  budget               Budget                    @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  financialTransaction FinancialTransaction?     @relation(fields: [financialTransactionId], references: [id], onDelete: SetNull)

  @@unique([budgetId, clientKey], name: "unique_budget_entry_client_key")
  @@index([budgetId, occurredAt])
}
```

### Extensoes recomendadas em `FinancialAccount`

Adicionar ao modelo existente:

```prisma
purpose         FinancialAccountPurpose @default(GENERAL)
isSystemManaged Boolean                 @default(false)
```

Para contas de orcamento:

- `type = CASH`
- `purpose = BUDGET`
- `isSystemManaged = true`
- `allowNegativeBalance = true`

### Fonte de verdade por campo

#### Em `Budget`

Canonicos:

- `targetEndingBalance`
- `dailyBudgetInitial`
- `dailyBudgetCurrent`
- `dayExtraBalance`
- `isPrimary`
- `status`
- `startDate`
- `endDate`
- `lastDailyBudgetDate`

#### Em `FinancialAccount`

Canonico:

- saldo corrente do orcamento que afeta o principal do budget

Ou seja:

- `FinancialAccount.balance` deve representar o equivalente backend de `saldoAtual`.

#### Em `BudgetEntry`

Canonicos:

- evento do app;
- `allocationMode`;
- `clientKey` da movimentacao local;
- rastreabilidade do que o usuario realmente fez;
- suporte a eventos que nao devem virar transacao financeira.

#### Em `FinancialTransaction`

Canonicos quando houver projecao:

- valor;
- datas;
- descricao;
- tipo financeiro;
- status financeiro.

## Nota Sobre Redundancia Controlada

Sim, nesse desenho existe redundancia parcial entre `BudgetEntry` e `FinancialTransaction` quando um evento do orcamento e projetado para o core financeiro.

Essa redundancia e deliberada e limitada.

Motivos:

- o dominio de orcamento precisa rastrear o evento original do app;
- nem todo evento do orcamento deve virar transacao financeira;
- o sync precisa de idempotencia por `clientKey` do app;
- o app precisa preservar a semantica atual sem deformar o ledger.

A alternativa de nao ter `BudgetEntry` e depender apenas de `FinancialTransaction` gera atrito principalmente em `saldoExtraDoDia`, porque esse tipo de alocacao pertence ao planejamento do orcamento e nao ao saldo financeiro principal.

## Regra Critica: `saldoExtraDoDia`

O `saldoExtraDoDia` e o principal motivo para nao usar apenas `FinancialTransaction` como unico modelo.

Recomendacao:

- entrada com alocacao `PRINCIPAL` pode gerar `FinancialTransaction`;
- entrada com alocacao `EXTRA` deve permanecer apenas como `BudgetEntry`;
- `BudgetEntry.allocationMode = EXTRA` nao altera `FinancialAccount.balance`;
- `Budget.dayExtraBalance` continua sendo o estado canonico desse valor.

Isso preserva o comportamento atual do app sem contaminar o core financeiro com uma regra de planejamento diario.

## Regras de Materializacao

### Criacao de `Budget`

Ao sincronizar um novo orcamento vindo do app:

1. localizar `Budget` por `companyId + userId + clientKey`;
2. se nao existir, criar;
3. criar `FinancialAccount` vinculada se ainda nao houver;
4. vincular `financialAccountId` ao `Budget`.

Padrao sugerido para a conta:

- `type = CASH`
- `purpose = BUDGET`
- `isSystemManaged = true`
- `allowNegativeBalance = true`
- nome derivado do codigo do orcamento, por exemplo: `Orcamento - <code>`

### Atualizacao de `Budget`

Ao sincronizar um orcamento existente:

- atualizar apenas campos do dominio `Budget`;
- se o `code` mudar, refletir o nome da conta vinculada;
- nao recalcular no backend regras que continuam pertencendo ao app, exceto validacoes de consistencia.

### Status do `Budget`

Mapeamento recomendado:

- `ACTIVE` -> orcamento ativo
- `ARCHIVED` -> orcamento arquivado
- `EXPIRED` -> orcamento expirado
- `DELETED` -> exclusao logica

A conta vinculada pode permanecer existente para preservar historico.

Sugestao:

- nao remover a conta ao arquivar;
- nao remover transacoes ao excluir logicamente;
- controlar visibilidade por `Budget.status` e por `FinancialAccount.purpose`.

### Materializacao de `BudgetEntry`

#### `EXPENSE`

Gerar:

- `BudgetEntry`
- `FinancialTransaction` do tipo `EXPENSE`

Mapeamento:

- `fromAccountId = budget.financialAccountId`
- `date = occurredAt`
- `dueDate = occurredAt`
- `effectiveDate = occurredAt`
- `status = COMPLETED`
- `categoryId = categoria padrao de despesa da workspace`

#### `INCOME` com `allocationMode = PRINCIPAL`

Gerar:

- `BudgetEntry`
- `FinancialTransaction` do tipo `INCOME`

Mapeamento:

- `toAccountId = budget.financialAccountId`
- `date = occurredAt`
- `dueDate = occurredAt`
- `effectiveDate = occurredAt`
- `status = COMPLETED`
- `categoryId = categoria padrao de receita da workspace`

#### `INCOME` com `allocationMode = EXTRA`

Gerar:

- `BudgetEntry`

Nao gerar:

- `FinancialTransaction`

Motivo:

- esse evento altera o planejamento diario do budget;
- esse evento nao deve alterar o saldo principal da conta vinculada.

#### `MANUAL_ADJUSTMENT`

Nao esta exposto na UX principal hoje, mas o modelo deve suportar.

Regra sugerida para o MVP:

- persistir como `BudgetEntry`;
- se no futuro precisar afetar saldo principal, projetar como `INCOME` ou `EXPENSE` conforme o delta;
- nao ampliar esse comportamento agora sem necessidade funcional real.

## Estrategia de Sincronizacao

### Unidade de idempotencia

A unidade de idempotencia deve ser:

- `Budget.clientKey` para orcamentos;
- `BudgetEntry.clientKey` para eventos do orcamento.

### Estado local adicional obrigatorio

Para sincronizacao segura entre aparelhos, o mobile precisa persistir mais metadados locais alem de `lastSyncAt`:

- `installationId`
  identificador estavel da instalacao/aparelho
- `boundUserId`
  usuario da nuvem ao qual esta instalacao ja foi vinculada
- `boundCompanyId`
  workspace pessoal atualmente vinculada
- `firstBindingCompletedAt`
  quando esse aparelho deixou de ser apenas guest
- `lastSuccessfulPullAt`
  ultimo pull canonico aplicado localmente
- `lastSuccessfulPushAt`
  ultimo push aceito pelo servidor
- `hasCompletedInitialReconciliation`
  flag que separa `primeiro vinculo` de `sync normal`

### Fluxo recomendado

#### Primeiro vinculo autenticado do aparelho

No primeiro login de um aparelho para aquela combinacao `userId + companyId`, o app nao deve fazer push automatico imediato.

Fluxo:

1. app autentica no Zenit;
2. backend provisiona ou localiza a workspace pessoal;
3. app faz `GET /api/cash/budgets` antes de qualquer `PUT`;
4. app compara:
   - se existe dado local;
   - se existe dado remoto;
   - se este aparelho ja estava vinculado a esse usuario/workspace.

Casos:

- `local vazio + remoto vazio`
  marcar aparelho como vinculado e seguir
- `local vazio + remoto com dados`
  baixar remoto e substituir local
- `local com dados + remoto vazio`
  subir local como base inicial da nuvem
- `local com dados + remoto com dados + aparelho ainda nao vinculado`
  pausar e exigir reconciliacao explicita

#### Reconciliacao obrigatoria no primeiro vinculo quando ambos os lados tem dados

Se o aparelho possui budgets guest e a nuvem ja possui budgets do mesmo usuario, nao fazer merge automatico por semelhanca de nome, datas ou tipo.

O app deve oferecer exatamente estas opcoes:

- `Usar dados da nuvem`
  descarta o conjunto local atual e reidrata o aparelho com o remoto
- `Importar meus dados locais como novos orcamentos`
  recomendada quando o usuario quer preservar os dois conjuntos
- `Cancelar`
  aborta o vinculo cloud e mantem o app local-only ate o usuario decidir

Regra importante:

na opcao `Importar meus dados locais como novos orcamentos`, o app deve clonar os budgets e entries locais com novos `clientKey` antes do primeiro push.

Motivo:

- evitar colisao acidental com `clientKey` ja existentes na nuvem;
- evitar que o app interprete budgets guest antigos como sendo os mesmos budgets remotos;
- preservar ambos os conjuntos sem merge semantico arriscado.

#### Sync normal apos o aparelho estar vinculado

1. app continua local-first com Hive;
2. mutacoes locais atualizam o estado local imediatamente;
3. antes do push, app faz pull do estado remoto canonico;
4. app faz merge local/remoto por `clientKey`;
5. app envia upserts explicitos ao backend;
6. backend aplica upsert idempotente;
7. backend recalcula o estado agregado canonico do budget;
8. backend devolve o estado consolidado para re-hidratar o local.

### Conflitos

#### Regras de merge

Para aparelho ja vinculado:

- `Budget`
  merge por `clientKey`, com `updatedAt` apenas para campos autorais do budget
- `BudgetEntry`
  merge por `clientKey`, com `updatedAt` no nivel da entry
- `campo derivado do budget`
  nao usar `last-write-wins` cego; recalcular no backend a partir do estado final de entries + metadados

#### Fonte de verdade por tipo de dado

- `campos autorais do budget`
  `code`, `kind`, `status`, `initialBalanceCents`, `targetEndingBalanceCents`, `startDate`, `endDate`, `isPrimary`
- `entries`
  fatos sincronizaveis com merge por `clientKey`
- `campos derivados`
  `currentBalanceCents`, `dailyBudgetInitialCents`, `dailyBudgetCurrentCents`, `dayExtraBalanceCents`, `lastDailyBudgetDate`

Os campos derivados podem ate viajar no payload como dica de UX/local cache, mas a resposta canonica do backend deve prevalecer.

#### Deletes

Ausencia de budget ou entry no payload nao deve significar delete.

Regras:

- `Budget`
  usar soft delete pelo proprio `status = DELETED`
- `BudgetEntry`
  quando houver exclusao futura, usar tombstone explicita (`deletedAt`) ou endpoint dedicado
- `omissao no payload`
  significa apenas `nao houve alteracao enviada`, nunca `remover do servidor`

#### Conflito que o usuario deve ver

No sync normal, o usuario nao precisa ver merge manual por item.

O app deve apenas informar algo leve como:

- `Algumas alteracoes mais recentes da nuvem foram mantidas`

Mas o primeiro vinculo com `local != vazio` e `remoto != vazio` deve continuar exigindo decisao explicita do usuario.

## API Proposta

### Headers obrigatorios

Todas as chamadas autenticadas devem usar:

- `Authorization: Bearer <token>`;
- `X-Company-Id: <companyId>`;
- `X-App-Key: zenit-cash`.

### Endpoints do MVP

#### 1. Buscar budgets do usuario na workspace ativa

```http
GET /api/cash/budgets
```

Response:

```json
{
  "budgets": []
}
```

#### 2. Sincronizar budgets e entries

```http
PUT /api/cash/budgets/sync
```

Payload:

```json
{
  "deviceId": "4f7c9b0a-3d3a-4f78-8c5e-7e5c4a8df0b3",
  "budgets": [
    {
      "clientKey": "5f9a51d3-6a95-4c3d-9b4d-3d1479d88f2d",
      "code": "Viagem",
      "kind": "SPENDING",
      "status": "ACTIVE",
      "isPrimary": true,
      "initialBalanceCents": 100000,
      "currentBalanceCents": 76500,
      "targetEndingBalanceCents": 10000,
      "dailyBudgetInitialCents": 9000,
      "dailyBudgetCurrentCents": 7650,
      "dayExtraBalanceCents": 4000,
      "startDate": "2026-05-15T00:00:00.000Z",
      "endDate": "2026-05-25T00:00:00.000Z",
      "lastDailyBudgetDate": "2026-05-15T00:00:00.000Z",
      "createdAt": "2026-05-15T14:00:00.000Z",
      "updatedAt": "2026-05-15T14:10:00.000Z",
      "entries": [
        {
          "clientKey": "c7e60ca3-5ac9-4595-a2f4-d5d9942ac85e",
          "entryType": "EXPENSE",
          "allocationMode": "PRINCIPAL",
          "amountCents": 3500,
          "principalImpactAmountCents": 3500,
          "occurredAt": "2026-05-15T00:00:00.000Z",
          "description": "Almoco",
          "affectsBudgetBalance": true,
          "createdAt": "2026-05-15T14:10:30.000Z",
          "updatedAt": "2026-05-15T14:11:00.000Z"
        }
      ]
    }
  ]
}
```

### Regras do endpoint de sync

O endpoint deve:

1. validar a empresa ativa e grant do app;
2. provisionar workspace pessoal, se necessario;
3. fazer upsert dos `Budget` por `clientKey`;
4. fazer upsert dos `BudgetEntry` por `budgetId + clientKey`;
5. nunca apagar `BudgetEntry` por simples ausencia no payload;
6. recalcular o estado canonico agregado de cada budget apos reconciliar entries;
7. materializar `FinancialAccount` e `FinancialTransaction` quando aplicavel;
8. devolver a representacao canonica consolidada.

### Validacoes minimas do backend

- `clientKey` obrigatoria em `Budget`;
- `clientKey` obrigatoria em `BudgetEntry`;
- `kind` valida;
- `status` valido;
- `entryType` valido;
- `allocationMode` valida quando aplicavel;
- datas em ISO-8601;
- `amountCents >= 0` quando aplicavel;
- rejeitar `clientKey` vazio;
- permitir apenas usuario autenticado na empresa ativa.

## Regras de Dominio Mantidas no Mobile

Estas regras devem continuar no Flutter no MVP e devem ser reaproveitadas como estao, salvo ajustes pontuais de compatibilidade com a nova sincronizacao:

- calculo de `orcamentoDiarioInicial`;
- calculo de `orcamentoDiarioAtual`;
- comportamento de `saldoExtraDoDia`;
- logica de `gasto` vs `economia`;
- promocao do primeiro orcamento ativo para `isTrabalho`;
- definicao de um unico `isTrabalho` ativo;
- recalc do orcamento ao virar o dia.

### Observacao sobre `expirado`

Hoje o status `expirado` existe no enum, mas nao ha automacao clara para aplicacao dele.

No MVP:

- manter o valor no modelo para compatibilidade;
- nao introduzir automacao nova de expiracao sem regra de produto confirmada.

## Implementacao Mobile

### Mudancas obrigatorias

#### 1. Autenticacao

Substituir a camada atual de autenticacao por cliente HTTP para o backend Zenit, mas sem tornar login obrigatorio para uso local:

- login via `/api/auth/login`;
- refresh via `/api/auth/refresh`;
- bootstrap de sessao via `/api/auth/me`.

#### 2. Selecao de empresa

O mobile deve seguir a mesma regra do web `zenit-cash`:

- escolher uma `companyId` com acesso ao app `zenit-cash` quando o usuario ativar sync;
- persistir a empresa ativa localmente;
- enviar `X-Company-Id` em todas as chamadas autenticadas.

Fluxo recomendado:

- `usar agora` sem login para experiencia local/offline;
- `entrar para sincronizar` quando o usuario quiser cloud;
- no primeiro sync, o backend localiza ou provisiona a workspace pessoal e a torna transparente para a UX.
- se este for o primeiro vinculo do aparelho e ambos os lados tiverem dados, mostrar tela de reconciliacao antes de qualquer push.

#### 3. Servico de sincronizacao

Criar um `BudgetSyncService` com responsabilidades:

- persistir `installationId`, binding cloud e metadados de reconciliacao no `AppStateStore`;
- serializar budgets e movimentacoes locais para payload JSON;
- chamar `GET /api/cash/budgets`;
- chamar `PUT /api/cash/budgets/sync`;
- decidir entre `adotar remoto`, `subir local` ou `exigir reconciliacao` no primeiro vinculo;
- clonar budgets locais com novos `clientKey` quando o usuario escolher importar dados guest como novos budgets;
- fazer pull antes do push em sync autenticado normal;
- aplicar merge local/remoto por `clientKey` e `updatedAt`;
- reidratar Hive com a resposta canonica consolidada;
- registrar `lastSyncAt`, `syncStatus` e `lastSyncError`.

#### 4. Serializacao correta

Substituir a serializacao atual incompleta por:

- orcamentos completos;
- movimentacoes completas;
- datas em ISO-8601;
- enum como string, preferencialmente.

#### 5. Estado visual de sync

Atualizar o drawer para exibir:

- ultimo sync com sucesso;
- pendencia de sync;
- erro de sync;
- reconciliacao pendente no primeiro vinculo;
- acao manual de sincronizar agora.

### Mudancas de UX recomendadas

- remover opcao de cadastro local/Firebase no login;
- deixar claro no onboarding que login e opcional e serve para sincronizacao;
- mostrar loading de sync no bootstrap;
- se o usuario nao tiver acesso a nenhuma empresa com `zenit-cash`, exibir mensagem clara;
- se houver falha de rede, manter app funcional localmente e avisar que a sincronizacao ficou pendente.

## Implementacao Backend

### Arquivos sugeridos

- `backend/prisma/schema.prisma`
- `backend/src/services/personal-workspace.service.ts`
- `backend/src/services/budget.service.ts`
- `backend/src/services/budget-sync.service.ts`
- `backend/src/controllers/budget.controller.ts`
- `backend/src/validators/budget.validator.ts`
- `backend/src/routes/budget.routes.ts`
- `backend/src/app.ts`

### Service sugerido

```ts
export default class BudgetSyncService {
  static async listBudgets(companyId: number, userId: number): Promise<BudgetSyncResponse>
  static async syncBudgets(params: {
    companyId: number
    userId: number
    budgets: BudgetSyncInput[]
  }): Promise<BudgetSyncResponse>
}
```

### Regras do service

- upsert de `Budget` por `companyId + userId + clientKey`;
- criacao da `FinancialAccount` vinculada quando o budget surgir pela primeira vez;
- upsert de `BudgetEntry` por `budgetId + clientKey`;
- nunca deletar `BudgetEntry` por omissao de payload;
- recalcular o budget canonico apos mesclar entries aceitas;
- materializacao de `FinancialTransaction` apenas para entradas e saidas que afetam o saldo principal;
- preservacao de `INCOME` com `allocationMode = EXTRA` apenas no dominio `Budget`;
- logs de sucesso e erro com `userId`, `companyId`, quantidade de budgets e quantidade de entries.

### Visibilidade no Cash

Contas de orcamento nao devem poluir as visoes financeiras gerais por padrao.

Recomendacao do MVP:

- `FinancialAccount.purpose = BUDGET` deve ser excluido do resumo financeiro geral por default;
- listagens genericas de contas e transacoes devem esconder contas de budget ate existir UX dedicada;
- a feature de orcamento pode ganhar visao propria no web depois, sem precisar mudar o dominio.

## Seguranca e Isolamento

O backend deve garantir:

- um usuario so enxerga os proprios `Budget` e `BudgetEntry`;
- um usuario nao enxerga budgets de outra empresa;
- somente usuarios com grant de `zenit-cash` conseguem usar o endpoint;
- o endpoint nao depende de permissao administrativa.

## Migracao e Compatibilidade

### Dados locais existentes

O app ja possui dados Hive em aparelhos antigos.

No primeiro vinculo autenticado:

- se a nuvem estiver vazia, esses dados devem ser tratados como base inicial;
- se a nuvem ja tiver dados, esses registros nao devem ser empurrados automaticamente;
- o ID legado string do orcamento deve ser preservado como `clientKey` para evitar duplicacao;
- o ID legado string de cada movimentacao deve ser preservado como `BudgetEntry.clientKey`.

Observacao:

se o usuario escolher `importar dados locais como novos orcamentos` durante a reconciliacao, esses registros devem ser clonados com novos `clientKey` antes do envio.

### Compatibilidade do schema local

Como o modelo Hive principal pode ser preservado, a reativacao nao precisa de uma migracao destrutiva do armazenamento local neste primeiro passo.

## Testes Minimos

### Backend

- login + acesso ao endpoint com `X-App-Key: zenit-cash`;
- bloqueio sem `X-Company-Id`;
- bloqueio para empresa sem pertencimento;
- retorno vazio quando nao houver budgets;
- provisionamento da workspace pessoal no primeiro sync;
- criacao de `Budget` e `FinancialAccount` vinculada no primeiro sync;
- criacao de `BudgetEntry` idempotente por `clientKey`;
- materializacao de `FinancialTransaction` para `EXPENSE` e `INCOME` principal;
- ausencia de `FinancialTransaction` para `INCOME` com `allocationMode = EXTRA`;
- filtros padrao impedem contas `purpose = BUDGET` de poluir o resumo financeiro geral;
- isolamento entre dois usuarios da mesma empresa;
- isolamento entre empresas do mesmo usuario.

### Mobile

- uso local sem login continua funcionando;
- login com backend Zenit;
- bootstrap sem internet com Hive local;
- bootstrap com internet e pull remoto;
- primeiro vinculo com `local vazio + remoto vazio`;
- primeiro vinculo com `local vazio + remoto com dados`;
- primeiro vinculo com `local com dados + remoto vazio`;
- primeiro vinculo com `local com dados + remoto com dados`, exigindo reconciliacao;
- sync apos criar orcamento;
- sync apos registrar movimentacao;
- sync apos arquivar/reativar/excluir;
- persistencia correta de `isTrabalho`;
- exibicao de status de sync no drawer.

## Criterios de Aceite do MVP

- app abre e continua funcionando com Hive local;
- usuario consegue usar o app sem login obrigatorio;
- usuario consegue autenticar com conta Zenit quando quiser sincronizar;
- primeiro sync provisiona ou reutiliza uma workspace pessoal valida do `zenit-cash`;
- dados deixam de depender de Firebase;
- dados deixam de ficar apenas locais;
- criar/editar/movimentar orcamento sincroniza `Budget` e `BudgetEntry` com backend Zenit;
- cada orcamento sincronizado passa a ter `FinancialAccount` vinculada;
- movimentacoes que afetam saldo principal geram `FinancialTransaction`;
- entradas marcadas como `EXTRA` nao geram `FinancialTransaction`;
- ao reinstalar ou abrir em outro aparelho, o usuario recupera seus budgets e entries;
- primeiro vinculo do aparelho nunca sobrescreve automaticamente nuvem existente quando tambem houver dados locais;
- ausencia de entry no payload nao apaga dado remoto;
- conflito simples entre dispositivos e resolvido por `updatedAt` de budget e entry, com recalculo canonico dos agregados do budget;
- contas de orcamento nao aparecem por padrao no resumo financeiro geral;
- nenhuma funcionalidade nova relevante e introduzida alem da persistencia, sync e integracao controlada com o core financeiro.

## Proxima Fase, se o MVP funcionar

Se a feature provar valor, a fase seguinte pode:

- expor CRUD REST mais granular;
- reaproveitar o mesmo dominio em web;
- criar UX web propria para budgets dentro do Zenit Cash;
- tornar configuravel a visibilidade das contas de budget no ecossistema financeiro;
- evoluir a integracao entre budget e core financeiro sem perder a separacao de dominio;
- introduzir relatorios e automacoes.

## Recomendacao Final

Para reativar rapido com risco controlado, o melhor caminho e:

1. manter o app local-first e sem login obrigatorio para uso basico;
2. remover Firebase;
3. manter a regra atual no Flutter;
4. sincronizar `Budget` e `BudgetEntry` com o backend Zenit;
5. provisionar uma workspace pessoal invisivel no primeiro sync;
6. criar uma `FinancialAccount` por budget e materializar apenas as transacoes financeiras aplicaveis;
7. adiar uma absorcao mais profunda pelo core financeiro para depois da validacao do uso.

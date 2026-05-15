# Especificacao Tecnica Minima - Reativacao do App Mobile de Orcamento

## Objetivo

Reativar o app legado em `zenit/mobile` sem ampliar o escopo funcional do produto neste primeiro passo.

O objetivo do MVP e:

- manter a experiencia atual do app de orcamento diario;
- substituir autenticacao e sincronizacao baseadas em Firebase;
- persistir os dados no backend do ecossistema Zenit;
- preservar suporte a uso local/offline com Hive;
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

O menor caminho para reativar o app nao e modelar agora um novo modulo financeiro completo.

O menor caminho e:

1. manter as regras de negocio atuais no Flutter;
2. trocar Firebase por autenticacao Zenit;
3. sincronizar um snapshot do estado do app com o backend;
4. deixar normalizacao de dominio para uma fase posterior, se a feature crescer.

## Decisoes do MVP

### Decisao 1: Manter Hive

Hive continua como cache local e suporte offline.

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

Cada snapshot de orcamento sera isolado por:

- `userId`;
- `companyId`.

Isso significa:

- o dado nao sera compartilhado com outros usuarios;
- o mesmo usuario pode ter snapshots diferentes por empresa;
- o backend continua aderente ao modelo multi-tenant atual.

### Decisao 5: Backend armazena snapshot, nao recalcula regra

Neste MVP, o backend nao deve recalcular:

- saldo;
- orcamento diario;
- saldo extra;
- mensagens amigaveis;
- previsao de amanha.

Tudo isso continua sendo calculado no mobile como hoje.

O backend armazena e devolve o estado consolidado enviado pelo app.

## Fora de Escopo Agora

- transformar o orcamento diario em `FinancialAccount` ou `FinancialTransaction`;
- compartilhar orcamentos entre usuarios;
- edicao colaborativa;
- dashboard web desta feature;
- reconciliacao com contas financeiras do Zenit Cash;
- analytics complexos;
- push notifications;
- sincronizacao em tempo real por websocket;
- merge fino por movimentacao.

## Arquitetura Recomendada

## Visao Geral

```text
Flutter app
  -> Hive local
  -> Zenit Auth API
  -> Zenit Budget Sync API

Zenit Backend
  -> auth existente
  -> tenant middleware existente
  -> app access middleware existente
  -> tabela unica de snapshot por usuario/empresa
```

## Modelo de Persistencia no Backend

### Abordagem recomendada

Criar uma tabela unica para armazenar o snapshot completo do app por usuario/empresa.

### Modelo Prisma sugerido

```prisma
model CashMobileBudgetState {
  id            Int      @id @default(autoincrement())
  companyId     Int
  userId        Int
  schemaVersion Int      @default(1)
  payload       Json
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([companyId, userId])
  @@index([userId])
}
```

### Motivo dessa escolha

Essa abordagem:

- preserva o modelo atual do app quase sem mudanca estrutural;
- reduz drasticamente o numero de entidades novas no backend;
- permite reativar rapido;
- evita acoplamento prematuro com o dominio financeiro principal;
- deixa espaco para normalizacao futura, se a feature provar valor.

## Formato do Snapshot

O payload deve espelhar o estado relevante atual do Hive.

### Estrutura de alto nivel

```json
{
  "schemaVersion": 1,
  "budgets": [
    {
      "id": "1716037850000",
      "codigo": "Viagem",
      "tipo": "gasto",
      "status": "ativo",
      "isTrabalho": true,
      "valorInicial": 1000.0,
      "saldoAtual": 820.0,
      "saldoFinalDesejado": 100.0,
      "saldoExtraDoDia": 40.0,
      "orcamentoDiarioInicial": 90.0,
      "orcamentoDiarioAtual": 76.5,
      "dataInicio": "2026-05-15T00:00:00.000Z",
      "dataFinal": "2026-05-25T00:00:00.000Z",
      "dataOrcamentoDiarioAtual": "2026-05-15T00:00:00.000Z",
      "updatedAt": "2026-05-15T14:10:00.000Z",
      "movimentacoes": [
        {
          "id": "1716037900000",
          "data": "2026-05-15T00:00:00.000Z",
          "valor": 35.0,
          "tipo": "saida",
          "descricao": "Almoco",
          "createdAt": "2026-05-15T14:11:00.000Z",
          "updatedAt": "2026-05-15T14:11:00.000Z"
        }
      ]
    }
  ]
}
```

### Regras do payload

- `id` do orcamento continua sendo string no MVP;
- `id` da movimentacao continua sendo string no MVP;
- `updatedAt` do orcamento passa a ser obrigatorio em toda mutacao local;
- `movimentacoes` sobem completas, nao apenas os IDs;
- `schemaVersion` permite evolucao futura do formato.

## Estrategia de Sincronizacao

### Unidade de merge

O merge sera por `orcamento`, nao por `movimentacao`.

Cada orcamento sera tratado como um snapshot atomico:

- se o `updatedAt` local do orcamento for mais novo, vence o local;
- se o `updatedAt` remoto for mais novo, vence o remoto;
- em empate, vence o remoto.

### Motivo

Isso reduz muito a complexidade do MVP e continua coerente com o jeito atual do app, onde qualquer alteracao pratica e feita sobre o objeto `Orcamento` inteiro.

### Fluxo recomendado

#### Primeiro login em um aparelho com dados locais

1. usuario autentica no Zenit;
2. app busca snapshot remoto da empresa ativa;
3. se nao houver snapshot remoto, envia o snapshot local inteiro;
4. se houver snapshot remoto, backend faz merge por `orcamento.updatedAt`;
5. backend devolve snapshot consolidado;
6. app substitui o estado local pelo consolidado.

#### Logins seguintes

1. app carrega Hive;
2. autentica/renova sessao;
3. puxa snapshot remoto;
4. chama sync com estado local atual;
5. recebe snapshot consolidado;
6. regrava Hive com a resposta.

#### Mutacoes locais

Sempre que o usuario:

- cria orcamento;
- registra movimentacao;
- arquiva;
- reativa;
- exclui logicamente;
- define `isTrabalho`;
- recalcula o orcamento diario;

o app deve:

1. atualizar o estado local;
2. atualizar `updatedAt` do orcamento afetado;
3. marcar estado como pendente de sync;
4. disparar sync em background com debounce.

### Tratamento de conflitos

No MVP:

- nao havera tela de resolucao manual de conflitos;
- nao havera merge por campo;
- o backend apenas aplica merge por timestamp do orcamento.

## API Proposta

### Headers obrigatorios

Todas as chamadas autenticadas devem usar:

- `Authorization: Bearer <token>`;
- `X-Company-Id: <companyId>`;
- `X-App-Key: zenit-cash`.

### Endpoints do MVP

#### 1. Buscar snapshot atual

```http
GET /api/cash/mobile-budget-state
```

Response:

```json
{
  "schemaVersion": 1,
  "budgets": [],
  "serverUpdatedAt": "2026-05-15T14:00:00.000Z"
}
```

#### 2. Sincronizar snapshot

```http
PUT /api/cash/mobile-budget-state
```

Payload:

```json
{
  "schemaVersion": 1,
  "budgets": []
}
```

Response:

```json
{
  "schemaVersion": 1,
  "budgets": [],
  "serverUpdatedAt": "2026-05-15T14:05:00.000Z"
}
```

### Comportamento do endpoint de sync

O endpoint deve:

1. carregar snapshot remoto do `userId + companyId`;
2. validar shape do payload;
3. mergear remoto e local por `orcamento.id`;
4. persistir o snapshot consolidado;
5. devolver o snapshot consolidado.

### Validacoes minimas do backend

- `schemaVersion` obrigatoria;
- `budgets` obrigatorio;
- `id` do orcamento obrigatorio;
- `updatedAt` do orcamento obrigatorio;
- `movimentacoes` deve ser array;
- cada movimentacao deve ter `id`, `tipo`, `valor`, `data`, `createdAt`, `updatedAt`;
- nao aceitar payload maior que limite razoavel;
- permitir apenas usuario autenticado na empresa ativa.

## Regras de Dominio Mantidas no Mobile

Estas regras devem continuar no Flutter no MVP:

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

Substituir FirebaseAuth por cliente HTTP para o backend Zenit:

- login via `/api/auth/login`;
- refresh via `/api/auth/refresh`;
- bootstrap de sessao via `/api/auth/me`.

#### 2. Selecao de empresa

O mobile deve seguir a mesma regra do web `zenit-cash`:

- escolher uma `companyId` com acesso ao app `zenit-cash`;
- persistir a empresa ativa localmente;
- enviar `X-Company-Id` em todas as chamadas autenticadas.

#### 3. Servico de sincronizacao

Criar um `BudgetSyncService` com responsabilidades:

- serializar Hive para payload JSON;
- chamar `GET /api/cash/mobile-budget-state`;
- chamar `PUT /api/cash/mobile-budget-state`;
- aplicar merge local/remoto quando necessario;
- sobrescrever Hive com o snapshot consolidado;
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
- acao manual de sincronizar agora.

### Mudancas de UX recomendadas

- remover opcao de cadastro local/Firebase no login;
- mostrar loading de sync no bootstrap;
- se o usuario nao tiver acesso a nenhuma empresa com `zenit-cash`, exibir mensagem clara;
- se houver falha de rede, manter app funcional localmente e avisar que a sincronizacao ficou pendente.

## Implementacao Backend

### Arquivos sugeridos

- `backend/prisma/schema.prisma`
- `backend/src/services/cash-mobile-budget-state.service.ts`
- `backend/src/controllers/cash-mobile-budget-state.controller.ts`
- `backend/src/validators/cash-mobile-budget-state.validator.ts`
- `backend/src/routes/cash-mobile-budget-state.routes.ts`
- `backend/src/app.ts`

### Service sugerido

```ts
export default class CashMobileBudgetStateService {
  static async getState(companyId: number, userId: number): Promise<MobileBudgetStateResponse>
  static async syncState(params: {
    companyId: number
    userId: number
    schemaVersion: number
    budgets: MobileBudget[]
  }): Promise<MobileBudgetStateResponse>
}
```

### Regras do service

- um snapshot por usuario/empresa;
- merge por `orcamento.id`;
- comparacao por `updatedAt`;
- persistencia do snapshot consolidado;
- logs de sucesso e erro com `userId`, `companyId` e quantidade de orcamentos.

## Seguranca e Isolamento

O backend deve garantir:

- um usuario so enxerga o proprio snapshot;
- um usuario nao enxerga snapshot de outra empresa;
- somente usuarios com grant de `zenit-cash` conseguem usar o endpoint;
- o endpoint nao depende de permissao administrativa.

## Migracao e Compatibilidade

### Dados locais existentes

O app ja possui dados Hive em aparelhos antigos.

No primeiro sync autenticado:

- esses dados devem ser tratados como a base local inicial;
- o backend passa a ser populado a partir deles;
- o ID legado string do orcamento deve ser preservado para evitar duplicacao.

### Compatibilidade do schema local

Como o modelo Hive principal pode ser preservado, a reativacao nao precisa de uma migracao destrutiva do armazenamento local neste primeiro passo.

## Testes Minimos

### Backend

- login + acesso ao endpoint com `X-App-Key: zenit-cash`;
- bloqueio sem `X-Company-Id`;
- bloqueio para empresa sem pertencimento;
- retorno vazio quando nao houver snapshot;
- criacao do snapshot no primeiro sync;
- merge local/remoto por `updatedAt`;
- isolamento entre dois usuarios da mesma empresa;
- isolamento entre empresas do mesmo usuario.

### Mobile

- login com backend Zenit;
- bootstrap sem internet com Hive local;
- bootstrap com internet e pull remoto;
- sync apos criar orcamento;
- sync apos registrar movimentacao;
- sync apos arquivar/reativar/excluir;
- persistencia correta de `isTrabalho`;
- exibicao de status de sync no drawer.

## Criterios de Aceite do MVP

- app abre e continua funcionando com Hive local;
- usuario consegue autenticar com conta Zenit;
- usuario opera dentro de uma empresa valida do `zenit-cash`;
- dados deixam de depender de Firebase;
- dados deixam de ficar apenas locais;
- criar/editar/movimentar orcamento dispara sincronizacao com backend Zenit;
- ao reinstalar ou abrir em outro aparelho, o usuario recupera seu snapshot;
- conflito simples entre dispositivos e resolvido por `updatedAt` do orcamento;
- nenhuma funcionalidade nova relevante e introduzida alem da persistencia e sync.

## Proxima Fase, se o MVP funcionar

Se a feature provar valor, a fase seguinte pode:

- normalizar `orcamento` e `movimentacao` em tabelas proprias;
- expor CRUD REST mais granular;
- reaproveitar o mesmo dominio em web;
- conectar o orcamento diario a contas financeiras do Zenit Cash;
- introduzir relatorios e automacoes.

## Recomendacao Final

Para reativar rapido com risco controlado, o melhor caminho e:

1. remover Firebase;
2. manter a regra atual no Flutter;
3. sincronizar snapshot completo com o backend Zenit;
4. tratar essa feature como dado privado por usuario/empresa;
5. adiar modelagem financeira mais profunda para depois da validacao do uso.

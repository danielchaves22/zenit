# Zenit Mobile Budget App

App Flutter `local-first` do ecossistema Zenit para controle de orcamento diario pessoal.

O objetivo deste app e ser rapido, simples e util mesmo sem login. O usuario pode abrir, criar um orcamento e usar normalmente offline. Quando quiser backup e sincronizacao, entra com a conta Zenit e o app passa a sincronizar com uma workspace pessoal invisivel dentro do Cash.

## Proposta do Produto

Este nao e um mini Zenit Cash. O app continua propositalmente estreito:

- criar um orcamento diario do tipo `gasto` ou `economia`;
- acompanhar quanto pode gastar ou guardar no dia;
- registrar entradas e saidas com o menor atrito possivel;
- recalcular o orcamento diario ao longo do periodo;
- manter um unico `orcamento de trabalho`;
- continuar funcionando offline.

## O que foi implementado nesta reativacao

- remocao da dependencia funcional de Firebase;
- bootstrap local com Hive e migracao de dados legados;
- migracao monetaria de `double` para `int` em centavos;
- separacao entre `businessDate` e timestamps reais de criacao/atualizacao;
- IDs estaveis baseados em UUID para novos orcamentos e movimentacoes;
- `BudgetRepository`, `BudgetService`, `AuthService`, `SyncService`, `ClockService` e `AppConfig`;
- login opcional para sincronizacao via backend Zenit;
- sync automatico com debounce e retry manual;
- drawer/configuracoes com estado real de sincronizacao;
- Hive mantido como armazenamento principal offline.

## Fluxo do App

1. `main.dart` inicializa configuracao, Hive, servicos e migracoes.
2. `EntryPoint` decide a navegacao inicial a partir do estado local.
3. Se existir um `orcamento de trabalho` ativo, o app abre direto no resumo dele.
4. Caso contrario, abre na lista de orcamentos.
5. Toda mutacao grava primeiro no Hive.
6. Se houver sessao Zenit, o sync e agendado em background.
7. Sem sessao, o app segue em `guest/local only`.

## Arquitetura

### Dominio local

- `lib/models/orcamento.dart`
- `lib/models/movimentacao.dart`
- `lib/models/tipo_distribuicao_entrada.dart`

O dominio continua em PT-BR no mobile. Os valores monetarios sao armazenados em centavos e os adapters Hive leem tanto o formato novo quanto o legado.

### Servicos

- `lib/services/app_services.dart`
  inicializacao central do app
- `lib/services/app_config.dart`
  configuracao de ambiente
- `lib/services/clock_service.dart`
  data de negocio e timestamps reais
- `lib/services/id_service.dart`
  geracao de IDs estaveis
- `lib/services/budget_repository.dart`
  persistencia local em Hive
- `lib/services/mobile_migration_service.dart`
  saneamento/migracao de dados legados
- `lib/services/budget_service.dart`
  regra de negocio e mutacoes do dominio
- `lib/services/auth_service.dart`
  sessao Zenit e workspace pessoal
- `lib/services/sync_service.dart`
  push/pull do dominio com o backend
- `lib/services/app_state_store.dart`
  metadados locais de sync

### Interface

- `lib/pages/lista_orcamentos_page.dart`
- `lib/pages/resumo_orcamento_page.dart`
- `lib/pages/criar_orcamento_page.dart`
- `lib/pages/registrar_movimentacao_page.dart`
- `lib/pages/lista_orcamentos_inativos_page.dart`
- `lib/pages/configuracoes_page.dart`
- `lib/pages/login_page.dart`
- `lib/widgets/app_drawer.dart`

## Persistencia local

O app usa Hive para:

- orcamentos e movimentacoes;
- metadados operacionais de sincronizacao;
- comportamento offline padrao.

Os adapters foram ajustados para:

- converter valores monetarios antigos (`double`) para centavos;
- preservar historico local;
- adicionar metadados necessarios para sync.

## Autenticacao e sincronizacao

### Uso sem login

O app abre e funciona integralmente sem autenticacao.

### Uso com login

Ao entrar para sincronizar:

- o app autentica em `/api/auth/login` com `X-App-Key: zenit-cash`;
- resolve a workspace pessoal em `/api/cash/personal-workspace`;
- passa a sincronizar com `/api/cash/budgets/sync`;
- continua salvando tudo localmente primeiro.

### Estados de sync

O app expoe estes estados:

- `localOnly`
- `pending`
- `syncing`
- `synced`
- `error`

Esses estados aparecem no drawer e em configuracoes.

## Configuracao de ambiente

O app carrega `.env` com `flutter_dotenv`.

Exemplo minimo:

```env
API_BASE_URL=http://localhost:3000
MODO_DEV=false
DATA_SIMULADA=
```

Campos:

- `API_BASE_URL`
  base da API do backend Zenit
- `MODO_DEV`
  habilita data simulada
- `DATA_SIMULADA`
  data `YYYY-MM-DD` usada como `businessDate` em modo dev

## Dependencias principais

- Flutter
- Hive
- `flutter_dotenv`
- `intl`
- `flutter_speed_dial`
- `http`
- `uuid`
- `flutter_secure_storage`

## Como rodar

Pre-requisitos:

- Flutter SDK instalado e configurado no PATH;
- toolchain Android e/ou iOS;
- backend Zenit rodando localmente, se quiser validar auth/sync.

Comandos:

```bash
flutter pub get
flutter run
```

## Testes e limitacoes

O ambiente atual desta thread nao tem Flutter SDK instalado, entao eu nao consegui rodar `flutter analyze` ou `flutter test` aqui.

O arquivo `test/widget_test.dart` foi reduzido a um placeholder. O ideal agora e cobrir:

- migracao local de Hive;
- criacao de orcamento;
- registro de movimentacao com impacto em saldo principal vs extra;
- recalc diario;
- serializacao para sync;
- reconciliacao de conflitos.

## Backend esperado

Este app conversa com o dominio backend descrito em:

- `../docs/cash/mobile/budget-reactivation-mvp.md`

Hoje o contrato esperado inclui:

- `GET /api/cash/personal-workspace`
- `GET /api/cash/budgets`
- `PUT /api/cash/budgets/sync`

## Direcao futura

O objetivo desta base nao e crescer em complexidade financeira geral. A prioridade e:

- manter a experiencia rapida;
- preservar o offline;
- sincronizar sem friccao;
- integrar ao ecossistema Zenit sem perder a leveza original do app.

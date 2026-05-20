import 'dart:io';

import 'package:hive/hive.dart';
import 'package:http/http.dart' as http;
import 'package:orcamento_app/models/movimentacao.dart';
import 'package:orcamento_app/models/orcamento.dart';
import 'package:orcamento_app/services/app_config.dart';
import 'package:orcamento_app/services/app_state_store.dart';
import 'package:orcamento_app/services/auth_service.dart';
import 'package:orcamento_app/services/budget_repository.dart';
import 'package:orcamento_app/services/budget_service.dart';
import 'package:orcamento_app/services/clock_service.dart';
import 'package:orcamento_app/services/mobile_migration_service.dart';
import 'package:orcamento_app/services/sync_service.dart';
import 'package:flutter_test/flutter_test.dart';

bool _initialized = false;
bool _appConfigLoaded = false;
late Directory _hiveDirectory;
int _boxCounter = 0;

Future<void> ensureTestEnvironment() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  if (!_appConfigLoaded) {
    await AppConfig.instance.load();
    _appConfigLoaded = true;
  }

  await ClockService.instance.initialize(localTimeZoneOverride: 'UTC');

  if (_initialized) {
    return;
  }

  _hiveDirectory = await Directory.systemTemp.createTemp('orcamento_app_tests_');
  Hive.init(_hiveDirectory.path);

  if (!Hive.isAdapterRegistered(0)) {
    Hive.registerAdapter(OrcamentoAdapter());
  }
  if (!Hive.isAdapterRegistered(1)) {
    Hive.registerAdapter(TipoMovimentacaoAdapter());
  }
  if (!Hive.isAdapterRegistered(2)) {
    Hive.registerAdapter(MovimentacaoAdapter());
  }
  if (!Hive.isAdapterRegistered(3)) {
    Hive.registerAdapter(TipoOrcamentoAdapter());
  }
  if (!Hive.isAdapterRegistered(4)) {
    Hive.registerAdapter(StatusOrcamentoAdapter());
  }

  _initialized = true;
}

class TestContext {
  TestContext({
    required this.budgetBox,
    required this.appStateBox,
    required this.appStateStore,
    required this.repository,
    required this.authService,
    required this.syncService,
    required this.budgetService,
    required this.migrationService,
  });

  final Box<Orcamento> budgetBox;
  final Box<dynamic> appStateBox;
  final AppStateStore appStateStore;
  final BudgetRepository repository;
  final AuthService authService;
  final SyncService syncService;
  final BudgetService budgetService;
  final MobileMigrationService migrationService;

  Future<void> dispose() async {
    final budgetBoxName = budgetBox.name;
    final appStateBoxName = appStateBox.name;

    await Future<void>.delayed(const Duration(milliseconds: 25));
    await budgetBox.close();
    await appStateBox.close();
    await Hive.deleteBoxFromDisk(budgetBoxName);
    await Hive.deleteBoxFromDisk(appStateBoxName);
  }
}

Future<TestContext> createTestContext({
  http.Client? httpClient,
  AuthSession? session,
}) async {
  await ensureTestEnvironment();

  final suffix = _boxCounter++;
  final budgetBox = await Hive.openBox<Orcamento>('orcamentos_test_$suffix');
  final appStateBox = await Hive.openBox<dynamic>('app_state_test_$suffix');
  final repository = BudgetRepository(budgetBox);
  final appStateStore = AppStateStore(appStateBox);
  final authService = AuthService(
    apiBaseUrl: 'http://localhost:3000',
    httpClient: httpClient,
  );

  if (session != null) {
    authService.sessionListenable.value = session;
  }

  final syncService = SyncService(
    repository: repository,
    authService: authService,
    appStateStore: appStateStore,
    apiBaseUrl: 'http://localhost:3000',
    httpClient: httpClient,
  );

  return TestContext(
    budgetBox: budgetBox,
    appStateBox: appStateBox,
    appStateStore: appStateStore,
    repository: repository,
    authService: authService,
    syncService: syncService,
    budgetService: BudgetService(
      repository: repository,
      syncService: syncService,
    ),
    migrationService: MobileMigrationService(repository),
  );
}

DateTime businessToday() => ClockService.instance.businessDate;

Orcamento buildOrcamento({
  String id = 'budget-1',
  String codigo = 'ORC-1',
  TipoOrcamento tipo = TipoOrcamento.gasto,
  StatusOrcamento status = StatusOrcamento.ativo,
  int valorInicialEmCentavos = 10000,
  int saldoAtualEmCentavos = 10000,
  int saldoFinalDesejadoEmCentavos = 0,
  int orcamentoDiarioInicialEmCentavos = 2000,
  int orcamentoDiarioAtualEmCentavos = 2000,
  int saldoExtraDoDiaEmCentavos = 0,
  DateTime? dataInicio,
  DateTime? dataFinal,
  DateTime? dataOrcamentoDiarioAtual,
  DateTime? createdAt,
  DateTime? updatedAt,
  List<Movimentacao>? movimentacoes,
  bool isTrabalho = true,
}) {
  final today = businessToday();
  final created = createdAt ?? DateTime.utc(2025, 1, 1, 12);

  return Orcamento(
    id: id,
    codigo: codigo,
    valorInicialEmCentavos: valorInicialEmCentavos,
    saldoAtualEmCentavos: saldoAtualEmCentavos,
    dataFinal: dataFinal ?? today.add(const Duration(days: 4)),
    saldoFinalDesejadoEmCentavos: saldoFinalDesejadoEmCentavos,
    movimentacoes: movimentacoes ?? <Movimentacao>[],
    orcamentoDiarioInicialEmCentavos: orcamentoDiarioInicialEmCentavos,
    orcamentoDiarioAtualEmCentavos: orcamentoDiarioAtualEmCentavos,
    dataInicio: dataInicio ?? today,
    tipo: tipo,
    dataOrcamentoDiarioAtual: dataOrcamentoDiarioAtual ?? today,
    isTrabalho: isTrabalho,
    status: status,
    saldoExtraDoDiaEmCentavos: saldoExtraDoDiaEmCentavos,
    createdAt: created,
    updatedAt: updatedAt ?? created,
  );
}

Movimentacao buildMovimentacao({
  String id = 'entry-1',
  DateTime? data,
  int valorEmCentavos = 1000,
  TipoMovimentacao tipo = TipoMovimentacao.entrada,
  String? descricao,
  DateTime? createdAt,
  DateTime? updatedAt,
  int? impactoSaldoPrincipalEmCentavos,
}) {
  final created = createdAt ?? DateTime.utc(2025, 1, 1, 12);

  return Movimentacao(
    id: id,
    data: data ?? businessToday(),
    valorEmCentavos: valorEmCentavos,
    tipo: tipo,
    descricao: descricao,
    createdAt: created,
    updatedAt: updatedAt ?? created,
    impactoSaldoPrincipalEmCentavos: impactoSaldoPrincipalEmCentavos,
  );
}

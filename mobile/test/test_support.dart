import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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
import 'package:orcamento_app/services/scope_service.dart';
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
    required this.scopeBoxNames,
    required this.appStateStore,
    required this.repository,
    required this.authService,
    required this.syncService,
    required this.budgetService,
    required this.migrationService,
    required this.scopeService,
  });

  final Box<Orcamento> budgetBox;
  final Box<dynamic> appStateBox;
  final List<String> scopeBoxNames;
  final AppStateStore appStateStore;
  final BudgetRepository repository;
  final AuthService authService;
  final SyncService syncService;
  final BudgetService budgetService;
  final MobileMigrationService migrationService;
  final ScopeService scopeService;

  Future<void> dispose() async {
    final budgetBoxName = budgetBox.name;
    final appStateBoxName = appStateBox.name;

    syncService.dispose();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    await budgetBox.close();
    await appStateBox.close();
    for (final scopeBoxName in scopeBoxNames) {
      if (Hive.isBoxOpen(scopeBoxName)) {
        await Hive.box<Orcamento>(scopeBoxName).close();
      }
      await Hive.deleteBoxFromDisk(scopeBoxName);
    }
    await Hive.deleteBoxFromDisk(budgetBoxName);
    await Hive.deleteBoxFromDisk(appStateBoxName);
  }
}

Future<TestContext> createTestContext({
  http.Client? httpClient,
  AuthSession? session,
  ActiveCloudTarget? activeTarget,
}) async {
  await ensureTestEnvironment();

  final suffix = _boxCounter++;
  final budgetBox = await Hive.openBox<Orcamento>('orcamentos_test_$suffix');
  final appStateBox = await Hive.openBox<dynamic>('app_state_test_$suffix');
  final scopedBoxNames = <String>[];
  final repository = BudgetRepository(
    budgetBox,
    boxOpener: (boxName) async {
      final scopedName = '${boxName}_test_$suffix';
      if (!scopedBoxNames.contains(scopedName)) {
        scopedBoxNames.add(scopedName);
      }
      return Hive.openBox<Orcamento>(scopedName);
    },
  );
  final appStateStore = AppStateStore(appStateBox);
  final authService = AuthService(
    apiBaseUrl: 'http://localhost:3000',
    httpClient: httpClient,
    secureStorage: FakeSecureStorage(),
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
  final migrationService = MobileMigrationService(repository);
  final budgetService = BudgetService(
    repository: repository,
    syncService: syncService,
  );
  final scopeService = ScopeService(
    repository: repository,
    authService: authService,
    appStateStore: appStateStore,
    syncService: syncService,
    budgetService: budgetService,
    migrationService: migrationService,
  );

  if (activeTarget != null) {
    authService.activeTargetListenable.value = activeTarget;
  }

  return TestContext(
    budgetBox: budgetBox,
    appStateBox: appStateBox,
    scopeBoxNames: scopedBoxNames,
    appStateStore: appStateStore,
    repository: repository,
    authService: authService,
    syncService: syncService,
    budgetService: budgetService,
    migrationService: migrationService,
    scopeService: scopeService,
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

class FakeSecureStorage extends FlutterSecureStorage {
  FakeSecureStorage();

  final Map<String, String> _values = <String, String>{};

  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value == null) {
      _values.remove(key);
      return;
    }
    _values[key] = value;
  }

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    return _values[key];
  }

  @override
  Future<void> delete({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    _values.remove(key);
  }

  @override
  Future<void> deleteAll({
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    _values.clear();
  }
}

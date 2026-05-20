import 'package:hive_flutter/hive_flutter.dart';

import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import '../models/tipo_distribuicao_entrada.dart';
import 'app_config.dart';
import 'app_state_store.dart';
import 'auth_service.dart';
import 'budget_repository.dart';
import 'budget_service.dart';
import 'clock_service.dart';
import 'mobile_migration_service.dart';
import 'scope_service.dart';
import 'sync_service.dart';

class AppServices {
  AppServices._();

  static late final BudgetRepository budgetRepository;
  static late final AppStateStore appStateStore;
  static late final AuthService authService;
  static late final SyncService syncService;
  static late final BudgetService budgetService;
  static late final MobileMigrationService migrationService;
  static late final ScopeService scopeService;

  static Future<void> initialize() async {
    await AppConfig.instance.load();
    await ClockService.instance.initialize();
    await Hive.initFlutter();

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
    if (!Hive.isAdapterRegistered(5)) {
      Hive.registerAdapter(TipoDistribuicaoEntradaAdapter());
    }

    final budgetBox = await Hive.openBox<Orcamento>('orcamentos');
    final appStateBox = await Hive.openBox<dynamic>(AppStateStore.boxName);

    budgetRepository = BudgetRepository(budgetBox);
    appStateStore = AppStateStore(appStateBox);
    authService = AuthService(apiBaseUrl: AppConfig.instance.apiBaseUrl);
    syncService = SyncService(
      repository: budgetRepository,
      authService: authService,
      appStateStore: appStateStore,
      apiBaseUrl: AppConfig.instance.apiBaseUrl,
    );
    budgetService = BudgetService(
      repository: budgetRepository,
      syncService: syncService,
    );
    migrationService = MobileMigrationService(budgetRepository);
    scopeService = ScopeService(
      repository: budgetRepository,
      authService: authService,
      appStateStore: appStateStore,
      syncService: syncService,
      budgetService: budgetService,
      migrationService: migrationService,
    );

    await authService.restoreSession();
    await scopeService.initialize();
  }
}

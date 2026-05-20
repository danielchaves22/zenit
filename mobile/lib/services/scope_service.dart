import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import 'app_state_store.dart';
import 'auth_service.dart';
import 'budget_repository.dart';
import 'budget_service.dart';
import 'local_scope.dart';
import 'mobile_migration_service.dart';
import 'sync_service.dart';
import 'sync_state.dart';

class ScopeService {
  ScopeService({
    required BudgetRepository repository,
    required AuthService authService,
    required AppStateStore appStateStore,
    required SyncService syncService,
    required BudgetService budgetService,
    required MobileMigrationService migrationService,
  })  : _repository = repository,
        _authService = authService,
        _appStateStore = appStateStore,
        _syncService = syncService,
        _budgetService = budgetService,
        _migrationService = migrationService;

  final BudgetRepository _repository;
  final AuthService _authService;
  final AppStateStore _appStateStore;
  final SyncService _syncService;
  final BudgetService _budgetService;
  final MobileMigrationService _migrationService;

  String get currentScopeId => _repository.currentScopeId;

  Future<void> initialize() async {
    await _syncService.initialize();

    if (!_authService.isAuthenticated) {
      await _enterGuestMode();
      return;
    }

    final target = _authService.currentTarget;
    if (target == null) {
      await _enterGuestMode();
      await _syncService.syncAllPendingScopes();
      return;
    }

    await activateTarget(target, allowGuestPromotion: false);
  }

  Future<bool> selectExistingCompany(String companyId) async {
    final target = await _authService.selectExistingCompany(companyId: companyId);
    return activateTarget(target);
  }

  Future<bool> selectPersonalWorkspace() async {
    final target = await _authService.resolvePersonalWorkspaceTarget();
    return activateTarget(target);
  }

  Future<bool> activateTarget(
    ActiveCloudTarget target, {
    bool allowGuestPromotion = true,
  }) async {
    final session = _authService.currentSession;
    if (session == null) {
      throw Exception('Sessao nao encontrada');
    }

    final scopeId = LocalScopeId.company(
      userId: session.userId,
      companyId: target.companyId,
    );

    await _prepareGuestPromotionIfNeeded(
      scopeId: scopeId,
      allowGuestPromotion: allowGuestPromotion,
    );
    await _authService.setActiveTarget(target);
    await _syncService.switchScope(scopeId, target: target);
    await _runCurrentScopeMaintenance();

    final requiresReconciliation = await _syncService.runInitialBindingIfNeeded();
    if (!requiresReconciliation) {
      await _syncService.runAuthenticatedSync();
      await _consumeGuestAfterBindingIfNeeded(scopeId);
      await _syncService.syncAllPendingScopes();
    }

    return requiresReconciliation;
  }

  Future<void> useLocalOnly() async {
    await _authService.clearActiveTarget();
    await _enterGuestMode();
    if (_authService.isAuthenticated) {
      await _syncService.syncAllPendingScopes();
    }
  }

  Future<void> completeReconciliationUsingCloud() async {
    await _syncService.adoptRemoteBudgets();
    await _consumeGuestAfterBindingIfNeeded(_syncService.currentScopeId);
    await _syncService.syncAllPendingScopes();
  }

  Future<void> completeReconciliationByImportingLocal() async {
    await _syncService.importLocalBudgetsAsNew();
    await _consumeGuestAfterBindingIfNeeded(_syncService.currentScopeId);
    await _syncService.syncAllPendingScopes();
  }

  Future<void> signOut() async {
    await _authService.signOut();
    await _enterGuestMode();
  }

  Future<void> _enterGuestMode() async {
    await _syncService.switchScope(
      LocalScopeId.guest,
      target: null,
    );
    await _runCurrentScopeMaintenance();
  }

  Future<void> _runCurrentScopeMaintenance() async {
    await _migrationService.run();
    await _budgetService.refreshDailyBudgetsIfNeeded();
  }

  Future<void> _prepareGuestPromotionIfNeeded({
    required String scopeId,
    required bool allowGuestPromotion,
  }) async {
    if (!allowGuestPromotion || !LocalScopeId.isGuest(_repository.currentScopeId)) {
      return;
    }

    final scopeHasBudgets = await _repository.hasAnyBudgetInScope(scopeId);
    if (scopeHasBudgets) {
      return;
    }

    final guestBudgets = await _repository.listBudgetsForScope(LocalScopeId.guest);
    if (guestBudgets.isEmpty) {
      return;
    }

    await _repository.replaceAllInScope(
      scopeId,
      guestBudgets.map(_cloneBudget),
    );
    await _appStateStore.setPendingGuestPromotion(scopeId, true);
  }

  Future<void> _consumeGuestAfterBindingIfNeeded(String scopeId) async {
    if (!_appStateStore.shouldConsumeGuestAfterBinding(scopeId)) {
      return;
    }

    final binding = _appStateStore.loadBindingState(scopeId);
    if (!binding.isBound) {
      return;
    }

    await _repository.clearScope(LocalScopeId.guest);
    await _appStateStore.saveSyncState(
      LocalScopeId.guest,
      const SyncStateSnapshot(
        status: SyncStatus.localOnly,
        hasPendingChanges: false,
      ),
    );
    await _appStateStore.clearBindingState(LocalScopeId.guest);
    await _appStateStore.setPendingGuestPromotion(scopeId, false);
  }

  Orcamento _cloneBudget(Orcamento budget) {
    return Orcamento(
      id: budget.id,
      valorInicialEmCentavos: budget.valorInicialEmCentavos,
      saldoAtualEmCentavos: budget.saldoAtualEmCentavos,
      dataFinal: budget.dataFinal,
      saldoFinalDesejadoEmCentavos: budget.saldoFinalDesejadoEmCentavos,
      movimentacoes: budget.movimentacoes.map(_cloneEntry).toList(),
      orcamentoDiarioInicialEmCentavos: budget.orcamentoDiarioInicialEmCentavos,
      orcamentoDiarioAtualEmCentavos: budget.orcamentoDiarioAtualEmCentavos,
      dataInicio: budget.dataInicio,
      tipo: budget.tipo,
      dataOrcamentoDiarioAtual: budget.dataOrcamentoDiarioAtual,
      codigo: budget.codigo,
      isTrabalho: budget.isTrabalho,
      status: budget.status,
      saldoExtraDoDiaEmCentavos: budget.saldoExtraDoDiaEmCentavos,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    );
  }

  Movimentacao _cloneEntry(Movimentacao entry) {
    return Movimentacao(
      id: entry.id,
      data: entry.data,
      valorEmCentavos: entry.valorEmCentavos,
      tipo: entry.tipo,
      descricao: entry.descricao,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      impactoSaldoPrincipalEmCentavos: entry.impactoSaldoPrincipalEmCentavos,
    );
  }
}

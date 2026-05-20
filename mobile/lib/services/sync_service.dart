import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import '../utils.dart';
import 'app_config.dart';
import 'app_state_store.dart';
import 'auth_service.dart';
import 'binding_state.dart';
import 'budget_repository.dart';
import 'clock_service.dart';
import 'id_service.dart';
import 'local_scope.dart';
import 'sync_state.dart';

class PendingReconciliation {
  const PendingReconciliation({
    required this.scopeId,
    required this.timeZone,
    required this.businessDate,
    required this.localBudgets,
    required this.remoteBudgets,
  });

  final String scopeId;
  final String timeZone;
  final DateTime businessDate;
  final List<Orcamento> localBudgets;
  final List<Orcamento> remoteBudgets;

  int get localBudgetCount => localBudgets.length;
  int get remoteBudgetCount => remoteBudgets.length;

  Orcamento? get localPrimaryBudget => localBudgets.where(_isActivePrimary).firstOrNull;
  Orcamento? get remotePrimaryBudget => remoteBudgets.where(_isActivePrimary).firstOrNull;

  static bool _isActivePrimary(Orcamento budget) {
    return budget.status == StatusOrcamento.ativo && budget.isTrabalho;
  }
}

class SyncService {
  SyncService({
    required BudgetRepository repository,
    required AuthService authService,
    required AppStateStore appStateStore,
    required String apiBaseUrl,
    http.Client? httpClient,
  })  : _repository = repository,
        _authService = authService,
        _appStateStore = appStateStore,
        _apiBaseUrl = apiBaseUrl,
        _httpClient = httpClient ?? http.Client() {
    _authService.sessionListenable.addListener(_handleSessionChanged);
  }

  final BudgetRepository _repository;
  final AuthService _authService;
  final AppStateStore _appStateStore;
  final String _apiBaseUrl;
  final http.Client _httpClient;

  final ValueNotifier<SyncStateSnapshot> stateListenable =
      ValueNotifier<SyncStateSnapshot>(
    const SyncStateSnapshot(status: SyncStatus.localOnly),
  );
  final ValueNotifier<PendingReconciliation?> pendingReconciliationListenable =
      ValueNotifier<PendingReconciliation?>(null);
  final ValueNotifier<int> pendingScopeCountListenable = ValueNotifier<int>(0);

  Timer? _debounceTimer;
  bool _isSyncing = false;
  bool _resyncRequested = false;
  String _currentScopeId = LocalScopeId.guest;
  ActiveCloudTarget? _currentTarget;
  late CloudBindingState _bindingState;

  String get currentScopeId => _currentScopeId;
  CloudBindingState get bindingState => _bindingState;

  bool get hasCurrentTarget => _currentTarget != null;

  bool get isBoundToCurrentSession {
    final session = _authService.currentSession;
    final target = _currentTarget;
    return session != null &&
        target != null &&
        _bindingState.matches(
          userId: session.userId,
          companyId: target.companyId,
        ) &&
        _bindingState.isBound;
  }

  Future<void> initialize() async {
    _appStateStore.ensureInstallationId();
    await switchScope(
      LocalScopeId.guest,
      target: null,
      persistAsActiveScope: false,
    );
    await _refreshPendingScopeCount();
  }

  Future<void> switchScope(
    String scopeId, {
    required ActiveCloudTarget? target,
    bool persistAsActiveScope = true,
  }) async {
    _currentScopeId = scopeId;
    _currentTarget = target;
    await _repository.switchScope(scopeId);
    await _appStateStore.registerScope(scopeId);
    if (persistAsActiveScope) {
      await _appStateStore.saveActiveScopeId(scopeId);
    }

    _bindingState = _appStateStore.loadBindingState(scopeId);
    stateListenable.value = _resolveStateForCurrentScope();
    pendingReconciliationListenable.value = null;

    final scopeTimeZone = _bindingState.timeZone ?? target?.timeZone;
    ClockService.instance.setWorkspaceTimeZone(scopeTimeZone);
    await _refreshPendingScopeCount();
  }

  Future<bool> runInitialBindingIfNeeded() async {
    final session = _authService.currentSession;
    final target = _currentTarget;
    if (session == null || target == null) {
      return false;
    }

    if (_bindingState.matches(
          userId: session.userId,
          companyId: target.companyId,
        ) &&
        _bindingState.hasCompletedInitialReconciliation) {
      ClockService.instance.setWorkspaceTimeZone(
        _bindingState.timeZone ?? target.timeZone,
      );
      return false;
    }

    final remoteSnapshot = await _fetchRemoteSnapshot(target);
    final localBudgets = await _repository.listBudgetsForScope(_currentScopeId);

    ClockService.instance.setWorkspaceTimeZone(remoteSnapshot.timeZone);

    if (localBudgets.isEmpty && remoteSnapshot.budgets.isEmpty) {
      await _markBindingComplete(
        scopeId: _currentScopeId,
        session: session,
        target: target,
        timeZone: remoteSnapshot.timeZone,
        lastPullAt: agoraUtc(),
      );
      await _setCurrentState(
        SyncStateSnapshot(
          status: SyncStatus.synced,
          lastSyncAt: agoraUtc(),
          hasPendingChanges: false,
        ),
      );
      return false;
    }

    if (localBudgets.isEmpty && remoteSnapshot.budgets.isNotEmpty) {
      await _repository.replaceAllInScope(_currentScopeId, remoteSnapshot.budgets);
      await _markBindingComplete(
        scopeId: _currentScopeId,
        session: session,
        target: target,
        timeZone: remoteSnapshot.timeZone,
        lastPullAt: agoraUtc(),
      );
      await _setCurrentState(
        SyncStateSnapshot(
          status: SyncStatus.synced,
          lastSyncAt: agoraUtc(),
          hasPendingChanges: false,
        ),
      );
      return false;
    }

    if (localBudgets.isNotEmpty && remoteSnapshot.budgets.isEmpty) {
      await _pushLocalBudgetsAndHydrate(
        scopeId: _currentScopeId,
        target: target,
        budgets: localBudgets,
        remoteSnapshot: remoteSnapshot,
        session: session,
        recordPull: true,
        updateUi: true,
      );
      return false;
    }

    pendingReconciliationListenable.value = PendingReconciliation(
      scopeId: _currentScopeId,
      timeZone: remoteSnapshot.timeZone,
      businessDate: remoteSnapshot.businessDate,
      localBudgets: localBudgets,
      remoteBudgets: remoteSnapshot.budgets,
    );

    await _setCurrentState(
      stateListenable.value.copyWith(
        status: SyncStatus.reconciliationRequired,
        hasPendingChanges: true,
      ),
    );

    return true;
  }

  Future<void> adoptRemoteBudgets() async {
    final pending = pendingReconciliationListenable.value;
    final session = _authService.currentSession;
    final target = _currentTarget;
    if (pending == null || session == null || target == null) {
      return;
    }

    ClockService.instance.setWorkspaceTimeZone(pending.timeZone);
    await _repository.replaceAllInScope(_currentScopeId, pending.remoteBudgets);
    pendingReconciliationListenable.value = null;
    await _markBindingComplete(
      scopeId: _currentScopeId,
      session: session,
      target: target,
      timeZone: pending.timeZone,
      lastPullAt: agoraUtc(),
    );
    await _setCurrentState(
      SyncStateSnapshot(
        status: SyncStatus.synced,
        lastSyncAt: agoraUtc(),
        hasPendingChanges: false,
      ),
    );
  }

  Future<void> importLocalBudgetsAsNew() async {
    final pending = pendingReconciliationListenable.value;
    final session = _authService.currentSession;
    final target = _currentTarget;
    if (pending == null || session == null || target == null) {
      return;
    }

    ClockService.instance.setWorkspaceTimeZone(pending.timeZone);

    final clonedBudgets = _cloneBudgetsForImport(
      pending.localBudgets,
      remoteHasPrimary: pending.remotePrimaryBudget != null,
    );

    await _pushLocalBudgetsAndHydrate(
      scopeId: _currentScopeId,
      target: target,
      budgets: clonedBudgets,
      remoteSnapshot: _RemoteBudgetSnapshot(
        timeZone: pending.timeZone,
        businessDate: pending.businessDate,
        budgets: pending.remoteBudgets,
      ),
      session: session,
      recordPull: true,
      updateUi: true,
    );

    pendingReconciliationListenable.value = null;
  }

  void scheduleSync({bool immediate = false}) {
    if (!_authService.isAuthenticated) {
      unawaited(
        _setCurrentState(
          stateListenable.value.copyWith(
            status: SyncStatus.localOnly,
            hasPendingChanges: true,
          ),
        ),
      );
      return;
    }

    if (_currentTarget == null) {
      unawaited(
        _setCurrentState(
          stateListenable.value.copyWith(
            status: SyncStatus.localOnly,
            hasPendingChanges: true,
          ),
        ),
      );
      return;
    }

    if (pendingReconciliationListenable.value != null || !isBoundToCurrentSession) {
      unawaited(
        _setCurrentState(
          stateListenable.value.copyWith(
            status: SyncStatus.reconciliationRequired,
            hasPendingChanges: true,
          ),
        ),
      );
      return;
    }

    _debounceTimer?.cancel();
    unawaited(
      _setCurrentState(
        stateListenable.value.copyWith(
          status: SyncStatus.pending,
          hasPendingChanges: true,
          clearLastSyncError: true,
        ),
      ),
    );

    _debounceTimer = Timer(
      immediate ? Duration.zero : const Duration(milliseconds: 800),
      () => syncAllPendingScopes(),
    );
  }

  Future<void> forceSync() async {
    await runAuthenticatedSync();
  }

  Future<void> runAuthenticatedSync() async {
    if (_currentTarget == null) {
      await _setCurrentState(
        stateListenable.value.copyWith(
          status: SyncStatus.localOnly,
          hasPendingChanges: true,
        ),
      );
      return;
    }

    await _runAuthenticatedSyncForScope(
      scopeId: _currentScopeId,
      target: _currentTarget!,
      updateUi: true,
    );
  }

  Future<void> syncAllPendingScopes() async {
    final session = _authService.currentSession;
    if (session == null) {
      return;
    }

    if (_isSyncing) {
      _resyncRequested = true;
      return;
    }

    _isSyncing = true;
    try {
      final knownScopes = _appStateStore.loadKnownScopes();
      final prioritizedScopeIds = <String>[
        if (_currentTarget != null) _currentScopeId,
        ...knownScopes.where((scopeId) => scopeId != _currentScopeId),
      ];

      for (final scopeId in prioritizedScopeIds) {
        if (LocalScopeId.isGuest(scopeId)) {
          continue;
        }

        final binding = _appStateStore.loadBindingState(scopeId);
        final syncState = _appStateStore.loadSyncState(scopeId);
        if (!syncState.hasPendingChanges ||
            !binding.isBound ||
            binding.boundUserId != session.userId ||
            binding.boundCompanyId == null) {
          continue;
        }

        final target = scopeId == _currentScopeId && _currentTarget != null
            ? _currentTarget!
            : ActiveCloudTarget(
                companyId: binding.boundCompanyId!,
                name: 'Empresa',
                timeZone: binding.timeZone,
              );

        await _runAuthenticatedSyncForScope(
          scopeId: scopeId,
          target: target,
          updateUi: scopeId == _currentScopeId,
        );
      }
    } finally {
      _isSyncing = false;
      if (_resyncRequested) {
        _resyncRequested = false;
        scheduleSync(immediate: true);
      }
    }
  }

  Future<void> _runAuthenticatedSyncForScope({
    required String scopeId,
    required ActiveCloudTarget target,
    required bool updateUi,
  }) async {
    final session = _authService.currentSession;
    if (session == null) {
      if (updateUi) {
        await _setCurrentState(
          stateListenable.value.copyWith(
            status: SyncStatus.localOnly,
            hasPendingChanges: true,
          ),
        );
      }
      return;
    }

    final binding = _appStateStore.loadBindingState(scopeId);
    final currentState = _appStateStore.loadSyncState(scopeId);

    if (!binding.matches(
          userId: session.userId,
          companyId: target.companyId,
        ) ||
        !binding.isBound) {
      if (updateUi) {
        pendingReconciliationListenable.value = null;
        _bindingState = binding;
        await _setCurrentState(
          currentState.copyWith(
            status: SyncStatus.reconciliationRequired,
            hasPendingChanges: true,
          ),
        );
      }
      return;
    }

    await _saveScopeState(
      scopeId,
      currentState.copyWith(
        status: SyncStatus.syncing,
        hasPendingChanges: true,
        clearLastSyncError: true,
      ),
      updateUi: updateUi,
    );

    try {
      final remoteSnapshot = await _fetchRemoteSnapshot(target);
      final mergedBudgets = _mergeBudgets(
        localBudgets: await _repository.listBudgetsForScope(scopeId),
        remoteBudgets: remoteSnapshot.budgets,
      );

      await _markBindingComplete(
        scopeId: scopeId,
        session: session,
        target: target,
        timeZone: remoteSnapshot.timeZone,
        lastPullAt: agoraUtc(),
      );

      if (_isSameBudgetSet(
            mergedBudgets,
            remoteSnapshot.budgets,
            timeZone: remoteSnapshot.timeZone,
          ) &&
          !currentState.hasPendingChanges) {
        await _repository.replaceAllInScope(scopeId, remoteSnapshot.budgets);
        await _saveScopeState(
          scopeId,
          SyncStateSnapshot(
            status: SyncStatus.synced,
            lastSyncAt: agoraUtc(),
            hasPendingChanges: false,
          ),
          updateUi: updateUi,
        );
        return;
      }

      final response = await _putBudgets(
        target: target,
        budgets: mergedBudgets,
        timeZone: remoteSnapshot.timeZone,
      );
      await _repository.replaceAllInScope(scopeId, response.budgets);

      final conflictMessage = response.conflicts.isEmpty
          ? null
          : '${response.conflicts.length} alteracao(oes) mais recentes da nuvem foram mantidas.';

      await _markBindingComplete(
        scopeId: scopeId,
        session: session,
        target: target,
        timeZone: response.timeZone,
        lastPullAt: agoraUtc(),
        lastPushAt: agoraUtc(),
      );
      await _saveScopeState(
        scopeId,
        SyncStateSnapshot(
          status: SyncStatus.synced,
          lastSyncAt: agoraUtc(),
          lastSyncError: null,
          hasPendingChanges: false,
          lastConflictMessage: conflictMessage,
        ),
        updateUi: updateUi,
      );
    } catch (error) {
      await _saveScopeState(
        scopeId,
        currentState.copyWith(
          status: SyncStatus.error,
          lastSyncError: error.toString(),
          hasPendingChanges: true,
        ),
        updateUi: updateUi,
      );
    }
  }

  Future<_RemoteBudgetSnapshot> _fetchRemoteSnapshot(ActiveCloudTarget target) async {
    final response = await _authorizedRequest(
      () {
        final session = _authService.currentSession;
        if (session == null) {
          throw Exception('Sessao nao encontrada');
        }

        return _httpClient.get(
          Uri.parse('$_apiBaseUrl/api/cash/budgets'),
          headers: _buildHeaders(session, target.companyId),
        );
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_extractError(response.body, fallback: 'Falha ao carregar budgets'));
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final timeZone = (json['timeZone'] as String?)?.trim();
    final businessDateRaw = json['businessDate'] as String?;
    final rawBudgets = (json['budgets'] as List<dynamic>? ?? const []);

    return _RemoteBudgetSnapshot(
      timeZone: timeZone == null || timeZone.isEmpty
          ? (target.timeZone ?? ClockService.instance.effectiveTimeZone)
          : timeZone,
      businessDate: businessDateRaw == null
          ? ClockService.instance.businessDate
          : ClockService.instance.dateOnlyFromIso(
              businessDateRaw,
              timeZone: timeZone,
            ),
      budgets: _deserializeBudgets(
        rawBudgets,
        timeZone: timeZone,
      ),
    );
  }

  Future<_SyncResponse> _putBudgets({
    required ActiveCloudTarget target,
    required List<Orcamento> budgets,
    required String timeZone,
  }) async {
    final response = await _authorizedRequest(
      () {
        final session = _authService.currentSession;
        if (session == null) {
          throw Exception('Sessao nao encontrada');
        }

        return _httpClient.put(
          Uri.parse('$_apiBaseUrl/api/cash/budgets/sync'),
          headers: _buildHeaders(session, target.companyId),
          body: jsonEncode({
            'deviceId': _bindingState.installationId,
            'budgets': _serializeBudgets(budgets, timeZone: timeZone),
          }),
        );
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_extractError(response.body, fallback: 'Falha ao sincronizar'));
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final responseTimeZone = (json['timeZone'] as String?)?.trim();

    return _SyncResponse(
      timeZone: responseTimeZone == null || responseTimeZone.isEmpty
          ? timeZone
          : responseTimeZone,
      businessDate: json['businessDate'] == null
          ? ClockService.instance.businessDate
          : ClockService.instance.dateOnlyFromIso(
              json['businessDate'] as String,
              timeZone: responseTimeZone,
            ),
      budgets: _deserializeBudgets(
        (json['budgets'] as List<dynamic>? ?? const []),
        timeZone: responseTimeZone,
      ),
      conflicts: (json['conflicts'] as List<dynamic>? ?? const [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList(),
    );
  }

  Future<http.Response> _authorizedRequest(
    Future<http.Response> Function() requestFactory,
  ) async {
    var response = await requestFactory();
    if (response.statusCode != 401) {
      return response;
    }

    final refreshed = await _authService.refreshSession();
    if (!refreshed) {
      return response;
    }

    response = await requestFactory();
    return response;
  }

  Map<String, String> _buildHeaders(AuthSession session, String companyId) {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${session.token}',
      'X-App-Key': AppConfig.cashAppKey,
      'X-Company-Id': companyId,
    };
  }

  List<Map<String, dynamic>> _serializeBudgets(
    List<Orcamento> budgets, {
    required String timeZone,
  }) {
    return budgets.map((orcamento) {
      return {
        'clientKey': orcamento.id,
        'code': orcamento.codigo,
        'kind': orcamento.tipo == TipoOrcamento.gasto ? 'SPENDING' : 'SAVINGS',
        'status': _serializeBudgetStatus(orcamento.status),
        'initialBalanceCents': orcamento.valorInicialEmCentavos,
        'currentBalanceCents': orcamento.saldoAtualEmCentavos,
        'targetEndingBalanceCents': orcamento.saldoFinalDesejadoEmCentavos,
        'dailyBudgetInitialCents': orcamento.orcamentoDiarioInicialEmCentavos,
        'dailyBudgetCurrentCents': orcamento.orcamentoDiarioAtualEmCentavos,
        'dayExtraBalanceCents': orcamento.saldoExtraDoDiaEmCentavos,
        'startDate': ClockService.instance.serializeDateOnly(
          orcamento.dataInicio,
          timeZone: timeZone,
        ),
        'endDate': ClockService.instance.serializeDateOnly(
          orcamento.dataFinal,
          timeZone: timeZone,
        ),
        'lastDailyBudgetDate': ClockService.instance.serializeDateOnly(
          orcamento.dataOrcamentoDiarioAtual,
          timeZone: timeZone,
        ),
        'isPrimary': orcamento.isTrabalho,
        'createdAt': orcamento.createdAt.toUtc().toIso8601String(),
        'updatedAt': orcamento.updatedAt.toUtc().toIso8601String(),
        'entries': orcamento.movimentacoes.map((movimentacao) {
          final principalImpact = _serializePrincipalImpact(movimentacao);
          return {
            'clientKey': movimentacao.id,
            'entryType': _serializeEntryType(movimentacao.tipo),
            'allocationMode': _serializeAllocationMode(movimentacao),
            'amountCents': movimentacao.valorEmCentavos,
            'principalImpactAmountCents': principalImpact,
            'occurredAt': ClockService.instance.serializeDateOnly(
              movimentacao.data,
              timeZone: timeZone,
            ),
            'description': movimentacao.descricao,
            'affectsBudgetBalance': true,
            'createdAt': movimentacao.createdAt.toUtc().toIso8601String(),
            'updatedAt': movimentacao.updatedAt.toUtc().toIso8601String(),
          };
        }).toList(),
      };
    }).toList();
  }

  int _serializePrincipalImpact(Movimentacao movimentacao) {
    if (movimentacao.tipo == TipoMovimentacao.saida) {
      return movimentacao.impactoSaldoPrincipalEmCentavos.abs();
    }
    return movimentacao.impactoSaldoPrincipalEmCentavos;
  }

  String? _serializeAllocationMode(Movimentacao movimentacao) {
    final principalImpactAbs = movimentacao.impactoSaldoPrincipalEmCentavos.abs();

    if (principalImpactAbs == movimentacao.valorEmCentavos) {
      return 'PRINCIPAL';
    }
    if (principalImpactAbs == 0) {
      return 'EXTRA';
    }
    return null;
  }

  String _serializeEntryType(TipoMovimentacao tipo) {
    switch (tipo) {
      case TipoMovimentacao.entrada:
        return 'INCOME';
      case TipoMovimentacao.saida:
        return 'EXPENSE';
      case TipoMovimentacao.ajusteManual:
        return 'MANUAL_ADJUSTMENT';
    }
  }

  String _serializeBudgetStatus(StatusOrcamento status) {
    switch (status) {
      case StatusOrcamento.ativo:
        return 'ACTIVE';
      case StatusOrcamento.arquivado:
        return 'ARCHIVED';
      case StatusOrcamento.expirado:
        return 'EXPIRED';
      case StatusOrcamento.excluido:
        return 'DELETED';
    }
  }

  List<Orcamento> _deserializeBudgets(
    List<dynamic> rawBudgets, {
    String? timeZone,
  }) {
    return rawBudgets.map((rawBudget) {
      final json = rawBudget as Map<String, dynamic>;
      final createdAt = DateTime.parse(json['createdAt'] as String).toUtc();
      final updatedAt = DateTime.parse(json['updatedAt'] as String).toUtc();

      return Orcamento(
        id: json['clientKey'] as String,
        codigo: json['code'] as String,
        valorInicialEmCentavos: json['initialBalanceCents'] as int,
        saldoAtualEmCentavos: json['currentBalanceCents'] as int,
        dataFinal: ClockService.instance.dateOnlyFromIso(
          json['endDate'] as String,
          timeZone: timeZone,
        ),
        saldoFinalDesejadoEmCentavos:
            json['targetEndingBalanceCents'] as int,
        movimentacoes: (json['entries'] as List<dynamic>).map((rawEntry) {
          final entry = rawEntry as Map<String, dynamic>;
          final entryType = entry['entryType'] as String;
          final amountCents = entry['amountCents'] as int;
          final principalImpactAmountCents =
              entry['principalImpactAmountCents'] as int;

          return Movimentacao(
            id: entry['clientKey'] as String,
            data: ClockService.instance.dateOnlyFromIso(
              entry['occurredAt'] as String,
              timeZone: timeZone,
            ),
            valorEmCentavos: amountCents,
            tipo: _deserializeEntryType(entryType),
            descricao: entry['description'] as String?,
            createdAt: DateTime.parse(entry['createdAt'] as String).toUtc(),
            updatedAt: DateTime.parse(entry['updatedAt'] as String).toUtc(),
            impactoSaldoPrincipalEmCentavos: entryType == 'EXPENSE'
                ? -principalImpactAmountCents
                : principalImpactAmountCents,
          );
        }).toList(),
        orcamentoDiarioInicialEmCentavos:
            json['dailyBudgetInitialCents'] as int,
        orcamentoDiarioAtualEmCentavos:
            json['dailyBudgetCurrentCents'] as int,
        dataInicio: ClockService.instance.dateOnlyFromIso(
          json['startDate'] as String,
          timeZone: timeZone,
        ),
        tipo: (json['kind'] as String) == 'SPENDING'
            ? TipoOrcamento.gasto
            : TipoOrcamento.economia,
        dataOrcamentoDiarioAtual: ClockService.instance.dateOnlyFromIso(
          json['lastDailyBudgetDate'] as String,
          timeZone: timeZone,
        ),
        isTrabalho: json['isPrimary'] as bool? ?? false,
        status: _deserializeBudgetStatus(json['status'] as String),
        saldoExtraDoDiaEmCentavos: json['dayExtraBalanceCents'] as int,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );
    }).toList();
  }

  TipoMovimentacao _deserializeEntryType(String rawType) {
    switch (rawType) {
      case 'INCOME':
        return TipoMovimentacao.entrada;
      case 'EXPENSE':
        return TipoMovimentacao.saida;
      default:
        return TipoMovimentacao.ajusteManual;
    }
  }

  StatusOrcamento _deserializeBudgetStatus(String rawStatus) {
    switch (rawStatus) {
      case 'ARCHIVED':
        return StatusOrcamento.arquivado;
      case 'EXPIRED':
        return StatusOrcamento.expirado;
      case 'DELETED':
        return StatusOrcamento.excluido;
      default:
        return StatusOrcamento.ativo;
    }
  }

  List<Orcamento> _mergeBudgets({
    required List<Orcamento> localBudgets,
    required List<Orcamento> remoteBudgets,
  }) {
    final localById = {
      for (final budget in localBudgets) budget.id: budget,
    };
    final remoteById = {
      for (final budget in remoteBudgets) budget.id: budget,
    };
    final merged = <Orcamento>[];
    final allKeys = {...localById.keys, ...remoteById.keys}.toList()..sort();

    for (final key in allKeys) {
      final local = localById[key];
      final remote = remoteById[key];

      if (local == null && remote != null) {
        merged.add(remote);
        continue;
      }
      if (remote == null && local != null) {
        merged.add(local);
        continue;
      }
      if (local == null || remote == null) {
        continue;
      }

      final base = local.updatedAt.isAfter(remote.updatedAt) ? local : remote;
      final localEntries = {for (final entry in local.movimentacoes) entry.id: entry};
      final remoteEntries = {for (final entry in remote.movimentacoes) entry.id: entry};
      final mergedEntries = <Movimentacao>[];
      final entryKeys = {...localEntries.keys, ...remoteEntries.keys}.toList()..sort();

      for (final entryKey in entryKeys) {
        final localEntry = localEntries[entryKey];
        final remoteEntry = remoteEntries[entryKey];

        if (localEntry == null && remoteEntry != null) {
          mergedEntries.add(remoteEntry);
          continue;
        }
        if (remoteEntry == null && localEntry != null) {
          mergedEntries.add(localEntry);
          continue;
        }
        if (localEntry == null || remoteEntry == null) {
          continue;
        }

        mergedEntries.add(
          localEntry.updatedAt.isAfter(remoteEntry.updatedAt)
              ? localEntry
              : remoteEntry,
        );
      }

      merged.add(
        Orcamento(
          id: base.id,
          codigo: base.codigo,
          valorInicialEmCentavos: base.valorInicialEmCentavos,
          saldoAtualEmCentavos: base.saldoAtualEmCentavos,
          dataFinal: base.dataFinal,
          saldoFinalDesejadoEmCentavos: base.saldoFinalDesejadoEmCentavos,
          movimentacoes: mergedEntries,
          orcamentoDiarioInicialEmCentavos:
              base.orcamentoDiarioInicialEmCentavos,
          orcamentoDiarioAtualEmCentavos: base.orcamentoDiarioAtualEmCentavos,
          dataInicio: base.dataInicio,
          tipo: base.tipo,
          dataOrcamentoDiarioAtual: base.dataOrcamentoDiarioAtual,
          isTrabalho: base.isTrabalho,
          status: base.status,
          saldoExtraDoDiaEmCentavos: base.saldoExtraDoDiaEmCentavos,
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        ),
      );
    }

    return merged;
  }

  List<Orcamento> _cloneBudgetsForImport(
    List<Orcamento> budgets, {
    required bool remoteHasPrimary,
  }) {
    final importedActiveBudgets = budgets
        .where((budget) => budget.status == StatusOrcamento.ativo)
        .toList()
      ..sort((left, right) => left.createdAt.compareTo(right.createdAt));

    String? importedPrimaryId;
    if (!remoteHasPrimary && importedActiveBudgets.isNotEmpty) {
      importedPrimaryId = importedActiveBudgets
              .where((budget) => budget.isTrabalho)
              .firstOrNull
              ?.id ??
          importedActiveBudgets.first.id;
    }

    return budgets.map((budget) {
      final newBudgetId = IdService.instance.next();
      final shouldBePrimary = !remoteHasPrimary &&
          budget.status == StatusOrcamento.ativo &&
          budget.id == importedPrimaryId;

      return Orcamento(
        id: newBudgetId,
        codigo: budget.codigo,
        valorInicialEmCentavos: budget.valorInicialEmCentavos,
        saldoAtualEmCentavos: budget.saldoAtualEmCentavos,
        dataFinal: budget.dataFinal,
        saldoFinalDesejadoEmCentavos: budget.saldoFinalDesejadoEmCentavos,
        movimentacoes: budget.movimentacoes.map((entry) {
          return Movimentacao(
            id: IdService.instance.next(),
            data: entry.data,
            valorEmCentavos: entry.valorEmCentavos,
            tipo: entry.tipo,
            descricao: entry.descricao,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            impactoSaldoPrincipalEmCentavos:
                entry.impactoSaldoPrincipalEmCentavos,
          );
        }).toList(),
        orcamentoDiarioInicialEmCentavos:
            budget.orcamentoDiarioInicialEmCentavos,
        orcamentoDiarioAtualEmCentavos: budget.orcamentoDiarioAtualEmCentavos,
        dataInicio: budget.dataInicio,
        tipo: budget.tipo,
        dataOrcamentoDiarioAtual: budget.dataOrcamentoDiarioAtual,
        isTrabalho: shouldBePrimary,
        status: budget.status,
        saldoExtraDoDiaEmCentavos: budget.saldoExtraDoDiaEmCentavos,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt,
      );
    }).toList();
  }

  bool _isSameBudgetSet(
    List<Orcamento> left,
    List<Orcamento> right, {
    required String timeZone,
  }) {
    return jsonEncode(_serializeBudgets(left, timeZone: timeZone)) ==
        jsonEncode(_serializeBudgets(right, timeZone: timeZone));
  }

  Future<void> _pushLocalBudgetsAndHydrate({
    required String scopeId,
    required ActiveCloudTarget target,
    required List<Orcamento> budgets,
    required _RemoteBudgetSnapshot remoteSnapshot,
    required AuthSession session,
    required bool recordPull,
    required bool updateUi,
  }) async {
    final response = await _putBudgets(
      target: target,
      budgets: budgets,
      timeZone: remoteSnapshot.timeZone,
    );

    if (updateUi) {
      ClockService.instance.setWorkspaceTimeZone(response.timeZone);
    }
    await _repository.replaceAllInScope(scopeId, response.budgets);
    if (updateUi) {
      pendingReconciliationListenable.value = null;
    }
    await _markBindingComplete(
      scopeId: scopeId,
      session: session,
      target: target,
      timeZone: response.timeZone,
      lastPullAt: recordPull ? agoraUtc() : null,
      lastPushAt: agoraUtc(),
    );
    await _saveScopeState(
      scopeId,
      SyncStateSnapshot(
        status: SyncStatus.synced,
        lastSyncAt: agoraUtc(),
        hasPendingChanges: false,
      ),
      updateUi: updateUi,
    );
  }

  Future<void> _markBindingComplete({
    required String scopeId,
    required AuthSession session,
    required ActiveCloudTarget target,
    required String timeZone,
    DateTime? lastPullAt,
    DateTime? lastPushAt,
  }) async {
    final currentBinding = _appStateStore.loadBindingState(scopeId);
    final nextBinding = currentBinding.copyWith(
      boundUserId: session.userId,
      boundCompanyId: target.companyId,
      timeZone: timeZone,
      firstBindingCompletedAt:
          currentBinding.firstBindingCompletedAt ?? agoraUtc(),
      lastSuccessfulPullAt:
          lastPullAt ?? currentBinding.lastSuccessfulPullAt,
      lastSuccessfulPushAt:
          lastPushAt ?? currentBinding.lastSuccessfulPushAt,
      hasCompletedInitialReconciliation: true,
    );
    await _appStateStore.saveBindingState(scopeId, nextBinding);

    if (scopeId == _currentScopeId) {
      _bindingState = nextBinding;
      ClockService.instance.setWorkspaceTimeZone(timeZone);
    }
  }

  SyncStateSnapshot _resolveStateForCurrentScope() {
    if (_currentTarget == null) {
      return _appStateStore.loadSyncState(_currentScopeId).copyWith(
            status: SyncStatus.localOnly,
          );
    }
    return _appStateStore.loadSyncState(_currentScopeId);
  }

  Future<void> _setCurrentState(FutureOr<SyncStateSnapshot> nextState) async {
    final snapshot = await nextState;
    await _saveScopeState(_currentScopeId, snapshot, updateUi: true);
  }

  Future<void> _saveScopeState(
    String scopeId,
    SyncStateSnapshot snapshot, {
    required bool updateUi,
  }) async {
    await _appStateStore.saveSyncState(scopeId, snapshot);
    if (updateUi) {
      stateListenable.value = snapshot;
    }
    await _refreshPendingScopeCount();
  }

  Future<void> _refreshPendingScopeCount() async {
    pendingScopeCountListenable.value =
        _appStateStore.countScopesWithPendingChanges();
  }

  String _extractError(String responseBody, {required String fallback}) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      return (json['error'] as String?) ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  void _handleSessionChanged() {
    if (_authService.isAuthenticated) {
      return;
    }

    pendingReconciliationListenable.value = null;
    _currentTarget = null;
    _bindingState = _appStateStore.loadBindingState(_currentScopeId);
    ClockService.instance.setWorkspaceTimeZone(null);
    unawaited(
      _setCurrentState(
        stateListenable.value.copyWith(
          status: SyncStatus.localOnly,
        ),
      ),
    );
  }

  void dispose() {
    _debounceTimer?.cancel();
    _authService.sessionListenable.removeListener(_handleSessionChanged);
  }
}

class _RemoteBudgetSnapshot {
  const _RemoteBudgetSnapshot({
    required this.timeZone,
    required this.businessDate,
    required this.budgets,
  });

  final String timeZone;
  final DateTime businessDate;
  final List<Orcamento> budgets;
}

class _SyncResponse extends _RemoteBudgetSnapshot {
  const _SyncResponse({
    required super.timeZone,
    required super.businessDate,
    required super.budgets,
    required this.conflicts,
  });

  final List<Map<String, dynamic>> conflicts;
}

extension<T> on Iterable<T> {
  T? get firstOrNull {
    if (isEmpty) {
      return null;
    }
    return first;
  }
}

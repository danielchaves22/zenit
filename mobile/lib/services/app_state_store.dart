import 'package:hive/hive.dart';

import 'binding_state.dart';
import 'id_service.dart';
import 'local_scope.dart';
import 'sync_state.dart';

class AppStateStore {
  AppStateStore(this._box);

  static const String boxName = 'app_state';
  static const String _installationIdKey = 'binding.installationId';
  static const String _activeScopeIdKey = 'scope.active';
  static const String _knownScopesKey = 'scope.known';
  static const String _guestPromotionScopesKey = 'scope.pendingGuestPromotion';

  final Box<dynamic> _box;

  String ensureInstallationId() {
    final existing = (_box.get(_installationIdKey) as String?)?.trim();
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final installationId = IdService.instance.next();
    _box.put(_installationIdKey, installationId);
    return installationId;
  }

  String loadActiveScopeId() {
    final stored = (_box.get(_activeScopeIdKey) as String?)?.trim();
    if (stored == null || stored.isEmpty) {
      return LocalScopeId.guest;
    }
    return stored;
  }

  Future<void> saveActiveScopeId(String scopeId) async {
    await registerScope(scopeId);
    await _box.put(_activeScopeIdKey, scopeId);
  }

  List<String> loadKnownScopes() {
    final stored = (_box.get(_knownScopesKey) as List?)?.cast<String>() ??
        const <String>[];
    final known = <String>{LocalScopeId.guest, ...stored};
    return known.toList()..sort();
  }

  Future<void> registerScope(String scopeId) async {
    final known = loadKnownScopes().toSet()..add(scopeId);
    await _box.put(_knownScopesKey, known.toList()..sort());
  }

  Future<void> setPendingGuestPromotion(String scopeId, bool enabled) async {
    final pending = loadGuestPromotionScopes().toSet();
    if (enabled) {
      pending.add(scopeId);
    } else {
      pending.remove(scopeId);
    }
    await _box.put(_guestPromotionScopesKey, pending.toList()..sort());
  }

  bool shouldConsumeGuestAfterBinding(String scopeId) {
    return loadGuestPromotionScopes().contains(scopeId);
  }

  List<String> loadGuestPromotionScopes() {
    return (_box.get(_guestPromotionScopesKey) as List?)
            ?.cast<String>()
            .toList() ??
        const <String>[];
  }

  SyncStateSnapshot loadSyncState(String scopeId) {
    return SyncStateSnapshot(
      status: _readStatus(_box.get(_scopeKey(scopeId, 'sync.status')) as String?),
      lastSyncAt: _box.get(_scopeKey(scopeId, 'sync.lastSyncAt')) as DateTime?,
      lastSyncError: _box.get(_scopeKey(scopeId, 'sync.lastSyncError')) as String?,
      hasPendingChanges:
          (_box.get(_scopeKey(scopeId, 'sync.hasPendingChanges')) as bool?) ?? false,
      lastConflictMessage:
          _box.get(_scopeKey(scopeId, 'sync.lastConflictMessage')) as String?,
    );
  }

  Future<void> saveSyncState(String scopeId, SyncStateSnapshot snapshot) async {
    await registerScope(scopeId);
    await _box.put(_scopeKey(scopeId, 'sync.status'), snapshot.status.name);
    await _box.put(_scopeKey(scopeId, 'sync.lastSyncAt'), snapshot.lastSyncAt);
    await _box.put(_scopeKey(scopeId, 'sync.lastSyncError'), snapshot.lastSyncError);
    await _box.put(
      _scopeKey(scopeId, 'sync.hasPendingChanges'),
      snapshot.hasPendingChanges,
    );
    await _box.put(
      _scopeKey(scopeId, 'sync.lastConflictMessage'),
      snapshot.lastConflictMessage,
    );
  }

  CloudBindingState loadBindingState(String scopeId) {
    return CloudBindingState(
      installationId: ensureInstallationId(),
      boundUserId: _box.get(_scopeKey(scopeId, 'binding.boundUserId')) as int?,
      boundCompanyId:
          _box.get(_scopeKey(scopeId, 'binding.boundCompanyId')) as String?,
      timeZone: _box.get(_scopeKey(scopeId, 'binding.timeZone')) as String?,
      firstBindingCompletedAt:
          _box.get(_scopeKey(scopeId, 'binding.firstBindingCompletedAt')) as DateTime?,
      lastSuccessfulPullAt:
          _box.get(_scopeKey(scopeId, 'binding.lastSuccessfulPullAt')) as DateTime?,
      lastSuccessfulPushAt:
          _box.get(_scopeKey(scopeId, 'binding.lastSuccessfulPushAt')) as DateTime?,
      hasCompletedInitialReconciliation:
          (_box.get(_scopeKey(scopeId, 'binding.hasCompletedInitialReconciliation'))
              as bool?) ??
          false,
    );
  }

  Future<void> saveBindingState(String scopeId, CloudBindingState state) async {
    await registerScope(scopeId);
    await _box.put(_installationIdKey, state.installationId);
    await _box.put(_scopeKey(scopeId, 'binding.boundUserId'), state.boundUserId);
    await _box.put(
      _scopeKey(scopeId, 'binding.boundCompanyId'),
      state.boundCompanyId,
    );
    await _box.put(_scopeKey(scopeId, 'binding.timeZone'), state.timeZone);
    await _box.put(
      _scopeKey(scopeId, 'binding.firstBindingCompletedAt'),
      state.firstBindingCompletedAt,
    );
    await _box.put(
      _scopeKey(scopeId, 'binding.lastSuccessfulPullAt'),
      state.lastSuccessfulPullAt,
    );
    await _box.put(
      _scopeKey(scopeId, 'binding.lastSuccessfulPushAt'),
      state.lastSuccessfulPushAt,
    );
    await _box.put(
      _scopeKey(scopeId, 'binding.hasCompletedInitialReconciliation'),
      state.hasCompletedInitialReconciliation,
    );
  }

  Future<void> clearBindingState(
    String scopeId, {
    bool preserveInstallationId = true,
  }) async {
    final installationId = preserveInstallationId ? ensureInstallationId() : null;

    for (final suffix in const [
      'binding.boundUserId',
      'binding.boundCompanyId',
      'binding.timeZone',
      'binding.firstBindingCompletedAt',
      'binding.lastSuccessfulPullAt',
      'binding.lastSuccessfulPushAt',
      'binding.hasCompletedInitialReconciliation',
    ]) {
      await _box.delete(_scopeKey(scopeId, suffix));
    }

    if (!preserveInstallationId) {
      await _box.delete(_installationIdKey);
    } else if (installationId != null) {
      await _box.put(_installationIdKey, installationId);
    }
  }

  int countScopesWithPendingChanges() {
    return loadKnownScopes().where((scopeId) {
      return loadSyncState(scopeId).hasPendingChanges;
    }).length;
  }

  String _scopeKey(String scopeId, String suffix) {
    return 'scope.$scopeId.$suffix';
  }

  SyncStatus _readStatus(String? rawValue) {
    return SyncStatus.values.firstWhere(
      (status) => status.name == rawValue,
      orElse: () => SyncStatus.localOnly,
    );
  }
}

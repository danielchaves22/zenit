import 'package:hive/hive.dart';

import 'binding_state.dart';
import 'id_service.dart';
import 'sync_state.dart';

class AppStateStore {
  AppStateStore(this._box);

  static const String boxName = 'app_state';
  static const String _syncStatusKey = 'sync.status';
  static const String _lastSyncAtKey = 'sync.lastSyncAt';
  static const String _lastSyncErrorKey = 'sync.lastSyncError';
  static const String _hasPendingChangesKey = 'sync.hasPendingChanges';
  static const String _lastConflictMessageKey = 'sync.lastConflictMessage';
  static const String _installationIdKey = 'binding.installationId';
  static const String _boundUserIdKey = 'binding.boundUserId';
  static const String _boundCompanyIdKey = 'binding.boundCompanyId';
  static const String _bindingTimeZoneKey = 'binding.timeZone';
  static const String _firstBindingCompletedAtKey = 'binding.firstBindingCompletedAt';
  static const String _lastSuccessfulPullAtKey = 'binding.lastSuccessfulPullAt';
  static const String _lastSuccessfulPushAtKey = 'binding.lastSuccessfulPushAt';
  static const String _hasCompletedInitialReconciliationKey =
      'binding.hasCompletedInitialReconciliation';

  final Box<dynamic> _box;

  SyncStateSnapshot loadSyncState() {
    return SyncStateSnapshot(
      status: _readStatus(_box.get(_syncStatusKey) as String?),
      lastSyncAt: _box.get(_lastSyncAtKey) as DateTime?,
      lastSyncError: _box.get(_lastSyncErrorKey) as String?,
      hasPendingChanges: (_box.get(_hasPendingChangesKey) as bool?) ?? false,
      lastConflictMessage: _box.get(_lastConflictMessageKey) as String?,
    );
  }

  Future<void> saveSyncState(SyncStateSnapshot snapshot) async {
    await _box.put(_syncStatusKey, snapshot.status.name);
    await _box.put(_lastSyncAtKey, snapshot.lastSyncAt);
    await _box.put(_lastSyncErrorKey, snapshot.lastSyncError);
    await _box.put(_hasPendingChangesKey, snapshot.hasPendingChanges);
    await _box.put(_lastConflictMessageKey, snapshot.lastConflictMessage);
  }

  CloudBindingState loadBindingState() {
    return CloudBindingState(
      installationId: ensureInstallationId(),
      boundUserId: _box.get(_boundUserIdKey) as int?,
      boundCompanyId: _box.get(_boundCompanyIdKey) as String?,
      timeZone: _box.get(_bindingTimeZoneKey) as String?,
      firstBindingCompletedAt: _box.get(_firstBindingCompletedAtKey) as DateTime?,
      lastSuccessfulPullAt: _box.get(_lastSuccessfulPullAtKey) as DateTime?,
      lastSuccessfulPushAt: _box.get(_lastSuccessfulPushAtKey) as DateTime?,
      hasCompletedInitialReconciliation:
          (_box.get(_hasCompletedInitialReconciliationKey) as bool?) ?? false,
    );
  }

  Future<void> saveBindingState(CloudBindingState state) async {
    await _box.put(_installationIdKey, state.installationId);
    await _box.put(_boundUserIdKey, state.boundUserId);
    await _box.put(_boundCompanyIdKey, state.boundCompanyId);
    await _box.put(_bindingTimeZoneKey, state.timeZone);
    await _box.put(_firstBindingCompletedAtKey, state.firstBindingCompletedAt);
    await _box.put(_lastSuccessfulPullAtKey, state.lastSuccessfulPullAt);
    await _box.put(_lastSuccessfulPushAtKey, state.lastSuccessfulPushAt);
    await _box.put(
      _hasCompletedInitialReconciliationKey,
      state.hasCompletedInitialReconciliation,
    );
  }

  Future<void> clearBindingState({bool preserveInstallationId = true}) async {
    final installationId = preserveInstallationId ? ensureInstallationId() : null;

    await _box.delete(_boundUserIdKey);
    await _box.delete(_boundCompanyIdKey);
    await _box.delete(_bindingTimeZoneKey);
    await _box.delete(_firstBindingCompletedAtKey);
    await _box.delete(_lastSuccessfulPullAtKey);
    await _box.delete(_lastSuccessfulPushAtKey);
    await _box.put(_hasCompletedInitialReconciliationKey, false);

    if (!preserveInstallationId) {
      await _box.delete(_installationIdKey);
    } else if (installationId != null) {
      await _box.put(_installationIdKey, installationId);
    }
  }

  String ensureInstallationId() {
    final existing = (_box.get(_installationIdKey) as String?)?.trim();
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final installationId = IdService.instance.next();
    _box.put(_installationIdKey, installationId);
    return installationId;
  }

  SyncStatus _readStatus(String? rawValue) {
    return SyncStatus.values.firstWhere(
      (status) => status.name == rawValue,
      orElse: () => SyncStatus.localOnly,
    );
  }
}

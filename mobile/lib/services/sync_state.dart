enum SyncStatus {
  localOnly,
  reconciliationRequired,
  syncing,
  synced,
  pending,
  error,
}

class SyncStateSnapshot {
  const SyncStateSnapshot({
    required this.status,
    this.lastSyncAt,
    this.lastSyncError,
    this.hasPendingChanges = false,
    this.lastConflictMessage,
  });

  final SyncStatus status;
  final DateTime? lastSyncAt;
  final String? lastSyncError;
  final bool hasPendingChanges;
  final String? lastConflictMessage;

  SyncStateSnapshot copyWith({
    SyncStatus? status,
    DateTime? lastSyncAt,
    String? lastSyncError,
    bool? hasPendingChanges,
    String? lastConflictMessage,
    bool clearLastSyncError = false,
    bool clearLastConflictMessage = false,
  }) {
    return SyncStateSnapshot(
      status: status ?? this.status,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
      lastSyncError: clearLastSyncError ? null : (lastSyncError ?? this.lastSyncError),
      hasPendingChanges: hasPendingChanges ?? this.hasPendingChanges,
      lastConflictMessage: clearLastConflictMessage
          ? null
          : (lastConflictMessage ?? this.lastConflictMessage),
    );
  }
}

class CloudBindingState {
  const CloudBindingState({
    required this.installationId,
    this.boundUserId,
    this.boundCompanyId,
    this.timeZone,
    this.firstBindingCompletedAt,
    this.lastSuccessfulPullAt,
    this.lastSuccessfulPushAt,
    this.hasCompletedInitialReconciliation = false,
  });

  final String installationId;
  final int? boundUserId;
  final String? boundCompanyId;
  final String? timeZone;
  final DateTime? firstBindingCompletedAt;
  final DateTime? lastSuccessfulPullAt;
  final DateTime? lastSuccessfulPushAt;
  final bool hasCompletedInitialReconciliation;

  bool get isBound =>
      boundUserId != null &&
      boundCompanyId != null &&
      hasCompletedInitialReconciliation;

  bool matches({
    required int userId,
    required String companyId,
  }) {
    return boundUserId == userId && boundCompanyId == companyId;
  }

  CloudBindingState copyWith({
    String? installationId,
    int? boundUserId,
    String? boundCompanyId,
    String? timeZone,
    DateTime? firstBindingCompletedAt,
    DateTime? lastSuccessfulPullAt,
    DateTime? lastSuccessfulPushAt,
    bool? hasCompletedInitialReconciliation,
    bool clearBoundUserId = false,
    bool clearBoundCompanyId = false,
    bool clearTimeZone = false,
    bool clearFirstBindingCompletedAt = false,
    bool clearLastSuccessfulPullAt = false,
    bool clearLastSuccessfulPushAt = false,
  }) {
    return CloudBindingState(
      installationId: installationId ?? this.installationId,
      boundUserId: clearBoundUserId ? null : (boundUserId ?? this.boundUserId),
      boundCompanyId:
          clearBoundCompanyId ? null : (boundCompanyId ?? this.boundCompanyId),
      timeZone: clearTimeZone ? null : (timeZone ?? this.timeZone),
      firstBindingCompletedAt: clearFirstBindingCompletedAt
          ? null
          : (firstBindingCompletedAt ?? this.firstBindingCompletedAt),
      lastSuccessfulPullAt: clearLastSuccessfulPullAt
          ? null
          : (lastSuccessfulPullAt ?? this.lastSuccessfulPullAt),
      lastSuccessfulPushAt: clearLastSuccessfulPushAt
          ? null
          : (lastSuccessfulPushAt ?? this.lastSuccessfulPushAt),
      hasCompletedInitialReconciliation:
          hasCompletedInitialReconciliation ??
              this.hasCompletedInitialReconciliation,
    );
  }
}

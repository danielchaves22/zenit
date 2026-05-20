class LocalScopeId {
  LocalScopeId._();

  static const String guest = 'guest';

  static String company({
    required int userId,
    required String companyId,
  }) {
    return 'user:$userId:company:$companyId';
  }

  static bool isGuest(String scopeId) => scopeId == guest;

  static String boxNameForScope(String scopeId) {
    if (isGuest(scopeId)) {
      return 'orcamentos';
    }

    final normalized = scopeId.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '_');
    return 'orcamentos_scope_$normalized';
  }
}

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'app_config.dart';
import 'clock_service.dart';

class AuthCompanyOption {
  const AuthCompanyOption({
    required this.id,
    required this.name,
    required this.role,
    required this.isDefault,
  });

  final String id;
  final String name;
  final String role;
  final bool isDefault;

  factory AuthCompanyOption.fromJson(Map<String, dynamic> json) {
    return AuthCompanyOption(
      id: json['id'].toString(),
      name: (json['name'] as String?) ?? 'Empresa',
      role: (json['role'] as String?) ?? 'USER',
      isDefault: (json['isDefault'] as bool?) ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'role': role,
      'isDefault': isDefault,
    };
  }
}

class ActiveCloudTarget {
  const ActiveCloudTarget({
    required this.companyId,
    required this.name,
    this.timeZone,
  });

  final String companyId;
  final String name;
  final String? timeZone;

  factory ActiveCloudTarget.fromJson(Map<String, dynamic> json) {
    return ActiveCloudTarget(
      companyId: json['companyId'].toString(),
      name: (json['name'] as String?) ?? 'Empresa',
      timeZone: json['timeZone'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'companyId': companyId,
      'name': name,
      'timeZone': timeZone,
    };
  }
}

class AuthSession {
  const AuthSession({
    required this.userId,
    required this.token,
    required this.refreshToken,
    required this.userName,
    required this.userEmail,
    this.availableCompanies = const <AuthCompanyOption>[],
  });

  final int userId;
  final String token;
  final String refreshToken;
  final String userName;
  final String userEmail;
  final List<AuthCompanyOption> availableCompanies;
}

class AuthService {
  AuthService({
    required this.apiBaseUrl,
    http.Client? httpClient,
    FlutterSecureStorage? secureStorage,
  })  : _httpClient = httpClient ?? http.Client(),
        _secureStorage = secureStorage ?? const FlutterSecureStorage();

  static const String _userIdKey = 'zenit.userId';
  static const String _tokenKey = 'zenit.token';
  static const String _refreshTokenKey = 'zenit.refreshToken';
  static const String _userNameKey = 'zenit.userName';
  static const String _userEmailKey = 'zenit.userEmail';
  static const String _availableCompaniesKey = 'zenit.availableCompanies';
  static const String _activeCompanyIdKey = 'zenit.companyId';
  static const String _activeCompanyNameKey = 'zenit.companyName';
  static const String _activeCompanyTimeZoneKey = 'zenit.companyTimeZone';

  final String apiBaseUrl;
  final http.Client _httpClient;
  final FlutterSecureStorage _secureStorage;
  final ValueNotifier<AuthSession?> sessionListenable =
      ValueNotifier<AuthSession?>(null);
  final ValueNotifier<ActiveCloudTarget?> activeTargetListenable =
      ValueNotifier<ActiveCloudTarget?>(null);

  AuthSession? get currentSession => sessionListenable.value;
  ActiveCloudTarget? get currentTarget => activeTargetListenable.value;
  bool get isAuthenticated => currentSession != null;

  Future<void> restoreSession() async {
    final userIdRaw = await _secureStorage.read(key: _userIdKey);
    final token = await _secureStorage.read(key: _tokenKey);
    final refreshToken = await _secureStorage.read(key: _refreshTokenKey);

    if (userIdRaw == null || token == null || refreshToken == null) {
      sessionListenable.value = null;
      activeTargetListenable.value = null;
      return;
    }

    final userId = int.tryParse(userIdRaw);
    if (userId == null) {
      await signOut();
      return;
    }

    sessionListenable.value = AuthSession(
      userId: userId,
      token: token,
      refreshToken: refreshToken,
      userName: await _secureStorage.read(key: _userNameKey) ?? 'Usuario',
      userEmail: await _secureStorage.read(key: _userEmailKey) ?? '',
      availableCompanies: _readPersistedCompanies(
        await _secureStorage.read(key: _availableCompaniesKey),
      ),
    );

    final activeCompanyId = await _secureStorage.read(key: _activeCompanyIdKey);
    if (activeCompanyId == null || activeCompanyId.trim().isEmpty) {
      activeTargetListenable.value = null;
      return;
    }

    activeTargetListenable.value = ActiveCloudTarget(
      companyId: activeCompanyId,
      name:
          await _secureStorage.read(key: _activeCompanyNameKey) ?? 'Empresa',
      timeZone: await _secureStorage.read(key: _activeCompanyTimeZoneKey),
    );
  }

  Future<void> signIn({
    required String email,
    required String password,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$apiBaseUrl/api/auth/login'),
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': AppConfig.cashAppKey,
      },
      body: jsonEncode({
        'email': email.trim(),
        'password': password,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _extractError(response.body, fallback: 'Falha ao autenticar');
    }

    final session = _buildSessionFromAuthPayload(
      jsonDecode(response.body) as Map<String, dynamic>,
      fallbackEmail: email.trim(),
    );
    await _persistSession(session);
    await clearActiveTarget();
    sessionListenable.value = session;
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$apiBaseUrl/api/auth/register'),
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': AppConfig.cashAppKey,
      },
      body: jsonEncode({
        'name': name.trim(),
        'email': email.trim(),
        'password': password,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _extractError(response.body, fallback: 'Falha ao cadastrar');
    }

    final session = _buildSessionFromAuthPayload(
      jsonDecode(response.body) as Map<String, dynamic>,
      fallbackEmail: email.trim(),
    );
    await _persistSession(session);
    await clearActiveTarget();
    sessionListenable.value = session;
  }

  Future<bool> refreshSession() async {
    final session = currentSession;
    if (session == null) {
      return false;
    }

    final response = await _httpClient.post(
      Uri.parse('$apiBaseUrl/api/auth/refresh'),
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'refreshToken': session.refreshToken,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      await signOut();
      return false;
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final refreshed = AuthSession(
      userId: session.userId,
      token: json['token'] as String,
      refreshToken: session.refreshToken,
      userName: session.userName,
      userEmail: session.userEmail,
      availableCompanies: session.availableCompanies,
    );

    await _persistSession(refreshed);
    sessionListenable.value = refreshed;
    return true;
  }

  Future<ActiveCloudTarget> selectExistingCompany({
    required String companyId,
  }) async {
    final session = currentSession;
    if (session == null) {
      throw Exception('Sessao nao encontrada');
    }

    final response = await _authorizedRequest(
      () => _httpClient.post(
        Uri.parse('$apiBaseUrl/api/cash/bootstrap/select-company'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${session.token}',
          'X-App-Key': AppConfig.cashAppKey,
        },
        body: jsonEncode({
          'companyId': int.parse(companyId),
        }),
      ),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _extractError(
        response.body,
        fallback: 'Falha ao selecionar empresa',
      );
    }

    return ActiveCloudTarget.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
  }

  Future<ActiveCloudTarget> resolvePersonalWorkspaceTarget() async {
    final session = currentSession;
    if (session == null) {
      throw Exception('Sessao nao encontrada');
    }

    final response = await _authorizedRequest(
      () => _httpClient.get(
        Uri.parse('$apiBaseUrl/api/cash/personal-workspace'),
        headers: {
          'Authorization': 'Bearer ${session.token}',
          'X-App-Key': AppConfig.cashAppKey,
          'X-Device-Timezone': ClockService.instance.localTimeZone,
        },
      ),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _extractError(
        response.body,
        fallback: 'Falha ao resolver workspace pessoal',
      );
    }

    return ActiveCloudTarget.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
  }

  Future<void> setActiveTarget(ActiveCloudTarget? target) async {
    if (target == null) {
      await clearActiveTarget();
      return;
    }

    await _secureStorage.write(key: _activeCompanyIdKey, value: target.companyId);
    await _secureStorage.write(key: _activeCompanyNameKey, value: target.name);
    await _secureStorage.write(
      key: _activeCompanyTimeZoneKey,
      value: target.timeZone,
    );
    activeTargetListenable.value = target;
  }

  Future<void> clearActiveTarget() async {
    await _secureStorage.delete(key: _activeCompanyIdKey);
    await _secureStorage.delete(key: _activeCompanyNameKey);
    await _secureStorage.delete(key: _activeCompanyTimeZoneKey);
    activeTargetListenable.value = null;
  }

  Future<void> signOut() async {
    await _secureStorage.deleteAll();
    sessionListenable.value = null;
    activeTargetListenable.value = null;
  }

  AuthSession _buildSessionFromAuthPayload(
    Map<String, dynamic> payload, {
    required String fallbackEmail,
  }) {
    final user = payload['user'] as Map<String, dynamic>;
    return AuthSession(
      userId: user['id'] as int,
      token: payload['token'] as String,
      refreshToken: payload['refreshToken'] as String,
      userName: (user['name'] as String?) ?? 'Usuario',
      userEmail: (user['email'] as String?) ?? fallbackEmail,
      availableCompanies: _parseCashCompanies(user),
    );
  }

  List<AuthCompanyOption> _parseCashCompanies(Map<String, dynamic> userJson) {
    final companies = (userJson['companies'] as List<dynamic>? ?? const [])
        .map((item) => AuthCompanyOption.fromJson(item as Map<String, dynamic>))
        .toList();
    final appAccessByCompany =
        (userJson['appAccessByCompany'] as Map<String, dynamic>? ?? const {});

    final available = companies.where((company) {
      final companyAccess =
          (appAccessByCompany[company.id] as List<dynamic>? ?? const []);
      return companyAccess.any((rawAccess) {
        final access = rawAccess as Map<String, dynamic>;
        return access['appKey'] == AppConfig.cashAppKey &&
            access['allowed'] == true;
      });
    }).toList();

    available.sort((left, right) {
      if (left.isDefault != right.isDefault) {
        return left.isDefault ? -1 : 1;
      }
      return left.name.compareTo(right.name);
    });

    return available;
  }

  List<AuthCompanyOption> _readPersistedCompanies(String? rawJson) {
    if (rawJson == null || rawJson.trim().isEmpty) {
      return const <AuthCompanyOption>[];
    }

    try {
      final decoded = jsonDecode(rawJson) as List<dynamic>;
      return decoded
          .map((item) => AuthCompanyOption.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return const <AuthCompanyOption>[];
    }
  }

  Future<void> _persistSession(AuthSession session) async {
    await _secureStorage.write(key: _userIdKey, value: session.userId.toString());
    await _secureStorage.write(key: _tokenKey, value: session.token);
    await _secureStorage.write(key: _refreshTokenKey, value: session.refreshToken);
    await _secureStorage.write(key: _userNameKey, value: session.userName);
    await _secureStorage.write(key: _userEmailKey, value: session.userEmail);
    await _secureStorage.write(
      key: _availableCompaniesKey,
      value: jsonEncode(
        session.availableCompanies.map((company) => company.toJson()).toList(),
      ),
    );
  }

  Future<http.Response> _authorizedRequest(
    Future<http.Response> Function() requestFactory,
  ) async {
    var response = await requestFactory();
    if (response.statusCode != 401) {
      return response;
    }

    final refreshed = await refreshSession();
    if (!refreshed) {
      return response;
    }

    response = await requestFactory();
    return response;
  }

  String _extractError(String responseBody, {required String fallback}) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      return (json['error'] as String?) ?? fallback;
    } catch (_) {
      return fallback;
    }
  }
}

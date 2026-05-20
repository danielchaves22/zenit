import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'app_config.dart';
import 'clock_service.dart';

class AuthSession {
  const AuthSession({
    required this.userId,
    required this.token,
    required this.refreshToken,
    required this.companyId,
    required this.userName,
    required this.userEmail,
  });

  final int userId;
  final String token;
  final String refreshToken;
  final String companyId;
  final String userName;
  final String userEmail;
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
  static const String _companyIdKey = 'zenit.companyId';
  static const String _userNameKey = 'zenit.userName';
  static const String _userEmailKey = 'zenit.userEmail';

  final String apiBaseUrl;
  final http.Client _httpClient;
  final FlutterSecureStorage _secureStorage;
  final ValueNotifier<AuthSession?> sessionListenable =
      ValueNotifier<AuthSession?>(null);

  AuthSession? get currentSession => sessionListenable.value;
  bool get isAuthenticated => currentSession != null;

  Future<void> restoreSession() async {
    final userIdRaw = await _secureStorage.read(key: _userIdKey);
    final token = await _secureStorage.read(key: _tokenKey);
    final refreshToken = await _secureStorage.read(key: _refreshTokenKey);
    final companyId = await _secureStorage.read(key: _companyIdKey);

    if (userIdRaw == null ||
        token == null ||
        refreshToken == null ||
        companyId == null) {
      sessionListenable.value = null;
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
      companyId: companyId,
      userName: await _secureStorage.read(key: _userNameKey) ?? 'Usuario',
      userEmail: await _secureStorage.read(key: _userEmailKey) ?? '',
    );
  }

  Future<void> signIn({
    required String email,
    required String password,
  }) async {
    final loginResponse = await _httpClient.post(
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

    if (loginResponse.statusCode < 200 || loginResponse.statusCode >= 300) {
      throw _extractError(loginResponse.body, fallback: 'Falha ao autenticar');
    }

    final loginJson = jsonDecode(loginResponse.body) as Map<String, dynamic>;
    final token = loginJson['token'] as String;
    final refreshToken = loginJson['refreshToken'] as String;
    final user = loginJson['user'] as Map<String, dynamic>;
    final workspace = await _resolvePersonalWorkspace(token);

    final session = AuthSession(
      userId: user['id'] as int,
      token: token,
      refreshToken: refreshToken,
      companyId: workspace['companyId'].toString(),
      userName: (user['name'] as String?) ?? 'Usuario',
      userEmail: (user['email'] as String?) ?? email.trim(),
    );

    await _persistSession(session);
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
      companyId: session.companyId,
      userName: session.userName,
      userEmail: session.userEmail,
    );

    await _persistSession(refreshed);
    sessionListenable.value = refreshed;
    return true;
  }

  Future<void> signOut() async {
    await _secureStorage.deleteAll();
    sessionListenable.value = null;
  }

  Future<Map<String, dynamic>> _resolvePersonalWorkspace(String token) async {
    final response = await _httpClient.get(
      Uri.parse('$apiBaseUrl/api/cash/personal-workspace'),
      headers: {
        'Authorization': 'Bearer $token',
        'X-App-Key': AppConfig.cashAppKey,
        'X-Device-Timezone': ClockService.instance.localTimeZone,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _extractError(
        response.body,
        fallback: 'Falha ao resolver workspace pessoal',
      );
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<void> _persistSession(AuthSession session) async {
    await _secureStorage.write(key: _userIdKey, value: session.userId.toString());
    await _secureStorage.write(key: _tokenKey, value: session.token);
    await _secureStorage.write(key: _refreshTokenKey, value: session.refreshToken);
    await _secureStorage.write(key: _companyIdKey, value: session.companyId);
    await _secureStorage.write(key: _userNameKey, value: session.userName);
    await _secureStorage.write(key: _userEmailKey, value: session.userEmail);
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

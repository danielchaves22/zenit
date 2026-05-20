import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  AppConfig._();

  static final AppConfig instance = AppConfig._();

  static const String cashAppKey = 'zenit-cash';

  late final String apiBaseUrl;
  late final bool modoDev;
  late final DateTime? dataSimulada;

  Future<void> load() async {
    await dotenv.load(fileName: '.env');

    apiBaseUrl = (dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000').trim();
    modoDev = (dotenv.env['MODO_DEV'] ?? 'false').toLowerCase() == 'true';
    dataSimulada = _parseOptionalDate(dotenv.env['DATA_SIMULADA']);
  }

  DateTime? _parseOptionalDate(String? rawValue) {
    if (rawValue == null || rawValue.trim().isEmpty) {
      return null;
    }

    final parts = rawValue.split('-');
    if (parts.length != 3) {
      return null;
    }

    try {
      return DateTime(
        int.parse(parts[0]),
        int.parse(parts[1]),
        int.parse(parts[2]),
      );
    } catch (_) {
      return null;
    }
  }
}

import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/timezone.dart' as tz;

import 'app_config.dart';
import 'time_zone_initializer.dart';

class ClockService {
  ClockService._();

  static final ClockService instance = ClockService._();

  bool _initialized = false;
  String _localTimeZone = 'UTC';
  String? _workspaceTimeZone;
  tz.Location _localLocation = tz.UTC;
  tz.Location? _workspaceLocation;

  Future<void> initialize({String? localTimeZoneOverride}) async {
    if (_initialized) {
      if (localTimeZoneOverride != null) {
        _setLocalTimeZone(localTimeZoneOverride);
      }
      return;
    }

    await initializeTimeZoneDatabase();

    if (localTimeZoneOverride != null) {
      _setLocalTimeZone(localTimeZoneOverride);
    } else {
      await _loadLocalTimeZone();
    }

    _initialized = true;
  }

  DateTime get businessDate {
    final simulated = AppConfig.instance.modoDev ? AppConfig.instance.dataSimulada : null;
    if (simulated != null) {
      return DateTime(simulated.year, simulated.month, simulated.day);
    }

    final now = tz.TZDateTime.now(_effectiveLocation);
    return DateTime(now.year, now.month, now.day);
  }

  DateTime nowUtc() {
    return DateTime.now().toUtc();
  }

  String get localTimeZone => _localTimeZone;

  String get effectiveTimeZone => _workspaceTimeZone ?? _localTimeZone;

  void setWorkspaceTimeZone(String? timeZone) {
    if (timeZone == null || timeZone.trim().isEmpty) {
      _workspaceTimeZone = null;
      _workspaceLocation = null;
      return;
    }

    _workspaceTimeZone = timeZone.trim();
    _workspaceLocation = _safeLocation(_workspaceTimeZone!);
  }

  DateTime dateOnlyFromIso(String rawValue, {String? timeZone}) {
    final parsed = DateTime.parse(rawValue).toUtc();
    final location = _locationFor(timeZone);
    final zoned = tz.TZDateTime.from(parsed, location);
    return DateTime(zoned.year, zoned.month, zoned.day);
  }

  String serializeDateOnly(DateTime date, {String? timeZone}) {
    final location = _locationFor(timeZone);
    final zoned = tz.TZDateTime(location, date.year, date.month, date.day, 12);
    return zoned.toUtc().toIso8601String();
  }

  tz.Location get _effectiveLocation => _workspaceLocation ?? _localLocation;

  tz.Location _locationFor(String? timeZone) {
    if (timeZone == null || timeZone.trim().isEmpty) {
      return _effectiveLocation;
    }

    return _safeLocation(timeZone.trim());
  }

  Future<void> _loadLocalTimeZone() async {
    try {
      final detected = await FlutterTimezone.getLocalTimezone();
      _setLocalTimeZone(detected.identifier);
    } catch (_) {
      _setLocalTimeZone('UTC');
    }
  }

  void _setLocalTimeZone(String timeZone) {
    _localTimeZone = timeZone.trim().isEmpty ? 'UTC' : timeZone.trim();
    _localLocation = _safeLocation(_localTimeZone);
  }

  tz.Location _safeLocation(String timeZone) {
    try {
      return tz.getLocation(timeZone);
    } catch (_) {
      return tz.UTC;
    }
  }
}

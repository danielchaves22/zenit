import 'package:timezone/data/latest.dart' as tz_data;

Future<void> initializeTimeZoneDatabase() async {
  tz_data.initializeTimeZones();
}

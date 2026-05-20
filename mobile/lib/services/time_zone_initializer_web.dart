import 'package:timezone/browser.dart' as tz_browser;

Future<void> initializeTimeZoneDatabase() {
  return tz_browser.initializeTimeZone();
}

// Basic tests that don't require platform plugins (no DB / path_provider boot).
//
// A full app smoke test would need provider overrides for the database and file
// storage; that arrives alongside the v1 test suite.

import 'package:doc_scanner/app/theme/app_theme.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  test('AppTheme builds a Material 3 light scheme', () {
    final theme = AppTheme.light();
    expect(theme.useMaterial3, isTrue);
    expect(theme.colorScheme.brightness.name, 'light');
  });

  test('AppTheme builds a Material 3 dark scheme', () {
    final theme = AppTheme.dark();
    expect(theme.useMaterial3, isTrue);
    expect(theme.colorScheme.brightness.name, 'dark');
  });
}

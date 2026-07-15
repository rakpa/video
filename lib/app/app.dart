import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/settings/presentation/settings_providers.dart';
import 'router/app_router.dart';
import 'theme/app_theme.dart';

/// Root application widget.
///
/// Uses [MaterialApp.router] so navigation is driven by go_router. The router
/// is exposed as a provider to allow future redirect guards (e.g. app lock).
class DocScannerApp extends ConsumerWidget {
  const DocScannerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'Paperly',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
    );
  }
}

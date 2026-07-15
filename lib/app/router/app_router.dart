import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/crop/domain/crop_route_args.dart';
import '../../features/crop/presentation/crop_screen.dart';
import '../../features/documents/domain/entities.dart';
import '../../features/documents/presentation/document_detail_screen.dart';
import '../../features/documents/presentation/document_list_screen.dart';
import '../../features/enhance/presentation/enhance_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/scan/domain/scan_mode.dart';
import '../../features/scan/presentation/scan_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/splash/presentation/splash_screen.dart';

/// Application routes.
abstract final class Routes {
  static const splash = '/';
  static const onboarding = '/onboarding';
  static const home = '/home';
  static const library = '/library';
  static const settings = '/settings';
  static const scan = '/scan';
  static const crop = '/crop';
  static const document = '/document/:id';
  static const enhance = '/document/:id/page/:pageId/enhance';
}

final goRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: Routes.splash,
    routes: [
      GoRoute(
        path: Routes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: Routes.onboarding,
        pageBuilder: (context, state) => _fadePage(
          key: state.pageKey,
          child: const OnboardingScreen(),
        ),
      ),
      GoRoute(
        path: Routes.home,
        pageBuilder: (context, state) => _fadePage(
          key: state.pageKey,
          child: const HomeScreen(),
        ),
      ),
      GoRoute(
        path: Routes.library,
        builder: (context, state) => const DocumentListScreen(),
      ),
      GoRoute(
        path: Routes.settings,
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: Routes.scan,
        pageBuilder: (context, state) {
          final args = state.extra as ScanRouteArgs? ?? const ScanRouteArgs();
          return CustomTransitionPage<void>(
            key: state.pageKey,
            child: ScanScreen(args: args),
            transitionDuration: const Duration(milliseconds: 350),
            reverseTransitionDuration: const Duration(milliseconds: 280),
            transitionsBuilder:
                (context, animation, secondaryAnimation, child) {
              return SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0, 1),
                  end: Offset.zero,
                ).animate(CurvedAnimation(
                  parent: animation,
                  curve: Curves.easeOutCubic,
                )),
                child: child,
              );
            },
          );
        },
      ),
      GoRoute(
        path: Routes.crop,
        pageBuilder: (context, state) {
          final args = state.extra as CropRouteArgs?;
          return CustomTransitionPage<String?>(
            key: state.pageKey,
            child: args == null
                ? const Scaffold(
                    body: Center(child: Text('Image not found')),
                  )
                : CropScreen(args: args),
            transitionDuration: const Duration(milliseconds: 260),
            reverseTransitionDuration: const Duration(milliseconds: 220),
            transitionsBuilder:
                (context, animation, secondaryAnimation, child) {
              return FadeTransition(
                opacity:
                    CurvedAnimation(parent: animation, curve: Curves.easeOut),
                child: child,
              );
            },
          );
        },
      ),
      GoRoute(
        path: Routes.document,
        pageBuilder: (context, state) => CustomTransitionPage<void>(
          key: state.pageKey,
          child: DocumentDetailScreen(
            documentId: state.pathParameters['id']!,
          ),
          transitionDuration: const Duration(milliseconds: 320),
          reverseTransitionDuration: const Duration(milliseconds: 260),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(
              opacity:
                  CurvedAnimation(parent: animation, curve: Curves.easeOut),
              child: ScaleTransition(
                scale: Tween<double>(begin: 0.98, end: 1).animate(
                  CurvedAnimation(
                      parent: animation, curve: Curves.easeOutCubic),
                ),
                child: child,
              ),
            );
          },
        ),
        routes: [
          GoRoute(
            path: 'page/:pageId/enhance',
            builder: (context, state) {
              final extra = state.extra as Map<String, dynamic>?;
              final page = extra?['page'] as ScanPage?;
              if (page == null) {
                return const Scaffold(
                  body: Center(child: Text('Page not found')),
                );
              }
              return EnhanceScreen(
                page: page,
                documentId: state.pathParameters['id']!,
                pageNumber: extra?['pageNumber'] as int? ?? 1,
                pageTotal: extra?['pageTotal'] as int? ?? 1,
              );
            },
          ),
        ],
      ),
    ],
  );
});

CustomTransitionPage<void> _fadePage({
  required LocalKey key,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: const Duration(milliseconds: 400),
    reverseTransitionDuration: const Duration(milliseconds: 300),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
        child: child,
      );
    },
  );
}

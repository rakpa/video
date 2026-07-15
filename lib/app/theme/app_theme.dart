import 'package:flutter/material.dart';

import '../../core/design/app_color_tokens.dart';
import '../../core/design/app_spacing.dart';
import '../../core/design/app_typography.dart';

/// Assembles the light & dark [ThemeData] from the design tokens.
///
/// All colours come from [AppPalette]; custom tokens (gradients, glass, glow)
/// ride along as an [AppTokens] theme extension.
class AppTheme {
  AppTheme._();

  static ThemeData light() =>
      _build(AppPalette.lightScheme, AppPalette.lightTokens);
  static ThemeData dark() =>
      _build(AppPalette.darkScheme, AppPalette.darkTokens);

  static ThemeData _build(ColorScheme scheme, AppTokens tokens) {
    final textTheme = AppTypography.textTheme(scheme);

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: tokens.canvasBackground,
      textTheme: textTheme,
      extensions: [tokens],
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        scrolledUnderElevation: 0,
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        titleTextStyle: textTheme.titleLarge,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        color: scheme.brightness == Brightness.light
            ? Colors.white
            : scheme.surfaceContainerHighest,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 52),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          textStyle: textTheme.labelLarge,
          foregroundColor: scheme.primary,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
      ),
      dialogTheme: DialogThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
      ),
      scrollbarTheme: const ScrollbarThemeData(
        thumbVisibility: WidgetStatePropertyAll(false),
        trackVisibility: WidgetStatePropertyAll(false),
        thickness: WidgetStatePropertyAll(0),
      ),
    );
  }
}

/// Ergonomic access to the custom tokens: `context.tokens.scanSurface`.
extension AppThemeX on BuildContext {
  AppTokens get tokens => Theme.of(this).extension<AppTokens>()!;
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
}

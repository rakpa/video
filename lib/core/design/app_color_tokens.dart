import 'package:flutter/material.dart';

/// Extra design tokens that don't fit Material's [ColorScheme] â€” brand surfaces,
/// neumorphic canvas, and semantic colors from the Scanella Stitch design.
@immutable
class AppTokens extends ThemeExtension<AppTokens> {
  const AppTokens({
    required this.splashBackground,
    required this.scanSurface,
    required this.brandSoft,
    required this.onBrandSoft,
    required this.surfaceSunken,
    required this.textTertiary,
    required this.success,
    required this.warning,
    required this.danger,
    required this.premium,
    required this.canvasBackground,
  });

  /// Deep navy used on the splash screen.
  final Color splashBackground;
  final Color scanSurface;

  /// Light container fill + its on-color (chips, soft badges).
  final Color brandSoft;
  final Color onBrandSoft;

  /// A recessed surface (search wells, pressed neumorphic areas).
  final Color surfaceSunken;

  /// Lowest-emphasis text (timestamps, captions).
  final Color textTertiary;

  final Color success;
  final Color warning;
  final Color danger;

  /// Highlight / "Pro" accent.
  final Color premium;

  /// Dashboard canvas (#F5F5F7 in Stitch).
  final Color canvasBackground;

  @override
  AppTokens copyWith({
    Color? splashBackground,
    Color? scanSurface,
    Color? brandSoft,
    Color? onBrandSoft,
    Color? surfaceSunken,
    Color? textTertiary,
    Color? success,
    Color? warning,
    Color? danger,
    Color? premium,
    Color? canvasBackground,
  }) {
    return AppTokens(
      splashBackground: splashBackground ?? this.splashBackground,
      scanSurface: scanSurface ?? this.scanSurface,
      brandSoft: brandSoft ?? this.brandSoft,
      onBrandSoft: onBrandSoft ?? this.onBrandSoft,
      surfaceSunken: surfaceSunken ?? this.surfaceSunken,
      textTertiary: textTertiary ?? this.textTertiary,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      premium: premium ?? this.premium,
      canvasBackground: canvasBackground ?? this.canvasBackground,
    );
  }

  @override
  AppTokens lerp(AppTokens? other, double t) {
    if (other == null) return this;
    return AppTokens(
      splashBackground:
          Color.lerp(splashBackground, other.splashBackground, t)!,
      scanSurface: Color.lerp(scanSurface, other.scanSurface, t)!,
      brandSoft: Color.lerp(brandSoft, other.brandSoft, t)!,
      onBrandSoft: Color.lerp(onBrandSoft, other.onBrandSoft, t)!,
      surfaceSunken: Color.lerp(surfaceSunken, other.surfaceSunken, t)!,
      textTertiary: Color.lerp(textTertiary, other.textTertiary, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      premium: Color.lerp(premium, other.premium, t)!,
      canvasBackground:
          Color.lerp(canvasBackground, other.canvasBackground, t)!,
    );
  }
}

/// Raw brand colour constants from Stitch project 9661105501663215896.
abstract final class BrandColors {
  static const Color primary = Color(0xFF0040A1);
  static const Color primaryContainer = Color(0xFF0056D2);
  static const Color primaryFixed = Color(0xFFDAE2FF);
  static const Color secondary = Color(0xFF006A6A);
  static const Color secondaryContainer = Color(0xFF90EFEF);
  static const Color splashNavy = Color(0xFF001847);
  static const Color canvas = Color(0xFFF5F5F7);
  static const Color surface = Color(0xFFF9F9FB);
  static const Color amber = Color(0xFFF59E0B);

  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFBA1A1A);
}

/// Light + dark [ColorScheme]s and matching [AppTokens].
abstract final class AppPalette {
  static const ColorScheme lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: BrandColors.primary,
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: BrandColors.primaryContainer,
    onPrimaryContainer: Color(0xFFCCD8FF),
    secondary: BrandColors.secondary,
    onSecondary: Color(0xFFFFFFFF),
    secondaryContainer: BrandColors.secondaryContainer,
    onSecondaryContainer: Color(0xFF006E6E),
    tertiary: Color(0xFF2E4B58),
    onTertiary: Color(0xFFFFFFFF),
    error: BrandColors.danger,
    onError: Color(0xFFFFFFFF),
    surface: BrandColors.surface,
    onSurface: Color(0xFF1A1C1D),
    surfaceContainerHighest: Color(0xFFE2E2E4),
    onSurfaceVariant: Color(0xFF424654),
    outline: Color(0xFF737785),
    outlineVariant: Color(0xFFC3C6D6),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFF2F3132),
    onInverseSurface: Color(0xFFF0F0F2),
    inversePrimary: Color(0xFFB2C5FF),
  );

  static const AppTokens lightTokens = AppTokens(
    splashBackground: BrandColors.splashNavy,
    scanSurface: BrandColors.primaryContainer,
    brandSoft: BrandColors.primaryFixed,
    onBrandSoft: Color(0xFF0040A1),
    surfaceSunken: Color(0xFFF3F3F5),
    textTertiary: Color(0xFF737785),
    success: BrandColors.success,
    warning: BrandColors.warning,
    danger: BrandColors.danger,
    premium: BrandColors.amber,
    canvasBackground: BrandColors.canvas,
  );

  static const ColorScheme darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFFB2C5FF),
    onPrimary: Color(0xFF001847),
    primaryContainer: Color(0xFF0040A1),
    onPrimaryContainer: Color(0xFFCCD8FF),
    secondary: Color(0xFF76D6D5),
    onSecondary: Color(0xFF002020),
    secondaryContainer: Color(0xFF004F4F),
    onSecondaryContainer: Color(0xFF93F2F2),
    tertiary: Color(0xFFADCBDA),
    onTertiary: Color(0xFF001F2A),
    error: Color(0xFFFFB4AB),
    onError: Color(0xFF690005),
    surface: Color(0xFF0F1218),
    onSurface: Color(0xFFF0F0F2),
    surfaceContainerHighest: Color(0xFF1E2228),
    onSurfaceVariant: Color(0xFFC3C6D6),
    outline: Color(0xFF737785),
    outlineVariant: Color(0xFF424654),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFFF0F0F2),
    onInverseSurface: Color(0xFF2F3132),
    inversePrimary: BrandColors.primary,
  );

  static const AppTokens darkTokens = AppTokens(
    splashBackground: BrandColors.splashNavy,
    scanSurface: Color(0xFF003580),
    brandSoft: Color(0xFF1A2A4A),
    onBrandSoft: Color(0xFFB2C5FF),
    surfaceSunken: Color(0xFF161A22),
    textTertiary: Color(0xFF737785),
    success: BrandColors.success,
    warning: BrandColors.warning,
    danger: Color(0xFFFFB4AB),
    premium: Color(0xFFF5C451),
    canvasBackground: Color(0xFF0F1218),
  );
}

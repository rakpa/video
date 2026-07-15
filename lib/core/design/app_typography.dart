import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// App type ramp, built on Inter — clean and legible across platforms.
abstract final class AppTypography {
  static TextTheme textTheme(ColorScheme scheme) {
    final base = GoogleFonts.config.allowRuntimeFetching
        ? GoogleFonts.interTextTheme()
        : Typography.material2021(platform: TargetPlatform.android).black;
    final onSurface = scheme.onSurface;
    final muted = scheme.onSurfaceVariant;

    return base.copyWith(
      displaySmall: base.displaySmall?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -1,
        color: onSurface,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
        color: onSurface,
      ),
      headlineSmall: base.headlineSmall?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
        color: onSurface,
      ),
      titleLarge: base.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
        color: onSurface,
      ),
      titleMedium: base.titleMedium?.copyWith(
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
        color: onSurface,
      ),
      titleSmall: base.titleSmall?.copyWith(
        fontWeight: FontWeight.w600,
        color: onSurface,
      ),
      bodyLarge: base.bodyLarge?.copyWith(height: 1.5, color: onSurface),
      bodyMedium: base.bodyMedium?.copyWith(height: 1.5, color: muted),
      bodySmall: base.bodySmall?.copyWith(height: 1.45, color: muted),
      labelLarge: base.labelLarge?.copyWith(
        fontWeight: FontWeight.w600,
        letterSpacing: 0,
        color: onSurface,
      ),
    );
  }
}

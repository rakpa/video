import 'package:flutter/material.dart';

/// Home screen design tokens — blue/white Scanella branding.
abstract final class HomeDesign {
  static const primary = Color(0xFF0040A1);
  static const primaryLight = Color(0xFF1A5DC4);
  static const secondary = Color(0xFF006A6A);
  static const canvas = Color(0xFFF5F5F7);
  static const surface = Color(0xFFFFFFFF);
  static const mutedSurface = Color(0xFFF9F9FB);
  static const onSurface = Color(0xFF1A1C1D);
  static const muted = Color(0xFF737785);
  static const border = Color(0xFFE8EAED);

  static const radiusMd = 16.0;
  static const radiusLg = 20.0;

  static const sectionGap = 14.0;
  static const cardGap = 12.0;

  static Color canvasOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? Theme.of(context).colorScheme.surface
          : canvas;

  static Color surfaceOf(BuildContext context) =>
      Theme.of(context).colorScheme.surface;

  static Color onSurfaceOf(BuildContext context) =>
      Theme.of(context).colorScheme.onSurface;

  static Color mutedOf(BuildContext context) =>
      Theme.of(context).colorScheme.onSurfaceVariant;

  static List<BoxShadow> get softShadow => [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.04),
          blurRadius: 16,
          offset: const Offset(0, 6),
        ),
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.02),
          blurRadius: 4,
          offset: const Offset(0, 1),
        ),
      ];

  static List<BoxShadow> get elevatedShadow => [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.08),
          blurRadius: 24,
          offset: const Offset(0, 10),
        ),
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.03),
          blurRadius: 8,
          offset: const Offset(0, 3),
        ),
      ];

  static List<BoxShadow> get fabShadow => [
        BoxShadow(
          color: primary.withValues(alpha: 0.28),
          blurRadius: 20,
          offset: const Offset(0, 8),
        ),
      ];

  static Color folderAccent(String name) {
    final n = name.toLowerCase();
    if (n.contains('receipt')) return const Color(0xFFFFB300);
    if (n.contains('work')) return primary;
    if (n.contains('personal')) return const Color(0xFF2E7D32);
    if (n.contains('medical')) return const Color(0xFFC62828);
    const palette = [
      Color(0xFFFFB300),
      Color(0xFF0040A1),
      Color(0xFF2E7D32),
      Color(0xFF7B1FA2),
      Color(0xFF00838F),
    ];
    return palette[name.hashCode.abs() % palette.length];
  }
}

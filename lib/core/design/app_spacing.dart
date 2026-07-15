import 'package:flutter/widgets.dart';

/// 4-pt spacing scale. Use these instead of magic numbers so rhythm stays
/// consistent across every screen.
abstract final class AppSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 40;
  static const double huge = 56;

  // Common edge insets.
  static const EdgeInsets screen = EdgeInsets.symmetric(horizontal: md);
  static const EdgeInsets card = EdgeInsets.all(md);
}

/// Corner-radius scale.
abstract final class AppRadius {
  static const double sm = 10;
  static const double md = 16;
  static const double lg = 22;
  static const double xl = 28;
  static const double pill = 999;

  static const Radius rMd = Radius.circular(md);
  static const Radius rLg = Radius.circular(lg);
  static const Radius rXl = Radius.circular(xl);
}

/// Animation durations — fluid, premium timing (per design direction).
abstract final class AppDuration {
  static const Duration micro = Duration(milliseconds: 180);
  static const Duration base = Duration(milliseconds: 320);
  static const Duration slow = Duration(milliseconds: 520);
  static const Duration splash = Duration(milliseconds: 1600);
}

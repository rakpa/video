import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'home_design_tokens.dart';

/// Inter-based text styles for the premium home UI.
abstract final class HomeTypography {
  static TextStyle _style({
    required double size,
    FontWeight weight = FontWeight.w400,
    Color? color,
    double? height,
    double letterSpacing = 0,
  }) {
    return GoogleFonts.inter(
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: height,
      letterSpacing: letterSpacing,
    );
  }

  static TextStyle get appTitle => _style(
        size: 22,
        weight: FontWeight.w700,
        color: HomeDesign.primary,
        letterSpacing: -0.2,
        height: 1.2,
      );

  static TextStyle get sectionTitle => _style(
        size: 20,
        weight: FontWeight.w700,
        color: HomeDesign.onSurface,
        letterSpacing: -0.2,
        height: 1.25,
      );

  static TextStyle get body => _style(
        size: 16,
        color: HomeDesign.onSurface,
        height: 1.4,
      );

  static TextStyle get bodyMuted => _style(
        size: 15,
        color: HomeDesign.muted,
        height: 1.4,
      );

  static TextStyle get label => _style(
        size: 14,
        weight: FontWeight.w600,
        color: HomeDesign.onSurface,
        height: 1.2,
      );

  static TextStyle get caption => _style(
        size: 12,
        weight: FontWeight.w500,
        color: HomeDesign.muted,
        height: 1.2,
      );

  static TextStyle get navLabel => _style(
        size: 12,
        weight: FontWeight.w600,
        height: 1.1,
      );

  static TextStyle get quickActionTitle => _style(
        size: 14,
        weight: FontWeight.w600,
        color: HomeDesign.onSurface,
        letterSpacing: -0.1,
        height: 1.2,
      );

  static TextStyle get quickActionSubtitle => _style(
        size: 12,
        color: HomeDesign.muted,
        height: 1.35,
      );
}

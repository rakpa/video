import 'package:flutter/material.dart';

import '../../home/presentation/home_design_tokens.dart';

/// Scanner-specific tokens — reuses Scanella home branding.
abstract final class ScanDesign {
  static const primary = HomeDesign.primary;
  static const primaryLight = HomeDesign.primaryLight;
  static const guideBlue = Color(0xFF0056D2);
  static const overlay = Color(0x99000000);
  static const glass = Color(0xCC0D1117);
  static const onDark = Colors.white;
  static const onDarkMuted = Color(0xB3FFFFFF);
}

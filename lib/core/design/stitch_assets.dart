import 'package:flutter/material.dart';

/// Sequential Stitch screen PNGs (pixel-perfect design reference).
abstract final class StitchAssets {
  static const String splash = 'assets/stitch/00_splash.png';
  static const String splashIcon = 'assets/stitch/splash_icon.png';
  static const String logo = 'assets/stitch/01_logo.png';
  static const String onboardingAutoCrop =
      'assets/stitch/02_onboarding_auto_crop.png';
  static const String smartCapture = 'assets/stitch/03_smart_capture.png';
  static const String perspectiveCrop = 'assets/stitch/04_perspective_crop.png';
  static const String filterEnhance = 'assets/stitch/05_filter_enhance.png';
  static const String documentExport = 'assets/stitch/06_document_export.png';
  static const String dashboard = 'assets/stitch/07_dashboard.png';
  static const String premiumDashboard =
      'assets/stitch/08_premium_dashboard.png';
  static const String settings = 'assets/stitch/09_settings.png';
  static const String premiumSmartCapture =
      'assets/stitch/10_premium_smart_capture.png';
  static const String premiumDocumentExport =
      'assets/stitch/11_premium_document_export.png';

  static const onboardingFlow = [
    onboardingAutoCrop,
    smartCapture,
    perspectiveCrop,
    filterEnhance,
    documentExport,
  ];

  /// Full sequential order matching the Stitch export (01→11).
  static const allScreens = [
    splash,
    logo,
    onboardingAutoCrop,
    smartCapture,
    perspectiveCrop,
    filterEnhance,
    documentExport,
    dashboard,
    premiumDashboard,
    settings,
    premiumSmartCapture,
    premiumDocumentExport,
  ];

  static String smartCaptureFor({required bool premium}) =>
      premium ? premiumSmartCapture : smartCapture;

  static String documentExportFor({required bool premium}) =>
      premium ? premiumDocumentExport : documentExport;
}

/// Percentage-based tap region on a Stitch screenshot (0.0–1.0).
class StitchHotspot {
  const StitchHotspot({
    required this.left,
    required this.top,
    required this.width,
    required this.height,
    required this.onTap,
    this.semanticLabel,
  });

  final double left;
  final double top;
  final double width;
  final double height;
  final VoidCallback onTap;
  final String? semanticLabel;
}

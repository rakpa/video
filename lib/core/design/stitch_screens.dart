/// Stitch HTML screen asset paths (from Google Stitch exports).
abstract final class StitchScreens {
  static const htmlBase = 'assets/stitch/html';

  static const splash = '$htmlBase/splash.html';
  static const onboardingAutoCrop = '$htmlBase/onboarding_auto_crop.html';
  static const smartCapture = '$htmlBase/smart_capture.html';
  static const perspectiveCrop = '$htmlBase/perspective_crop.html';
  static const filterEnhance = '$htmlBase/filter_enhance.html';
  static const documentExport = '$htmlBase/document_export.html';
  static const dashboard = '$htmlBase/dashboard.html';
  static const premiumDashboard = '$htmlBase/premium_dashboard.html';
  static const settings = '$htmlBase/settings.html';
  static const premiumSmartCapture = '$htmlBase/premium_smart_capture.html';
  static const premiumDocumentExport = '$htmlBase/premium_document_export.html';
  static const premiumSplash = '$htmlBase/premium_splash.html';

  static const onboardingFlow = [
    onboardingAutoCrop,
    smartCapture,
    perspectiveCrop,
    filterEnhance,
    documentExport,
  ];

  static String smartCaptureFor({required bool premium}) =>
      premium ? premiumSmartCapture : smartCapture;

  static String documentExportFor({required bool premium}) =>
      premium ? premiumDocumentExport : documentExport;

  /// Stitch design canvas width (px).
  static const designWidth = 780.0;

  /// Stitch design canvas height (px).
  static const designHeight = 1768.0;
}

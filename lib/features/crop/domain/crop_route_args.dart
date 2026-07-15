import 'dart:ui' show Offset;

/// Arguments for the reusable crop editor.
class CropRouteArgs {
  const CropRouteArgs({
    required this.imagePath,
    this.initialNormalizedCorners,
    this.title = 'Adjust corners',
  });

  final String imagePath;

  /// Optional TL/TR/BR/BL corners normalized to the source image frame.
  final List<Offset>? initialNormalizedCorners;

  final String title;
}

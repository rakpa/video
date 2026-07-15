import 'dart:io';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../domain/perspective_transform.dart' as perspective;
import '../domain/scan_mode.dart';
import 'document_quad_detector.dart';

/// Crops a captured photo to the document boundary with true perspective
/// correction (keystone removal), like a native scanner.
///
/// The document quad is re-detected on the captured still itself (higher
/// quality than the live preview estimate); the live [quad] is only a hint.
/// All decoding and pixel work runs on a background isolate via [compute].
class ScanImageProcessor {
  Future<String> cropToQuad({
    required String sourcePath,
    required DocumentQuad quad,
    required ScanMode mode,
    bool applyModeEnhancement = true,
  }) async {
    if (kIsWeb) return sourcePath;

    final dir = await getTemporaryDirectory();
    final outPath = p.join(
      dir.path,
      'scan_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );

    return compute(
      _runCropAndRectify,
      _CropArgs(
        sourcePath: sourcePath,
        outPath: outPath,
        modeIndex: mode.index,
        applyModeEnhancement: applyModeEnhancement,
        liveCorners:
            quad.corners.map((c) => [c.dx, c.dy]).toList(growable: false),
      ),
    );
  }

  /// Applies perspective correction with caller-provided full-resolution image
  /// corners. Used by the manual crop editor after the user adjusts handles.
  Future<String> cropWithCorners({
    required String sourcePath,
    required List<Offset> corners,
  }) async {
    if (kIsWeb) return sourcePath;

    final dir = await getTemporaryDirectory();
    final outPath = p.join(
      dir.path,
      'scan_crop_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );

    return compute(
      _runExplicitCornerCrop,
      _ExplicitCropArgs(
        sourcePath: sourcePath,
        outPath: outPath,
        corners: corners.map((c) => [c.dx, c.dy]).toList(growable: false),
      ),
    );
  }
}

@visibleForTesting
img.Image warpPerspectiveForTesting(img.Image src, List<Offset> corners) {
  return perspective.warpPerspective(src, corners);
}

@immutable
class _CropArgs {
  const _CropArgs({
    required this.sourcePath,
    required this.outPath,
    required this.modeIndex,
    required this.applyModeEnhancement,
    required this.liveCorners,
  });

  final String sourcePath;
  final String outPath;
  final int modeIndex;
  final bool applyModeEnhancement;

  /// TL/TR/BR/BL corners from the live tracker, normalized to preview space.
  final List<List<double>> liveCorners;
}

@immutable
class _ExplicitCropArgs {
  const _ExplicitCropArgs({
    required this.sourcePath,
    required this.outPath,
    required this.corners,
  });

  final String sourcePath;
  final String outPath;
  final List<List<double>> corners;
}

/// Top-level entry point executed on the background isolate.
Future<String> _runCropAndRectify(_CropArgs args) async {
  final bytes = await File(args.sourcePath).readAsBytes();
  var decoded = img.decodeImage(bytes);
  if (decoded == null) return args.sourcePath;

  decoded = img.bakeOrientation(decoded);

  final corners =
      _detectStillCorners(decoded) ?? _liveCornersFor(decoded, args);

  var result = corners != null
      ? perspective.warpPerspective(decoded, corners)
      : decoded; // No confident boundary — keep the full frame.

  if (args.applyModeEnhancement) {
    final mode = ScanMode.values[args.modeIndex];
    result = switch (mode) {
      ScanMode.whiteboard =>
        img.adjustColor(result, contrast: 1.12, brightness: 1.04),
      ScanMode.receipt => img.grayscale(result),
      ScanMode.idCard => img.adjustColor(result, contrast: 1.08),
      _ => img.adjustColor(result, contrast: 1.05),
    };
  }

  await File(args.outPath).writeAsBytes(img.encodeJpg(result, quality: 92));
  return args.outPath;
}

Future<String> _runExplicitCornerCrop(_ExplicitCropArgs args) async {
  final bytes = await File(args.sourcePath).readAsBytes();
  var decoded = img.decodeImage(bytes);
  if (decoded == null) return args.sourcePath;

  decoded = img.bakeOrientation(decoded);
  final corners =
      args.corners.map((c) => Offset(c[0], c[1])).toList(growable: false);
  final result = perspective.cropWithCorners(decoded, corners);
  await File(args.outPath).writeAsBytes(img.encodeJpg(result, quality: 92));
  return args.outPath;
}

/// Runs the shared quad detector on a downscaled grayscale copy of the still.
/// Returns corners in full-resolution pixel coordinates, or null.
List<Offset>? _detectStillCorners(img.Image still) {
  const analysisWidth = 300;
  final scale = still.width / analysisWidth;
  const gridW = analysisWidth;
  final gridH = (still.height / scale).round().clamp(48, 460);

  final small = img.copyResize(
    still,
    width: gridW,
    height: gridH,
    interpolation: img.Interpolation.average,
  );

  final lum = Uint8List(gridW * gridH);
  for (var y = 0; y < gridH; y++) {
    for (var x = 0; x < gridW; x++) {
      lum[y * gridW + x] = img.getLuminance(small.getPixel(x, y)).round();
    }
  }

  final detection = const DocumentQuadDetector().detect(lum, gridW, gridH);
  if (detection == null || detection.confidence < 0.45) return null;

  return detection.corners
      .map((c) => Offset(c.dx * still.width, c.dy * still.height))
      .toList(growable: false);
}

/// Maps the live preview quad onto the still as a fallback hint. Only trusted
/// when it differs meaningfully from the full frame (otherwise cropping adds
/// nothing and risks cutting content).
List<Offset>? _liveCornersFor(img.Image still, _CropArgs args) {
  final corners = args.liveCorners
      .map((c) => Offset(
            (c[0] * still.width).clamp(0.0, still.width.toDouble()),
            (c[1] * still.height).clamp(0.0, still.height.toDouble()),
          ))
      .toList(growable: false);

  final area = _quadArea(corners);
  final frameArea = still.width * still.height;
  final ratio = area / frameArea;
  if (ratio < 0.15 || ratio > 0.95) return null;
  return corners;
}

double _quadArea(List<Offset> quad) {
  var area = 0.0;
  for (var i = 0; i < quad.length; i++) {
    final a = quad[i];
    final b = quad[(i + 1) % quad.length];
    area += a.dx * b.dy - b.dx * a.dy;
  }
  return area.abs() / 2;
}

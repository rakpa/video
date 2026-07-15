import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;

import '../domain/doc_filter.dart';

/// Runs image enhancement off the UI thread.
///
/// All heavy pixel work happens inside [compute] (a background isolate), so the
/// editor stays responsive even on large scans. The public API takes/returns
/// raw bytes, which are cheap to ship across the isolate boundary.
class ImageProcessor {
  /// Applies [filter] plus brightness/contrast and returns encoded JPEG bytes.
  ///
  /// [brightness] and [contrast] are multipliers where 1.0 == no change.
  /// [maxDimension] caps the longest side (used to keep previews fast); pass a
  /// larger value (or a high cap) when saving at full quality.
  Future<Uint8List> process({
    required Uint8List bytes,
    required DocFilter filter,
    double brightness = 1.0,
    double contrast = 1.0,
    int? maxDimension,
    int quality = 90,
  }) {
    final args = _ProcessArgs(
      bytes: bytes,
      filterIndex: filter.index,
      brightness: brightness,
      contrast: contrast,
      maxDimension: maxDimension,
      quality: quality,
    );
    return compute(_runProcessing, args);
  }

  Future<Uint8List> rotate90({
    required Uint8List bytes,
    required bool clockwise,
    int quality = 92,
  }) {
    return compute(
      _runRotate90,
      _RotateArgs(bytes: bytes, clockwise: clockwise, quality: quality),
    );
  }
}

final imageProcessorProvider = Provider<ImageProcessor>((ref) {
  return ImageProcessor();
});

/// Immutable, isolate-sendable bundle of processing parameters.
@immutable
class _ProcessArgs {
  const _ProcessArgs({
    required this.bytes,
    required this.filterIndex,
    required this.brightness,
    required this.contrast,
    required this.maxDimension,
    required this.quality,
  });

  final Uint8List bytes;
  final int filterIndex;
  final double brightness;
  final double contrast;
  final int? maxDimension;
  final int quality;
}

@immutable
class _RotateArgs {
  const _RotateArgs({
    required this.bytes,
    required this.clockwise,
    required this.quality,
  });

  final Uint8List bytes;
  final bool clockwise;
  final int quality;
}

/// Top-level entry point executed on the background isolate. Must be a free
/// function (not a closure/method) for [compute] to use it.
Uint8List _runProcessing(_ProcessArgs args) {
  final decoded = img.decodeImage(args.bytes);
  if (decoded == null) {
    return args.bytes; // not a decodable image — pass through
  }

  var image = decoded;

  // Downscale for previews / cap output size.
  final maxDim = args.maxDimension;
  if (maxDim != null) {
    final longest = image.width > image.height ? image.width : image.height;
    if (longest > maxDim) {
      image = image.width >= image.height
          ? img.copyResize(image, width: maxDim)
          : img.copyResize(image, height: maxDim);
    }
  }

  switch (DocFilter.values[args.filterIndex]) {
    case DocFilter.original:
      break;
    case DocFilter.color:
      image = img.adjustColor(image, saturation: 1.08, contrast: 1.04);
      break;
    case DocFilter.auto:
      // Contrast-stretch the histogram, then a gentle pop.
      image = img.normalize(image, min: 0, max: 255);
      image = img.adjustColor(image, contrast: 1.05, saturation: 1.08);
    case DocFilter.magic:
      // The vivid, high-contrast "document" look.
      image = img.normalize(image, min: 0, max: 255);
      image = img.adjustColor(
        image,
        contrast: 1.2,
        saturation: 1.35,
        brightness: 1.05,
      );
    case DocFilter.lighten:
      image = img.adjustColor(image, brightness: 1.12, contrast: 1.08);
    case DocFilter.grayscale:
      image = img.grayscale(image);
    case DocFilter.blackWhite:
      image = img.grayscale(image);
      _applyAdaptiveThreshold(image);
  }

  // Manual brightness/contrast on top of any filter.
  if (args.brightness != 1.0 || args.contrast != 1.0) {
    image = img.adjustColor(
      image,
      brightness: args.brightness,
      contrast: args.contrast,
    );
  }

  return img.encodeJpg(image, quality: args.quality);
}

Uint8List _runRotate90(_RotateArgs args) {
  final decoded = img.decodeImage(args.bytes);
  if (decoded == null) return args.bytes;
  final baked = img.bakeOrientation(decoded);
  final rotated = img.copyRotate(baked, angle: args.clockwise ? 90 : -90);
  return img.encodeJpg(rotated, quality: args.quality);
}

/// In-place local mean threshold -> pure black/white (scanned-text look).
///
/// A block-based threshold handles shadows and page gradients better than one
/// global cutoff while staying simple enough for the pure Dart image pipeline.
void _applyAdaptiveThreshold(img.Image image, {int blockSize = 24}) {
  final width = image.width;
  final height = image.height;
  final luma = List<int>.filled(width * height, 0);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final pixel = image.getPixel(x, y);
      luma[y * width + x] =
          (0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b).round();
    }
  }

  for (var by = 0; by < height; by += blockSize) {
    final yEnd = (by + blockSize).clamp(0, height);
    for (var bx = 0; bx < width; bx += blockSize) {
      final xEnd = (bx + blockSize).clamp(0, width);
      var sum = 0;
      var count = 0;
      for (var y = by; y < yEnd; y++) {
        for (var x = bx; x < xEnd; x++) {
          sum += luma[y * width + x];
          count++;
        }
      }
      final threshold = count == 0 ? 128 : (sum / count) - 6;
      for (var y = by; y < yEnd; y++) {
        for (var x = bx; x < xEnd; x++) {
          final value = luma[y * width + x] >= threshold ? 255 : 0;
          image.getPixel(x, y).setRgb(value, value, value);
        }
      }
    }
  }
}

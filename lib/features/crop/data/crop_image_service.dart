import 'dart:io';
import 'dart:ui' show Offset;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../scan/data/document_quad_detector.dart';
import '../../scan/domain/perspective_transform.dart' as perspective;

final cropImageServiceProvider = Provider<CropImageService>((ref) {
  return CropImageService();
});

class CropImageService {
  Future<List<Offset>?> detectCorners(String imagePath) {
    if (kIsWeb) return Future.value(null);
    return compute(_detectCornersInImage, imagePath);
  }

  Future<String> applyCrop({
    required String imagePath,
    required List<Offset> corners,
    bool useFullImage = false,
  }) async {
    if (kIsWeb || useFullImage) return imagePath;

    final dir = await getTemporaryDirectory();
    final outPath = p.join(
      dir.path,
      'crop_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );

    return compute(
      _applyPerspectiveCrop,
      _CropJob(
        sourcePath: imagePath,
        outPath: outPath,
        corners: corners.map((c) => [c.dx, c.dy]).toList(growable: false),
      ),
    );
  }
}

@immutable
class _CropJob {
  const _CropJob({
    required this.sourcePath,
    required this.outPath,
    required this.corners,
  });

  final String sourcePath;
  final String outPath;
  final List<List<double>> corners;
}

Future<String> _applyPerspectiveCrop(_CropJob job) async {
  final bytes = await File(job.sourcePath).readAsBytes();
  var decoded = img.decodeImage(bytes);
  if (decoded == null) return job.sourcePath;
  decoded = img.bakeOrientation(decoded);

  final corners =
      job.corners.map((c) => Offset(c[0], c[1])).toList(growable: false);
  final cropped = perspective.cropWithCorners(decoded, corners);
  await File(job.outPath).writeAsBytes(img.encodeJpg(cropped, quality: 92));
  return job.outPath;
}

Future<List<Offset>?> _detectCornersInImage(String imagePath) async {
  final bytes = await File(imagePath).readAsBytes();
  final decodedRaw = img.decodeImage(bytes);
  if (decodedRaw == null) return null;
  final decoded = img.bakeOrientation(decodedRaw);

  const analysisWidth = 300;
  final scale = decoded.width / analysisWidth;
  const gridW = analysisWidth;
  final gridH = (decoded.height / scale).round().clamp(48, 460);

  final small = img.copyResize(
    decoded,
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
  if (detection == null || detection.confidence < 0.35) return null;

  return detection.corners
      .map((c) => Offset(c.dx * decoded.width, c.dy * decoded.height))
      .toList(growable: false);
}

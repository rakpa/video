import 'dart:ui';

import 'package:doc_scanner/features/scan/data/scan_image_processor.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  test('warpPerspectiveForTesting rectifies a tilted quad', () {
    final source = img.Image(width: 100, height: 80);
    for (var y = 0; y < source.height; y++) {
      for (var x = 0; x < source.width; x++) {
        source.setPixelRgb(x, y, 30, 30, 30);
      }
    }

    for (var y = 20; y < 62; y++) {
      for (var x = 24; x < 78; x++) {
        source.setPixelRgb(x, y, 230, 230, 230);
      }
    }

    final warped = warpPerspectiveForTesting(
      source,
      const [
        Offset(24, 20),
        Offset(78, 16),
        Offset(74, 64),
        Offset(20, 60),
      ],
    );

    expect(warped.width, greaterThan(40));
    expect(warped.height, greaterThan(35));
    expect(
        img.getLuminance(
            warped.getPixel(warped.width ~/ 2, warped.height ~/ 2)),
        greaterThan(180));
  });
}

import 'dart:typed_data';
import 'dart:ui';

import 'package:doc_scanner/features/scan/data/document_quad_detector.dart';
import 'package:flutter_test/flutter_test.dart';

/// Renders a filled convex quad (TL/TR/BR/BL) onto a flat background grid.
Uint8List _renderQuad({
  required int width,
  required int height,
  required List<Offset> corners,
  required int background,
  required int fill,
}) {
  final lum = Uint8List(width * height)
    ..fillRange(0, width * height, background);

  bool inside(double px, double py) {
    var sign = 0;
    for (var i = 0; i < 4; i++) {
      final a = corners[i];
      final b = corners[(i + 1) % 4];
      final cross = (b.dx - a.dx) * (py - a.dy) - (b.dy - a.dy) * (px - a.dx);
      if (cross.abs() < 1e-9) continue;
      final s = cross > 0 ? 1 : -1;
      if (sign == 0) {
        sign = s;
      } else if (s != sign) {
        return false;
      }
    }
    return true;
  }

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      if (inside(x.toDouble(), y.toDouble())) {
        lum[y * width + x] = fill;
      }
    }
  }
  return lum;
}

void _expectCornersClose(
  List<Offset> detected,
  List<Offset> expected,
  int width,
  int height, {
  double tolerancePx = 7,
}) {
  for (var i = 0; i < 4; i++) {
    final d = Offset(detected[i].dx * width, detected[i].dy * height);
    final delta = (d - expected[i]).distance;
    expect(
      delta,
      lessThan(tolerancePx),
      reason: 'corner $i detected at $d, expected near ${expected[i]}',
    );
  }
}

void main() {
  const detector = DocumentQuadDetector();
  const w = 160;
  const h = 120;

  test('detects a bright tilted document on a dark background', () {
    final corners = [
      const Offset(32, 22), // TL
      const Offset(128, 30), // TR
      const Offset(122, 98), // BR
      const Offset(26, 88), // BL
    ];
    final lum = _renderQuad(
      width: w,
      height: h,
      corners: corners,
      background: 45,
      fill: 215,
    );

    final result = detector.detect(lum, w, h);
    expect(result, isNotNull);
    expect(result!.confidence, greaterThan(0.5));
    _expectCornersClose(result.corners, corners, w, h);
  });

  test('detects a dark document on a light background', () {
    final corners = [
      const Offset(40, 25),
      const Offset(120, 25),
      const Offset(120, 95),
      const Offset(40, 95),
    ];
    final lum = _renderQuad(
      width: w,
      height: h,
      corners: corners,
      background: 200,
      fill: 60,
    );

    final result = detector.detect(lum, w, h);
    expect(result, isNotNull);
    _expectCornersClose(result!.corners, corners, w, h);
  });

  test('returns null on an empty frame', () {
    final lum = Uint8List(w * h)..fillRange(0, w * h, 128);
    expect(detector.detect(lum, w, h), isNull);
  });

  test('ignores blobs that are too small to be a document', () {
    final corners = [
      const Offset(75, 55),
      const Offset(85, 55),
      const Offset(85, 65),
      const Offset(75, 65),
    ];
    final lum = _renderQuad(
      width: w,
      height: h,
      corners: corners,
      background: 45,
      fill: 215,
    );
    expect(detector.detect(lum, w, h), isNull);
  });

  test('survives moderate sensor noise', () {
    final corners = [
      const Offset(30, 20),
      const Offset(130, 24),
      const Offset(126, 100),
      const Offset(28, 94),
    ];
    final lum = _renderQuad(
      width: w,
      height: h,
      corners: corners,
      background: 50,
      fill: 210,
    );
    // Deterministic pseudo-noise of ±8 luminance.
    var seed = 12345;
    for (var i = 0; i < lum.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      final noise = (seed % 17) - 8;
      lum[i] = (lum[i] + noise).clamp(0, 255);
    }

    final result = detector.detect(lum, w, h);
    expect(result, isNotNull);
    _expectCornersClose(result!.corners, corners, w, h, tolerancePx: 9);
  });

  test('detects a document that fills most of the frame', () {
    // The border ring lies mostly ON the document here — region-based
    // background estimation fails; only edge-based detection works.
    final corners = [
      const Offset(10, 8),
      const Offset(150, 10),
      const Offset(148, 112),
      const Offset(8, 110),
    ];
    final lum = _renderQuad(
      width: w,
      height: h,
      corners: corners,
      background: 70,
      fill: 205,
    );

    final result = detector.detect(lum, w, h);
    expect(result, isNotNull);
    _expectCornersClose(result!.corners, corners, w, h, tolerancePx: 8);
  });

  test('detects a document on a textured background', () {
    final corners = [
      const Offset(34, 24),
      const Offset(126, 28),
      const Offset(122, 96),
      const Offset(30, 90),
    ];
    final lum = _renderQuad(
      width: w,
      height: h,
      corners: corners,
      background: 90,
      fill: 210,
    );
    // Wood-grain-like background texture: ±25 luminance stripes outside the
    // document (leaves the interior untouched).
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        final i = y * w + x;
        if (lum[i] != 210) {
          final stripe = ((x + y * 2) % 9) < 4 ? 25 : -25;
          lum[i] = (lum[i] + stripe).clamp(0, 255);
        }
      }
    }

    final result = detector.detect(lum, w, h);
    expect(result, isNotNull);
    _expectCornersClose(result!.corners, corners, w, h, tolerancePx: 9);
  });

  test('orderCorners sorts arbitrary point order into TL/TR/BR/BL', () {
    final ordered = DocumentQuadDetector.orderCorners([
      const Offset(0.9, 0.8), // BR
      const Offset(0.1, 0.1), // TL
      const Offset(0.12, 0.82), // BL
      const Offset(0.88, 0.12), // TR
    ]);
    expect(ordered[0], const Offset(0.1, 0.1));
    expect(ordered[1], const Offset(0.88, 0.12));
    expect(ordered[2], const Offset(0.9, 0.8));
    expect(ordered[3], const Offset(0.12, 0.82));
  });
}

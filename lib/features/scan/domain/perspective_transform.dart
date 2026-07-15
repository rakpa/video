import 'dart:math' as math;
import 'dart:ui' show Offset;

import 'package:image/image.dart' as img;

typedef Image = img.Image;

/// Computes the homography mapping a destination rectangle of [width] x
/// [height] onto [corners] ordered TL/TR/BR/BL.
///
/// The returned list is `[a,b,c,d,e,f,g,h]`, where:
/// `sx = (a*x + b*y + c) / (g*x + h*y + 1)` and
/// `sy = (d*x + e*y + f) / (g*x + h*y + 1)`.
/// Returns null for degenerate geometry.
List<double>? computeHomography({
  required double width,
  required double height,
  required List<Offset> corners,
}) {
  if (corners.length != 4 || width <= 0 || height <= 0) return null;

  final srcPts = [
    Offset.zero,
    Offset(width, 0),
    Offset(width, height),
    Offset(0, height),
  ];
  final dstPts = corners;

  // Build the standard 8x8 system A*p = b for the projective transform.
  final a = List.generate(8, (_) => List<double>.filled(9, 0));
  for (var i = 0; i < 4; i++) {
    final x = srcPts[i].dx, y = srcPts[i].dy;
    final u = dstPts[i].dx, v = dstPts[i].dy;
    a[i * 2]
      ..[0] = x
      ..[1] = y
      ..[2] = 1
      ..[6] = -u * x
      ..[7] = -u * y
      ..[8] = u;
    a[i * 2 + 1]
      ..[3] = x
      ..[4] = y
      ..[5] = 1
      ..[6] = -v * x
      ..[7] = -v * y
      ..[8] = v;
  }

  // Gaussian elimination with partial pivoting.
  for (var col = 0; col < 8; col++) {
    var pivot = col;
    for (var r = col + 1; r < 8; r++) {
      if (a[r][col].abs() > a[pivot][col].abs()) pivot = r;
    }
    if (a[pivot][col].abs() < 1e-9) return null;
    if (pivot != col) {
      final tmp = a[col];
      a[col] = a[pivot];
      a[pivot] = tmp;
    }
    for (var r = 0; r < 8; r++) {
      if (r == col) continue;
      final factor = a[r][col] / a[col][col];
      if (factor == 0) continue;
      for (var c = col; c < 9; c++) {
        a[r][c] -= factor * a[col][c];
      }
    }
  }

  return List<double>.generate(8, (i) => a[i][8] / a[i][i]);
}

/// True perspective rectification: maps the source quad (TL/TR/BR/BL) onto an
/// upright rectangle sized from the quad's real edge lengths.
Image warpPerspective(Image src, List<Offset> corners, {int maxSide = 2200}) {
  if (corners.length != 4) return src;

  final tl = corners[0], tr = corners[1], br = corners[2], bl = corners[3];

  final topLen = (tr - tl).distance;
  final bottomLen = (br - bl).distance;
  final leftLen = (bl - tl).distance;
  final rightLen = (br - tr).distance;

  var outW = math.max(topLen, bottomLen).round();
  var outH = math.max(leftLen, rightLen).round();
  if (outW < 8 || outH < 8) return src;

  final longSide = math.max(outW, outH);
  if (longSide > maxSide) {
    final scale = maxSide / longSide;
    outW = math.max(8, (outW * scale).round());
    outH = math.max(8, (outH * scale).round());
  }

  final h = computeHomography(
    width: outW.toDouble(),
    height: outH.toDouble(),
    corners: corners,
  );
  if (h == null) return src;

  final out = img.Image(width: outW, height: outH, numChannels: 3);
  final maxX = src.width - 1.0;
  final maxY = src.height - 1.0;

  for (var y = 0; y < outH; y++) {
    for (var x = 0; x < outW; x++) {
      final denom = h[6] * x + h[7] * y + 1.0;
      if (denom.abs() < 1e-12) continue;
      final sx = ((h[0] * x + h[1] * y + h[2]) / denom).clamp(0.0, maxX);
      final sy = ((h[3] * x + h[4] * y + h[5]) / denom).clamp(0.0, maxY);
      final pixel = src.getPixelInterpolate(
        sx,
        sy,
        interpolation: img.Interpolation.linear,
      );
      out.setPixelRgb(x, y, pixel.r, pixel.g, pixel.b);
    }
  }
  return out;
}

/// Crops [src] using explicit pixel [corners]. If the corners describe the
/// full image frame, returns [src] unchanged to keep "Use full image" lossless.
Image cropWithCorners(Image src, List<Offset> corners, {int maxSide = 2200}) {
  if (_isFullFrame(src, corners)) return src;
  return warpPerspective(src, corners, maxSide: maxSide);
}

bool _isFullFrame(Image src, List<Offset> corners) {
  if (corners.length != 4) return false;
  const epsilon = 2.0;
  final full = [
    Offset.zero,
    Offset(src.width.toDouble(), 0),
    Offset(src.width.toDouble(), src.height.toDouble()),
    Offset(0, src.height.toDouble()),
  ];
  for (var i = 0; i < 4; i++) {
    if ((corners[i] - full[i]).distance > epsilon) return false;
  }
  return true;
}

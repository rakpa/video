import 'dart:ui';

import 'package:flutter/material.dart';

import '../../domain/scan_mode.dart';
import '../scan_design_tokens.dart';

/// Darkens everything outside the detected document quad and draws animated
/// blue corner guides.
class ScanEdgeOverlay extends StatelessWidget {
  const ScanEdgeOverlay({
    super.key,
    required this.quad,
    required this.confidence,
    this.pulse = 0,
  });

  final DocumentQuad quad;
  final double confidence;
  final double pulse;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        return CustomPaint(
          size: size,
          painter: _EdgeOverlayPainter(
            quad: quad,
            size: size,
            confidence: confidence,
            pulse: pulse,
          ),
        );
      },
    );
  }
}

class _EdgeOverlayPainter extends CustomPainter {
  _EdgeOverlayPainter({
    required this.quad,
    required this.size,
    required this.confidence,
    required this.pulse,
  });

  final DocumentQuad quad;
  final Size size;
  final double confidence;
  final double pulse;

  @override
  void paint(Canvas canvas, Size canvasSize) {
    final points = quad.corners
        .map((c) => Offset(c.dx * size.width, c.dy * size.height))
        .toList();

    final docPath = Path()
      ..moveTo(points[0].dx, points[0].dy)
      ..lineTo(points[1].dx, points[1].dy)
      ..lineTo(points[2].dx, points[2].dy)
      ..lineTo(points[3].dx, points[3].dy)
      ..close();

    final dimPath = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addPath(docPath, Offset.zero)
      ..fillType = PathFillType.evenOdd;

    canvas.drawPath(
      dimPath,
      Paint()..color = ScanDesign.overlay.withValues(alpha: 0.55),
    );

    final borderPaint = Paint()
      ..color = ScanDesign.guideBlue.withValues(alpha: 0.35 + confidence * 0.45)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    canvas.drawPath(docPath, borderPaint);

    final cornerLen = 22.0 + pulse * 4;
    final cornerPaint = Paint()
      ..color = ScanDesign.guideBlue
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    for (var i = 0; i < 4; i++) {
      final p = points[i];
      final prev = points[(i + 3) % 4];
      final next = points[(i + 1) % 4];
      final toPrev = (prev - p).direction;
      final toNext = (next - p).direction;
      canvas.drawLine(
        p,
        p + Offset.fromDirection(toPrev, cornerLen),
        cornerPaint,
      );
      canvas.drawLine(
        p,
        p + Offset.fromDirection(toNext, cornerLen),
        cornerPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _EdgeOverlayPainter oldDelegate) {
    return oldDelegate.quad != quad ||
        oldDelegate.confidence != confidence ||
        oldDelegate.pulse != pulse ||
        oldDelegate.size != size;
  }
}

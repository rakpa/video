import 'package:flutter/material.dart';

/// Scanning preset that adjusts the detection frame and capture behavior.
enum ScanMode {
  document('Document', Icons.description_outlined),
  receipt('Receipt', Icons.receipt_long_outlined),
  idCard('ID Card', Icons.badge_outlined),
  book('Book', Icons.menu_book_outlined),
  whiteboard('Whiteboard', Icons.dashboard_outlined);

  const ScanMode(this.label, this.icon);

  final String label;
  final IconData icon;

  /// Normalized width/height of the default detection frame (0–1).
  (double width, double height) get frameSize => switch (this) {
        ScanMode.document => (0.78, 0.58),
        ScanMode.receipt => (0.52, 0.72),
        ScanMode.idCard => (0.86, 0.54),
        ScanMode.book => (0.88, 0.62),
        ScanMode.whiteboard => (0.94, 0.52),
      };
}

/// Live edge-detection status shown to the user.
enum ScanDetectionPhase {
  looking('Looking for document...'),
  holdSteady('Hold steady...'),
  capturing('Capturing...'),
  pageCaptured('Page captured – move to the next page'),
  idle('');

  const ScanDetectionPhase(this.message);

  final String message;
}

/// Four corner points of a detected document, normalized 0–1 in preview space.
class DocumentQuad {
  const DocumentQuad({
    required this.topLeft,
    required this.topRight,
    required this.bottomRight,
    required this.bottomLeft,
  });

  final Offset topLeft;
  final Offset topRight;
  final Offset bottomRight;
  final Offset bottomLeft;

  List<Offset> get corners => [topLeft, topRight, bottomRight, bottomLeft];

  DocumentQuad lerp(DocumentQuad other, double t) {
    return DocumentQuad(
      topLeft: Offset.lerp(topLeft, other.topLeft, t)!,
      topRight: Offset.lerp(topRight, other.topRight, t)!,
      bottomRight: Offset.lerp(bottomRight, other.bottomRight, t)!,
      bottomLeft: Offset.lerp(bottomLeft, other.bottomLeft, t)!,
    );
  }

  /// Centered frame for a given [mode] inside a 1×1 normalized preview.
  factory DocumentQuad.forMode(ScanMode mode) {
    final (w, h) = mode.frameSize;
    final left = (1 - w) / 2;
    final top = (1 - h) / 2;
    final right = left + w;
    final bottom = top + h;
    return DocumentQuad(
      topLeft: Offset(left, top),
      topRight: Offset(right, top),
      bottomRight: Offset(right, bottom),
      bottomLeft: Offset(left, bottom),
    );
  }
}

/// Arguments passed when opening the scanner route.
class ScanRouteArgs {
  const ScanRouteArgs({
    this.folderId,
    this.appendDocumentId,
    this.openGallery = false,
  });

  final String? folderId;
  final String? appendDocumentId;
  final bool openGallery;
}

import 'package:flutter/foundation.dart';

/// Domain model for a scanned document. Kept independent from the Drift row
/// classes so the UI never depends on the persistence layer directly.
@immutable
class ScanDocument {
  const ScanDocument({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.folderId,
  });

  final String id;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? folderId;
}

/// A single page belonging to a [ScanDocument].
@immutable
class ScanPage {
  const ScanPage({
    required this.id,
    required this.documentId,
    required this.filePath,
    required this.index,
    required this.createdAt,
    this.ocrText,
  });

  final String id;
  final String documentId;
  final String filePath;
  final int index;
  final DateTime createdAt;
  final String? ocrText;
}

/// Lightweight projection used by the home list: a document plus the data
/// needed to render its card (page count + thumbnail).
@immutable
class DocumentSummary {
  const DocumentSummary({
    required this.document,
    required this.pageCount,
    required this.thumbnailPath,
  });

  final ScanDocument document;
  final int pageCount;
  final String? thumbnailPath;
}

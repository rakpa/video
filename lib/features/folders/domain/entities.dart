import 'package:flutter/foundation.dart';

/// User-created folder for organizing scans.
@immutable
class ScanFolder {
  const ScanFolder({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.updatedAt,
    this.documentCount = 0,
  });

  final String id;
  final String name;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int documentCount;
}

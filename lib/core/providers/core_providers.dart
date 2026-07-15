import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../data/database/database.dart';
import '../storage/document_storage.dart';

/// App-wide singletons. These live for the whole process lifetime.

/// Single Drift database instance.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

/// Manages page image files on disk.
final documentStorageProvider = Provider<DocumentStorage>((ref) {
  return DocumentStorage();
});

/// ID generator (v4 UUIDs).
final uuidProvider = Provider<Uuid>((ref) => const Uuid());

import 'package:uuid/uuid.dart';

import '../../../data/database/database.dart';
import '../../documents/domain/document_repository.dart';
import '../domain/entities.dart';
import '../domain/folder_repository.dart';

class FolderRepositoryImpl implements FolderRepository {
  FolderRepositoryImpl(this._db, this._uuid, this._documents);

  final AppDatabase _db;
  final Uuid _uuid;
  final DocumentRepository _documents;

  @override
  Stream<List<ScanFolder>> watchFolders() {
    return _db.watchFolders().asyncMap((rows) async {
      final folders = <ScanFolder>[];
      for (final row in rows) {
        final count = await _db.countDocumentsInFolder(row.id);
        folders.add(_toEntity(row, documentCount: count));
      }
      return folders;
    });
  }

  @override
  Future<ScanFolder?> getFolder(String id) async {
    final row = await _db.getFolder(id);
    if (row == null) return null;
    final count = await _db.countDocumentsInFolder(id);
    return _toEntity(row, documentCount: count);
  }

  @override
  Future<ScanFolder> createFolder(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) {
      throw ArgumentError.value(name, 'name', 'Folder name cannot be empty');
    }

    final now = DateTime.now();
    final id = _uuid.v4();
    await _db.insertFolder(
      FoldersCompanion.insert(
        id: id,
        name: trimmed,
        createdAt: now,
        updatedAt: now,
      ),
    );
    return ScanFolder(
      id: id,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
    );
  }

  @override
  Future<void> renameFolder(String id, String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) {
      throw ArgumentError.value(name, 'name', 'Folder name cannot be empty');
    }
    return _db.renameFolder(id, trimmed);
  }

  @override
  Future<void> deleteFolder(String id) async {
    final documentIds = await _db.getDocumentIdsInFolder(id);
    for (final documentId in documentIds) {
      await _documents.deleteDocument(documentId);
    }
    await _db.deleteFolder(id);
  }

  ScanFolder _toEntity(FolderRow row, {required int documentCount}) =>
      ScanFolder(
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        documentCount: documentCount,
      );
}

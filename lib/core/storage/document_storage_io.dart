import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Owns the on-disk layout for page images.
///
/// Layout: `<appDocuments>/documents/<documentId>/page_000.jpg`
///
/// The scanner plugin returns images in a temporary/cache directory; we copy
/// them into permanent storage so they survive OS cache eviction.
class DocumentStorage {
  Future<Directory> _documentsRoot() async {
    final dir = await getApplicationDocumentsDirectory();
    final root = Directory(p.join(dir.path, 'documents'));
    if (!await root.exists()) {
      await root.create(recursive: true);
    }
    return root;
  }

  /// Copies a scanned image into permanent storage and returns the new path.
  Future<String> importPage({
    required String documentId,
    required int index,
    required String sourcePath,
  }) async {
    final root = await _documentsRoot();
    final docDir = Directory(p.join(root.path, documentId));
    if (!await docDir.exists()) {
      await docDir.create(recursive: true);
    }

    final ext =
        p.extension(sourcePath).isEmpty ? '.jpg' : p.extension(sourcePath);
    final fileName = 'page_${index.toString().padLeft(3, '0')}$ext';
    final destPath = p.join(docDir.path, fileName);

    await File(sourcePath).copy(destPath);
    return destPath;
  }

  Future<void> replacePage({
    required String existingPath,
    required String sourcePath,
  }) async {
    if (p.equals(existingPath, sourcePath)) return;
    await File(sourcePath).copy(existingPath);
  }

  Future<void> deletePageFile(String filePath) async {
    final file = File(filePath);
    if (await file.exists()) {
      await file.delete();
    }
  }

  /// Removes all image files for a document (called after DB deletion).
  Future<void> deleteDocumentFiles(String documentId) async {
    final root = await _documentsRoot();
    final docDir = Directory(p.join(root.path, documentId));
    if (await docDir.exists()) {
      await docDir.delete(recursive: true);
    }
  }
}

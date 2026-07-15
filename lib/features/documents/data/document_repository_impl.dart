import 'package:drift/drift.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../../core/storage/document_storage.dart';
import '../../../data/database/database.dart';
import '../../settings/presentation/settings_providers.dart';
import '../domain/document_repository.dart';
import '../domain/entities.dart';

/// Drift-backed implementation of [DocumentRepository].
///
/// Maps between Drift row classes and domain entities, and coordinates the
/// database with on-disk image storage.
class DocumentRepositoryImpl implements DocumentRepository {
  DocumentRepositoryImpl(this._db, this._storage, this._uuid);

  final AppDatabase _db;
  final DocumentStorage _storage;
  final Uuid _uuid;

  @override
  Stream<List<DocumentSummary>> watchDocuments() {
    return _watchSummaries(_db.watchDocuments());
  }

  @override
  Stream<List<DocumentSummary>> watchDocumentsInFolder(String folderId) {
    return _watchSummaries(_db.watchDocumentsInFolder(folderId));
  }

  Stream<List<DocumentSummary>> _watchSummaries(
    Stream<List<DocumentRow>> rows,
  ) {
    // Watch documents, then enrich each with its page count + thumbnail.
    // N+1 per emission is acceptable for the MVP list size; revisit with a
    // single aggregate query if libraries grow large.
    return rows.asyncMap((rowList) async {
      final summaries = <DocumentSummary>[];
      for (final row in rowList) {
        summaries.add(await _summaryFor(row));
      }
      return summaries;
    });
  }

  Future<DocumentSummary> _summaryFor(DocumentRow row) async {
    final pages = await _db.getPages(row.id);
    return DocumentSummary(
      document: _toEntity(row),
      pageCount: pages.length,
      thumbnailPath: pages.isEmpty ? null : pages.first.filePath,
    );
  }

  @override
  Future<List<ScanPage>> getPages(String documentId) async {
    final rows = await _db.getPages(documentId);
    return rows.map(_toPageEntity).toList();
  }

  @override
  Future<ScanDocument> createDocumentFromScans(
    List<String> imagePaths, {
    String? title,
    String? folderId,
  }) async {
    final now = DateTime.now();
    final docId = _uuid.v4();
    final docTitle = title?.trim().isNotEmpty == true
        ? title!.trim()
        : await _defaultTitle(now);

    // Copy each scanned image into permanent storage.
    final pageCompanions = <PagesCompanion>[];
    for (var i = 0; i < imagePaths.length; i++) {
      final storedPath = await _storage.importPage(
        documentId: docId,
        index: i,
        sourcePath: imagePaths[i],
      );
      pageCompanions.add(
        PagesCompanion.insert(
          id: _uuid.v4(),
          documentId: docId,
          filePath: storedPath,
          pageIndex: i,
          createdAt: now,
        ),
      );
    }

    await _db.insertDocumentWithPages(
      DocumentsCompanion.insert(
        id: docId,
        title: docTitle,
        folderId: Value(folderId),
        createdAt: now,
        updatedAt: now,
      ),
      pageCompanions,
    );

    if (folderId != null) {
      await _db.touchFolder(folderId);
    }

    return ScanDocument(
      id: docId,
      title: docTitle,
      createdAt: now,
      updatedAt: now,
      folderId: folderId,
    );
  }

  @override
  Future<void> appendPagesToDocument(
    String documentId,
    List<String> imagePaths,
  ) async {
    if (imagePaths.isEmpty) return;
    final now = DateTime.now();
    final existing = await _db.getPages(documentId);
    final startIndex = existing.length;

    final pageCompanions = <PagesCompanion>[];
    for (var i = 0; i < imagePaths.length; i++) {
      final storedPath = await _storage.importPage(
        documentId: documentId,
        index: startIndex + i,
        sourcePath: imagePaths[i],
      );
      pageCompanions.add(
        PagesCompanion.insert(
          id: _uuid.v4(),
          documentId: documentId,
          filePath: storedPath,
          pageIndex: startIndex + i,
          createdAt: now,
        ),
      );
    }

    await _db.insertPages(pageCompanions);
    await _db.touchDocument(documentId);
  }

  @override
  Future<void> updatePageOcrText(String id, String text) async {
    final page = await _db.getPage(id);
    if (page == null) return;
    await _db.updatePageOcrText(id, text);
    await _db.touchDocument(page.documentId);
  }

  @override
  Future<void> renameDocument(String id, String title) {
    return _db.renameDocument(id, title);
  }

  @override
  Future<ScanDocument> duplicateDocument(String id) async {
    final source = await _db.getDocument(id);
    if (source == null) {
      throw StateError('Document not found.');
    }
    final sourcePages = await _db.getPages(id);
    if (sourcePages.isEmpty) {
      throw StateError('Document has no pages to duplicate.');
    }

    final now = DateTime.now();
    final copyId = _uuid.v4();
    final pageCompanions = <PagesCompanion>[];
    for (var i = 0; i < sourcePages.length; i++) {
      final storedPath = await _storage.importPage(
        documentId: copyId,
        index: i,
        sourcePath: sourcePages[i].filePath,
      );
      pageCompanions.add(
        PagesCompanion.insert(
          id: _uuid.v4(),
          documentId: copyId,
          filePath: storedPath,
          pageIndex: i,
          createdAt: now,
          ocrText: Value(sourcePages[i].ocrText),
        ),
      );
    }

    await _db.insertDocumentWithPages(
      DocumentsCompanion.insert(
        id: copyId,
        title: '${source.title} copy',
        folderId: Value(source.folderId),
        createdAt: now,
        updatedAt: now,
      ),
      pageCompanions,
    );

    if (source.folderId != null) {
      await _db.touchFolder(source.folderId!);
    }

    return ScanDocument(
      id: copyId,
      title: '${source.title} copy',
      createdAt: now,
      updatedAt: now,
      folderId: source.folderId,
    );
  }

  @override
  Future<void> reorderPages(String documentId, List<String> orderedPageIds) {
    return _db.reorderPages(documentId, orderedPageIds);
  }

  @override
  Future<void> replacePageImage(String pageId, String imagePath) async {
    final page = await _db.getPage(pageId);
    if (page == null) return;
    await _storage.replacePage(
      existingPath: page.filePath,
      sourcePath: imagePath,
    );
    await _db.updatePageImagePath(pageId, page.filePath);
    await _db.touchDocument(page.documentId);
  }

  @override
  Future<void> deletePage(String pageId) async {
    final page = await _db.getPage(pageId);
    if (page == null) return;
    await _db.deletePage(pageId);
    await _storage.deletePageFile(page.filePath);
    final remaining = await _db.getPages(page.documentId);
    await _db.reorderPages(
      page.documentId,
      remaining.map((p) => p.id).toList(growable: false),
    );
  }

  @override
  Future<List<DocumentSummary>> searchDocuments(String query) async {
    final rows = await _db.searchDocuments(query);
    final summaries = <DocumentSummary>[];
    for (final row in rows) {
      summaries.add(await _summaryFor(row));
    }
    return summaries;
  }

  @override
  Future<void> touchDocument(String id) => _db.touchDocument(id);

  @override
  Future<void> deleteDocument(String id) async {
    await _db.deleteDocument(id);
    await _storage.deleteDocumentFiles(id);
  }

  @override
  Future<void> moveDocumentToFolder(String id, String? folderId) async {
    await _db.moveDocumentToFolder(id, folderId);
    if (folderId != null) {
      await _db.touchFolder(folderId);
    }
  }

  // --- Mapping helpers -----------------------------------------------------

  ScanDocument _toEntity(DocumentRow row) => ScanDocument(
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        folderId: row.folderId,
      );

  ScanPage _toPageEntity(PageRow row) => ScanPage(
        id: row.id,
        documentId: row.documentId,
        filePath: row.filePath,
        index: row.pageIndex,
        createdAt: row.createdAt,
        ocrText: row.ocrText,
      );

  Future<String> _defaultTitle(DateTime now) async {
    final prefs = await SharedPreferences.getInstance();
    final pattern = prefs.getString(defaultFileNamePatternPrefsKey) ??
        defaultFileNamePatternValue;
    final base = _applyTitlePattern(pattern, now);
    final counter = await _db.countDocumentsCreatedOnDay(now) + 1;
    return '$base ($counter)';
  }

  String _applyTitlePattern(String pattern, DateTime now) {
    final base = pattern.trim().isEmpty ? defaultFileNamePatternValue : pattern;
    final title = base
        .replaceAll('{date}', DateFormat('yyyy-MM-dd').format(now))
        .replaceAll('{time}', DateFormat('HH-mm').format(now))
        .replaceAll('{datetime}', DateFormat('yyyy-MM-dd HH-mm').format(now))
        .trim();
    return title.isEmpty
        ? 'Scan ${DateFormat('yyyy-MM-dd').format(now)}'
        : title;
  }
}

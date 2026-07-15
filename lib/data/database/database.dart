import 'package:drift/drift.dart';

import 'database_connection.dart';

part 'database.g.dart';

/// User-created folder for organizing scans.
@DataClassName('FolderRow')
class Folders extends Table {
  TextColumn get id => text()();
  TextColumn get name => text().withLength(min: 1, max: 120)();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// A scanned document = a logical grouping of one or more pages.
@DataClassName('DocumentRow')
class Documents extends Table {
  TextColumn get id => text()();
  TextColumn get title => text().withLength(min: 1, max: 200)();
  TextColumn get folderId =>
      text().nullable().references(Folders, #id, onDelete: KeyAction.setNull)();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// A single page (image on disk). [filePath] points into the app documents dir;
/// blobs are never stored in SQLite — only metadata + paths.
@DataClassName('PageRow')
class Pages extends Table {
  TextColumn get id => text()();
  TextColumn get documentId =>
      text().references(Documents, #id, onDelete: KeyAction.cascade)();
  TextColumn get filePath => text()();
  TextColumn get ocrText => text().nullable()();
  IntColumn get pageIndex => integer()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [Folders, Documents, Pages])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? openConnection());

  @override
  int get schemaVersion => 3;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(folders);
            await m.addColumn(documents, documents.folderId);
          }
          if (from < 3) {
            await m.addColumn(pages, pages.ocrText as GeneratedColumn<Object>);
          }
        },
        beforeOpen: (details) async {
          // Required for the ON DELETE CASCADE on Pages to fire.
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );

  // --- Queries -------------------------------------------------------------

  /// Streams all documents (newest first) for the home list.
  Stream<List<DocumentRow>> watchDocuments() {
    return (select(documents)..orderBy([(d) => OrderingTerm.desc(d.updatedAt)]))
        .watch();
  }

  /// Streams documents inside a folder (newest first).
  Stream<List<DocumentRow>> watchDocumentsInFolder(String folderId) {
    return (select(documents)
          ..where((d) => d.folderId.equals(folderId))
          ..orderBy([(d) => OrderingTerm.desc(d.updatedAt)]))
        .watch();
  }

  /// Streams all folders (newest first).
  Stream<List<FolderRow>> watchFolders() {
    return (select(folders)..orderBy([(f) => OrderingTerm.desc(f.updatedAt)]))
        .watch();
  }

  Future<FolderRow?> getFolder(String id) {
    return (select(folders)..where((f) => f.id.equals(id))).getSingleOrNull();
  }

  Future<int> countDocumentsInFolder(String folderId) async {
    final rows = await (select(documents)
          ..where((d) => d.folderId.equals(folderId)))
        .get();
    return rows.length;
  }

  Future<List<String>> getDocumentIdsInFolder(String folderId) async {
    final rows = await (select(documents)
          ..where((d) => d.folderId.equals(folderId)))
        .get();
    return rows.map((row) => row.id).toList();
  }

  Future<void> insertFolder(FoldersCompanion folder) {
    return into(folders).insert(folder);
  }

  Future<void> renameFolder(String id, String name) {
    return (update(folders)..where((f) => f.id.equals(id))).write(
      FoldersCompanion(
        name: Value(name),
        updatedAt: Value(DateTime.now()),
      ),
    );
  }

  Future<void> touchFolder(String id) {
    return (update(folders)..where((f) => f.id.equals(id))).write(
      FoldersCompanion(updatedAt: Value(DateTime.now())),
    );
  }

  Future<void> deleteFolder(String id) {
    return (delete(folders)..where((f) => f.id.equals(id))).go();
  }

  Future<void> moveDocumentToFolder(String id, String? folderId) {
    return (update(documents)..where((d) => d.id.equals(id))).write(
      DocumentsCompanion(
        folderId: Value(folderId),
        updatedAt: Value(DateTime.now()),
      ),
    );
  }

  /// Ordered pages for a single document.
  Future<List<PageRow>> getPages(String documentId) {
    return (select(pages)
          ..where((t) => t.documentId.equals(documentId))
          ..orderBy([(t) => OrderingTerm.asc(t.pageIndex)]))
        .get();
  }

  Future<PageRow?> getPage(String id) {
    return (select(pages)..where((t) => t.id.equals(id))).getSingleOrNull();
  }

  Future<DocumentRow?> getDocument(String id) {
    return (select(documents)..where((d) => d.id.equals(id))).getSingleOrNull();
  }

  Future<int> countDocumentsCreatedOnDay(DateTime day) async {
    final start = DateTime(day.year, day.month, day.day);
    final end = start.add(const Duration(days: 1));
    final rows = await (select(documents)
          ..where((d) => d.createdAt.isBiggerOrEqualValue(start))
          ..where((d) => d.createdAt.isSmallerThanValue(end)))
        .get();
    return rows.length;
  }

  Future<void> insertDocumentWithPages(
    DocumentsCompanion document,
    List<PagesCompanion> docPages,
  ) {
    return transaction(() async {
      await into(documents).insert(document);
      await batch((b) => b.insertAll(pages, docPages));
    });
  }

  Future<void> insertPages(List<PagesCompanion> docPages) {
    return batch((b) => b.insertAll(pages, docPages));
  }

  Future<void> updatePageOcrText(String id, String text) {
    return (update(pages)..where((p) => p.id.equals(id))).write(
      PagesCompanion(ocrText: Value(text)),
    );
  }

  Future<void> updatePageImagePath(String id, String filePath) {
    return (update(pages)..where((p) => p.id.equals(id))).write(
      PagesCompanion(filePath: Value(filePath)),
    );
  }

  Future<void> deletePage(String id) {
    return (delete(pages)..where((p) => p.id.equals(id))).go();
  }

  Future<List<DocumentRow>> searchDocuments(String query) {
    final trimmed = query.trim().toLowerCase();
    if (trimmed.isEmpty) return Future.value(const []);
    final like = '%$trimmed%';
    return customSelect(
      '''
      SELECT DISTINCT d.*
      FROM documents AS d
      LEFT JOIN pages AS p ON p.document_id = d.id
      WHERE lower(d.title) LIKE ? OR lower(coalesce(p.ocr_text, '')) LIKE ?
      ORDER BY d.updated_at DESC
      ''',
      variables: [Variable<String>(like), Variable<String>(like)],
      readsFrom: {documents, pages},
    ).map((row) => documents.map(row.data)).get();
  }

  Future<void> reorderPages(String documentId, List<String> orderedPageIds) {
    return transaction(() async {
      for (var i = 0; i < orderedPageIds.length; i++) {
        await (update(pages)
              ..where((p) =>
                  p.documentId.equals(documentId) &
                  p.id.equals(orderedPageIds[i])))
            .write(PagesCompanion(pageIndex: Value(i)));
      }
      await touchDocument(documentId);
    });
  }

  Future<void> renameDocument(String id, String title) {
    return (update(documents)..where((d) => d.id.equals(id))).write(
      DocumentsCompanion(
        title: Value(title),
        updatedAt: Value(DateTime.now()),
      ),
    );
  }

  /// Bumps [updatedAt] without changing anything else (e.g. after editing a
  /// page), so the document re-sorts to the top of the list.
  Future<void> touchDocument(String id) {
    return (update(documents)..where((d) => d.id.equals(id))).write(
      DocumentsCompanion(updatedAt: Value(DateTime.now())),
    );
  }

  Future<void> deleteDocument(String id) {
    // Pages are removed via ON DELETE CASCADE.
    return (delete(documents)..where((d) => d.id.equals(id))).go();
  }
}

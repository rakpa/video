import 'package:doc_scanner/data/database/database.dart';
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase db;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
  });

  tearDown(() async {
    await db.close();
  });

  test('CRUD documents, pages, and folders', () async {
    final now = DateTime(2026, 7, 15, 12);

    await db.insertFolder(
      FoldersCompanion.insert(
        id: 'folder-1',
        name: 'Receipts',
        createdAt: now,
        updatedAt: now,
      ),
    );
    expect((await db.watchFolders().first).single.name, 'Receipts');

    await db.insertDocumentWithPages(
      DocumentsCompanion.insert(
        id: 'doc-1',
        title: 'Scan 2026-07-15 (1)',
        folderId: const Value('folder-1'),
        createdAt: now,
        updatedAt: now,
      ),
      [
        PagesCompanion.insert(
          id: 'page-1',
          documentId: 'doc-1',
          filePath: '/tmp/1.jpg',
          pageIndex: 0,
          createdAt: now,
        ),
        PagesCompanion.insert(
          id: 'page-2',
          documentId: 'doc-1',
          filePath: '/tmp/2.jpg',
          pageIndex: 1,
          createdAt: now,
        ),
      ],
    );

    expect(await db.countDocumentsInFolder('folder-1'), 1);
    expect(await db.countDocumentsCreatedOnDay(now), 1);
    expect((await db.getPages('doc-1')).map((p) => p.id), ['page-1', 'page-2']);

    await db.renameDocument('doc-1', 'Renamed');
    expect((await db.getDocument('doc-1'))!.title, 'Renamed');

    await db.reorderPages('doc-1', ['page-2', 'page-1']);
    expect((await db.getPages('doc-1')).map((p) => p.id), ['page-2', 'page-1']);

    await db.moveDocumentToFolder('doc-1', null);
    expect((await db.getDocument('doc-1'))!.folderId, isNull);

    await db.deleteDocument('doc-1');
    expect(await db.getDocument('doc-1'), isNull);
    expect(await db.getPages('doc-1'), isEmpty);
  });
}

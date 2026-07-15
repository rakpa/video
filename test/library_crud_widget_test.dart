import 'package:doc_scanner/features/documents/domain/document_repository.dart';
import 'package:doc_scanner/features/documents/domain/entities.dart';
import 'package:doc_scanner/features/documents/presentation/documents_providers.dart';
import 'package:doc_scanner/features/home/presentation/feed_actions.dart';
import 'package:doc_scanner/features/home/presentation/recent_feed_grid.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final document = ScanDocument(
    id: 'doc-1',
    title: 'Original',
    createdAt: DateTime(2026, 7, 15),
    updatedAt: DateTime(2026, 7, 15),
  );

  testWidgets('rename dialog saves through repository', (tester) async {
    final repo = _FakeDocumentRepository();

    await tester.pumpWidget(
      _TestApp(
        repo: repo,
        child: Consumer(
          builder: (context, ref, _) => ElevatedButton(
            onPressed: () => renameDocumentDialog(context, ref, document),
            child: const Text('Rename action'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Rename action'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Renamed');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(repo.renamed, ('doc-1', 'Renamed'));
  });

  testWidgets('delete confirmation deletes through repository', (tester) async {
    final repo = _FakeDocumentRepository();
    final summary = DocumentSummary(
      document: document,
      pageCount: 1,
      thumbnailPath: null,
    );

    await tester.pumpWidget(
      _TestApp(
        repo: repo,
        child: Consumer(
          builder: (context, ref, _) => ElevatedButton(
            onPressed: () =>
                deleteDocumentWithConfirmation(context, ref, summary),
            child: const Text('Delete action'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Delete action'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yes'));
    await tester.pumpAndSettle();

    expect(repo.deletedIds, ['doc-1']);
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.repo, required this.child});

  final DocumentRepository repo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      overrides: [documentRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(home: Scaffold(body: Center(child: child))),
    );
  }
}

class _FakeDocumentRepository implements DocumentRepository {
  (String, String)? renamed;
  final deletedIds = <String>[];

  @override
  Stream<List<DocumentSummary>> watchDocuments() => Stream.value(const []);

  @override
  Stream<List<DocumentSummary>> watchDocumentsInFolder(String folderId) =>
      Stream.value(const []);

  @override
  Future<List<ScanPage>> getPages(String documentId) async => const [];

  @override
  Future<void> updatePageOcrText(String id, String text) async {}

  @override
  Future<ScanDocument> createDocumentFromScans(
    List<String> imagePaths, {
    String? title,
    String? folderId,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<void> appendPagesToDocument(
    String documentId,
    List<String> imagePaths,
  ) async {}

  @override
  Future<void> renameDocument(String id, String title) async {
    renamed = (id, title);
  }

  @override
  Future<ScanDocument> duplicateDocument(String id) async {
    throw UnimplementedError();
  }

  @override
  Future<void> reorderPages(
      String documentId, List<String> orderedPageIds) async {}

  @override
  Future<void> replacePageImage(String pageId, String imagePath) async {}

  @override
  Future<void> deletePage(String pageId) async {}

  @override
  Future<List<DocumentSummary>> searchDocuments(String query) async => const [];

  @override
  Future<void> touchDocument(String id) async {}

  @override
  Future<void> deleteDocument(String id) async {
    deletedIds.add(id);
  }

  @override
  Future<void> moveDocumentToFolder(String id, String? folderId) async {}
}

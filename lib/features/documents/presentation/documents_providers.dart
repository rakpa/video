import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../data/document_repository_impl.dart';
import '../domain/document_repository.dart';
import '../domain/entities.dart';

/// Wires the repository to its dependencies.
final documentRepositoryProvider = Provider<DocumentRepository>((ref) {
  return DocumentRepositoryImpl(
    ref.watch(appDatabaseProvider),
    ref.watch(documentStorageProvider),
    ref.watch(uuidProvider),
  );
});

/// Reactive list of document summaries for the home screen.
final documentListProvider = StreamProvider<List<DocumentSummary>>((ref) {
  return ref.watch(documentRepositoryProvider).watchDocuments();
});

/// Pages for a single document (detail screen), keyed by document id.
final documentPagesProvider =
    FutureProvider.family<List<ScanPage>, String>((ref, documentId) {
  return ref.watch(documentRepositoryProvider).getPages(documentId);
});

final documentSearchProvider =
    FutureProvider.family<List<DocumentSummary>, String>((ref, query) {
  return ref.watch(documentRepositoryProvider).searchDocuments(query);
});

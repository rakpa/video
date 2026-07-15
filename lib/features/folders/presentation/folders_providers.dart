import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';
import '../data/folder_repository_impl.dart';
import '../domain/entities.dart';
import '../domain/folder_repository.dart';

final folderRepositoryProvider = Provider<FolderRepository>((ref) {
  return FolderRepositoryImpl(
    ref.watch(appDatabaseProvider),
    ref.watch(uuidProvider),
    ref.watch(documentRepositoryProvider),
  );
});

final folderListProvider = StreamProvider<List<ScanFolder>>((ref) {
  return ref.watch(folderRepositoryProvider).watchFolders();
});

final folderProvider =
    FutureProvider.family<ScanFolder?, String>((ref, folderId) {
  return ref.watch(folderRepositoryProvider).getFolder(folderId);
});

final documentsInFolderProvider =
    StreamProvider.family<List<DocumentSummary>, String>((ref, folderId) {
  return ref.watch(documentRepositoryProvider).watchDocumentsInFolder(folderId);
});

/// Set while the user is inside a folder on the Folders tab (enables scan-into-folder).
final activeFolderIdProvider = StateProvider<String?>((ref) => null);

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';

/// Drives the "scan a new document" flow and exposes loading/error state to the
/// UI (e.g. to show a spinner or a snackbar).
class ScanController extends AsyncNotifier<void> {
  @override
  FutureOr<void> build() {
    // No initial work; idle until captured paths are saved.
  }

  /// Persists pre-captured page paths as a new document.
  Future<ScanDocument?> saveFromPaths(
    List<String> paths, {
    String? folderId,
  }) async {
    if (paths.isEmpty) return null;
    state = const AsyncLoading();
    try {
      final document = await ref
          .read(documentRepositoryProvider)
          .createDocumentFromScans(paths, folderId: folderId);
      state = const AsyncData(null);
      return document;
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
      return null;
    }
  }

  /// Appends pre-captured page paths to an existing document.
  Future<bool> saveAppendedPages(String documentId, List<String> paths) async {
    if (paths.isEmpty) return false;
    state = const AsyncLoading();
    try {
      await ref
          .read(documentRepositoryProvider)
          .appendPagesToDocument(documentId, paths);
      state = const AsyncData(null);
      return true;
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
      return false;
    }
  }
}

final scanControllerProvider =
    AsyncNotifierProvider<ScanController, void>(ScanController.new);

import 'dart:async';
import 'dart:ui' show Rect;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';
import '../data/pdf_export_service.dart';
import '../domain/export_options.dart';

final pdfExportServiceProvider = Provider<PdfExportService>((ref) {
  return PdfExportService();
});

/// Handles "export to PDF and share" for a document. Exposes async state so the
/// detail screen can show progress / errors.
class ExportController extends AutoDisposeAsyncNotifier<void> {
  @override
  FutureOr<void> build() {}

  /// Builds a PDF for [document] and opens the system share sheet.
  ///
  /// [sharePositionOrigin] anchors the iOS/iPadOS share sheet — required on
  /// those platforms or share_plus throws a PlatformException.
  Future<void> exportAndShare(
    ScanDocument document, {
    PdfExportOptions options = const PdfExportOptions(),
    Rect? sharePositionOrigin,
  }) async {
    state = const AsyncLoading();
    try {
      final pages = await _pagesFor(document);
      final file = await ref
          .read(pdfExportServiceProvider)
          .buildPdf(document: document, pages: pages, options: options);

      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject: document.title,
        sharePositionOrigin: sharePositionOrigin,
      );
      state = const AsyncData(null);
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
    }
  }

  Future<String?> savePdf(
    ScanDocument document, {
    PdfExportOptions options = const PdfExportOptions(),
  }) async {
    state = const AsyncLoading();
    try {
      final pages = await _pagesFor(document);
      final file = await ref
          .read(pdfExportServiceProvider)
          .savePdf(document: document, pages: pages, options: options);
      state = const AsyncData(null);
      return file.path;
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
      return null;
    }
  }

  Future<void> shareJpgZip(
    ScanDocument document, {
    ExportQuality quality = ExportQuality.medium,
    Rect? sharePositionOrigin,
  }) async {
    state = const AsyncLoading();
    try {
      final pages = await _pagesFor(document);
      final file = await ref
          .read(pdfExportServiceProvider)
          .buildJpgZip(document: document, pages: pages, quality: quality);
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/zip')],
        subject: document.title,
        sharePositionOrigin: sharePositionOrigin,
      );
      state = const AsyncData(null);
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
    }
  }

  Future<int?> saveImages(
    ScanDocument document, {
    ExportQuality quality = ExportQuality.medium,
  }) async {
    state = const AsyncLoading();
    try {
      final pages = await _pagesFor(document);
      final count =
          await ref.read(pdfExportServiceProvider).saveImagesToGallery(
                document: document,
                pages: pages,
                quality: quality,
              );
      state = const AsyncData(null);
      return count;
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
      return null;
    }
  }

  Future<List<ScanPage>> _pagesFor(ScanDocument document) async {
    final pages =
        await ref.read(documentRepositoryProvider).getPages(document.id);
    if (pages.isEmpty) {
      throw StateError('This document has no pages to export.');
    }
    return pages;
  }
}

final exportControllerProvider =
    AutoDisposeAsyncNotifierProvider<ExportController, void>(
        ExportController.new);

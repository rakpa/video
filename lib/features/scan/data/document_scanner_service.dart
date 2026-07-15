import 'gallery_import_service.dart';

/// Compatibility facade for callers that still need a non-UI image picker.
/// The production scan flow uses [CameraScanService] from the scan screen.
class DocumentScannerService {
  DocumentScannerService({GalleryImportService? galleryImportService})
      : _galleryImportService = galleryImportService ?? GalleryImportService();

  final GalleryImportService _galleryImportService;

  Future<List<String>?> scan({int maxPages = 24}) async {
    final images = await _galleryImportService.pickPhotos(limit: maxPages);
    return images.isEmpty ? null : images;
  }
}

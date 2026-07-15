import 'entities.dart';

/// Repository contract for documents. The presentation layer depends only on
/// this interface, never on Drift.
abstract interface class DocumentRepository {
  /// Reactive stream of document summaries for the home list.
  Stream<List<DocumentSummary>> watchDocuments();

  /// Reactive stream of document summaries inside a folder.
  Stream<List<DocumentSummary>> watchDocumentsInFolder(String folderId);

  /// Ordered pages for a document.
  Future<List<ScanPage>> getPages(String documentId);

  /// Persists a freshly scanned set of images as a new document.
  ///
  /// [imagePaths] are temporary paths returned by the scanner; they are copied
  /// into permanent storage. Returns the created document.
  Future<ScanDocument> createDocumentFromScans(
    List<String> imagePaths, {
    String? title,
    String? folderId,
  });

  /// Appends scanned images as new pages on an existing document.
  Future<void> appendPagesToDocument(
    String documentId,
    List<String> imagePaths,
  );

  Future<void> updatePageOcrText(String id, String text);

  Future<ScanDocument> duplicateDocument(String id);

  Future<void> reorderPages(String documentId, List<String> orderedPageIds);

  Future<void> replacePageImage(String pageId, String imagePath);

  Future<void> deletePage(String pageId);

  Future<List<DocumentSummary>> searchDocuments(String query);

  Future<void> renameDocument(String id, String title);

  /// Marks the document as updated (used after a page is edited/enhanced).
  Future<void> touchDocument(String id);

  Future<void> deleteDocument(String id);

  /// Moves a document into a folder, or back to the home library when [folderId] is null.
  Future<void> moveDocumentToFolder(String id, String? folderId);
}

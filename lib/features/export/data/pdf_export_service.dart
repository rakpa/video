import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive_io.dart';
import 'package:gal/gal.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../documents/domain/entities.dart';
import '../domain/export_options.dart';

/// Builds a multi-page PDF from a document's pages.
///
/// Each page image is re-encoded according to [PdfExportOptions.quality], then
/// laid out centred on the selected page size while preserving aspect ratio.
class PdfExportService {
  /// Generates the PDF and writes it to a temporary file, returning that file.
  /// The temp dir is used because the output is meant for immediate sharing.
  Future<File> buildPdf({
    required ScanDocument document,
    required List<ScanPage> pages,
    PdfExportOptions options = const PdfExportOptions(),
  }) async {
    final pdf = pw.Document(title: document.title);

    for (final page in pages) {
      final bytes = await _encodedJpgBytes(
        page.filePath,
        quality: options.quality,
      );
      final image = pw.MemoryImage(bytes);
      pdf.addPage(
        pw.Page(
          pageFormat: options.pageSize.format,
          margin: const pw.EdgeInsets.all(16),
          build: (context) => pw.Center(
            child: pw.Image(image, fit: pw.BoxFit.contain),
          ),
        ),
      );
    }

    final bytes = await pdf.save();
    final dir = await getTemporaryDirectory();
    final file = File(p.join(dir.path, '${_safeFileName(document.title)}.pdf'));
    await file.writeAsBytes(bytes);
    return file;
  }

  /// Copies a generated PDF into the app documents export folder.
  Future<File> savePdf({
    required ScanDocument document,
    required List<ScanPage> pages,
    PdfExportOptions options = const PdfExportOptions(),
  }) async {
    final tempPdf = await buildPdf(
      document: document,
      pages: pages,
      options: options,
    );
    final dir = await _exportsDirectory();
    final file = File(p.join(dir.path, '${_safeFileName(document.title)}.pdf'));
    return tempPdf.copy(file.path);
  }

  /// Writes one JPG per page to a temporary export folder.
  Future<List<File>> buildJpgPages({
    required ScanDocument document,
    required List<ScanPage> pages,
    ExportQuality quality = ExportQuality.medium,
  }) async {
    final dir = await _temporaryExportDirectory(document.title);
    final files = <File>[];
    for (var i = 0; i < pages.length; i++) {
      final bytes = await _encodedJpgBytes(pages[i].filePath, quality: quality);
      final file = File(
        p.join(
          dir.path,
          '${_safeFileName(document.title)}_${(i + 1).toString().padLeft(3, '0')}.jpg',
        ),
      );
      await file.writeAsBytes(bytes, flush: true);
      files.add(file);
    }
    return files;
  }

  /// Builds a ZIP containing all page JPGs.
  Future<File> buildJpgZip({
    required ScanDocument document,
    required List<ScanPage> pages,
    ExportQuality quality = ExportQuality.medium,
  }) async {
    final jpgs = await buildJpgPages(
      document: document,
      pages: pages,
      quality: quality,
    );
    final archive = Archive();
    for (final file in jpgs) {
      final bytes = await file.readAsBytes();
      archive.addFile(ArchiveFile(p.basename(file.path), bytes.length, bytes));
    }

    final zipBytes = ZipEncoder().encode(archive);
    if (zipBytes == null) {
      throw StateError('Could not create JPG ZIP.');
    }
    final dir = await getTemporaryDirectory();
    final zip = File(p.join(dir.path, '${_safeFileName(document.title)}.zip'));
    await zip.writeAsBytes(zipBytes, flush: true);
    return zip;
  }

  /// Saves each page image into the user's device gallery.
  Future<int> saveImagesToGallery({
    required ScanDocument document,
    required List<ScanPage> pages,
    ExportQuality quality = ExportQuality.medium,
  }) async {
    final files = await buildJpgPages(
      document: document,
      pages: pages,
      quality: quality,
    );
    for (final file in files) {
      await Gal.putImage(file.path, album: 'Paperly');
    }
    return files.length;
  }

  Future<Directory> _exportsDirectory() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(base.path, 'exports'));
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir;
  }

  Future<Directory> _temporaryExportDirectory(String title) async {
    final base = await getTemporaryDirectory();
    final dir = Directory(
      p.join(
        base.path,
        'paperly_export_${_safeFileName(title)}_${DateTime.now().millisecondsSinceEpoch}',
      ),
    );
    await dir.create(recursive: true);
    return dir;
  }

  Future<Uint8List> _encodedJpgBytes(
    String path, {
    required ExportQuality quality,
  }) async {
    final source = await File(path).readAsBytes();
    final decoded = img.decodeImage(source);
    if (decoded == null) return source;

    var image = img.bakeOrientation(decoded);
    final longest = image.width > image.height ? image.width : image.height;
    if (longest > quality.maxDimension) {
      image = image.width >= image.height
          ? img.copyResize(image, width: quality.maxDimension)
          : img.copyResize(image, height: quality.maxDimension);
    }

    return Uint8List.fromList(
      img.encodeJpg(image, quality: quality.jpegQuality),
    );
  }

  /// Strips characters that are unsafe in file names across platforms.
  String _safeFileName(String input) {
    final cleaned = input.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    return cleaned.isEmpty ? 'document' : cleaned;
  }
}

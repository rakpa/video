import 'package:pdf/pdf.dart';

/// Page sizes supported by Paperly PDF export.
enum ExportPageSize {
  a4('A4'),
  letter('Letter');

  const ExportPageSize(this.label);

  final String label;

  PdfPageFormat get format => switch (this) {
        ExportPageSize.a4 => PdfPageFormat.a4,
        ExportPageSize.letter => PdfPageFormat.letter,
      };
}

/// Image quality presets used before embedding pages in PDFs or JPG exports.
enum ExportQuality {
  small('Small', 60, 1400),
  medium('Medium', 85, 2200),
  high('High', 95, 3200);

  const ExportQuality(this.label, this.jpegQuality, this.maxDimension);

  final String label;
  final int jpegQuality;
  final int maxDimension;
}

class PdfExportOptions {
  const PdfExportOptions({
    this.pageSize = ExportPageSize.a4,
    this.quality = ExportQuality.medium,
  });

  final ExportPageSize pageSize;
  final ExportQuality quality;
}

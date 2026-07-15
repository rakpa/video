import 'scan_enhance_filter.dart';

/// One captured page in an active scan session.
class CapturedScanPage {
  const CapturedScanPage({
    required this.rawPath,
    required this.displayPath,
    this.filter = ScanEnhanceFilter.color,
  });

  final String rawPath;
  final String displayPath;
  final ScanEnhanceFilter filter;

  CapturedScanPage copyWith({
    String? rawPath,
    String? displayPath,
    ScanEnhanceFilter? filter,
  }) {
    return CapturedScanPage(
      rawPath: rawPath ?? this.rawPath,
      displayPath: displayPath ?? this.displayPath,
      filter: filter ?? this.filter,
    );
  }
}

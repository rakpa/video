import 'package:flutter_test/flutter_test.dart';

import 'package:doc_scanner/features/scan/domain/captured_scan_page.dart';
import 'package:doc_scanner/features/scan/domain/scan_enhance_filter.dart';

void main() {
  test('each captured page keeps its own filter metadata', () {
    const page1 = CapturedScanPage(
      rawPath: '/tmp/raw1.jpg',
      displayPath: '/tmp/page1_gray.jpg',
      filter: ScanEnhanceFilter.grayscale,
    );
    const page2 = CapturedScanPage(
      rawPath: '/tmp/raw2.jpg',
      displayPath: '/tmp/page2_color.jpg',
      filter: ScanEnhanceFilter.color,
    );

    final pages = [page1, page2];

    expect(pages[0].filter, ScanEnhanceFilter.grayscale);
    expect(pages[1].filter, ScanEnhanceFilter.color);
    expect(
      pages.map((p) => p.displayPath).toList(),
      ['/tmp/page1_gray.jpg', '/tmp/page2_color.jpg'],
    );
  });

  test('copyWith updates only the targeted page fields', () {
    const original = CapturedScanPage(
      rawPath: '/tmp/raw.jpg',
      displayPath: '/tmp/color.jpg',
      filter: ScanEnhanceFilter.color,
    );

    final updated = original.copyWith(
      displayPath: '/tmp/sharp.jpg',
      filter: ScanEnhanceFilter.sharp,
    );

    expect(updated.rawPath, '/tmp/raw.jpg');
    expect(updated.displayPath, '/tmp/sharp.jpg');
    expect(updated.filter, ScanEnhanceFilter.sharp);
    expect(original.filter, ScanEnhanceFilter.color);
  });
}

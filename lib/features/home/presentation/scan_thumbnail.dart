import 'package:flutter/material.dart';

import 'home_design_tokens.dart';
import 'scan_thumbnail_io.dart' if (dart.library.html) 'scan_thumbnail_web.dart'
    as thumb;

/// Thumbnail for a scanned page — works on mobile and web.
class ScanThumbnail extends StatelessWidget {
  const ScanThumbnail({super.key, this.path});

  final String? path;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: HomeDesign.border.withValues(alpha: 0.45),
      child: thumb.buildScanThumbnail(path, cacheWidth: 320),
    );
  }
}

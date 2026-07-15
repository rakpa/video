import 'package:flutter/material.dart';

import 'home_design_tokens.dart';

/// In-scope tools tip screen (no AI / cloud / subscriptions).
class ToolsBody extends StatelessWidget {
  const ToolsBody({
    super.key,
    this.onImport,
    this.onScan,
  });

  final VoidCallback? onImport;
  final VoidCallback? onScan;

  @override
  Widget build(BuildContext context) {
    final items = [
      (
        Icons.document_scanner_outlined,
        'Scan documents',
        'Live edge detection, auto-capture, and batch pages.',
        onScan,
      ),
      (
        Icons.photo_library_outlined,
        'Import photos',
        'Pull existing images from your gallery into a new scan.',
        onImport,
      ),
      (
        Icons.text_fields_rounded,
        'On-device OCR',
        'Extract text from any page — searchable offline.',
        null,
      ),
      (
        Icons.picture_as_pdf_outlined,
        'Export & share',
        'PDF (A4/Letter), JPG zip, print, or save to device.',
        null,
      ),
    ];

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          Text(
            'Tools',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: HomeDesign.onSurfaceOf(context),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Everything runs on-device. No accounts or cloud sync.',
            style: TextStyle(
              fontSize: 14,
              color: HomeDesign.mutedOf(context),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 20),
          for (final item in items) ...[
            Material(
              color: HomeDesign.surfaceOf(context),
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: item.$4,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: HomeDesign.primary.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(item.$1, color: HomeDesign.primary),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.$2,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: HomeDesign.onSurfaceOf(context),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              item.$3,
                              style: TextStyle(
                                fontSize: 13,
                                color: HomeDesign.mutedOf(context),
                                height: 1.35,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (item.$4 != null)
                        Icon(
                          Icons.chevron_right_rounded,
                          color: HomeDesign.mutedOf(context),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

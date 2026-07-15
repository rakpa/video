import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../documents/domain/entities.dart';
import '../domain/export_options.dart';
import 'export_controller.dart';

class ExportOptionsSheet extends ConsumerStatefulWidget {
  const ExportOptionsSheet({
    super.key,
    required this.document,
    required this.onPrint,
    this.initialPageSize = ExportPageSize.a4,
  });

  final ScanDocument document;
  final Future<void> Function(PdfExportOptions options) onPrint;
  final ExportPageSize initialPageSize;

  @override
  ConsumerState<ExportOptionsSheet> createState() => _ExportOptionsSheetState();
}

class _ExportOptionsSheetState extends ConsumerState<ExportOptionsSheet> {
  late ExportPageSize _pageSize = widget.initialPageSize;
  var _quality = ExportQuality.medium;

  PdfExportOptions get _pdfOptions => PdfExportOptions(
        pageSize: _pageSize,
        quality: _quality,
      );

  @override
  Widget build(BuildContext context) {
    final exportState = ref.watch(exportControllerProvider);
    final busy = exportState.isLoading;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(context).dividerColor,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Export',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 16),
            const Text('Page size'),
            const SizedBox(height: 8),
            SegmentedButton<ExportPageSize>(
              segments: ExportPageSize.values
                  .map(
                    (size) => ButtonSegment(
                      value: size,
                      label: Text(size.label),
                    ),
                  )
                  .toList(),
              selected: {_pageSize},
              onSelectionChanged: busy
                  ? null
                  : (selection) => setState(() => _pageSize = selection.first),
            ),
            const SizedBox(height: 16),
            const Text('Quality'),
            const SizedBox(height: 8),
            SegmentedButton<ExportQuality>(
              segments: ExportQuality.values
                  .map(
                    (quality) => ButtonSegment(
                      value: quality,
                      label: Text(quality.label),
                    ),
                  )
                  .toList(),
              selected: {_quality},
              onSelectionChanged: busy
                  ? null
                  : (selection) => setState(() => _quality = selection.first),
            ),
            const SizedBox(height: 16),
            if (busy)
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: LinearProgressIndicator(),
              ),
            _ExportAction(
              icon: Icons.ios_share_rounded,
              title: 'Share PDF',
              enabled: !busy,
              onTap: () => _run(
                context,
                () =>
                    ref.read(exportControllerProvider.notifier).exportAndShare(
                          widget.document,
                          options: _pdfOptions,
                          sharePositionOrigin: _shareOrigin(context),
                        ),
              ),
            ),
            _ExportAction(
              icon: Icons.save_alt_rounded,
              title: 'Save PDF',
              enabled: !busy,
              onTap: () => _runWithMessage(context, () async {
                final path = await ref
                    .read(exportControllerProvider.notifier)
                    .savePdf(widget.document, options: _pdfOptions);
                return path == null ? null : 'Saved PDF to $path';
              }),
            ),
            _ExportAction(
              icon: Icons.print_outlined,
              title: 'Print',
              enabled: !busy,
              onTap: () => _run(context, () => widget.onPrint(_pdfOptions)),
            ),
            _ExportAction(
              icon: Icons.archive_outlined,
              title: 'Export JPG/Zip',
              subtitle: 'Share a ZIP with one JPG per page',
              enabled: !busy,
              onTap: () => _run(
                context,
                () => ref.read(exportControllerProvider.notifier).shareJpgZip(
                      widget.document,
                      quality: _quality,
                      sharePositionOrigin: _shareOrigin(context),
                    ),
              ),
            ),
            _ExportAction(
              icon: Icons.photo_library_outlined,
              title: 'Save images',
              subtitle: 'Save JPG pages to the device gallery',
              enabled: !busy,
              onTap: () => _runWithMessage(context, () async {
                final count = await ref
                    .read(exportControllerProvider.notifier)
                    .saveImages(widget.document, quality: _quality);
                return count == null
                    ? null
                    : 'Saved $count image${count == 1 ? '' : 's'} to Photos';
              }),
            ),
          ],
        ),
      ),
    );
  }

  Rect _shareOrigin(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    return (box != null && box.hasSize)
        ? box.localToGlobal(Offset.zero) & box.size
        : const Rect.fromLTWH(0, 0, 1, 1);
  }

  Future<void> _run(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    await action();
    if (!context.mounted) return;
    Navigator.pop(context);
  }

  Future<void> _runWithMessage(
    BuildContext context,
    Future<String?> Function() action,
  ) async {
    final message = await action();
    if (!context.mounted) return;
    Navigator.pop(context);
    if (message != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }
}

class _ExportAction extends StatelessWidget {
  const _ExportAction({
    required this.icon,
    required this.title,
    required this.enabled,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      enabled: enabled,
      leading: Icon(icon),
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      onTap: enabled ? onTap : null,
    );
  }
}

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';

import '../../../app/router/app_router.dart';
import '../../crop/domain/crop_route_args.dart';
import '../../export/domain/export_options.dart';
import '../../export/presentation/export_controller.dart';
import '../../export/presentation/export_options_sheet.dart';
import '../../home/presentation/feed_actions.dart';
import '../../home/presentation/home_design_tokens.dart';
import '../../home/presentation/recent_feed_grid.dart'
    show deleteDocumentWithConfirmation;
import '../../home/presentation/scan_thumbnail.dart';
import '../../ocr/presentation/ocr_text_sheet.dart';
import '../../scan/domain/scan_mode.dart';
import '../../settings/presentation/settings_providers.dart';
import '../domain/entities.dart';
import 'documents_providers.dart';

/// Document viewer — large preview, thumbnails, export & edit actions.
class DocumentDetailScreen extends ConsumerStatefulWidget {
  const DocumentDetailScreen({super.key, required this.documentId});

  final String documentId;

  @override
  ConsumerState<DocumentDetailScreen> createState() =>
      _DocumentDetailScreenState();
}

class _DocumentDetailScreenState extends ConsumerState<DocumentDetailScreen> {
  int _pageIndex = 0;
  final _zoomController = TransformationController();

  @override
  void dispose() {
    _zoomController.dispose();
    super.dispose();
  }

  void _resetZoom() {
    _zoomController.value = Matrix4.identity();
  }

  @override
  Widget build(BuildContext context) {
    final pagesAsync = ref.watch(documentPagesProvider(widget.documentId));
    final summariesAsync = ref.watch(documentListProvider);
    final exportState = ref.watch(exportControllerProvider);

    final summary = summariesAsync.maybeWhen(
      data: (summaries) {
        for (final s in summaries) {
          if (s.document.id == widget.documentId) return s;
        }
        return null;
      },
      orElse: () => null,
    );
    final document = summary?.document;

    ref.listen(exportControllerProvider, (prev, next) {
      if (next is AsyncError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: ${next.error}')),
        );
      }
    });

    return Scaffold(
      backgroundColor: HomeDesign.canvasOf(context),
      body: pagesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed: $e')),
        data: (pages) {
          if (pages.isEmpty) {
            return const Center(child: Text('No pages in this document'));
          }

          final page = pages[_pageIndex.clamp(0, pages.length - 1)];
          final created =
              DateFormat.yMMMd().format(document?.createdAt ?? page.createdAt);

          return Column(
            children: [
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 8, 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      IconButton(
                        onPressed: () => context.pop(),
                        icon: const Icon(Icons.arrow_back_rounded),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              document?.title ?? 'Document',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: HomeDesign.onSurfaceOf(context),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Created $created · ${pages.length} ${pages.length == 1 ? 'page' : 'pages'}',
                              style: TextStyle(
                                fontSize: 12,
                                color: HomeDesign.mutedOf(context),
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: summary == null
                            ? null
                            : () =>
                                _showMoreMenu(context, summary, pages.length),
                        icon: const Icon(Icons.more_vert_rounded),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: GestureDetector(
                    onDoubleTap: () {
                      final currentScale =
                          _zoomController.value.getMaxScaleOnAxis();
                      final target = currentScale > 1.05 ? 1.0 : 2.0;
                      _zoomController.value = Matrix4.diagonal3Values(
                        target,
                        target,
                        1,
                      );
                    },
                    child: InteractiveViewer(
                      transformationController: _zoomController,
                      minScale: 1,
                      maxScale: 4,
                      child: Center(
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius:
                                BorderRadius.circular(HomeDesign.radiusMd),
                            boxShadow: HomeDesign.elevatedShadow,
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: _PageImage(path: page.filePath),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              if (pages.length > 1)
                SizedBox(
                  height: 72,
                  child: ReorderableListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    buildDefaultDragHandles: false,
                    itemCount: pages.length,
                    onReorderItem: (oldIndex, newIndex) =>
                        _reorderPages(pages, oldIndex, newIndex),
                    itemBuilder: (context, index) {
                      final p = pages[index];
                      final selected = index == _pageIndex;
                      return Padding(
                        key: ValueKey(p.id),
                        padding: const EdgeInsets.only(right: 8),
                        child: ReorderableDelayedDragStartListener(
                          index: index,
                          child: GestureDetector(
                            onTap: () {
                              setState(() => _pageIndex = index);
                              _resetZoom();
                            },
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              width: 52,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: selected
                                      ? HomeDesign.primary
                                      : HomeDesign.border,
                                  width: selected ? 2 : 1,
                                ),
                              ),
                              clipBehavior: Clip.antiAlias,
                              child: ScanThumbnail(path: p.filePath),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () =>
                                  _edit(context, page, pages.length),
                              icon: const Icon(Icons.tune_rounded),
                              label: const Text('Edit'),
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(46),
                                foregroundColor: HomeDesign.primary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _crop(context, page),
                              icon: const Icon(Icons.crop_rounded),
                              label: const Text('Crop'),
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(46),
                                foregroundColor: HomeDesign.primary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => showOcrTextSheet(
                                context: context,
                                page: page,
                                documentTitle:
                                    document?.title ?? 'Paperly document',
                              ),
                              icon: const Icon(Icons.text_snippet_outlined),
                              label: Text(
                                page.ocrText?.trim().isNotEmpty == true
                                    ? 'Text'
                                    : 'OCR',
                              ),
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(46),
                                foregroundColor: HomeDesign.primary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: exportState.isLoading || document == null
                              ? null
                              : () => _showExportSheet(context, document),
                          icon: exportState.isLoading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.picture_as_pdf_outlined),
                          label: const Text('Export'),
                          style: FilledButton.styleFrom(
                            backgroundColor: HomeDesign.primary,
                            minimumSize: const Size.fromHeight(48),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showMoreMenu(
    BuildContext context,
    DocumentSummary summary,
    int pageCount,
  ) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.ios_share_rounded),
              title: const Text('Export'),
              onTap: () {
                Navigator.pop(ctx);
                _showExportSheet(context, summary.document);
              },
            ),
            ListTile(
              leading: const Icon(Icons.drive_file_rename_outline_rounded),
              title: const Text('Rename'),
              onTap: () async {
                Navigator.pop(ctx);
                await renameDocumentDialog(context, ref, summary.document);
              },
            ),
            ListTile(
              leading: const Icon(Icons.add_photo_alternate_outlined),
              title: const Text('Add page'),
              onTap: () {
                Navigator.pop(ctx);
                _addPage();
              },
            ),
            ListTile(
              leading: const Icon(Icons.print_outlined),
              title: const Text('Print'),
              onTap: () {
                Navigator.pop(ctx);
                _print(summary.document);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded,
                  color: Color(0xFFC62828)),
              title: const Text('Delete',
                  style: TextStyle(color: Color(0xFFC62828))),
              onTap: () async {
                Navigator.pop(ctx);
                await deleteDocumentWithConfirmation(context, ref, summary);
                if (context.mounted) context.pop();
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _edit(BuildContext context, ScanPage page, int total) async {
    await context.push(
      '/document/${widget.documentId}/page/${page.id}/enhance',
      extra: {
        'page': page,
        'pageNumber': page.index + 1,
        'pageTotal': total,
      },
    );
    if (!mounted) return;
    ref.invalidate(documentPagesProvider(widget.documentId));
  }

  Future<void> _crop(BuildContext context, ScanPage page) async {
    final cropped = await context.push<String>(
      Routes.crop,
      extra: CropRouteArgs(
        imagePath: page.filePath,
        title: 'Re-crop page ${page.index + 1}',
      ),
    );
    if (cropped == null || cropped.isEmpty || !mounted) return;

    await ref
        .read(documentRepositoryProvider)
        .replacePageImage(page.id, cropped);
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    ref.invalidate(documentPagesProvider(widget.documentId));
    ref.invalidate(documentListProvider);
  }

  Future<void> _addPage() async {
    final added = await context.push<bool>(
      Routes.scan,
      extra: ScanRouteArgs(appendDocumentId: widget.documentId),
    );
    if (added != true || !mounted) return;
    ref.invalidate(documentPagesProvider(widget.documentId));
    ref.invalidate(documentListProvider);
    final pages =
        await ref.read(documentPagesProvider(widget.documentId).future);
    if (mounted) setState(() => _pageIndex = pages.length - 1);
  }

  Future<void> _print(
    ScanDocument document, [
    PdfExportOptions options = const PdfExportOptions(),
  ]) async {
    try {
      final pages =
          await ref.read(documentRepositoryProvider).getPages(document.id);
      if (pages.isEmpty) return;
      final file = await ref
          .read(pdfExportServiceProvider)
          .buildPdf(document: document, pages: pages, options: options);
      final bytes = await file.readAsBytes();
      await Printing.layoutPdf(
        onLayout: (_) async => bytes,
        name: document.title,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Print failed: $e')),
      );
    }
  }

  Future<void> _showExportSheet(
    BuildContext context,
    ScanDocument? document,
  ) async {
    if (document == null) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ExportOptionsSheet(
        document: document,
        initialPageSize: ref.read(defaultPageSizeProvider),
        onPrint: (options) => _print(document, options),
      ),
    );
  }

  Future<void> _reorderPages(
    List<ScanPage> pages,
    int oldIndex,
    int newIndex,
  ) async {
    if (oldIndex == newIndex) return;

    final selectedId = pages[_pageIndex.clamp(0, pages.length - 1)].id;
    final reordered = [...pages];
    final moved = reordered.removeAt(oldIndex);
    reordered.insert(newIndex, moved);
    setState(() {
      _pageIndex = reordered.indexWhere((page) => page.id == selectedId);
      if (_pageIndex < 0) _pageIndex = newIndex;
    });

    try {
      await ref.read(documentRepositoryProvider).reorderPages(
            widget.documentId,
            reordered.map((page) => page.id).toList(growable: false),
          );
      ref.invalidate(documentPagesProvider(widget.documentId));
      ref.invalidate(documentListProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not reorder pages: $e')),
      );
    }
  }
}

class _PageImage extends StatelessWidget {
  const _PageImage({required this.path});

  final String path;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return const AspectRatio(
        aspectRatio: 0.72,
        child: Center(child: Icon(Icons.description_outlined, size: 64)),
      );
    }

    final file = File(path);
    if (!file.existsSync()) {
      return const AspectRatio(
        aspectRatio: 0.72,
        child: Center(child: Icon(Icons.broken_image_outlined)),
      );
    }

    return Image.file(
      file,
      fit: BoxFit.contain,
      cacheWidth: 1200,
    );
  }
}

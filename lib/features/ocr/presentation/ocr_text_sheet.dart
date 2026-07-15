import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';
import '../../home/presentation/home_design_tokens.dart';
import 'ocr_providers.dart';

Future<void> showOcrTextSheet({
  required BuildContext context,
  required ScanPage page,
  required String documentTitle,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _OcrTextSheet(
      page: page,
      documentTitle: documentTitle,
    ),
  );
}

class _OcrTextSheet extends ConsumerStatefulWidget {
  const _OcrTextSheet({
    required this.page,
    required this.documentTitle,
  });

  final ScanPage page;
  final String documentTitle;

  @override
  ConsumerState<_OcrTextSheet> createState() => _OcrTextSheetState();
}

class _OcrTextSheetState extends ConsumerState<_OcrTextSheet> {
  late String _text = widget.page.ocrText?.trim() ?? '';
  bool _extracting = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    if (_text.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _extract());
    }
  }

  Future<void> _extract() async {
    if (_extracting) return;
    setState(() {
      _extracting = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(ocrServiceProvider)
          .recognizeText(widget.page.filePath);
      await ref
          .read(documentRepositoryProvider)
          .updatePageOcrText(widget.page.id, result.text);
      ref.invalidate(documentPagesProvider(widget.page.documentId));
      ref.invalidate(documentListProvider);
      if (!mounted) return;
      setState(() {
        _text = result.text;
        _extracting = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _extracting = false;
      });
    }
  }

  Future<void> _copy() async {
    if (_text.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: _text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Text copied')),
    );
  }

  Future<void> _shareTxt() async {
    if (_text.isEmpty) return;
    final dir = await getTemporaryDirectory();
    final fileName =
        '${_safeFileName(widget.documentTitle)}_page_${widget.page.index + 1}.txt';
    final file = File(p.join(dir.path, fileName));
    await file.writeAsString(_text, flush: true);
    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'text/plain', name: fileName)],
      text: 'Extracted text from ${widget.documentTitle}',
    );
  }

  String _safeFileName(String value) {
    final cleaned = value.trim().replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '_');
    return cleaned.isEmpty ? 'paperly_text' : cleaned;
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final color = HomeDesign.onSurfaceOf(context);
    final muted = HomeDesign.mutedOf(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottomInset),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.72,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: HomeDesign.border,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Extract text',
                    style: TextStyle(
                      color: color,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Run OCR again',
                  onPressed: _extracting ? null : _extract,
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
            Text(
              'Page ${widget.page.index + 1} · on-device recognition',
              style: TextStyle(color: muted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest
                      .withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: HomeDesign.border),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: _body(color, muted),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _text.isEmpty ? null : _copy,
                    icon: const Icon(Icons.copy_rounded),
                    label: const Text('Copy'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _text.isEmpty ? null : _shareTxt,
                    icon: const Icon(Icons.ios_share_rounded),
                    label: const Text('Share as .txt'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(Color color, Color muted) {
    if (_extracting) {
      return const Center(child: CircularProgressIndicator());
    }
    final error = _error;
    if (error != null) {
      return Center(
        child: Text(
          'Could not extract text.\n$error',
          textAlign: TextAlign.center,
          style: TextStyle(color: muted),
        ),
      );
    }
    if (_text.isEmpty) {
      return Center(
        child: Text(
          'No text found on this page.',
          style: TextStyle(color: muted),
        ),
      );
    }
    return SingleChildScrollView(
      child: SelectableText(
        _text,
        style: TextStyle(
          color: color,
          fontSize: 15,
          height: 1.45,
        ),
      ),
    );
  }
}

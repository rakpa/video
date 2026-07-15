import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';
import '../../scan/presentation/scan_design_tokens.dart';
import '../data/image_processor.dart';
import '../domain/doc_filter.dart';

/// Native page editor — live filter preview plus brightness/contrast sliders.
class EnhanceScreen extends ConsumerStatefulWidget {
  const EnhanceScreen({
    super.key,
    required this.page,
    required this.documentId,
    this.pageNumber = 1,
    this.pageTotal = 1,
  });

  final ScanPage page;
  final String documentId;
  final int pageNumber;
  final int pageTotal;

  @override
  ConsumerState<EnhanceScreen> createState() => _EnhanceScreenState();
}

class _EnhanceScreenState extends ConsumerState<EnhanceScreen> {
  DocFilter _filter = DocFilter.original;
  double _brightness = 0;
  double _contrast = 0;

  Uint8List? _original;
  Uint8List? _diskOriginal;
  Uint8List? _preview;
  bool _processing = false;
  bool _saving = false;
  bool _rotating = false;
  bool _rotated = false;
  Timer? _debounce;

  static const _carouselFilters = [
    DocFilter.original,
    DocFilter.magic,
    DocFilter.lighten,
    DocFilter.blackWhite,
    DocFilter.grayscale,
    DocFilter.auto,
  ];

  static const _filterIcons = {
    DocFilter.original: Icons.image_outlined,
    DocFilter.magic: Icons.auto_fix_high_rounded,
    DocFilter.lighten: Icons.light_mode_rounded,
    DocFilter.blackWhite: Icons.filter_b_and_w_rounded,
    DocFilter.grayscale: Icons.gradient_rounded,
    DocFilter.auto: Icons.auto_awesome_outlined,
  };

  double get _brightnessFactor => 1 + _brightness * 0.5;
  double get _contrastFactor => 1 + _contrast * 0.5;

  bool get _hasEdits =>
      _rotated ||
      _filter != DocFilter.original ||
      _brightness != 0 ||
      _contrast != 0;

  @override
  void initState() {
    super.initState();
    _loadOriginal();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _loadOriginal() async {
    final bytes = await File(widget.page.filePath).readAsBytes();
    if (!mounted) return;
    setState(() {
      _diskOriginal = bytes;
      _original = bytes;
      _preview = bytes;
    });
  }

  Future<void> _regeneratePreview() async {
    final source = _original;
    if (source == null) return;
    setState(() => _processing = true);

    final result = await ref.read(imageProcessorProvider).process(
          bytes: source,
          filter: _filter,
          brightness: _brightnessFactor,
          contrast: _contrastFactor,
          maxDimension: 1080,
          quality: 85,
        );

    if (!mounted) return;
    setState(() {
      _preview = result;
      _processing = false;
    });
  }

  void _onFilterSelected(DocFilter filter) {
    if (filter == _filter) return;
    setState(() => _filter = filter);
    _regeneratePreview();
  }

  void _onAdjustmentChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 180), _regeneratePreview);
  }

  void _reset() {
    final diskOriginal = _diskOriginal;
    setState(() {
      _filter = DocFilter.original;
      _brightness = 0;
      _contrast = 0;
      _original = diskOriginal ?? _original;
      _preview = diskOriginal ?? _original;
      _processing = false;
      _rotated = false;
    });
    _debounce?.cancel();
  }

  Future<void> _rotate90({required bool clockwise}) async {
    final source = _original;
    if (source == null || _rotating || _saving) return;
    setState(() {
      _rotating = true;
      _processing = true;
    });
    try {
      final rotated = await ref.read(imageProcessorProvider).rotate90(
            bytes: source,
            clockwise: clockwise,
          );
      if (!mounted) return;
      setState(() {
        _original = rotated;
        _preview = rotated;
        _rotated = true;
        _rotating = false;
      });
      if (_filter != DocFilter.original || _brightness != 0 || _contrast != 0) {
        await _regeneratePreview();
      } else if (mounted) {
        setState(() => _processing = false);
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _rotating = false;
        _processing = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not rotate: $error')),
      );
    }
  }

  Future<void> _save() async {
    final source = _original;
    if (source == null || _saving) return;

    if (!_hasEdits) {
      if (mounted) context.pop(false);
      return;
    }
    setState(() => _saving = true);

    try {
      final full = await ref.read(imageProcessorProvider).process(
            bytes: source,
            filter: _filter,
            brightness: _brightnessFactor,
            contrast: _contrastFactor,
            maxDimension: 2600,
            quality: 92,
          );
      await File(widget.page.filePath).writeAsBytes(full, flush: true);

      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();

      await ref
          .read(documentRepositoryProvider)
          .touchDocument(widget.documentId);
      ref.invalidate(documentPagesProvider(widget.documentId));
      ref.invalidate(documentListProvider);

      if (!mounted) return;
      context.pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save: $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D1117),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: _saving ? null : () => context.pop(),
                    icon: const Icon(Icons.close_rounded),
                    color: ScanDesign.onDark,
                  ),
                  Expanded(
                    child: Text(
                      'Page ${widget.pageNumber} of ${widget.pageTotal}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: ScanDesign.onDark,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: ScanDesign.onDark,
                            ),
                          )
                        : const Text(
                            'Save',
                            style: TextStyle(
                              color: ScanDesign.primaryLight,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    if (_preview != null)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.memory(
                          _preview!,
                          fit: BoxFit.contain,
                          gaplessPlayback: true,
                        ),
                      )
                    else
                      const CircularProgressIndicator(
                        color: ScanDesign.primaryLight,
                      ),
                    if (_processing)
                      const Positioned(
                        top: 12,
                        right: 12,
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: ScanDesign.onDark,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _rotating || _saving
                          ? null
                          : () => _rotate90(clockwise: false),
                      icon: const Icon(Icons.rotate_left_rounded),
                      label: const Text('Rotate left'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: ScanDesign.primaryLight,
                        side: const BorderSide(color: Colors.white24),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _rotating || _saving
                          ? null
                          : () => _rotate90(clockwise: true),
                      icon: const Icon(Icons.rotate_right_rounded),
                      label: const Text('Rotate right'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: ScanDesign.primaryLight,
                        side: const BorderSide(color: Colors.white24),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 84,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _carouselFilters.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final filter = _carouselFilters[index];
                  final selected = filter == _filter;
                  return GestureDetector(
                    onTap: () => _onFilterSelected(filter),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      width: 76,
                      decoration: BoxDecoration(
                        color: selected
                            ? ScanDesign.primary.withValues(alpha: 0.22)
                            : Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: selected
                              ? ScanDesign.primaryLight
                              : Colors.white24,
                          width: selected ? 1.6 : 1,
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            _filterIcons[filter],
                            size: 24,
                            color: selected
                                ? ScanDesign.primaryLight
                                : ScanDesign.onDarkMuted,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            filter.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w500,
                              color: selected
                                  ? ScanDesign.onDark
                                  : ScanDesign.onDarkMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Column(
                children: [
                  _AdjustmentSlider(
                    icon: Icons.light_mode_outlined,
                    label: 'Brightness',
                    value: _brightness,
                    onChanged: (v) {
                      setState(() => _brightness = v);
                      _onAdjustmentChanged();
                    },
                  ),
                  _AdjustmentSlider(
                    icon: Icons.contrast_rounded,
                    label: 'Contrast',
                    value: _contrast,
                    onChanged: (v) {
                      setState(() => _contrast = v);
                      _onAdjustmentChanged();
                    },
                  ),
                  if (_hasEdits)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                        onPressed: _saving ? null : _reset,
                        icon: const Icon(Icons.restart_alt_rounded, size: 18),
                        label: const Text('Reset'),
                        style: TextButton.styleFrom(
                          foregroundColor: ScanDesign.onDarkMuted,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdjustmentSlider extends StatelessWidget {
  const _AdjustmentSlider({
    required this.icon,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: ScanDesign.onDarkMuted),
        const SizedBox(width: 4),
        Expanded(
          child: Slider(
            value: value,
            min: -1,
            max: 1,
            activeColor: ScanDesign.primaryLight,
            inactiveColor: Colors.white24,
            label: label,
            onChanged: onChanged,
          ),
        ),
        SizedBox(
          width: 36,
          child: Text(
            (value * 100).round().toString(),
            textAlign: TextAlign.end,
            style: const TextStyle(
              color: ScanDesign.onDarkMuted,
              fontSize: 12,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}

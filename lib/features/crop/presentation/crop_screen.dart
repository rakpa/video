import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../scan/presentation/scan_design_tokens.dart';
import '../data/crop_image_service.dart';
import '../domain/crop_route_args.dart';

class CropScreen extends ConsumerStatefulWidget {
  const CropScreen({super.key, required this.args});

  final CropRouteArgs args;

  @override
  ConsumerState<CropScreen> createState() => _CropScreenState();
}

class _CropScreenState extends ConsumerState<CropScreen> {
  final _imageKey = ValueKey(DateTime.now().microsecondsSinceEpoch);

  Size? _imageSize;
  List<Offset> _corners = const [];
  Offset? _dragLocal;
  int? _draggingCorner;
  bool _loading = true;
  bool _detecting = false;
  bool _saving = false;
  bool _useFullImage = false;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  Future<void> _loadImage() async {
    if (kIsWeb) {
      setState(() => _loading = false);
      return;
    }

    final bytes = await File(widget.args.imagePath).readAsBytes();
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final size = Size(
      frame.image.width.toDouble(),
      frame.image.height.toDouble(),
    );
    frame.image.dispose();

    if (!mounted) return;
    setState(() {
      _imageSize = size;
      _corners = _initialCorners(size);
      _loading = false;
    });
  }

  List<Offset> _initialCorners(Size size) {
    final normalized = widget.args.initialNormalizedCorners;
    if (normalized != null && normalized.length == 4) {
      return normalized
          .map((c) => Offset(c.dx * size.width, c.dy * size.height))
          .toList(growable: false);
    }
    return _fullFrameCorners(size);
  }

  List<Offset> _fullFrameCorners(Size size) => [
        Offset.zero,
        Offset(size.width, 0),
        Offset(size.width, size.height),
        Offset(0, size.height),
      ];

  Rect _imageRect(Size available, Size imageSize) {
    final scale = math.min(
      available.width / imageSize.width,
      available.height / imageSize.height,
    );
    final width = imageSize.width * scale;
    final height = imageSize.height * scale;
    return Rect.fromLTWH(
      (available.width - width) / 2,
      (available.height - height) / 2,
      width,
      height,
    );
  }

  Offset _toView(Offset imagePoint, Rect rect, Size imageSize) {
    return Offset(
      rect.left + imagePoint.dx / imageSize.width * rect.width,
      rect.top + imagePoint.dy / imageSize.height * rect.height,
    );
  }

  Offset _toImage(Offset viewPoint, Rect rect, Size imageSize) {
    return Offset(
      ((viewPoint.dx - rect.left) / rect.width * imageSize.width)
          .clamp(0.0, imageSize.width),
      ((viewPoint.dy - rect.top) / rect.height * imageSize.height)
          .clamp(0.0, imageSize.height),
    );
  }

  Future<void> _redetect() async {
    if (_detecting) return;
    setState(() => _detecting = true);
    try {
      final detected = await ref
          .read(cropImageServiceProvider)
          .detectCorners(widget.args.imagePath);
      if (!mounted) return;
      if (detected == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No document edge found.')),
        );
        return;
      }
      setState(() {
        _corners = detected;
        _useFullImage = false;
      });
    } finally {
      if (mounted) setState(() => _detecting = false);
    }
  }

  void _useFullFrame() {
    final size = _imageSize;
    if (size == null) return;
    HapticFeedback.selectionClick();
    setState(() {
      _corners = _fullFrameCorners(size);
      _useFullImage = true;
    });
  }

  Future<void> _confirm() async {
    if (_saving || _corners.length != 4) return;
    setState(() => _saving = true);
    try {
      final result = await ref.read(cropImageServiceProvider).applyCrop(
            imagePath: widget.args.imagePath,
            corners: _corners,
            useFullImage: _useFullImage,
          );
      if (!mounted) return;
      context.pop(result);
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Crop failed: $error')),
      );
    }
  }

  void _startDrag(int index, Offset viewPosition) {
    HapticFeedback.selectionClick();
    setState(() {
      _draggingCorner = index;
      _dragLocal = viewPosition;
      _useFullImage = false;
    });
  }

  void _nudgeDrag(
    int index,
    Offset delta,
    Rect rect,
    Size imageSize,
  ) {
    final currentView = _toView(_corners[index], rect, imageSize);
    final nextView = currentView + delta;
    final next = [..._corners];
    next[index] = _toImage(nextView, rect, imageSize);
    setState(() {
      _corners = next;
      _dragLocal = nextView;
    });
  }

  void _endDrag() {
    setState(() {
      _draggingCorner = null;
      _dragLocal = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final imageSize = _imageSize;

    return Scaffold(
      backgroundColor: const Color(0xFF0D1117),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed:
                        _saving ? null : () => context.pop<String?>(null),
                    icon: const Icon(Icons.close_rounded),
                    color: ScanDesign.onDark,
                  ),
                  Expanded(
                    child: Text(
                      widget.args.title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: ScanDesign.onDark,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _saving || _loading ? null : _confirm,
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
                            'Apply',
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
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: _loading || imageSize == null
                        ? const Center(
                            child: CircularProgressIndicator(
                              color: ScanDesign.primaryLight,
                            ),
                          )
                        : LayoutBuilder(
                            builder: (context, constraints) {
                              final available = Size(
                                constraints.maxWidth,
                                constraints.maxHeight,
                              );
                              final rect = _imageRect(available, imageSize);
                              final viewCorners = _corners
                                  .map((c) => _toView(c, rect, imageSize))
                                  .toList(growable: false);

                              return Stack(
                                children: [
                                  Positioned.fromRect(
                                    rect: rect,
                                    child: Image.file(
                                      File(widget.args.imagePath),
                                      key: _imageKey,
                                      fit: BoxFit.fill,
                                    ),
                                  ),
                                  Positioned.fill(
                                    child: CustomPaint(
                                      painter: _CropOverlayPainter(
                                        imageRect: rect,
                                        corners: viewCorners,
                                      ),
                                    ),
                                  ),
                                  for (var i = 0; i < viewCorners.length; i++)
                                    _CornerHandle(
                                      position: viewCorners[i],
                                      active: _draggingCorner == i,
                                      onPanStart: () =>
                                          _startDrag(i, viewCorners[i]),
                                      onPanUpdate: (details) => _nudgeDrag(
                                        i,
                                        details.delta,
                                        rect,
                                        imageSize,
                                      ),
                                      onPanEnd: (_) => _endDrag(),
                                    ),
                                  if (_dragLocal != null)
                                    _Loupe(
                                      imagePath: widget.args.imagePath,
                                      imageRect: rect,
                                      focalPoint: _dragLocal!,
                                      available: available,
                                    ),
                                ],
                              );
                            },
                          ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _detecting || _saving ? null : _redetect,
                      icon: _detecting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.center_focus_strong_rounded),
                      label: const Text('Re-detect'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: ScanDesign.primaryLight,
                        side: const BorderSide(color: Colors.white24),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _saving ? null : _useFullFrame,
                      icon: const Icon(Icons.crop_free_rounded),
                      label: const Text('Use full image'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: ScanDesign.onDark,
                        side: const BorderSide(color: Colors.white24),
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

class _CornerHandle extends StatelessWidget {
  const _CornerHandle({
    required this.position,
    required this.active,
    required this.onPanStart,
    required this.onPanUpdate,
    required this.onPanEnd,
  });

  final Offset position;
  final bool active;
  final VoidCallback onPanStart;
  final GestureDragUpdateCallback onPanUpdate;
  final GestureDragEndCallback onPanEnd;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: position.dx - 24,
      top: position.dy - 24,
      width: 48,
      height: 48,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onPanStart: (_) => onPanStart(),
        onPanUpdate: onPanUpdate,
        onPanEnd: onPanEnd,
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: active ? 28 : 22,
            height: active ? 28 : 22,
            decoration: BoxDecoration(
              color: ScanDesign.primaryLight,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2.5),
              boxShadow: [
                BoxShadow(
                  color: ScanDesign.primaryLight.withValues(alpha: 0.45),
                  blurRadius: active ? 18 : 10,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Loupe extends StatelessWidget {
  const _Loupe({
    required this.imagePath,
    required this.imageRect,
    required this.focalPoint,
    required this.available,
  });

  final String imagePath;
  final Rect imageRect;
  final Offset focalPoint;
  final Size available;

  @override
  Widget build(BuildContext context) {
    const size = 104.0;
    const zoom = 2.4;
    final left = (focalPoint.dx + 18).clamp(8.0, available.width - size - 8);
    final top =
        (focalPoint.dy - size - 24).clamp(8.0, available.height - size - 8);
    final imageLocal = focalPoint - imageRect.topLeft;

    return Positioned(
      left: left,
      top: top,
      width: size,
      height: size,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: const [
              BoxShadow(
                color: Colors.black54,
                blurRadius: 16,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: ClipOval(
            child: Stack(
              children: [
                Transform(
                  alignment: Alignment.topLeft,
                  transform: Matrix4.identity()
                    ..setEntry(0, 0, zoom)
                    ..setEntry(1, 1, zoom)
                    ..setEntry(0, 3, size / 2 - imageLocal.dx * zoom)
                    ..setEntry(1, 3, size / 2 - imageLocal.dy * zoom),
                  child: SizedBox(
                    width: imageRect.width,
                    height: imageRect.height,
                    child: Image.file(
                      File(imagePath),
                      fit: BoxFit.fill,
                    ),
                  ),
                ),
                const Center(
                  child: Icon(
                    Icons.add_rounded,
                    size: 20,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CropOverlayPainter extends CustomPainter {
  const _CropOverlayPainter({
    required this.imageRect,
    required this.corners,
  });

  final Rect imageRect;
  final List<Offset> corners;

  @override
  void paint(Canvas canvas, Size size) {
    final shade = Paint()..color = Colors.black.withValues(alpha: 0.45);
    final full = Path()..addRect(Offset.zero & size);
    final image = Path()..addRect(imageRect);
    final outside = Path.combine(PathOperation.difference, full, image);
    canvas.drawPath(outside, shade);

    if (corners.length != 4) return;
    final polygon = Path()..moveTo(corners.first.dx, corners.first.dy);
    for (final c in corners.skip(1)) {
      polygon.lineTo(c.dx, c.dy);
    }
    polygon.close();

    final dimmedImage = Path.combine(PathOperation.difference, image, polygon);
    canvas.drawPath(dimmedImage, shade);
    canvas.drawPath(
      polygon,
      Paint()
        ..color = ScanDesign.primaryLight.withValues(alpha: 0.20)
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      polygon,
      Paint()
        ..color = ScanDesign.primaryLight
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5,
    );
  }

  @override
  bool shouldRepaint(covariant _CropOverlayPainter oldDelegate) {
    return oldDelegate.imageRect != imageRect || oldDelegate.corners != corners;
  }
}

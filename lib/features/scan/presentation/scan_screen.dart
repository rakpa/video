import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_router.dart';
import '../../crop/domain/crop_route_args.dart';
import '../domain/scan_enhance_filter.dart';
import '../domain/scan_mode.dart';
import 'scan_controller.dart';
import 'scan_design_tokens.dart';
import 'scan_session_controller.dart';
import 'widgets/scan_bottom_controls.dart';
import 'widgets/scan_captured_preview.dart';
import 'widgets/scan_edge_overlay.dart';
import 'widgets/scan_filter_strip.dart';
import 'widgets/scan_mode_selector.dart';
import 'widgets/scan_review_panel.dart';
import 'widgets/scan_status_pill.dart';
import 'widgets/scan_top_toolbar.dart';

/// Premium in-app camera scanner with live edge guides and multi-page capture.
class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key, this.args = const ScanRouteArgs()});

  final ScanRouteArgs args;

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _pulseController;
  Timer? _detectionTimer;
  Timer? _focusRingTimer;
  Offset? _focusPoint;
  var _saving = false;

  /// In-app camera with live edge guides is the scan experience.
  var _showCustomCamera = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (kIsWeb) return;
      ref.read(scanSessionProvider.notifier).setCropEditor(_openCropEditor);
      await _startCustomCamera();
    });
  }

  Future<void> _startCustomCamera() async {
    if (!mounted) return;
    setState(() => _showCustomCamera = true);
    await ref.read(scanSessionProvider.notifier).initializeCamera();
    _detectionTimer ??= Timer.periodic(
      const Duration(milliseconds: 50),
      (_) => ref.read(scanSessionProvider.notifier).updateDetection(),
    );
    if (widget.args.openGallery && mounted) {
      await ref.read(scanSessionProvider.notifier).importFromGallery();
    }
  }

  @override
  void dispose() {
    ref.read(scanSessionProvider.notifier).setCropEditor(null);
    WidgetsBinding.instance.removeObserver(this);
    _detectionTimer?.cancel();
    _focusRingTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  Future<String?> _openCropEditor(String sourcePath, DocumentQuad quad) async {
    if (!mounted) return '';
    final result = await context.push<String>(
      Routes.crop,
      extra: CropRouteArgs(
        imagePath: sourcePath,
        initialNormalizedCorners: quad.corners,
      ),
    );
    return result ?? '';
  }

  /// Release the camera in background and restore it on return — otherwise
  /// the preview comes back frozen (or the camera stays locked for other apps).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (kIsWeb) return;
    // Only manage the camera while the in-app preview is active.
    if (!_showCustomCamera) return;
    final notifier = ref.read(scanSessionProvider.notifier);
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      notifier.suspendCamera();
    } else if (state == AppLifecycleState.resumed) {
      notifier.resumeCamera();
    }
  }

  Future<void> _focusAt(Offset local, Size previewSize) async {
    final camera = ref.read(scanSessionProvider.notifier).cameraController;
    if (camera == null || !camera.value.isInitialized) return;

    final point = Offset(
      (local.dx / previewSize.width).clamp(0.0, 1.0),
      (local.dy / previewSize.height).clamp(0.0, 1.0),
    );
    setState(() => _focusPoint = local);
    _focusRingTimer?.cancel();
    _focusRingTimer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _focusPoint = null);
    });

    try {
      await camera.setFocusPoint(point);
      await camera.setExposurePoint(point);
    } catch (_) {
      // Some devices don't support focus/exposure points — the tap is a no-op.
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _capture() async {
    try {
      await HapticFeedback.lightImpact();
      await ref.read(scanSessionProvider.notifier).capture(manual: true);
    } catch (e) {
      _showError('Capture failed: $e');
    }
  }

  Future<void> _setFilter(ScanEnhanceFilter filter) async {
    try {
      await ref.read(scanSessionProvider.notifier).setPageFilter(filter);
    } catch (e) {
      _showError('Filter failed: $e');
    }
  }

  Future<void> _save() async {
    final paths = ref.read(scanSessionProvider).capturedPaths;
    if (paths.isEmpty || _saving) return;

    setState(() => _saving = true);
    try {
      final controller = ref.read(scanControllerProvider.notifier);
      final appendId = widget.args.appendDocumentId;

      if (appendId != null) {
        final ok = await controller.saveAppendedPages(appendId, paths);
        if (!mounted) return;
        if (ok) {
          context.pop(true);
        } else {
          _showError('Could not save pages. Please try again.');
        }
      } else {
        final doc = await controller.saveFromPaths(
          paths,
          folderId: widget.args.folderId,
        );
        if (!mounted) return;
        if (doc != null) {
          context.pop();
          context.push('/document/${doc.id}');
        } else {
          _showError('Could not save document. Please try again.');
        }
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showMoreMenu() {
    final session = ref.read(scanSessionProvider);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1A1C1D),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SwitchListTile(
              title: const Text('Auto-capture',
                  style: TextStyle(color: Colors.white)),
              subtitle: const Text(
                'Capture when document is stable',
                style: TextStyle(color: Colors.white70),
              ),
              value: session.autoCapture,
              activeThumbColor: ScanDesign.primary,
              onChanged: (v) =>
                  ref.read(scanSessionProvider.notifier).setAutoCapture(v),
            ),
          ],
        ),
      ),
    );
  }

  /// Sizes the preview to the camera buffer in display orientation so the
  /// normalized quad coordinates from detection map 1:1 onto the pixels.
  Widget _previewBox(
    BuildContext context,
    CameraController camera,
    Widget overlay,
  ) {
    final buffer = camera.value.previewSize ?? const Size(720, 1280);
    final portrait = MediaQuery.orientationOf(context) == Orientation.portrait;
    final shortSide = buffer.shortestSide;
    final longSide = buffer.longestSide;
    final size = Size(
      portrait ? shortSide : longSide,
      portrait ? longSide : shortSide,
    );
    return SizedBox(
      width: size.width,
      height: size.height,
      child: CameraPreview(
        camera,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (details) => _focusAt(details.localPosition, size),
          child: Stack(
            fit: StackFit.expand,
            children: [
              overlay,
              if (_focusPoint != null)
                Positioned(
                  left: _focusPoint!.dx - 32,
                  top: _focusPoint!.dy - 32,
                  child: IgnorePointer(
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: ScanDesign.guideBlue,
                          width: 2,
                        ),
                      ),
                    )
                        .animate(key: ValueKey(_focusPoint))
                        .scale(
                          begin: const Offset(1.3, 1.3),
                          end: const Offset(1, 1),
                          duration: 220.ms,
                          curve: Curves.easeOutCubic,
                        )
                        .fadeIn(duration: 120.ms),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          title: const Text('Scanner'),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => context.pop(),
          ),
        ),
        body: const Center(
          child: Text(
            'Camera scanning runs on the installed app.',
            style: TextStyle(color: Colors.white70),
          ),
        ),
      );
    }

    // Quiet holding screen while the custom camera initializes.
    if (!_showCustomCamera) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(color: ScanDesign.primary),
              const SizedBox(height: 16),
              Text(
                'Opening scanner...',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7)),
              ),
            ],
          ),
        ),
      );
    }

    final session = ref.watch(scanSessionProvider);
    final camera = ref.read(scanSessionProvider.notifier).cameraController;

    if (session.step == ScanStep.review) {
      return ScanReviewPanel(
        paths: session.capturedPaths,
        saving: _saving,
        onBack: () => ref.read(scanSessionProvider.notifier).backToCapture(),
        onRemove: (i) => ref.read(scanSessionProvider.notifier).removePage(i),
        onAddMore: () => ref.read(scanSessionProvider.notifier).backToCapture(),
        onSave: _save,
      );
    }

    final quad = session.quad ?? DocumentQuad.forMode(session.mode);
    final previewPath = session.editingPreviewPath;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (session.cameraReady &&
              camera != null &&
              camera.value.isInitialized)
            // Preview and edge overlay share one coordinate space: the overlay
            // is a child of CameraPreview inside a cover-fitted box, so the
            // detected quad lands exactly on the document the camera sees.
            SizedBox.expand(
              child: ClipRect(
                child: FittedBox(
                  fit: BoxFit.cover,
                  clipBehavior: Clip.hardEdge,
                  child: _previewBox(
                    context,
                    camera,
                    AnimatedBuilder(
                      animation: _pulseController,
                      builder: (context, _) => ScanEdgeOverlay(
                        quad: quad,
                        confidence: session.confidence,
                        pulse: session.waitingForNextPage
                            ? 0
                            : _pulseController.value,
                      ),
                    ),
                  ),
                ),
              ),
            )
          else if (session.cameraError != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  session.cameraError!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            )
          else
            const Center(
              child: CircularProgressIndicator(color: ScanDesign.primary),
            ),

          if (session.waitingForNextPage && previewPath != null)
            Positioned.fill(
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.55),
                child: Center(
                  child: ScanCapturedPreview(
                    imagePath: previewPath,
                    processing: session.applyingFilter,
                  ),
                ),
              ),
            ),

          if (session.showFlashOverlay)
            AnimatedOpacity(
              opacity: session.showFlashOverlay ? 1 : 0,
              duration: const Duration(milliseconds: 80),
              child: const ColoredBox(color: Colors.white),
            ),

          // Glass bottom gradient
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 280,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.75),
                  ],
                ),
              ),
            ),
          ),

          Column(
            children: [
              ScanTopToolbar(
                onClose: () => context.pop(),
                onFlash: () =>
                    ref.read(scanSessionProvider.notifier).toggleFlash(),
                onMore: _showMoreMenu,
                flashOn: session.flashOn,
                status: session.phase,
              ),
              const Spacer(),
              ScanStatusPill(
                phase: session.phase,
                confidence: session.confidence,
              ),
              if (session.waitingForNextPage && previewPath != null) ...[
                const SizedBox(height: 12),
                ScanFilterStrip(
                  selected: session.activeFilter,
                  processing: session.applyingFilter,
                  onSelected: _setFilter,
                ),
              ],
              if (!session.waitingForNextPage) ...[
                const SizedBox(height: 16),
                ScanModeSelector(
                  selected: session.mode,
                  onSelected: (m) =>
                      ref.read(scanSessionProvider.notifier).setMode(m),
                ),
              ],
              const SizedBox(height: 12),
              ScanBottomControls(
                pageCount: session.pageCount,
                capturing: session.isCapturing,
                waitingForNextPage: session.waitingForNextPage,
                hintText: session.waitingForNextPage
                    ? 'Swap to the next page to continue, or adjust filters'
                    : 'Align document inside the frame',
                onNextPage: session.waitingForNextPage
                    ? () {
                        HapticFeedback.selectionClick();
                        ref
                            .read(scanSessionProvider.notifier)
                            .prepareNextPage();
                      }
                    : null,
                onGallery: session.waitingForNextPage
                    ? () {}
                    : () async {
                        try {
                          await ref
                              .read(scanSessionProvider.notifier)
                              .importFromGallery();
                        } catch (e) {
                          _showError('Import failed: $e');
                        }
                      },
                onCapture: _capture,
                retakeMode: session.waitingForNextPage,
                onDone: () =>
                    ref.read(scanSessionProvider.notifier).goToReview(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

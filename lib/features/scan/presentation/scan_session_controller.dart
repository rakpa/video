import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../enhance/data/image_processor.dart';
import '../../settings/presentation/settings_providers.dart';
import '../data/camera_frame_analyzer.dart';
import '../data/camera_scan_service.dart';
import '../data/document_edge_tracker.dart';
import '../data/gallery_import_service.dart';
import '../data/scan_image_processor.dart';
import '../domain/captured_scan_page.dart';
import '../domain/scan_enhance_filter.dart';
import '../domain/scan_mode.dart';

final cameraScanServiceProvider = Provider<CameraScanService>((ref) {
  final service = CameraScanService();
  ref.onDispose(() {
    service.dispose();
  });
  return service;
});

final galleryImportServiceProvider = Provider((ref) => GalleryImportService());

final scanImageProcessorProvider = Provider((ref) => ScanImageProcessor());

/// In-memory scan session while the camera screen is open.
class ScanSessionState {
  const ScanSessionState({
    this.mode = ScanMode.document,
    this.pages = const [],
    this.editingPageIndex,
    this.phase = ScanDetectionPhase.looking,
    this.confidence = 0,
    this.quad,
    this.flashOn = false,
    this.autoCapture = true,
    this.isCapturing = false,
    this.showFlashOverlay = false,
    this.step = ScanStep.capture,
    this.cameraReady = false,
    this.cameraError,
    this.applyingFilter = false,
  });

  final ScanMode mode;
  final List<CapturedScanPage> pages;

  /// Index of the page currently shown in preview / filter strip.
  final int? editingPageIndex;
  final ScanDetectionPhase phase;
  final double confidence;
  final DocumentQuad? quad;
  final bool flashOn;
  final bool autoCapture;
  final bool isCapturing;
  final bool showFlashOverlay;
  final ScanStep step;
  final bool cameraReady;
  final String? cameraError;
  final bool applyingFilter;

  int get pageCount => pages.length;

  bool get waitingForNextPage =>
      editingPageIndex != null && step == ScanStep.capture;

  CapturedScanPage? get editingPage => editingPageIndex != null &&
          editingPageIndex! >= 0 &&
          editingPageIndex! < pages.length
      ? pages[editingPageIndex!]
      : null;

  String? get editingPreviewPath => editingPage?.displayPath;

  ScanEnhanceFilter get activeFilter =>
      editingPage?.filter ?? ScanEnhanceFilter.color;

  /// Final file paths passed to save — one per page, with that page's filter applied.
  List<String> get capturedPaths =>
      pages.map((page) => page.displayPath).toList(growable: false);

  ScanSessionState copyWith({
    ScanMode? mode,
    List<CapturedScanPage>? pages,
    int? editingPageIndex,
    bool clearEditingPageIndex = false,
    ScanDetectionPhase? phase,
    double? confidence,
    DocumentQuad? quad,
    bool? flashOn,
    bool? autoCapture,
    bool? isCapturing,
    bool? showFlashOverlay,
    ScanStep? step,
    bool? cameraReady,
    String? cameraError,
    bool? applyingFilter,
  }) {
    return ScanSessionState(
      mode: mode ?? this.mode,
      pages: pages ?? this.pages,
      editingPageIndex: clearEditingPageIndex
          ? null
          : (editingPageIndex ?? this.editingPageIndex),
      phase: phase ?? this.phase,
      confidence: confidence ?? this.confidence,
      quad: quad ?? this.quad,
      flashOn: flashOn ?? this.flashOn,
      autoCapture: autoCapture ?? this.autoCapture,
      isCapturing: isCapturing ?? this.isCapturing,
      showFlashOverlay: showFlashOverlay ?? this.showFlashOverlay,
      step: step ?? this.step,
      cameraReady: cameraReady ?? this.cameraReady,
      cameraError: cameraError,
      applyingFilter: applyingFilter ?? this.applyingFilter,
    );
  }
}

enum ScanStep { capture, review }

class ScanSessionNotifier extends StateNotifier<ScanSessionState> {
  ScanSessionNotifier(this._ref) : super(const ScanSessionState());

  final Ref _ref;
  DocumentEdgeTracker? _tracker;
  CameraController? _cameraController;
  final _frameAnalyzer = CameraFrameAnalyzer();
  var _frameAnalysisBusy = false;
  Future<String?> Function(String sourcePath, DocumentQuad quad)? _cropEditor;

  CameraController? get cameraController => _cameraController;

  void setCropEditor(
    Future<String?> Function(String sourcePath, DocumentQuad quad)? editor,
  ) {
    _cropEditor = editor;
  }

  Future<void> initializeCamera() async {
    try {
      // Respect the user's persisted auto-capture preference for new sessions.
      final autoCaptureDefault = _ref.read(autoCaptureDefaultProvider);
      if (state.autoCapture != autoCaptureDefault) {
        state = state.copyWith(autoCapture: autoCaptureDefault);
      }
      final service = _ref.read(cameraScanServiceProvider);
      await service.initialize();
      _cameraController = service.controller;
      _startTracker();
      await _startFrameAnalysis();
      state = state.copyWith(cameraReady: true, cameraError: null);
    } catch (e) {
      state = state.copyWith(cameraReady: false, cameraError: e.toString());
    }
  }

  /// Releases the camera when the app goes to background; captured pages and
  /// session state survive so scanning continues seamlessly on resume.
  Future<void> suspendCamera() async {
    _tracker?.stop();
    _cameraController = null;
    state = state.copyWith(cameraReady: false);
    await _ref.read(cameraScanServiceProvider).dispose();
  }

  Future<void> resumeCamera() async {
    if (state.step != ScanStep.capture) return; // re-inits via backToCapture
    if (_cameraController != null) return;
    await initializeCamera();
  }

  Future<void> _startFrameAnalysis() async {
    final service = _ref.read(cameraScanServiceProvider);
    final camera = service.activeCamera;
    if (camera == null) return;

    // Frames keep flowing while the captured-page preview is up — the tracker
    // uses them to notice the page being swapped and auto-advance the session.
    await service.startImageStream((image) {
      if (_frameAnalysisBusy || state.step != ScanStep.capture) {
        return;
      }
      _frameAnalysisBusy = true;
      try {
        final result = _frameAnalyzer.analyzeThrottled(
          image,
          state.mode,
          camera,
        );
        if (result != null) {
          _tracker?.updateFromFrame(
            detected: result.quad,
            frameConfidence: result.confidence,
          );
        }
      } catch (e, st) {
        debugPrint('Frame analysis failed: $e\n$st');
      } finally {
        _frameAnalysisBusy = false;
      }
    });
  }

  void _startTracker() {
    _tracker?.dispose();
    _tracker = DocumentEdgeTracker(onStable: _onAutoCapture);
    _tracker!
      ..setMode(state.mode)
      ..setAutoCapture(state.autoCapture)
      ..start();
  }

  void updateDetection() {
    final tracker = _tracker;
    if (tracker == null) return;
    // Batch scanning: once the tracker unlocks (previous page left the frame
    // or a new one appeared), dismiss the captured-page preview automatically
    // so multi-page scans never need a tap between pages.
    final autoAdvance =
        state.waitingForNextPage && !tracker.isAutoCaptureLocked;
    state = state.copyWith(
      quad: tracker.quad,
      phase: tracker.phase,
      confidence: tracker.confidence,
      clearEditingPageIndex: autoAdvance,
    );
  }

  void setMode(ScanMode mode) {
    if (state.waitingForNextPage) return;
    _tracker?.setMode(mode);
    state = state.copyWith(mode: mode);
  }

  void setAutoCapture(bool enabled) {
    _tracker?.setAutoCapture(enabled);
    state = state.copyWith(autoCapture: enabled);
  }

  Future<void> toggleFlash() async {
    final on = await _ref.read(cameraScanServiceProvider).toggleFlash();
    state = state.copyWith(flashOn: on);
  }

  Future<void> capture({bool manual = true}) async {
    if (state.isCapturing) return;

    final tracker = _tracker;
    if (!manual && state.waitingForNextPage) return;
    if (!manual &&
        tracker != null &&
        (tracker.isAutoCaptureLocked || tracker.waitingForNextPage)) {
      return;
    }

    state = state.copyWith(
      isCapturing: true,
      phase: ScanDetectionPhase.capturing,
      showFlashOverlay: true,
    );

    try {
      final rawPath = await _ref.read(cameraScanServiceProvider).capture();
      final quad = tracker?.quad ?? DocumentQuad.forMode(state.mode);
      final initialFilter = _initialScanFilter();
      final cropped = await _editOrAutoCrop(rawPath, quad);
      if (cropped == null) {
        _tracker?.releaseCaptureLock();
        state = state.copyWith(
          isCapturing: false,
          showFlashOverlay: false,
          phase: ScanDetectionPhase.looking,
        );
        return;
      }
      final processed = await _applyFilterToFile(
        cropped,
        initialFilter,
      );

      final newPage = CapturedScanPage(
        rawPath: cropped,
        displayPath: processed,
        filter: initialFilter,
      );

      final pages = [...state.pages];
      int editingIndex;

      if (manual &&
          state.waitingForNextPage &&
          state.editingPageIndex != null) {
        editingIndex = state.editingPageIndex!;
        pages[editingIndex] = newPage;
      } else {
        pages.add(newPage);
        editingIndex = pages.length - 1;
      }

      tracker?.lockAfterCapture(quad);

      state = state.copyWith(
        pages: pages,
        editingPageIndex: editingIndex,
        isCapturing: false,
        showFlashOverlay: false,
        phase: ScanDetectionPhase.pageCaptured,
        applyingFilter: false,
      );
    } catch (e) {
      _tracker?.releaseCaptureLock();
      state = state.copyWith(
        isCapturing: false,
        showFlashOverlay: false,
        phase: ScanDetectionPhase.looking,
      );
      rethrow;
    }
  }

  Future<void> _onAutoCapture() async {
    if (!state.autoCapture || state.isCapturing || state.waitingForNextPage) {
      return;
    }
    await capture(manual: false);
  }

  void prepareNextPage() {
    _tracker?.prepareNextPage();
    state = state.copyWith(clearEditingPageIndex: true);
    updateDetection();
  }

  Future<void> setPageFilter(ScanEnhanceFilter filter) async {
    final index = state.editingPageIndex;
    final editing = state.editingPage;
    if (index == null || editing == null || state.applyingFilter) return;
    if (filter == editing.filter) return;

    state = state.copyWith(applyingFilter: true);
    try {
      final processed = await _applyFilterToFile(editing.rawPath, filter);
      final pages = [...state.pages];
      pages[index] = editing.copyWith(
        displayPath: processed,
        filter: filter,
      );
      state = state.copyWith(
        pages: pages,
        applyingFilter: false,
      );
    } catch (e, st) {
      debugPrint('Filter apply failed: $e\n$st');
      state = state.copyWith(applyingFilter: false);
    }
  }

  Future<String> _applyFilterToFile(
    String sourcePath,
    ScanEnhanceFilter filter,
  ) async {
    final bytes = await File(sourcePath).readAsBytes();
    final processed = await _ref.read(imageProcessorProvider).process(
          bytes: bytes,
          filter: filter.docFilter,
          quality: 92,
        );
    final dir = await getTemporaryDirectory();
    final outPath = p.join(
      dir.path,
      'scan_${filter.name}_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );
    await File(outPath).writeAsBytes(processed);
    return outPath;
  }

  Future<void> importFromGallery() async {
    if (state.waitingForNextPage) return;

    final paths = await _ref.read(galleryImportServiceProvider).pickPhotos();
    if (paths.isEmpty) return;

    final imported = <CapturedScanPage>[];
    final initialFilter = _initialScanFilter();
    for (final path in paths) {
      final edited = await _cropEditor?.call(
            path,
            DocumentQuad.forMode(state.mode),
          ) ??
          path;
      if (edited.isEmpty) continue;
      final processed = await _applyFilterToFile(edited, initialFilter);
      imported.add(
        CapturedScanPage(
          rawPath: edited,
          displayPath: processed,
          filter: initialFilter,
        ),
      );
    }

    state = state.copyWith(
      pages: [...state.pages, ...imported],
      clearEditingPageIndex: true,
    );
  }

  Future<String?> _editOrAutoCrop(String rawPath, DocumentQuad quad) async {
    final edited = await _cropEditor?.call(rawPath, quad);
    if (edited != null) return edited.isEmpty ? null : edited;

    return _ref.read(scanImageProcessorProvider).cropToQuad(
          sourcePath: rawPath,
          quad: quad,
          mode: state.mode,
          applyModeEnhancement: false,
        );
  }

  void goToReview() {
    if (state.pages.isEmpty) return;
    state = state.copyWith(
      step: ScanStep.review,
      clearEditingPageIndex: true,
    );
    _tracker?.stop();
    _ref.read(cameraScanServiceProvider).stopImageStream();
  }

  void backToCapture() {
    state = state.copyWith(
      step: ScanStep.capture,
      clearEditingPageIndex: true,
    );
    if (_cameraController == null) {
      // Camera was released while backgrounded on the review screen.
      initializeCamera();
    } else {
      _tracker?.start();
      _startFrameAnalysis();
    }
  }

  void removePage(int index) {
    final pages = [...state.pages]..removeAt(index);
    var editingIndex = state.editingPageIndex;
    if (editingIndex != null) {
      if (index == editingIndex) {
        editingIndex = null;
      } else if (index < editingIndex) {
        editingIndex -= 1;
      }
    }
    state = state.copyWith(
      pages: pages,
      editingPageIndex: editingIndex,
      clearEditingPageIndex: editingIndex == null,
    );
  }

  ScanEnhanceFilter _initialScanFilter() {
    final defaultFilter = _ref.read(defaultFilterProvider);
    for (final filter in ScanEnhanceFilter.values) {
      if (filter.docFilter == defaultFilter) return filter;
    }
    return ScanEnhanceFilter.color;
  }

  @override
  void dispose() {
    _tracker?.dispose();
    _ref.read(cameraScanServiceProvider).dispose();
    super.dispose();
  }
}

final scanSessionProvider =
    StateNotifierProvider.autoDispose<ScanSessionNotifier, ScanSessionState>(
  (ref) => ScanSessionNotifier(ref),
);

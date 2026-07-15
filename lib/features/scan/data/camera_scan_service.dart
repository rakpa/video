import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

/// Manages the device camera for live preview, frame analysis, and capture.
class CameraScanService {
  CameraScanService();

  CameraController? _controller;
  List<CameraDescription> _cameras = const [];
  CameraDescription? _activeCamera;
  void Function(CameraImage image)? _onFrame;
  var _streamActive = false;

  CameraController? get controller => _controller;
  CameraDescription? get activeCamera => _activeCamera;
  bool get isInitialized => _controller?.value.isInitialized ?? false;
  bool get isStreaming => _streamActive;

  Future<void> initialize() async {
    if (kIsWeb) return;

    final granted = await _ensureCameraPermission();
    if (!granted) {
      throw StateError(
        'Camera permission is required to scan documents. '
        'Enable it in Settings and try again.',
      );
    }

    _cameras = await availableCameras();
    if (_cameras.isEmpty) {
      throw StateError('No camera found on this device.');
    }

    final back = _cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.back,
      orElse: () => _cameras.first,
    );
    _activeCamera = back;

    final controller = CameraController(
      back,
      // veryHigh (1080p) — document text stays legible after perspective
      // crop; `high` (720p) produced soft, hard-to-read scans.
      ResolutionPreset.veryHigh,
      enableAudio: false,
      // iOS image streams are most reliable as BGRA; Android uses YUV420.
      // CameraFrameAnalyzer handles both for live edge detection.
      imageFormatGroup: defaultTargetPlatform == TargetPlatform.iOS
          ? ImageFormatGroup.bgra8888
          : ImageFormatGroup.yuv420,
    );
    await controller.initialize();
    await controller.setFocusMode(FocusMode.auto);
    await controller.setExposureMode(ExposureMode.auto);
    _controller = controller;
  }

  Future<void> startImageStream(
      void Function(CameraImage image) onFrame) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (_streamActive) return;

    _onFrame = onFrame;
    await controller.startImageStream((image) {
      _onFrame?.call(image);
    });
    _streamActive = true;
  }

  Future<void> stopImageStream() async {
    final controller = _controller;
    _onFrame = null;
    if (controller == null || !controller.value.isInitialized) {
      _streamActive = false;
      return;
    }
    if (_streamActive) {
      await controller.stopImageStream();
    }
    _streamActive = false;
  }

  Future<bool> toggleFlash() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return false;

    final next = controller.value.flashMode == FlashMode.torch
        ? FlashMode.off
        : FlashMode.torch;
    await controller.setFlashMode(next);
    return next == FlashMode.torch;
  }

  Future<String> capture() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      throw StateError('Camera is not ready.');
    }

    final wasStreaming = _streamActive;
    if (wasStreaming) {
      await stopImageStream();
    }

    try {
      final file = await controller.takePicture();
      return file.path;
    } finally {
      if (wasStreaming && _onFrame != null) {
        await startImageStream(_onFrame!);
      }
    }
  }

  Future<void> dispose() async {
    await stopImageStream();
    final controller = _controller;
    _controller = null;
    _activeCamera = null;
    if (controller != null) {
      if (controller.value.flashMode == FlashMode.torch) {
        await controller.setFlashMode(FlashMode.off);
      }
      await controller.dispose();
    }
  }

  Future<bool> _ensureCameraPermission() async {
    var status = await Permission.camera.status;
    if (status.isGranted) return true;
    if (status.isPermanentlyDenied) return false;
    status = await Permission.camera.request();
    return status.isGranted;
  }
}

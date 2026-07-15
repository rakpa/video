import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';

import '../domain/scan_mode.dart';

/// Tracks document stability from live frame analysis and triggers auto-capture.
class DocumentEdgeTracker {
  DocumentEdgeTracker({required this.onStable});

  static const _cooldown = Duration(milliseconds: 1500);
  static const _leaveFrameConfidence = 0.42;
  static const _leaveFrameTicks = 10;
  static const _significantChangeThreshold = 0.045;
  static const _duplicateFrameThreshold = 0.022;

  final VoidCallback onStable;

  DocumentQuad _quad = DocumentQuad.forMode(ScanMode.document);
  DocumentQuad _target = DocumentQuad.forMode(ScanMode.document);
  ScanDetectionPhase _phase = ScanDetectionPhase.looking;
  double _confidence = 0;
  double _stability = 0;
  Timer? _timer;
  final _random = math.Random();
  bool _autoCaptureEnabled = true;
  bool _capturing = false;
  var _hasFrameFeed = false;

  bool _autoCaptureLocked = false;
  DateTime? _lockCooldownUntil;
  DocumentQuad? _capturedQuadSnapshot;
  DocumentQuad? _lastAutoCaptureQuad;
  DateTime? _lastAutoCaptureAt;
  var _lowConfidenceTicks = 0;
  var _nextPageRequested = false;
  var _documentLeftFrame = false;
  var _missedFrames = 0;

  DocumentQuad get quad => _quad;
  ScanDetectionPhase get phase => _phase;
  double get confidence => _confidence;
  bool get isAutoCaptureLocked => _autoCaptureLocked;
  bool get waitingForNextPage =>
      _autoCaptureLocked && _phase == ScanDetectionPhase.pageCaptured;

  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 50), (_) => _tick());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  void setMode(ScanMode mode) {
    _target = DocumentQuad.forMode(mode);
    _stability = 0;
    _phase = ScanDetectionPhase.looking;
    _clearAutoCaptureLock();
  }

  void setAutoCapture(bool enabled) {
    _autoCaptureEnabled = enabled;
    if (!enabled) _stability = 0;
  }

  /// Feed live detection from [CameraFrameAnalyzer] (preferred over simulation).
  ///
  /// [detected] is null when the frame contained no document — the tracker
  /// then decays confidence and eases the guide back to the mode frame
  /// instead of freezing on a stale quad.
  void updateFromFrame({
    required DocumentQuad? detected,
    required double frameConfidence,
  }) {
    _hasFrameFeed = true;
    if (detected != null) {
      _missedFrames = 0;
      _quad = _quad.lerp(detected, 0.45);
      _confidence = _confidence * 0.4 + frameConfidence * 0.6;
    } else {
      _missedFrames++;
      _confidence *= 0.72;
      if (_missedFrames >= 4) {
        // Document is gone — settle back onto the centered guide frame.
        _quad = _quad.lerp(_target, 0.18);
        if (_missedFrames >= 12) _confidence = 0;
      }
    }
  }

  void lockAfterCapture(DocumentQuad capturedAt) {
    _capturing = false;
    _stability = 0;
    _autoCaptureLocked = true;
    _lockCooldownUntil = DateTime.now().add(_cooldown);
    _capturedQuadSnapshot = capturedAt;
    _lastAutoCaptureQuad = capturedAt;
    _lastAutoCaptureAt = DateTime.now();
    _nextPageRequested = false;
    _documentLeftFrame = false;
    _lowConfidenceTicks = 0;
    _phase = ScanDetectionPhase.pageCaptured;
  }

  void releaseCaptureLock() {
    _capturing = false;
  }

  void prepareNextPage() {
    _nextPageRequested = true;
    _tryUnlockAutoCapture();
  }

  void _clearAutoCaptureLock() {
    _autoCaptureLocked = false;
    _lockCooldownUntil = null;
    _capturedQuadSnapshot = null;
    _nextPageRequested = false;
    _documentLeftFrame = false;
    _lowConfidenceTicks = 0;
  }

  void _unlockAutoCapture() {
    // In batch scanning the next page often sits exactly where the last one
    // was; once the previous sheet demonstrably left the frame, stop treating
    // that position as a duplicate.
    if (_documentLeftFrame) {
      _lastAutoCaptureQuad = null;
      _lastAutoCaptureAt = null;
    }
    _clearAutoCaptureLock();
    _stability = 0;
    _phase = ScanDetectionPhase.looking;
    _confidence = 0.2;
  }

  bool _cooldownElapsed() {
    final until = _lockCooldownUntil;
    return until == null || !DateTime.now().isBefore(until);
  }

  bool _isDuplicateFrame(DocumentQuad current) {
    final reference = _lastAutoCaptureQuad;
    final capturedAt = _lastAutoCaptureAt;
    if (reference == null || capturedAt == null) return false;

    final elapsed = DateTime.now().difference(capturedAt);
    if (elapsed > const Duration(seconds: 8)) return false;

    return _averageCornerDistance(current, reference) <
        _duplicateFrameThreshold;
  }

  bool _isSignificantlyDifferentFromSnapshot() {
    final snapshot = _capturedQuadSnapshot;
    if (snapshot == null) return false;
    return _averageCornerDistance(_quad, snapshot) >=
        _significantChangeThreshold;
  }

  void _trackDocumentPresence() {
    if (_confidence < _leaveFrameConfidence) {
      _lowConfidenceTicks++;
      if (_lowConfidenceTicks >= _leaveFrameTicks) {
        _documentLeftFrame = true;
      }
    } else {
      _lowConfidenceTicks = 0;
    }
  }

  void _tryUnlockAutoCapture() {
    if (!_autoCaptureLocked || !_cooldownElapsed()) return;

    final canUnlock = _nextPageRequested ||
        _documentLeftFrame ||
        _isSignificantlyDifferentFromSnapshot();

    if (canUnlock) {
      _unlockAutoCapture();
    }
  }

  void _tick() {
    if (_capturing) return;

    if (!_hasFrameFeed) {
      _simulateUntilFrameFeed();
    }

    if (_autoCaptureLocked) {
      _trackDocumentPresence();
      _tryUnlockAutoCapture();
      if (_autoCaptureLocked) {
        _phase = ScanDetectionPhase.pageCaptured;
      }
      return;
    }

    if (_confidence < 0.5) {
      _phase = ScanDetectionPhase.looking;
      _stability = 0;
    } else if (_confidence < 0.78) {
      _phase = ScanDetectionPhase.holdSteady;
      _stability = math.max(0, _stability - 0.08);
    } else {
      _phase = ScanDetectionPhase.holdSteady;
      _stability += 0.06;
      if (_autoCaptureEnabled &&
          _stability >= 1.0 &&
          !_isDuplicateFrame(_quad)) {
        _capturing = true;
        _phase = ScanDetectionPhase.capturing;
        onStable();
      }
    }
  }

  /// Fallback motion until the first camera frame arrives (simulator / slow start).
  void _simulateUntilFrameFeed() {
    const jitter = 0.006;
    final noisyTarget = DocumentQuad(
      topLeft: _target.topLeft +
          Offset(
            (_random.nextDouble() - 0.5) * jitter,
            (_random.nextDouble() - 0.5) * jitter,
          ),
      topRight: _target.topRight +
          Offset(
            (_random.nextDouble() - 0.5) * jitter,
            (_random.nextDouble() - 0.5) * jitter,
          ),
      bottomRight: _target.bottomRight +
          Offset(
            (_random.nextDouble() - 0.5) * jitter,
            (_random.nextDouble() - 0.5) * jitter,
          ),
      bottomLeft: _target.bottomLeft +
          Offset(
            (_random.nextDouble() - 0.5) * jitter,
            (_random.nextDouble() - 0.5) * jitter,
          ),
    );

    _quad = _quad.lerp(noisyTarget, 0.2);
    final delta = _averageCornerDistance(_quad, _target);
    _confidence = (1 - (delta / 0.08)).clamp(0.0, 1.0);
  }

  double _averageCornerDistance(DocumentQuad a, DocumentQuad b) {
    final ac = a.corners;
    final bc = b.corners;
    var sum = 0.0;
    for (var i = 0; i < 4; i++) {
      sum += (ac[i] - bc[i]).distance;
    }
    return sum / 4;
  }

  void dispose() => stop();
}

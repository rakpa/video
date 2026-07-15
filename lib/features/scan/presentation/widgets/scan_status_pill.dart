import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../domain/scan_mode.dart';
import '../scan_design_tokens.dart';

class ScanStatusPill extends StatelessWidget {
  const ScanStatusPill({
    super.key,
    required this.phase,
    required this.confidence,
  });

  final ScanDetectionPhase phase;
  final double confidence;

  @override
  Widget build(BuildContext context) {
    if (phase == ScanDetectionPhase.idle || phase.message.isEmpty) {
      return const SizedBox.shrink();
    }

    final captured = phase == ScanDetectionPhase.pageCaptured;

    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: ScanDesign.glass.withValues(alpha: 0.8),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: captured
                  ? Colors.greenAccent.withValues(alpha: 0.55)
                  : ScanDesign.guideBlue.withValues(alpha: 0.4),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (captured)
                const Icon(
                  Icons.check_circle_rounded,
                  color: Colors.greenAccent,
                  size: 18,
                )
              else
                SizedBox(
                  width: 48,
                  child: LinearProgressIndicator(
                    value: confidence,
                    minHeight: 3,
                    backgroundColor: Colors.white24,
                    color: ScanDesign.guideBlue,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              const SizedBox(width: 10),
              Text(
                phase.message,
                style: const TextStyle(
                  color: ScanDesign.onDark,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate(key: ValueKey(phase)).fadeIn(duration: 200.ms);
  }
}

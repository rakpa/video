import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../domain/scan_mode.dart';
import '../scan_design_tokens.dart';

class ScanTopToolbar extends StatelessWidget {
  const ScanTopToolbar({
    super.key,
    required this.onClose,
    required this.onFlash,
    required this.onMore,
    required this.flashOn,
    this.status = ScanDetectionPhase.looking,
  });

  final VoidCallback onClose;
  final VoidCallback onFlash;
  final VoidCallback onMore;
  final bool flashOn;
  final ScanDetectionPhase status;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              decoration: BoxDecoration(
                color: ScanDesign.glass.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  IconButton(
                    onPressed: onClose,
                    icon: const Icon(Icons.close_rounded),
                    color: ScanDesign.onDark,
                    tooltip: 'Close',
                  ),
                  Expanded(
                    child: Text(
                      switch (status) {
                        ScanDetectionPhase.capturing => 'Capturing...',
                        ScanDetectionPhase.pageCaptured => 'Page captured',
                        _ => 'Scanning...',
                      },
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: ScanDesign.onDark,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: onFlash,
                    icon: Icon(
                      flashOn
                          ? Icons.flash_on_rounded
                          : Icons.flash_off_rounded,
                    ),
                    color: flashOn ? Colors.amber : ScanDesign.onDark,
                    tooltip: 'Flash',
                  ),
                  IconButton(
                    onPressed: onMore,
                    icon: const Icon(Icons.more_vert_rounded),
                    color: ScanDesign.onDark,
                    tooltip: 'More',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: -0.1, end: 0);
  }
}

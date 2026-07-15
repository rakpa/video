import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../scan_design_tokens.dart';

/// Shows the last captured page so filter changes are visible before "Next Page".
class ScanCapturedPreview extends StatelessWidget {
  const ScanCapturedPreview({
    super.key,
    required this.imagePath,
    this.processing = false,
  });

  final String imagePath;
  final bool processing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: AspectRatio(
        aspectRatio: 0.72,
        child: Stack(
          fit: StackFit.expand,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: ColoredBox(
                color: Colors.black26,
                child: Image.file(
                  File(imagePath),
                  key: ValueKey(imagePath),
                  fit: BoxFit.contain,
                  gaplessPlayback: true,
                  errorBuilder: (_, __, ___) => const Center(
                    child: Icon(Icons.broken_image_outlined,
                        color: Colors.white54),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 10,
              top: 10,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Captured page',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            if (processing)
              Container(
                decoration: BoxDecoration(
                  color: Colors.black45,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Center(
                  child: SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: ScanDesign.primary,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    )
        .animate()
        .fadeIn(duration: 260.ms)
        .scale(begin: const Offset(0.96, 0.96), end: const Offset(1, 1));
  }
}

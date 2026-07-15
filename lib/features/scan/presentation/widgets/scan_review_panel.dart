import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../scan_design_tokens.dart';

/// Review captured pages before saving the document.
class ScanReviewPanel extends StatelessWidget {
  const ScanReviewPanel({
    super.key,
    required this.paths,
    required this.onBack,
    required this.onRemove,
    required this.onAddMore,
    required this.onSave,
    this.saving = false,
  });

  final List<String> paths;
  final VoidCallback onBack;
  final ValueChanged<int> onRemove;
  final VoidCallback onAddMore;
  final VoidCallback onSave;
  final bool saving;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFF0D1117),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    onPressed: saving ? null : onBack,
                    icon: const Icon(Icons.arrow_back_rounded),
                    color: ScanDesign.onDark,
                  ),
                  Expanded(
                    child: Text(
                      'Review ${paths.length} ${paths.length == 1 ? 'Page' : 'Pages'}',
                      style: const TextStyle(
                        color: ScanDesign.onDark,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 0.72,
                ),
                itemCount: paths.length,
                itemBuilder: (context, index) {
                  return _ReviewCard(
                    path: paths[index],
                    index: index,
                    onRemove: saving ? null : () => onRemove(index),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: saving ? null : onAddMore,
                      icon: const Icon(Icons.add_a_photo_outlined),
                      label: const Text('Add more'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: ScanDesign.onDark,
                        side: const BorderSide(color: Colors.white24),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: saving
                          ? null
                          : () {
                              HapticFeedback.mediumImpact();
                              onSave();
                            },
                      icon: saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.check_rounded),
                      label: Text(saving ? 'Saving...' : 'Save'),
                      style: FilledButton.styleFrom(
                        backgroundColor: ScanDesign.primary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({
    required this.path,
    required this.index,
    this.onRemove,
  });

  final String path;
  final int index;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.file(File(path), fit: BoxFit.cover),
          Positioned(
            left: 8,
            top: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${index + 1}',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          if (onRemove != null)
            Positioned(
              right: 4,
              top: 4,
              child: IconButton(
                onPressed: onRemove,
                icon: const Icon(Icons.close_rounded, size: 20),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.black54,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

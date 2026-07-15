import 'package:doc_scanner/features/scan/domain/scan_enhance_filter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../scan_design_tokens.dart';

/// Horizontal filter chips shown after a page is locked in frame.
class ScanFilterStrip extends StatelessWidget {
  const ScanFilterStrip({
    super.key,
    required this.selected,
    required this.onSelected,
    this.processing = false,
  });

  final ScanEnhanceFilter selected;
  final ValueChanged<ScanEnhanceFilter> onSelected;
  final bool processing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Enhance this page',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.9),
              fontSize: 13,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: ScanEnhanceFilter.carousel.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final filter = ScanEnhanceFilter.carousel[index];
                final active = filter == selected;
                return _FilterChip(
                  label: filter.label,
                  selected: active,
                  processing: processing && active,
                  onTap: processing
                      ? null
                      : () {
                          HapticFeedback.selectionClick();
                          onSelected(filter);
                        },
                );
              },
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 240.ms, curve: Curves.easeOut)
        .slideY(begin: 0.12, end: 0, curve: Curves.easeOutCubic);
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.processing = false,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final bool processing;

  @override
  Widget build(BuildContext context) {
    return Material(
      color:
          selected ? ScanDesign.primary : Colors.white.withValues(alpha: 0.14),
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (processing) ...[
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : ScanDesign.onDark,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

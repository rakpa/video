import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../domain/scan_mode.dart';
import '../scan_design_tokens.dart';

class ScanModeSelector extends StatelessWidget {
  const ScanModeSelector({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  final ScanMode selected;
  final ValueChanged<ScanMode> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: ScanMode.values.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final mode = ScanMode.values[index];
          final isSelected = mode == selected;
          return GestureDetector(
            onTap: () => onSelected(mode),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected
                    ? ScanDesign.primary
                    : Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected
                      ? ScanDesign.primary
                      : Colors.white.withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    mode.icon,
                    size: 16,
                    color: isSelected ? Colors.white : ScanDesign.onDarkMuted,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    mode.label,
                    style: TextStyle(
                      color: isSelected ? Colors.white : ScanDesign.onDark,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ).animate().fadeIn(delay: 150.ms, duration: 300.ms);
  }
}

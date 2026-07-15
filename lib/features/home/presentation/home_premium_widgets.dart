import 'package:flutter/material.dart';

import 'home_design_tokens.dart';
import 'home_typography.dart';

/// Subtle scale-down on press for premium tactile feedback.
class ScaleTap extends StatefulWidget {
  const ScaleTap({
    super.key,
    required this.child,
    required this.onTap,
    this.onLongPress,
    this.borderRadius = HomeDesign.radiusMd,
  });

  final Widget child;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final double borderRadius;

  @override
  State<ScaleTap> createState() => _ScaleTapState();
}

class _ScaleTapState extends State<ScaleTap> {
  var _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOutCubic,
        child: widget.child,
      ),
    );
  }
}

class PremiumCard extends StatelessWidget {
  const PremiumCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = HomeDesign.radiusLg,
  });

  final Widget child;
  final EdgeInsets padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: HomeDesign.surfaceOf(context),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: HomeDesign.border.withValues(alpha: 0.45)),
        boxShadow: HomeDesign.softShadow,
      ),
      child: child,
    );
  }
}

class PremiumSearchBar extends StatelessWidget {
  const PremiumSearchBar({
    super.key,
    this.controller,
    this.onChanged,
  });

  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final muted = HomeDesign.mutedOf(context);
    return Container(
      height: 50,
      decoration: BoxDecoration(
        color: HomeDesign.surfaceOf(context),
        borderRadius: BorderRadius.circular(HomeDesign.radiusLg),
        border: Border.all(color: HomeDesign.border.withValues(alpha: 0.6)),
        boxShadow: HomeDesign.softShadow,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Row(
        children: [
          Icon(Icons.search_rounded,
              color: muted.withValues(alpha: 0.9), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: HomeTypography.body
                  .copyWith(color: HomeDesign.onSurfaceOf(context)),
              decoration: InputDecoration(
                hintText: 'Search documents...',
                hintStyle: HomeTypography.bodyMuted.copyWith(fontSize: 16),
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          if (controller != null)
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller!,
              builder: (context, value, _) => value.text.isEmpty
                  ? const SizedBox.shrink()
                  : IconButton(
                      onPressed: () {
                        controller!.clear();
                        onChanged?.call('');
                      },
                      icon: Icon(Icons.close_rounded, color: muted, size: 20),
                      tooltip: 'Clear search',
                      padding: EdgeInsets.zero,
                      constraints:
                          const BoxConstraints(minWidth: 32, minHeight: 32),
                    ),
            ),
        ],
      ),
    );
  }
}

class QuickActionCard extends StatelessWidget {
  const QuickActionCard({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ScaleTap(
      onTap: onTap,
      child: PremiumCard(
        padding: const EdgeInsets.all(14),
        radius: HomeDesign.radiusMd,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: iconColor, size: 24),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: HomeTypography.quickActionTitle,
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: HomeTypography.quickActionSubtitle,
            ),
          ],
        ),
      ),
    );
  }
}

class QuickActionsRow extends StatelessWidget {
  const QuickActionsRow({
    super.key,
    required this.onScan,
    required this.onNewFolder,
    required this.onImport,
  });

  final VoidCallback onScan;
  final VoidCallback onNewFolder;
  final VoidCallback onImport;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: QuickActionCard(
            icon: Icons.document_scanner_rounded,
            iconColor: HomeDesign.primary,
            iconBg: HomeDesign.primary.withValues(alpha: 0.1),
            title: 'Scan Document',
            subtitle: 'Capture with camera',
            onTap: onScan,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: QuickActionCard(
            icon: Icons.create_new_folder_rounded,
            iconColor: const Color(0xFFF9A825),
            iconBg: const Color(0xFFFFB300).withValues(alpha: 0.18),
            title: 'New Folder',
            subtitle: 'Organize documents',
            onTap: onNewFolder,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: QuickActionCard(
            icon: Icons.photo_library_rounded,
            iconColor: HomeDesign.secondary,
            iconBg: HomeDesign.secondary.withValues(alpha: 0.12),
            title: 'Import',
            subtitle: 'From Photos',
            onTap: onImport,
          ),
        ),
      ],
    );
  }
}

class PremiumEmptyState extends StatelessWidget {
  const PremiumEmptyState({
    super.key,
    required this.onScan,
    required this.onImport,
  });

  final VoidCallback onScan;
  final VoidCallback onImport;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: HomeDesign.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(32),
              ),
              child: Icon(
                Icons.description_rounded,
                size: 56,
                color: HomeDesign.primary.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 28),
            const Text(
              'Welcome to Paperly',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: HomeDesign.onSurface,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Scan receipts, contracts, IDs and notes.',
              textAlign: TextAlign.center,
              style: HomeTypography.bodyMuted,
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onScan,
                style: FilledButton.styleFrom(
                  backgroundColor: HomeDesign.primary,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(HomeDesign.radiusMd),
                  ),
                ),
                child: const Text('Scan First Document',
                    style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onImport,
                style: OutlinedButton.styleFrom(
                  foregroundColor: HomeDesign.primary,
                  minimumSize: const Size.fromHeight(52),
                  side: BorderSide(
                      color: HomeDesign.primary.withValues(alpha: 0.35)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(HomeDesign.radiusMd),
                  ),
                ),
                child: const Text('Import Image',
                    style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeSortChip extends StatelessWidget {
  const HomeSortChip({
    super.key,
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ScaleTap(
      onTap: onTap,
      borderRadius: 12,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: HomeDesign.mutedSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: HomeDesign.border.withValues(alpha: 0.7)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.swap_vert_rounded,
                size: 16, color: HomeDesign.muted),
            const SizedBox(width: 4),
            Text(
              label,
              style: HomeTypography.label.copyWith(fontSize: 14),
            ),
            const Icon(Icons.expand_more_rounded,
                size: 18, color: HomeDesign.muted),
          ],
        ),
      ),
    );
  }
}

class ViewModeToggle extends StatelessWidget {
  const ViewModeToggle({
    super.key,
    required this.listView,
    required this.onGrid,
    required this.onList,
  });

  final bool listView;
  final VoidCallback onGrid;
  final VoidCallback onList;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: HomeDesign.mutedSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: HomeDesign.border.withValues(alpha: 0.7)),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ModeBtn(
              icon: Icons.grid_view_rounded,
              selected: !listView,
              onTap: onGrid),
          _ModeBtn(
              icon: Icons.view_list_rounded, selected: listView, onTap: onList),
        ],
      ),
    );
  }
}

class _ModeBtn extends StatelessWidget {
  const _ModeBtn({
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        width: 36,
        height: 32,
        decoration: BoxDecoration(
          color: selected ? HomeDesign.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Icon(
          icon,
          size: 18,
          color: selected ? HomeDesign.primary : HomeDesign.muted,
        ),
      ),
    );
  }
}

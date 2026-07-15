import 'package:flutter/material.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/design/app_color_tokens.dart';
import '../../../core/design/app_spacing.dart';
import '../../../core/design/neu_decorations.dart';

/// Stitch Dashboard header â€” logo title + optional trailing action.
class StitchDashboardHeader extends StatelessWidget {
  const StitchDashboardHeader({
    super.key,
    this.onMenu,
    this.onTrailing,
    this.trailingIcon = Icons.settings_rounded,
  });

  final VoidCallback? onMenu;
  final VoidCallback? onTrailing;
  final IconData trailingIcon;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        boxShadow: NeuDecorations.flat(),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      child: Row(
        children: [
          if (onMenu != null)
            StitchNeuIconButton(icon: Icons.menu_rounded, onTap: onMenu!)
          else
            const SizedBox(width: 44),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'Paperly',
              style: context.text.titleLarge?.copyWith(
                color: context.colors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (onTrailing != null)
            StitchNeuIconButton(icon: trailingIcon, onTap: onTrailing!),
        ],
      ),
    );
  }
}

/// Neumorphic circular icon button from Stitch Dashboard.
class StitchNeuIconButton extends StatelessWidget {
  const StitchNeuIconButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: context.colors.surface,
          boxShadow: NeuDecorations.flat(),
        ),
        child: Icon(icon,
            color: color ?? context.colors.onSurfaceVariant, size: 22),
      ),
    );
  }
}

/// Stitch search bar with neumorphic inset styling.
class StitchSearchBar extends StatelessWidget {
  const StitchSearchBar({
    super.key,
    required this.hint,
    this.onChanged,
    this.onMic,
  });

  final String hint;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onMic;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: NeuDecorations.card(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        pressed: true,
      ),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      child: Row(
        children: [
          Icon(Icons.search_rounded, color: context.colors.outline),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: TextField(
              onChanged: onChanged,
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: context.text.bodyLarge?.copyWith(
                  color: context.colors.outline,
                ),
                border: InputBorder.none,
                isDense: true,
              ),
              style: context.text.bodyLarge,
            ),
          ),
          IconButton(
            icon: Icon(Icons.mic_rounded, color: context.colors.secondary),
            onPressed: onMic,
          ),
        ],
      ),
    );
  }
}

/// Stitch bottom navigation bar (Scans / Folders / Search / Profile).
class StitchBottomNav extends StatelessWidget {
  const StitchBottomNav({
    super.key,
    required this.index,
    required this.onChanged,
  });

  final int index;
  final ValueChanged<int> onChanged;

  static const items = [
    (Icons.description_rounded, 'Scans'),
    (Icons.folder_outlined, 'Folders'),
    (Icons.search_rounded, 'Search'),
    (Icons.person_outline_rounded, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            offset: Offset(0, -4),
            blurRadius: 12,
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              for (var i = 0; i < items.length; i++)
                _NavItem(
                  icon: items[i].$1,
                  label: items[i].$2,
                  active: index == i,
                  onTap: () => onChanged(i),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: active
            ? BoxDecoration(
                color: BrandColors.secondaryContainer.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              )
            : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 22,
              color: active
                  ? context.colors.primary
                  : context.colors.onSurfaceVariant.withValues(alpha: 0.7),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: context.text.labelSmall?.copyWith(
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                color: active
                    ? context.colors.primary
                    : context.colors.onSurfaceVariant.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Neumorphic document card from Stitch Dashboard grid.
class StitchScanCard extends StatelessWidget {
  const StitchScanCard({
    super.key,
    required this.title,
    required this.subtitle,
    this.thumbnail,
    this.onTap,
  });

  final String title;
  final String subtitle;
  final Widget? thumbnail;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: NeuDecorations.card(color: Colors.white),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: thumbnail ??
                      Container(
                        color: context.colors.surfaceContainerHighest,
                        child: Icon(Icons.description_outlined,
                            color: context.colors.onSurfaceVariant),
                      ),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelLarge?.copyWith(fontSize: 12),
              ),
              Text(
                subtitle,
                style: context.text.bodySmall?.copyWith(
                  color: context.colors.outline,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Transactional header for detail/enhance screens (back + title + action).
class StitchTransactionalHeader extends StatelessWidget {
  const StitchTransactionalHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.onBack,
    this.actionLabel,
    this.onAction,
    this.actionIcon,
    this.onActionIcon,
    this.busy = false,
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData? actionIcon;
  final VoidCallback? onActionIcon;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        boxShadow: NeuDecorations.flat(),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            StitchNeuIconButton(
              icon: Icons.close_rounded,
              onTap: onBack ?? () => Navigator.of(context).maybePop(),
            ),
            Expanded(
              child: Column(
                children: [
                  Text(
                    title,
                    style: context.text.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: context.text.labelSmall?.copyWith(
                        color: context.colors.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
            if (busy)
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else if (actionLabel != null)
              FilledButton(
                onPressed: onAction,
                style: FilledButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Text(actionLabel!),
              )
            else if (actionIcon != null)
              StitchNeuIconButton(
                icon: actionIcon!,
                onTap: onActionIcon ?? () {},
                color: context.colors.primary,
              )
            else
              const SizedBox(width: 44),
          ],
        ),
      ),
    );
  }
}

/// Stitch FAB â€” rounded square camera button.
class StitchScanFab extends StatelessWidget {
  const StitchScanFab({super.key, required this.onTap, this.busy = false});

  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      onPressed: busy ? null : onTap,
      backgroundColor: context.colors.primary,
      foregroundColor: context.colors.onPrimary,
      elevation: 6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: busy
          ? const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: Colors.white),
            )
          : const Icon(Icons.add_a_photo_rounded, size: 28),
    );
  }
}

/// Grid/list view toggle buttons from Stitch Dashboard.
class StitchViewToggle extends StatelessWidget {
  const StitchViewToggle({
    super.key,
    required this.gridView,
    required this.onToggle,
  });

  final bool gridView;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _ToggleBtn(
          icon: Icons.grid_view_rounded,
          active: gridView,
          onTap: onToggle,
        ),
        const SizedBox(width: AppSpacing.xs),
        _ToggleBtn(
          icon: Icons.view_list_rounded,
          active: !gridView,
          onTap: onToggle,
        ),
      ],
    );
  }
}

class _ToggleBtn extends StatelessWidget {
  const _ToggleBtn({
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: context.colors.surface,
          boxShadow: NeuDecorations.flat(),
        ),
        child: Icon(
          icon,
          size: 20,
          color: active ? context.colors.secondary : context.colors.outline,
        ),
      ),
    );
  }
}

/// Pagination dots from Stitch onboarding.
class StitchPageDots extends StatelessWidget {
  const StitchPageDots({super.key, required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        final active = i == index;
        return AnimatedContainer(
          duration: AppDuration.base,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          height: 8,
          width: active ? 24 : 8,
          decoration: BoxDecoration(
            color: active
                ? context.colors.primary
                : context.colors.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(4),
          ),
        );
      }),
    );
  }
}

import 'package:flutter/material.dart';

import 'home_design_tokens.dart';
import 'home_typography.dart';
import 'home_premium_widgets.dart';

/// Premium 5-slot bottom navigation with elevated scan FAB.
class PremiumBottomNav extends StatelessWidget {
  const PremiumBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTabSelected,
    required this.onScan,
    this.scanLoading = false,
  });

  /// 0 Home, 1 Collections, 3 Tools, 4 Settings (2 = scan action).
  final int currentIndex;
  final ValueChanged<int> onTabSelected;
  final VoidCallback? onScan;
  final bool scanLoading;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Container(
      decoration: BoxDecoration(
        color: HomeDesign.surface,
        border: Border(
            top: BorderSide(color: HomeDesign.border.withValues(alpha: 0.6))),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SizedBox(
        height: 72 + bottom,
        child: Padding(
          padding: EdgeInsets.only(bottom: bottom),
          child: Row(
            children: [
              _Tab(
                icon: Icons.home_rounded,
                label: 'Home',
                selected: currentIndex == 0,
                onTap: () => onTabSelected(0),
              ),
              _Tab(
                icon: Icons.folder_copy_rounded,
                label: 'Collections',
                selected: currentIndex == 1,
                onTap: () => onTabSelected(1),
              ),
              Expanded(
                child: Center(
                  child: Transform.translate(
                    offset: const Offset(0, -18),
                    child:
                        _PulseScanFab(onPressed: onScan, loading: scanLoading),
                  ),
                ),
              ),
              _Tab(
                icon: Icons.handyman_outlined,
                label: 'Tools',
                selected: currentIndex == 3,
                onTap: () => onTabSelected(3),
              ),
              _Tab(
                icon: Icons.settings_rounded,
                label: 'Settings',
                selected: currentIndex == 4,
                onTap: () => onTabSelected(4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? HomeDesign.primary : HomeDesign.muted;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 22, color: color),
            const SizedBox(height: 4),
            Text(
              label,
              style: HomeTypography.navLabel.copyWith(
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PulseScanFab extends StatefulWidget {
  const _PulseScanFab({required this.onPressed, required this.loading});

  final VoidCallback? onPressed;
  final bool loading;

  @override
  State<_PulseScanFab> createState() => _PulseScanFabState();
}

class _PulseScanFabState extends State<_PulseScanFab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        final scale = 1 + (_pulse.value * 0.04);
        return Transform.scale(scale: scale, child: child);
      },
      child: ScaleTap(
        onTap: widget.onPressed ?? () {},
        borderRadius: 20,
        child: Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [HomeDesign.primaryLight, HomeDesign.primary],
            ),
            boxShadow: HomeDesign.fabShadow,
          ),
          child: widget.loading
              ? const Padding(
                  padding: EdgeInsets.all(18),
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.add_a_photo_rounded,
                  color: Colors.white, size: 30),
        ),
      ),
    );
  }
}

// Backwards-compatible exports used elsewhere.
typedef DashboardScanBar = PremiumBottomNav;
typedef ScanFab = _PulseScanFab;

import 'package:flutter/material.dart';

import '../../app/theme/app_theme.dart';
import '../../core/design/app_spacing.dart';

/// The primary CTA matching Stitch btn-primary — solid blue, 16px radius.
///
/// Includes a built-in busy state (spinner + disabled) per the
/// `loading-buttons` accessibility rule.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.height = 54,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = context.colors;
    final enabled = onPressed != null && !busy;
    final radius = BorderRadius.circular(16);

    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: Material(
          color: scheme.primary,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onPressed : null,
            child: SizedBox(
              height: height,
              width: double.infinity,
              child: Center(
                child: busy
                    ? SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(scheme.onPrimary),
                        ),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (icon != null) ...[
                            Icon(icon, color: scheme.onPrimary, size: 20),
                            const SizedBox(width: AppSpacing.xs),
                          ],
                          Text(
                            label,
                            style: context.text.labelLarge
                                ?.copyWith(color: scheme.onPrimary),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

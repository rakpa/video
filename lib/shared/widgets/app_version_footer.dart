import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Small footer showing app version + build (from CFBundleVersion / versionCode).
class AppVersionFooter extends StatelessWidget {
  const AppVersionFooter({super.key, this.padding});

  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PackageInfo>(
      future: PackageInfo.fromPlatform(),
      builder: (context, snapshot) {
        final info = snapshot.data;
        final label = info == null
            ? 'Loading version…'
            : 'Paperly ${info.version} (${info.buildNumber})';

        return Padding(
          padding: padding ?? const EdgeInsets.symmetric(vertical: 12),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.45),
                ),
          ),
        );
      },
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/app_version_footer.dart';
import '../../enhance/domain/doc_filter.dart';
import '../../export/domain/export_options.dart';
import '../../home/presentation/home_design_tokens.dart';
import 'settings_providers.dart';

/// Native settings — every row here does something real (no mock content).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key, this.embedded = false});

  /// True when shown inside the home shell tab (no back button).
  final bool embedded;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final autoCapture = ref.watch(autoCaptureDefaultProvider);
    final defaultFilter = ref.watch(defaultFilterProvider);
    final defaultPageSize = ref.watch(defaultPageSizeProvider);
    final fileNamePattern = ref.watch(defaultFileNamePatternProvider);

    return Scaffold(
      backgroundColor: HomeDesign.canvasOf(context),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Row(
              children: [
                if (!embedded)
                  IconButton(
                    onPressed: () => context.pop(),
                    icon: const Icon(Icons.arrow_back_rounded),
                  ),
                Padding(
                  padding: EdgeInsets.only(left: embedded ? 8 : 0),
                  child: Text(
                    'Settings',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: HomeDesign.onSurfaceOf(context),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const _SectionLabel('Scanning'),
            _SettingsCard(
              children: [
                SwitchListTile(
                  value: autoCapture,
                  onChanged: (v) =>
                      ref.read(autoCaptureDefaultProvider.notifier).set(v),
                  secondary: const Icon(Icons.center_focus_strong_outlined),
                  title: const Text('Auto-capture'),
                  subtitle: const Text(
                    'Capture automatically when a document is steady',
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.filter_alt_outlined),
                  title: const Text('Default filter'),
                  subtitle: const Text('Applied to new scans and imports'),
                  trailing: DropdownButton<DocFilter>(
                    value: defaultFilter,
                    underline: const SizedBox.shrink(),
                    onChanged: (filter) {
                      if (filter == null) return;
                      ref.read(defaultFilterProvider.notifier).set(filter);
                    },
                    items: DocFilter.values
                        .map(
                          (filter) => DropdownMenuItem(
                            value: filter,
                            child: Text(filter.label),
                          ),
                        )
                        .toList(),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const _SectionLabel('Export'),
            _SettingsCard(
              children: [
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: const Text('Default PDF page size'),
                  trailing: SegmentedButton<ExportPageSize>(
                    segments: ExportPageSize.values
                        .map(
                          (size) => ButtonSegment(
                            value: size,
                            label: Text(size.label),
                          ),
                        )
                        .toList(),
                    selected: {defaultPageSize},
                    onSelectionChanged: (selection) => ref
                        .read(defaultPageSizeProvider.notifier)
                        .set(selection.first),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.drive_file_rename_outline_rounded),
                  title: const Text('Default file name'),
                  subtitle: Text(
                      '$fileNamePattern -> ${_previewTitle(fileNamePattern)}'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _editPattern(context, ref, fileNamePattern),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const _SectionLabel('Appearance'),
            _SettingsCard(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Theme'),
                      const SizedBox(height: 12),
                      SegmentedButton<ThemeMode>(
                        segments: const [
                          ButtonSegment(
                            value: ThemeMode.system,
                            label: Text('System'),
                            icon: Icon(Icons.brightness_auto_outlined),
                          ),
                          ButtonSegment(
                            value: ThemeMode.light,
                            label: Text('Light'),
                            icon: Icon(Icons.light_mode_outlined),
                          ),
                          ButtonSegment(
                            value: ThemeMode.dark,
                            label: Text('Dark'),
                            icon: Icon(Icons.dark_mode_outlined),
                          ),
                        ],
                        selected: {themeMode},
                        onSelectionChanged: (selection) => ref
                            .read(themeModeProvider.notifier)
                            .set(selection.first),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const _SectionLabel('About'),
            _SettingsCard(
              children: [
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: const Text('Open-source licenses'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => showLicensePage(
                    context: context,
                    applicationName: 'Paperly',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const AppVersionFooter(),
          ],
        ),
      ),
    );
  }

  String _previewTitle(String pattern) {
    return pattern
        .replaceAll('{date}', '2026-07-15')
        .replaceAll('{time}', '09-30')
        .replaceAll('{datetime}', '2026-07-15 09-30')
        .trim()
        .replaceFirst(RegExp(r'$'), ' (1)');
  }

  Future<void> _editPattern(
    BuildContext context,
    WidgetRef ref,
    String currentPattern,
  ) async {
    final controller = TextEditingController(text: currentPattern);
    final pattern = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Default file name'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            helperText: 'Use {date}, {time}, or {datetime}',
          ),
          onSubmitted: (value) => Navigator.pop(ctx, value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (pattern == null) return;
    await ref.read(defaultFileNamePatternProvider.notifier).set(pattern);
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, bottom: 8),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
          color: HomeDesign.mutedOf(context),
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: HomeDesign.surfaceOf(context),
        borderRadius: BorderRadius.circular(HomeDesign.radiusMd),
        boxShadow: HomeDesign.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}

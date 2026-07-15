import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/app_version_footer.dart';
import '../../folders/presentation/folder_detail_view.dart';
import '../../folders/presentation/folders_providers.dart';
import '../../folders/presentation/folders_tab.dart';
import '../../home/presentation/collections_body.dart';
import '../../home/presentation/dashboard_chrome.dart';
import '../../home/presentation/home_dashboard_body.dart';
import '../../home/presentation/home_design_tokens.dart';
import '../../home/presentation/tools_body.dart';
import '../../scan/domain/scan_mode.dart';
import '../../settings/presentation/settings_screen.dart';

/// App shell — home, collections, tools, settings + scan FAB.
class MainShell extends ConsumerStatefulWidget {
  const MainShell({super.key});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  var _navIndex = 0;

  Future<void> _scan() async {
    if (kIsWeb) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Scanning runs on the installed app.')),
      );
      return;
    }

    final folderId = ref.read(activeFolderIdProvider);
    await context.push(
      '/scan',
      extra: ScanRouteArgs(folderId: folderId),
    );
  }

  Future<void> _import() async {
    if (kIsWeb) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Photo import runs on the installed app.')),
      );
      return;
    }

    final folderId = ref.read(activeFolderIdProvider);
    await context.push(
      '/scan',
      extra: ScanRouteArgs(folderId: folderId, openGallery: true),
    );
  }

  void _onNavSelected(int index) {
    if (index == 2) {
      _scan();
      return;
    }
    setState(() => _navIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    final activeFolderId = ref.watch(activeFolderIdProvider);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: HomeDesign.canvas,
      drawer: Drawer(
        backgroundColor: HomeDesign.surface,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.symmetric(vertical: 16),
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(24, 8, 24, 16),
                child: Text(
                  'Paperly',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: HomeDesign.primary,
                  ),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.person_outline_rounded),
                title: const Text('Profile'),
                onTap: () {
                  Navigator.pop(context);
                  context.push('/settings');
                },
              ),
              ListTile(
                leading: const Icon(Icons.settings_outlined),
                title: const Text('Settings'),
                onTap: () {
                  Navigator.pop(context);
                  setState(() => _navIndex = 4);
                },
              ),
              ListTile(
                leading: const Icon(Icons.create_new_folder_outlined),
                title: const Text('New folder'),
                onTap: () {
                  Navigator.pop(context);
                  showCreateFolderDialog(context, ref);
                },
              ),
              const Divider(height: 32),
              const AppVersionFooter(
                padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              ),
            ],
          ),
        ),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 280),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.03, 0),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        ),
        child: activeFolderId != null
            ? FolderDetailView(
                key: ValueKey(activeFolderId),
                folderId: activeFolderId,
                onBack: () =>
                    ref.read(activeFolderIdProvider.notifier).state = null,
                onDocumentTap: (id) => context.push('/document/$id'),
                onScan: _scan,
              )
            : KeyedSubtree(
                key: const ValueKey('home-body'),
                child: _buildBody(),
              ),
      ),
      bottomNavigationBar: activeFolderId != null
          ? null
          : PremiumBottomNav(
              currentIndex: _navIndex,
              onTabSelected: _onNavSelected,
              onScan: _scan,
            ),
    );
  }

  Widget _buildBody() {
    return switch (_navIndex) {
      0 => HomeDashboardBody(
          onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
          onFolderTap: (id) =>
              ref.read(activeFolderIdProvider.notifier).state = id,
          onScan: _scan,
          onImport: _import,
        ),
      1 => CollectionsBody(
          onFolderTap: (id) =>
              ref.read(activeFolderIdProvider.notifier).state = id,
        ),
      3 => ToolsBody(onImport: _import, onScan: _scan),
      4 => const SettingsScreen(embedded: true),
      _ => HomeDashboardBody(
          onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
          onFolderTap: (id) =>
              ref.read(activeFolderIdProvider.notifier).state = id,
          onScan: _scan,
          onImport: _import,
        ),
    };
  }
}

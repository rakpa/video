import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../folders/presentation/folders_tab.dart';
import 'home_design_tokens.dart';
import 'home_typography.dart';
import 'home_premium_widgets.dart';
import 'recent_feed_grid.dart';
import 'recent_feed_item.dart';

/// Premium home screen — search, quick actions, recent documents.
class HomeDashboardBody extends ConsumerStatefulWidget {
  const HomeDashboardBody({
    super.key,
    required this.onOpenMenu,
    required this.onFolderTap,
    required this.onScan,
    required this.onImport,
  });

  final VoidCallback onOpenMenu;
  final ValueChanged<String> onFolderTap;
  final VoidCallback onScan;
  final VoidCallback onImport;

  @override
  ConsumerState<HomeDashboardBody> createState() => _HomeDashboardBodyState();
}

class _HomeDashboardBodyState extends ConsumerState<HomeDashboardBody> {
  var _listView = false;
  var _sort = RecentFeedSort.newest;
  final _searchController = TextEditingController();
  var _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildAppBar(),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
            child: PremiumSearchBar(
              controller: _searchController,
              onChanged: (v) => setState(() => _searchQuery = v),
            )
                .animate()
                .fadeIn(duration: 320.ms, curve: Curves.easeOut)
                .slideY(begin: 0.04, end: 0, curve: Curves.easeOutCubic),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
            child: QuickActionsRow(
              onScan: widget.onScan,
              onNewFolder: () => showCreateFolderDialog(context, ref),
              onImport: widget.onImport,
            )
                .animate()
                .fadeIn(delay: 80.ms, duration: 340.ms)
                .slideY(begin: 0.05, end: 0, curve: Curves.easeOutCubic),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: _buildSectionHeader(),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: ClipRect(
                child: RecentFeedGrid(
                  listView: _listView,
                  sort: _sort,
                  searchQuery: _searchQuery,
                  onDocumentTap: (id) => context.push('/document/$id'),
                  onFolderTap: widget.onFolderTap,
                  onFolderDelete: (folder) => deleteFolderWithConfirmation(
                    context,
                    ref,
                    folderId: folder.id,
                    folderName: folder.name,
                    scanCount: folder.documentCount,
                  ),
                  onDocumentDelete: (summary) =>
                      deleteDocumentWithConfirmation(context, ref, summary),
                  onScanFirst: widget.onScan,
                  onImport: widget.onImport,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: widget.onOpenMenu,
            icon: const Icon(Icons.menu_rounded, color: HomeDesign.onSurface),
            tooltip: 'Menu',
          ),
          Expanded(
            child: Text(
              'Paperly',
              textAlign: TextAlign.center,
              style: HomeTypography.appTitle,
            ),
          ),
          // Balances the leading menu button so the title stays centered.
          const SizedBox(width: 48),
        ],
      ),
    ).animate().fadeIn(duration: 280.ms);
  }

  Widget _buildSectionHeader() {
    return Row(
      children: [
        const Expanded(
          child: Text(
            'Recent',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: HomeDesign.onSurface,
            ),
          ),
        ),
        HomeSortChip(
          label: _sort.label,
          onTap: () => _showSortSheet(context),
        ),
        const SizedBox(width: 8),
        ViewModeToggle(
          listView: _listView,
          onGrid: () => setState(() => _listView = false),
          onList: () => setState(() => _listView = true),
        ),
      ],
    );
  }

  Future<void> _showSortSheet(BuildContext context) async {
    final picked = await showModalBottomSheet<RecentFeedSort>(
      context: context,
      backgroundColor: HomeDesign.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: HomeDesign.border,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Sort by',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
            ...RecentFeedSort.values.map(
              (sort) => ListTile(
                leading: Icon(
                  _sort == sort
                      ? Icons.check_circle_rounded
                      : Icons.circle_outlined,
                  color: _sort == sort ? HomeDesign.primary : HomeDesign.muted,
                ),
                title: Text(sort.label),
                onTap: () => Navigator.pop(context, sort),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked != null) setState(() => _sort = picked);
  }
}

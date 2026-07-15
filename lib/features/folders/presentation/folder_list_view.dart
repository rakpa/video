import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../documents/presentation/documents_providers.dart';
import '../../folders/presentation/folders_providers.dart';
import '../../folders/presentation/folders_tab.dart';
import '../../home/presentation/feed_actions.dart';
import '../../home/presentation/home_design_tokens.dart';
import '../../home/presentation/home_premium_widgets.dart';
import '../../home/presentation/recent_feed_grid.dart';

class FolderListView extends ConsumerStatefulWidget {
  const FolderListView({
    super.key,
    required this.onFolderTap,
  });

  final ValueChanged<String> onFolderTap;

  @override
  ConsumerState<FolderListView> createState() => _FolderListViewState();
}

class _FolderListViewState extends ConsumerState<FolderListView> {
  final _searchController = TextEditingController();
  var _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final folders = ref.watch(folderListProvider);
    final documents = ref.watch(documentListProvider);

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildHeader(context, ref),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            child: PremiumSearchBar(
              controller: _searchController,
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          folders.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (items) => documents.when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (docs) {
                final pageCount =
                    docs.fold<int>(0, (sum, d) => sum + d.pageCount);
                return Padding(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 6),
                  child: Text(
                    '${items.length} Folders · ${docs.length} Documents · $pageCount Pages',
                    style: TextStyle(
                      fontSize: 13,
                      color: HomeDesign.mutedOf(context),
                    ),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: folders.when(
              loading: () => const Center(
                child: SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (error, _) => Center(
                child: Text(
                  'Could not load folders',
                  style: TextStyle(color: HomeDesign.mutedOf(context)),
                ),
              ),
              data: (items) {
                final filtered = items.where((f) {
                  final q = _query.trim().toLowerCase();
                  if (q.isEmpty) return true;
                  return f.name.toLowerCase().contains(q);
                }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 88,
                            height: 88,
                            decoration: BoxDecoration(
                              color: HomeDesign.primary.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: Icon(
                              Icons.folder_open_rounded,
                              size: 44,
                              color: HomeDesign.primary.withValues(alpha: 0.5),
                            ),
                          ),
                          const SizedBox(height: 18),
                          Text(
                            _query.isEmpty
                                ? 'No folders yet'
                                : 'No matching folders',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: HomeDesign.onSurfaceOf(context),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _query.isEmpty
                                ? 'Create a folder to organize your scans.'
                                : 'Try a different search term.',
                            textAlign: TextAlign.center,
                            style:
                                TextStyle(color: HomeDesign.mutedOf(context)),
                          ),
                          if (_query.isEmpty) ...[
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              onPressed: () => showCreateFolderDialog(
                                context,
                                ref,
                                openAfterCreate: true,
                              ),
                              icon: const Icon(Icons.create_new_folder_rounded),
                              label: const Text('Create folder'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(height: HomeDesign.cardGap),
                  itemBuilder: (context, index) {
                    final folder = filtered[index];
                    return PremiumFolderCard(
                      folder: folder,
                      onTap: () => widget.onFolderTap(folder.id),
                      onLongPress: () => showFolderContextMenu(
                        context,
                        ref,
                        folder: folder,
                        onOpen: () => widget.onFolderTap(folder.id),
                      ),
                      onDelete: () => deleteFolderWithConfirmation(
                        context,
                        ref,
                        folderId: folder.id,
                        folderName: folder.name,
                        scanCount: folder.documentCount,
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Collections',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: HomeDesign.primary,
                letterSpacing: -0.3,
              ),
            ),
          ),
          FilledButton.tonalIcon(
            onPressed: () =>
                showCreateFolderDialog(context, ref, openAfterCreate: true),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('New'),
            style: FilledButton.styleFrom(
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../shared/formatting/relative_time.dart';
import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';
import '../../folders/domain/entities.dart';
import '../../folders/presentation/folders_providers.dart';
import 'feed_actions.dart';
import 'home_design_tokens.dart';
import 'home_premium_widgets.dart';
import 'home_typography.dart';
import 'recent_feed_item.dart';
import 'scan_thumbnail.dart';

/// Premium home feed — folders and scans, grid or list.
class RecentFeedGrid extends ConsumerWidget {
  const RecentFeedGrid({
    super.key,
    required this.onDocumentTap,
    required this.onFolderTap,
    this.onFolderDelete,
    this.onDocumentDelete,
    this.onScanFirst,
    this.onImport,
    this.listView = false,
    this.sort = RecentFeedSort.newest,
    this.searchQuery = '',
  });

  final ValueChanged<String> onDocumentTap;
  final ValueChanged<String> onFolderTap;
  final Future<void> Function(ScanFolder folder)? onFolderDelete;
  final Future<void> Function(DocumentSummary summary)? onDocumentDelete;
  final VoidCallback? onScanFirst;
  final VoidCallback? onImport;
  final bool listView;
  final RecentFeedSort sort;
  final String searchQuery;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final normalizedQuery = searchQuery.trim();
    final folders = ref.watch(folderListProvider);
    final scans = normalizedQuery.isEmpty
        ? ref.watch(documentListProvider)
        : ref.watch(documentSearchProvider(normalizedQuery));

    return folders.when(
      loading: () => const _FeedLoading(),
      error: (_, __) => const _FeedError(),
      data: (folderList) => scans.when(
        loading: () => const _FeedLoading(),
        error: (_, __) => const _FeedError(),
        data: (scanList) {
          final items = mergeRecentFeed(
            folders: folderList,
            scans: scanList,
            sort: sort,
          ).where((item) => _matchesSearch(item, normalizedQuery)).toList();

          if (items.isEmpty) {
            return PremiumEmptyState(
              onScan: onScanFirst ?? () {},
              onImport: onImport ?? () {},
            );
          }

          final scrollBehavior = ScrollConfiguration.of(context).copyWith(
            scrollbars: false,
          );

          return AnimatedSwitcher(
            duration: const Duration(milliseconds: 320),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) {
              return FadeTransition(
                opacity: animation,
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.98, end: 1).animate(animation),
                  child: child,
                ),
              );
            },
            layoutBuilder: (currentChild, previousChildren) {
              return Stack(
                alignment: Alignment.topCenter,
                children: [
                  ...previousChildren,
                  if (currentChild != null) currentChild,
                ],
              );
            },
            child: listView
                ? ScrollConfiguration(
                    key: const ValueKey('list'),
                    behavior: scrollBehavior,
                    child: ListView.separated(
                      padding: EdgeInsets.zero,
                      itemCount: items.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: HomeDesign.cardGap),
                      itemBuilder: (context, index) => _FeedListTile(
                        item: items[index],
                        onDocumentTap: onDocumentTap,
                        onFolderTap: onFolderTap,
                        onFolderDelete: onFolderDelete,
                        onDocumentDelete: onDocumentDelete,
                      ),
                    ),
                  )
                : ScrollConfiguration(
                    key: const ValueKey('grid'),
                    behavior: scrollBehavior,
                    child: GridView.builder(
                      padding: EdgeInsets.zero,
                      physics: const BouncingScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: HomeDesign.cardGap,
                        mainAxisSpacing: HomeDesign.cardGap,
                        childAspectRatio: 0.74,
                      ),
                      itemCount: items.length,
                      itemBuilder: (context, index) => _FeedCard(
                        item: items[index],
                        onDocumentTap: onDocumentTap,
                        onFolderTap: onFolderTap,
                        onFolderDelete: onFolderDelete,
                        onDocumentDelete: onDocumentDelete,
                      ),
                    ),
                  ),
          );
        },
      ),
    );
  }

  bool _matchesSearch(RecentFeedItem item, String searchQuery) {
    final q = searchQuery.trim().toLowerCase();
    if (q.isEmpty) return true;
    return switch (item) {
      RecentFolderItem(:final folder) => folder.name.toLowerCase().contains(q),
      RecentScanItem() => true,
    };
  }
}

class _FeedLoading extends StatelessWidget {
  const _FeedLoading();

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: EdgeInsets.zero,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: HomeDesign.cardGap,
        mainAxisSpacing: HomeDesign.cardGap,
        childAspectRatio: 0.74,
      ),
      itemCount: 4,
      itemBuilder: (_, __) => Container(
        decoration: BoxDecoration(
          color: HomeDesign.border.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(HomeDesign.radiusLg),
        ),
      ),
    );
  }
}

class _FeedError extends StatelessWidget {
  const _FeedError();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Could not load documents',
        style: TextStyle(color: HomeDesign.muted.withValues(alpha: 0.9)),
      ),
    );
  }
}

class _FeedCard extends ConsumerWidget {
  const _FeedCard({
    required this.item,
    required this.onDocumentTap,
    required this.onFolderTap,
    this.onFolderDelete,
    this.onDocumentDelete,
  });

  final RecentFeedItem item;
  final ValueChanged<String> onDocumentTap;
  final ValueChanged<String> onFolderTap;
  final Future<void> Function(ScanFolder folder)? onFolderDelete;
  final Future<void> Function(DocumentSummary summary)? onDocumentDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return switch (item) {
      RecentFolderItem(:final folder) => PremiumFolderCard(
          folder: folder,
          compact: true,
          onTap: () => onFolderTap(folder.id),
          onDelete:
              onFolderDelete == null ? null : () => onFolderDelete!(folder),
          onLongPress: () => showFolderContextMenu(
            context,
            ref,
            folder: folder,
            onOpen: () => onFolderTap(folder.id),
          ),
        ),
      RecentScanItem(:final summary) => PremiumDocumentCard(
          summary: summary,
          compact: true,
          onTap: () => onDocumentTap(summary.document.id),
          onDelete: onDocumentDelete == null
              ? null
              : () => onDocumentDelete!(summary),
          onShowMenu: () => showDocumentContextMenu(
            context,
            ref,
            summary: summary,
            onOpen: () => onDocumentTap(summary.document.id),
          ),
        ),
    };
  }
}

class _FeedListTile extends ConsumerWidget {
  const _FeedListTile({
    required this.item,
    required this.onDocumentTap,
    required this.onFolderTap,
    this.onFolderDelete,
    this.onDocumentDelete,
  });

  final RecentFeedItem item;
  final ValueChanged<String> onDocumentTap;
  final ValueChanged<String> onFolderTap;
  final Future<void> Function(ScanFolder folder)? onFolderDelete;
  final Future<void> Function(DocumentSummary summary)? onDocumentDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return switch (item) {
      RecentFolderItem(:final folder) => PremiumFolderCard(
          folder: folder,
          onTap: () => onFolderTap(folder.id),
          onDelete:
              onFolderDelete == null ? null : () => onFolderDelete!(folder),
          onLongPress: () => showFolderContextMenu(
            context,
            ref,
            folder: folder,
            onOpen: () => onFolderTap(folder.id),
          ),
        ),
      RecentScanItem(:final summary) => PremiumDocumentCard(
          summary: summary,
          onTap: () => onDocumentTap(summary.document.id),
          onDelete: onDocumentDelete == null
              ? null
              : () => onDocumentDelete!(summary),
          onShowMenu: () => showDocumentContextMenu(
            context,
            ref,
            summary: summary,
            onOpen: () => onDocumentTap(summary.document.id),
          ),
        ),
    };
  }
}

class PremiumFolderCard extends StatelessWidget {
  const PremiumFolderCard({
    super.key,
    required this.folder,
    required this.onTap,
    this.onDelete,
    this.onLongPress,
    this.compact = false,
  });

  final ScanFolder folder;
  final VoidCallback onTap;
  final Future<void> Function()? onDelete;
  final VoidCallback? onLongPress;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final accent = HomeDesign.folderAccent(folder.name);
    final updated = formatRelativeUpdated(folder.updatedAt);
    if (compact) {
      return ScaleTap(
        onTap: onTap,
        onLongPress: onLongPress ?? onDelete,
        child: PremiumCard(
          padding: const EdgeInsets.all(10),
          radius: HomeDesign.radiusLg,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  children: [
                    Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.14),
                        borderRadius:
                            BorderRadius.circular(HomeDesign.radiusMd),
                      ),
                      child: Center(
                        child:
                            Icon(Icons.folder_rounded, size: 46, color: accent),
                      ),
                    ),
                    if (onDelete != null || onLongPress != null)
                      Positioned(
                        top: 4,
                        right: 4,
                        child: _IconMenu(
                          onDelete: onDelete,
                          onOpen: onTap,
                          onMore: onLongPress,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                folder.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: HomeTypography.label.copyWith(
                  color: HomeDesign.onSurfaceOf(context),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                updated,
                style: HomeTypography.caption
                    .copyWith(color: HomeDesign.mutedOf(context)),
              ),
            ],
          ),
        ),
      );
    }

    return ScaleTap(
      onTap: onTap,
      onLongPress: onLongPress ?? onDelete,
      child: PremiumCard(
        radius: HomeDesign.radiusLg,
        child: Row(
          children: [
            Container(
              width: 60,
              height: 72,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(HomeDesign.radiusMd),
              ),
              child: Icon(Icons.folder_rounded, size: 34, color: accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    folder.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: HomeTypography.label.copyWith(
                      fontSize: 16,
                      color: HomeDesign.onSurfaceOf(context),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    updated,
                    style: HomeTypography.caption
                        .copyWith(color: HomeDesign.mutedOf(context)),
                  ),
                ],
              ),
            ),
            if (onDelete != null || onLongPress != null)
              _IconMenu(onDelete: onDelete, onOpen: onTap, onMore: onLongPress),
          ],
        ),
      ),
    );
  }
}

class PremiumDocumentCard extends StatefulWidget {
  const PremiumDocumentCard({
    super.key,
    required this.summary,
    required this.onTap,
    this.onDelete,
    this.onShowMenu,
    this.compact = false,
  });

  final DocumentSummary summary;
  final VoidCallback onTap;
  final Future<void> Function()? onDelete;
  final VoidCallback? onShowMenu;
  final bool compact;

  @override
  State<PremiumDocumentCard> createState() => _PremiumDocumentCardState();
}

class _PremiumDocumentCardState extends State<PremiumDocumentCard> {
  var _favorite = false;

  @override
  Widget build(BuildContext context) {
    final date =
        DateFormat('MMM d, yyyy').format(widget.summary.document.updatedAt);
    final pages =
        '${widget.summary.pageCount} page${widget.summary.pageCount == 1 ? '' : 's'}';

    if (widget.compact) {
      return ScaleTap(
        onTap: widget.onTap,
        child: PremiumCard(
          padding: const EdgeInsets.all(10),
          radius: HomeDesign.radiusLg,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(HomeDesign.radiusMd),
                      child: ScanThumbnail(path: widget.summary.thumbnailPath),
                    ),
                    const Positioned(left: 6, top: 6, child: _PdfBadge()),
                    Positioned(
                      top: 2,
                      right: 2,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _FavoriteBtn(
                            active: _favorite,
                            onTap: () => setState(() => _favorite = !_favorite),
                          ),
                          if (widget.onShowMenu != null ||
                              widget.onDelete != null)
                            _IconMenu(
                              onDelete: widget.onDelete,
                              onOpen: widget.onTap,
                              onMore: widget.onShowMenu,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                widget.summary.document.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: HomeTypography.label.copyWith(
                  color: HomeDesign.onSurfaceOf(context),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '$pages · $date',
                style: HomeTypography.caption
                    .copyWith(color: HomeDesign.mutedOf(context)),
              ),
            ],
          ),
        ),
      );
    }

    return ScaleTap(
      onTap: widget.onTap,
      child: PremiumCard(
        radius: HomeDesign.radiusLg,
        child: Row(
          children: [
            SizedBox(
              width: 68,
              height: 84,
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(HomeDesign.radiusMd),
                    child: ScanThumbnail(path: widget.summary.thumbnailPath),
                  ),
                  const Positioned(left: 6, top: 6, child: _PdfBadge()),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.summary.document.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: HomeTypography.label.copyWith(
                      fontSize: 16,
                      color: HomeDesign.onSurfaceOf(context),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$pages · $date',
                    style: HomeTypography.caption
                        .copyWith(color: HomeDesign.mutedOf(context)),
                  ),
                ],
              ),
            ),
            Column(
              children: [
                _FavoriteBtn(
                  active: _favorite,
                  onTap: () => setState(() => _favorite = !_favorite),
                ),
                if (widget.onShowMenu != null || widget.onDelete != null)
                  _IconMenu(
                    onDelete: widget.onDelete,
                    onOpen: widget.onTap,
                    onMore: widget.onShowMenu,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PdfBadge extends StatelessWidget {
  const _PdfBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: HomeDesign.primary,
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Text(
        'PDF',
        style: TextStyle(
          color: Colors.white,
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _FavoriteBtn extends StatelessWidget {
  const _FavoriteBtn({required this.active, required this.onTap});

  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.92),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(
            active ? Icons.star_rounded : Icons.star_outline_rounded,
            size: 18,
            color: active ? const Color(0xFFFFB300) : HomeDesign.muted,
          ),
        ),
      ),
    );
  }
}

class _IconMenu extends StatelessWidget {
  const _IconMenu({
    required this.onDelete,
    required this.onOpen,
    this.onMore,
  });

  final Future<void> Function()? onDelete;
  final VoidCallback onOpen;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.92),
      borderRadius: BorderRadius.circular(8),
      child: PopupMenuButton<String>(
        padding: EdgeInsets.zero,
        icon: Icon(Icons.more_horiz_rounded,
            size: 18, color: HomeDesign.mutedOf(context)),
        onSelected: (value) async {
          if (value == 'open') onOpen();
          if (value == 'more' && onMore != null) onMore!();
          if (value == 'delete' && onDelete != null) await onDelete!();
        },
        itemBuilder: (context) => [
          const PopupMenuItem(value: 'open', child: Text('Open')),
          if (onMore != null)
            const PopupMenuItem(value: 'more', child: Text('More actions')),
          if (onDelete != null)
            const PopupMenuItem(
              value: 'delete',
              child: Text('Delete', style: TextStyle(color: Color(0xFFC62828))),
            ),
        ],
      ),
    );
  }
}

Future<void> deleteDocumentWithConfirmation(
  BuildContext context,
  WidgetRef ref,
  DocumentSummary summary,
) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Delete document?'),
      content: Text('Do you want to delete "${summary.document.title}"?'),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          style:
              FilledButton.styleFrom(backgroundColor: const Color(0xFFC62828)),
          child: const Text('Yes'),
        ),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return;
  await ref
      .read(documentRepositoryProvider)
      .deleteDocument(summary.document.id);
}

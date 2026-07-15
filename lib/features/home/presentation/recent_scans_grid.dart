import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';
import '../../folders/presentation/folders_providers.dart';
import 'scan_thumbnail.dart';

/// Live grid/list of captured scans — no Stitch HTML placeholders.
class RecentScansGrid extends ConsumerWidget {
  const RecentScansGrid({
    super.key,
    required this.onDocumentTap,
    this.listView = false,
    this.folderId,
    this.emptyTitle = 'No scans yet',
    this.emptySubtitle = 'Tap the camera button to scan your first document.',
  });

  final ValueChanged<String> onDocumentTap;
  final bool listView;
  final String? folderId;
  final String emptyTitle;
  final String emptySubtitle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final documents = folderId == null
        ? ref.watch(documentListProvider)
        : ref.watch(documentsInFolderProvider(folderId!));

    return documents.when(
      loading: () => const Center(
        child: SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (error, _) => Center(
        child: Text(
          'Could not load scans',
          style: TextStyle(color: Colors.grey.shade600),
        ),
      ),
      data: (summaries) {
        if (summaries.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.document_scanner_outlined,
                    size: 48,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    emptyTitle,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    emptySubtitle,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                  ),
                ],
              ),
            ),
          );
        }

        if (listView) {
          return ListView.separated(
            padding: EdgeInsets.zero,
            itemCount: summaries.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) => _ScanListTile(
              summary: summaries[index],
              onTap: () => onDocumentTap(summaries[index].document.id),
            ),
          );
        }

        return GridView.builder(
          padding: EdgeInsets.zero,
          physics: const BouncingScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 0.72,
          ),
          itemCount: summaries.length,
          itemBuilder: (context, index) {
            return _ScanCard(
              summary: summaries[index],
              onTap: () => onDocumentTap(summaries[index].document.id),
            );
          },
        );
      },
    );
  }
}

class _ScanCard extends StatelessWidget {
  const _ScanCard({required this.summary, required this.onTap});

  final DocumentSummary summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final date = DateFormat('MMM d').format(summary.document.updatedAt);
    final meta = '$date · ${summary.pageCount} pg';

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0D000000),
                offset: Offset(4, 4),
                blurRadius: 8,
              ),
              BoxShadow(
                color: Colors.white,
                offset: Offset(-4, -4),
                blurRadius: 8,
              ),
            ],
          ),
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: ScanThumbnail(path: summary.thumbnailPath),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                summary.document.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1A1C1D),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                meta,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  color: Color(0xFF737785),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScanListTile extends StatelessWidget {
  const _ScanListTile({required this.summary, required this.onTap});

  final DocumentSummary summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final date = DateFormat('MMM d').format(summary.document.updatedAt);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0D000000),
                offset: Offset(4, 4),
                blurRadius: 8,
              ),
            ],
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  width: 56,
                  height: 72,
                  child: ScanThumbnail(path: summary.thumbnailPath),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      summary.document.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1A1C1D),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$date · ${summary.pageCount} pg',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF737785),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

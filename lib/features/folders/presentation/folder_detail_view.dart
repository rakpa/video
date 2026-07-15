import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../home/presentation/recent_scans_grid.dart';
import '../domain/entities.dart';
import 'folders_providers.dart';
import 'folders_tab.dart';

class FolderDetailView extends ConsumerWidget {
  const FolderDetailView({
    super.key,
    required this.folderId,
    required this.onBack,
    required this.onDocumentTap,
    required this.onScan,
  });

  final String folderId;
  final VoidCallback onBack;
  final ValueChanged<String> onDocumentTap;
  final VoidCallback onScan;

  static const _primary = Color(0xFF0040A1);
  static const _surface = Color(0xFFF9F9FB);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final folder = ref.watch(folderProvider(folderId));

    return Stack(
      children: [
        SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildHeader(context, ref, folder),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
                child: Text(
                  folder.maybeWhen(
                    data: (f) => f == null ? 'Folder' : '${f.name} scans',
                    orElse: () => 'Scans',
                  ),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1A1C1D),
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 88),
                  child: RecentScansGrid(
                    folderId: folderId,
                    onDocumentTap: onDocumentTap,
                    emptyTitle: 'No scans in this folder',
                    emptySubtitle:
                        'Tap the scan button below to scan into this folder.',
                  ),
                ),
              ),
            ],
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 24,
          child: Center(
            child: FloatingActionButton.extended(
              onPressed: onScan,
              backgroundColor: _primary,
              elevation: 4,
              icon: const Icon(Icons.document_scanner_outlined),
              label: const Text('Scan to folder'),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHeader(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<ScanFolder?> folder,
  ) {
    return Container(
      decoration: const BoxDecoration(
        color: _surface,
        boxShadow: [
          BoxShadow(
            color: Color(0x0D000000),
            offset: Offset(4, 4),
            blurRadius: 8,
          ),
          BoxShadow(
            color: Colors.white,
            offset: Offset(-4, -4),
            blurRadius: 4,
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back_rounded),
            color: const Color(0xFF424654),
          ),
          Expanded(
            child: folder.when(
              loading: () => const Text(
                'Folder',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: _primary,
                ),
              ),
              error: (_, __) => const Text(
                'Folder',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: _primary,
                ),
              ),
              data: (f) => Text(
                f?.name ?? 'Folder',
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: _primary,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Delete folder',
            onPressed: folder.maybeWhen(
              data: (f) => f == null
                  ? null
                  : () => deleteFolderWithConfirmation(
                        context,
                        ref,
                        folderId: folderId,
                        folderName: f.name,
                        scanCount: f.documentCount,
                        onDeleted: onBack,
                      ),
              orElse: () => null,
            ),
            icon: const Icon(Icons.delete_outline_rounded),
            color: const Color(0xFFC62828),
          ),
        ],
      ),
    );
  }
}

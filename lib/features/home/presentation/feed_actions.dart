import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../documents/domain/entities.dart';
import '../../documents/presentation/documents_providers.dart';
import '../../export/presentation/export_controller.dart';
import '../../folders/domain/entities.dart';
import '../../folders/presentation/folders_providers.dart';
import '../../folders/presentation/folders_tab.dart';
import 'recent_feed_grid.dart';

Future<void> showDocumentContextMenu(
  BuildContext context,
  WidgetRef ref, {
  required DocumentSummary summary,
  required VoidCallback onOpen,
}) async {
  final action = await showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.drive_file_rename_outline_rounded),
            title: const Text('Rename'),
            onTap: () => Navigator.pop(ctx, 'rename'),
          ),
          ListTile(
            leading: const Icon(Icons.drive_file_move_outlined),
            title: const Text('Move to folder'),
            onTap: () => Navigator.pop(ctx, 'move'),
          ),
          ListTile(
            leading: const Icon(Icons.picture_as_pdf_outlined),
            title: const Text('Export PDF'),
            onTap: () => Navigator.pop(ctx, 'export'),
          ),
          ListTile(
            leading: const Icon(Icons.copy_all_outlined),
            title: const Text('Duplicate'),
            onTap: () => Navigator.pop(ctx, 'duplicate'),
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline_rounded,
                color: Color(0xFFC62828)),
            title: const Text('Delete',
                style: TextStyle(color: Color(0xFFC62828))),
            onTap: () => Navigator.pop(ctx, 'delete'),
          ),
        ],
      ),
    ),
  );

  if (!context.mounted || action == null) return;

  switch (action) {
    case 'rename':
      await renameDocumentDialog(context, ref, summary.document);
    case 'move':
      await _moveDocument(context, ref, summary.document);
    case 'export':
      final box = context.findRenderObject() as RenderBox?;
      final origin = (box != null && box.hasSize)
          ? box.localToGlobal(Offset.zero) & box.size
          : const Rect.fromLTWH(0, 0, 1, 1);
      await ref.read(exportControllerProvider.notifier).exportAndShare(
            summary.document,
            sharePositionOrigin: origin,
          );
    case 'duplicate':
      final copy = await ref
          .read(documentRepositoryProvider)
          .duplicateDocument(summary.document.id);
      ref.invalidate(documentListProvider);
      ref.invalidate(folderListProvider);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Duplicated "${copy.title}"')),
      );
    case 'delete':
      await deleteDocumentWithConfirmation(context, ref, summary);
    case 'open':
      onOpen();
  }
}

Future<void> showFolderContextMenu(
  BuildContext context,
  WidgetRef ref, {
  required ScanFolder folder,
  required VoidCallback onOpen,
}) async {
  final action = await showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.drive_file_rename_outline_rounded),
            title: const Text('Rename'),
            onTap: () => Navigator.pop(ctx, 'rename'),
          ),
          ListTile(
            leading: const Icon(Icons.palette_outlined),
            title: const Text('Change color'),
            subtitle: const Text('Colors are based on folder name'),
            onTap: () => Navigator.pop(ctx, 'color'),
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline_rounded,
                color: Color(0xFFC62828)),
            title: const Text('Delete',
                style: TextStyle(color: Color(0xFFC62828))),
            onTap: () => Navigator.pop(ctx, 'delete'),
          ),
        ],
      ),
    ),
  );

  if (!context.mounted || action == null) return;

  switch (action) {
    case 'rename':
      await showRenameFolderDialog(context, ref, folder);
    case 'color':
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Folder color follows the name (e.g. Receipts, Work, Personal).'),
          ),
        );
      }
    case 'delete':
      await deleteFolderWithConfirmation(
        context,
        ref,
        folderId: folder.id,
        folderName: folder.name,
        scanCount: folder.documentCount,
      );
    case 'open':
      onOpen();
  }
}

Future<void> renameDocumentDialog(
  BuildContext context,
  WidgetRef ref,
  ScanDocument document,
) async {
  final controller = TextEditingController(text: document.title);
  final newTitle = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Rename document'),
      content: TextField(
        controller: controller,
        autofocus: true,
        onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, controller.text.trim()),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  WidgetsBinding.instance.addPostFrameCallback((_) => controller.dispose());
  if (newTitle != null && newTitle.isNotEmpty) {
    await ref
        .read(documentRepositoryProvider)
        .renameDocument(document.id, newTitle);
  }
}

Future<void> _moveDocument(
  BuildContext context,
  WidgetRef ref,
  ScanDocument document,
) async {
  final folders = await ref.read(folderListProvider.future);
  if (!context.mounted) return;

  final selected = await showModalBottomSheet<String?>(
    context: context,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Move to folder',
                style: TextStyle(fontWeight: FontWeight.w600)),
          ),
          ListTile(
            leading: const Icon(Icons.home_outlined),
            title: const Text('No folder (Home)'),
            onTap: () => Navigator.pop(ctx, ''),
          ),
          ...folders.map(
            (f) => ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: Text(f.name),
              onTap: () => Navigator.pop(ctx, f.id),
            ),
          ),
        ],
      ),
    ),
  );

  if (selected == null || !context.mounted) return;
  await ref.read(documentRepositoryProvider).moveDocumentToFolder(
        document.id,
        selected.isEmpty ? null : selected,
      );
}

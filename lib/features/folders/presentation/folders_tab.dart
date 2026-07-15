import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../scan/domain/scan_mode.dart';
import 'folder_detail_view.dart';
import 'folder_list_view.dart';
import '../domain/entities.dart';
import 'folders_providers.dart';

/// Folders tab — list of folders or scans inside an opened folder.
class FoldersTab extends ConsumerWidget {
  const FoldersTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final folderId = ref.watch(activeFolderIdProvider);

    if (folderId == null) {
      return FolderListView(
        onFolderTap: (id) =>
            ref.read(activeFolderIdProvider.notifier).state = id,
      );
    }

    return FolderDetailView(
      folderId: folderId,
      onBack: () => ref.read(activeFolderIdProvider.notifier).state = null,
      onDocumentTap: (id) => context.push('/document/$id'),
      onScan: () {
        if (kIsWeb) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Scanning runs on the installed app.')),
          );
          return;
        }
        context.push(
          '/scan',
          extra: ScanRouteArgs(folderId: folderId),
        );
      },
    );
  }
}

Future<void> showCreateFolderDialog(
  BuildContext context,
  WidgetRef ref, {
  bool openAfterCreate = false,
}) async {
  final controller = TextEditingController();
  final name = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('New folder'),
      content: TextField(
        controller: controller,
        autofocus: true,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          hintText: 'Folder name',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (value) => Navigator.pop(context, value),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, controller.text),
          child: const Text('Create'),
        ),
      ],
    ),
  );
  controller.dispose();

  if (name == null || name.trim().isEmpty) return;

  try {
    final folder =
        await ref.read(folderRepositoryProvider).createFolder(name.trim());
    if (!context.mounted) return;
    if (openAfterCreate) {
      ref.read(activeFolderIdProvider.notifier).state = folder.id;
    }
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Could not create folder: $error')),
    );
  }
}

Future<bool> showDeleteFolderDialog(
  BuildContext context,
  String folderName, {
  int scanCount = 0,
}) async {
  final scansNote = scanCount > 0
      ? '\n\n${scanCount == 1 ? '1 scan' : '$scanCount scans'} in this folder will also be deleted.'
      : '';

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Delete folder?'),
      content: Text(
        'Do you want to delete "$folderName"?$scansNote',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFFC62828),
          ),
          child: const Text('Yes'),
        ),
      ],
    ),
  );

  return confirmed ?? false;
}

Future<void> deleteFolderWithConfirmation(
  BuildContext context,
  WidgetRef ref, {
  required String folderId,
  required String folderName,
  int scanCount = 0,
  VoidCallback? onDeleted,
}) async {
  final confirmed =
      await showDeleteFolderDialog(context, folderName, scanCount: scanCount);
  if (!confirmed || !context.mounted) return;

  try {
    await ref.read(folderRepositoryProvider).deleteFolder(folderId);
    if (!context.mounted) return;
    onDeleted?.call();
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Could not delete folder: $error')),
    );
  }
}

Future<void> showRenameFolderDialog(
  BuildContext context,
  WidgetRef ref,
  ScanFolder folder,
) async {
  final controller = TextEditingController(text: folder.name);
  final name = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Rename folder'),
      content: TextField(
        controller: controller,
        autofocus: true,
        textCapitalization: TextCapitalization.sentences,
        onSubmitted: (value) => Navigator.pop(context, value),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, controller.text),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  controller.dispose();

  if (name == null || name.trim().isEmpty || name.trim() == folder.name) return;

  try {
    await ref
        .read(folderRepositoryProvider)
        .renameFolder(folder.id, name.trim());
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Could not rename folder: $error')),
    );
  }
}

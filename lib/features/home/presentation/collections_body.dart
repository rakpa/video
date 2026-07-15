import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../folders/presentation/folder_list_view.dart';

/// Collections tab — folder library.
class CollectionsBody extends ConsumerWidget {
  const CollectionsBody({
    super.key,
    required this.onFolderTap,
  });

  final ValueChanged<String> onFolderTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FolderListView(onFolderTap: onFolderTap);
  }
}

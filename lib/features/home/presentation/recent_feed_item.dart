import 'package:flutter/foundation.dart';

import '../../documents/domain/entities.dart';
import '../../folders/domain/entities.dart';

/// Sort order for the home recent feed.
enum RecentFeedSort {
  newest('Newest'),
  oldest('Oldest'),
  nameAsc('Name A–Z'),
  nameDesc('Name Z–A');

  const RecentFeedSort(this.label);

  final String label;
}

/// A single row in the home "Recent" feed — either a folder or a scan.
@immutable
sealed class RecentFeedItem {
  const RecentFeedItem();

  DateTime get sortDate;
  String get displayName;
}

@immutable
class RecentFolderItem extends RecentFeedItem {
  const RecentFolderItem(this.folder);

  final ScanFolder folder;

  @override
  DateTime get sortDate => folder.updatedAt;

  @override
  String get displayName => folder.name;
}

@immutable
class RecentScanItem extends RecentFeedItem {
  const RecentScanItem(this.summary);

  final DocumentSummary summary;

  @override
  DateTime get sortDate => summary.document.updatedAt;

  @override
  String get displayName => summary.document.title;
}

List<RecentFeedItem> mergeRecentFeed({
  required List<ScanFolder> folders,
  required List<DocumentSummary> scans,
  RecentFeedSort sort = RecentFeedSort.newest,
}) {
  final items = <RecentFeedItem>[
    ...folders.map(RecentFolderItem.new),
    ...scans.map(RecentScanItem.new),
  ];

  switch (sort) {
    case RecentFeedSort.newest:
      items.sort((a, b) => b.sortDate.compareTo(a.sortDate));
    case RecentFeedSort.oldest:
      items.sort((a, b) => a.sortDate.compareTo(b.sortDate));
    case RecentFeedSort.nameAsc:
      items.sort(
        (a, b) => a.displayName.toLowerCase().compareTo(
              b.displayName.toLowerCase(),
            ),
      );
    case RecentFeedSort.nameDesc:
      items.sort(
        (a, b) => b.displayName.toLowerCase().compareTo(
              a.displayName.toLowerCase(),
            ),
      );
  }

  return items;
}

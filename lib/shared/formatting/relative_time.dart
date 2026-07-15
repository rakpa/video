/// Human-readable relative timestamps for "Updated 2 hours ago" labels.
String formatRelativeUpdated(DateTime dateTime) {
  final now = DateTime.now();
  final diff = now.difference(dateTime);

  if (diff.inSeconds < 60) return 'Updated just now';
  if (diff.inMinutes < 60) {
    final m = diff.inMinutes;
    return 'Updated $m ${m == 1 ? 'minute' : 'minutes'} ago';
  }
  if (diff.inHours < 24) {
    final h = diff.inHours;
    return 'Updated $h ${h == 1 ? 'hour' : 'hours'} ago';
  }
  if (diff.inDays < 7) {
    final d = diff.inDays;
    return 'Updated $d ${d == 1 ? 'day' : 'days'} ago';
  }
  if (diff.inDays < 30) {
    final w = (diff.inDays / 7).floor();
    return 'Updated $w ${w == 1 ? 'week' : 'weeks'} ago';
  }
  return 'Updated ${dateTime.month}/${dateTime.day}/${dateTime.year}';
}

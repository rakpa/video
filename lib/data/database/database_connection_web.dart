import 'package:drift/drift.dart';
import 'package:drift/web.dart';

LazyDatabase openConnection() {
  return LazyDatabase(() async => WebDatabase('doc_scanner_preview'));
}

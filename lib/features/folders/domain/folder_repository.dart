import 'entities.dart';

abstract interface class FolderRepository {
  Stream<List<ScanFolder>> watchFolders();

  Future<ScanFolder?> getFolder(String id);

  Future<ScanFolder> createFolder(String name);

  Future<void> renameFolder(String id, String name);

  Future<void> deleteFolder(String id);
}

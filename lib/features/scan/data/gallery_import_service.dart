import 'package:image_picker/image_picker.dart';

/// Picks one or more images from the device photo library.
class GalleryImportService {
  final _picker = ImagePicker();

  Future<List<String>> pickPhotos({int limit = 24}) async {
    final files = await _picker.pickMultiImage(limit: limit);
    if (files.isEmpty) return [];
    return files.map((x) => x.path).where((path) => path.isNotEmpty).toList();
  }
}

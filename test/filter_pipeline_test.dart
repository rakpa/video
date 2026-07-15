import 'dart:typed_data';

import 'package:doc_scanner/features/enhance/data/image_processor.dart';
import 'package:doc_scanner/features/enhance/domain/doc_filter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  late ImageProcessor processor;
  late Uint8List sample;

  setUp(() {
    processor = ImageProcessor();
    final image = img.Image(width: 48, height: 48);
    for (var y = 0; y < image.height; y++) {
      for (var x = 0; x < image.width; x++) {
        final r = (x * 5 + y * 2) % 256;
        final g = (x * 2 + y * 5) % 256;
        final b = (255 - x * 3 + y).clamp(0, 255);
        image.setPixelRgb(x, y, r, g, b);
      }
    }
    sample = Uint8List.fromList(img.encodeJpg(image, quality: 95));
  });

  for (final filter in DocFilter.values) {
    test('${filter.name} produces decodable JPG output', () async {
      final output = await processor.process(
        bytes: sample,
        filter: filter,
        quality: 90,
      );

      final decoded = img.decodeJpg(output);
      expect(decoded, isNotNull);
      expect(decoded!.width, 48);
      expect(decoded.height, 48);
    });
  }

  test('lighten increases average luminance', () async {
    final original = img.decodeJpg(sample)!;
    final lightened = img.decodeJpg(
      await processor.process(bytes: sample, filter: DocFilter.lighten),
    )!;

    expect(
        _averageLuminance(lightened), greaterThan(_averageLuminance(original)));
  });

  test('blackWhite produces only black or white pixels', () async {
    final processed = img.decodeJpg(
      await processor.process(
        bytes: sample,
        filter: DocFilter.blackWhite,
        quality: 100,
      ),
    )!;

    final values = <int>{};
    for (final pixel in processed) {
      values.add(img.getLuminance(pixel).round());
    }
    expect(values.every((value) => value < 20 || value > 235), isTrue);
  });
}

double _averageLuminance(img.Image image) {
  var sum = 0.0;
  for (final pixel in image) {
    sum += img.getLuminance(pixel);
  }
  return sum / (image.width * image.height);
}

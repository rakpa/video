import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import 'package:doc_scanner/features/enhance/data/image_processor.dart';
import 'package:doc_scanner/features/enhance/domain/doc_filter.dart';

void main() {
  late ImageProcessor processor;
  late Uint8List sample;

  setUp(() {
    processor = ImageProcessor();
    final image = img.Image(width: 40, height: 40);
    for (var y = 0; y < 40; y++) {
      for (var x = 0; x < 40; x++) {
        final v = ((x + y) * 3) % 256;
        image.setPixelRgb(x, y, v, v ~/ 2, 255 - v);
      }
    }
    sample = Uint8List.fromList(img.encodeJpg(image));
  });

  test('grayscale filter changes pixel data', () async {
    final colorBytes = await processor.process(
      bytes: sample,
      filter: DocFilter.color,
      quality: 90,
    );
    final grayBytes = await processor.process(
      bytes: sample,
      filter: DocFilter.grayscale,
      quality: 90,
    );
    expect(grayBytes, isNot(equals(colorBytes)));
  });

  test('sharp filter produces different output than color', () async {
    final colorBytes = await processor.process(
      bytes: sample,
      filter: DocFilter.color,
      quality: 90,
    );
    final sharpBytes = await processor.process(
      bytes: sample,
      filter: DocFilter.magic,
      quality: 90,
    );
    expect(sharpBytes, isNot(equals(colorBytes)));
  });

  test('black and white filter produces different output', () async {
    final colorBytes = await processor.process(
      bytes: sample,
      filter: DocFilter.color,
      quality: 90,
    );
    final bwBytes = await processor.process(
      bytes: sample,
      filter: DocFilter.blackWhite,
      quality: 90,
    );
    expect(bwBytes, isNot(equals(colorBytes)));
  });
}

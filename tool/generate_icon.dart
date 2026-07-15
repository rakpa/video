// Generates the 1024x1024 app icon (assets/icon/app_icon.png).
//
// Draws the brand mark with the pure-Dart `image` package: solid purple
// background, white scan brackets, and a white document with purple text
// lines. iOS/Android mask the corners themselves, so the square is full-bleed.
//
// Run: dart run tool/generate_icon.dart
import 'dart:io';

import 'package:image/image.dart' as img;

void main() {
  const size = 1024;
  final icon = img.Image(width: size, height: size, numChannels: 4);

  final purple = img.ColorRgba8(0x6D, 0x28, 0xD9, 255); // brand purpleBright
  final white = img.ColorRgba8(255, 255, 255, 255);
  final purpleLine = img.ColorRgba8(0x5B, 0x21, 0xB6, 255); // brand purple
  final foldTint = img.ColorRgba8(0xE9, 0xE6, 0xFF, 255);

  img.fill(icon, color: purple);

  // --- Scan brackets: four L-shapes, stroke 56px, arm 190px, margin 148px ---
  const m = 148, arm = 190, t = 56;
  void bar(int x1, int y1, int x2, int y2) =>
      img.fillRect(icon, x1: x1, y1: y1, x2: x2, y2: y2, color: white, radius: 22);

  bar(m, m, m + arm, m + t); // top-left horizontal
  bar(m, m, m + t, m + arm); // top-left vertical
  bar(size - m - arm, m, size - m, m + t); // top-right horizontal
  bar(size - m - t, m, size - m, m + arm); // top-right vertical
  bar(m, size - m - t, m + arm, size - m); // bottom-left horizontal
  bar(m, size - m - arm, m + t, size - m); // bottom-left vertical
  bar(size - m - arm, size - m - t, size - m, size - m); // bottom-right horizontal
  bar(size - m - t, size - m - arm, size - m, size - m); // bottom-right vertical

  // --- Document: white card with a folded top-right corner ---
  const dl = 352, dt = 300, dr = 672, db = 724, fold = 96;
  img.fillRect(icon,
      x1: dl, y1: dt, x2: dr, y2: db, color: white, radius: 34);
  // Square off + tint the fold corner.
  img.fillRect(icon,
      x1: dr - fold, y1: dt, x2: dr, y2: dt + fold, color: foldTint);
  // Overdraw past the card edge so no white sliver survives rasterization.
  img.fillPolygon(icon,
      vertices: [
        img.Point(dr - fold, dt - 6),
        img.Point(dr + 6, dt - 6),
        img.Point(dr + 6, dt + fold),
      ],
      color: purple);

  // --- Purple text lines on the document ---
  void line(int y, int right) => img.fillRect(icon,
      x1: dl + 56, y1: y, x2: right, y2: y + 30, color: purpleLine, radius: 15);
  line(468, dr - 56);
  line(548, dr - 128);
  line(628, dr - 56);

  final out = File('assets/icon/app_icon.png')
    ..createSync(recursive: true)
    ..writeAsBytesSync(img.encodePng(icon));
  stdout.writeln('Wrote ${out.path} (${size}x$size)');
}

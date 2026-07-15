import 'dart:io';

import 'package:flutter/material.dart';

Widget buildScanThumbnail(String? path, {double? cacheWidth}) {
  if (path != null && File(path).existsSync()) {
    return Image.file(
      File(path),
      width: double.infinity,
      height: double.infinity,
      fit: BoxFit.cover,
      cacheWidth: cacheWidth?.round() ?? 320,
      gaplessPlayback: true,
      errorBuilder: (_, __, ___) => const _Placeholder(),
    );
  }
  return const _Placeholder();
}

class _Placeholder extends StatelessWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Icon(
        Icons.description_outlined,
        size: 32,
        color: Colors.grey.shade500,
      ),
    );
  }
}

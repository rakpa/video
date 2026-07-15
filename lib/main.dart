import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'shared/widgets/stitch/stitch_html_view.dart';

/// Entry point.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  ensureStitchWebViewInitialized();
  runApp(const ProviderScope(child: DocScannerApp()));
}

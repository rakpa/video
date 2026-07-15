import 'package:flutter/material.dart';

/// Stub — mobile/desktop uses WebView directly (see stitch_html_view.dart).
Future<String> registerStitchHtmlIframe(String html) async => '';

class StitchHtmlIframe extends StatelessWidget {
  const StitchHtmlIframe({super.key, required this.viewType});

  final String viewType;

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

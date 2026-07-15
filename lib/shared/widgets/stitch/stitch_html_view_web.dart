import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

var _iframeCounter = 0;

/// Registers an iframe platform view that renders Stitch HTML via srcdoc.
Future<String> registerStitchHtmlIframe(String html) async {
  final viewType = 'stitch-html-${_iframeCounter++}';
  ui_web.platformViewRegistry.registerViewFactory(
    viewType,
    (int _) {
      final iframe = web.HTMLIFrameElement()
        ..setAttribute('srcdoc', html)
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.display = 'block';
      return iframe;
    },
  );
  return viewType;
}

/// Flutter platform view wrapper for the Stitch iframe.
class StitchHtmlIframe extends StatelessWidget {
  const StitchHtmlIframe({super.key, required this.viewType});

  final String viewType;

  @override
  Widget build(BuildContext context) {
    return HtmlElementView(viewType: viewType);
  }
}

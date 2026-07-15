import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/design/stitch_assets.dart';
import 'stitch_html_patch.dart';

import 'stitch_html_view_web.dart'
    if (dart.library.io) 'stitch_html_view_stub.dart';

/// Renders original Stitch HTML (pixel-perfect) with optional tap hotspots.
class StitchHtmlView extends StatefulWidget {
  const StitchHtmlView({
    super.key,
    required this.htmlAsset,
    this.hotspots = const [],
    this.overlay,
    this.interactive = true,
    this.backgroundColor = Colors.black,
    this.onLoaded,
    this.hideDemoContent = false,
  });

  final String htmlAsset;
  final List<StitchHotspot> hotspots;
  final Widget? overlay;
  final bool interactive;
  final Color backgroundColor;
  final VoidCallback? onLoaded;
  final bool hideDemoContent;

  @override
  State<StitchHtmlView> createState() => _StitchHtmlViewState();
}

class _StitchHtmlViewState extends State<StitchHtmlView> {
  WebViewController? _controller;
  String? _webViewType;
  var _loading = true;
  String? _loadKey;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final mq = MediaQuery.of(context);
    final key = '${widget.htmlAsset}|${mq.size.width}|${mq.size.height}|'
        '${mq.padding.top}|${mq.padding.bottom}';
    if (_loadKey != key) {
      _loadKey = key;
      _loading = true;
      _init(mq.padding.top, mq.padding.bottom);
    }
  }

  @override
  void didUpdateWidget(covariant StitchHtmlView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.htmlAsset != widget.htmlAsset) {
      _loadKey = null;
      _loading = true;
    }
  }

  Future<void> _init(double topInset, double bottomInset) async {
    final raw = await rootBundle.loadString(widget.htmlAsset);
    final html = StitchHtmlPatch.forDevice(
      raw,
      topInset: topInset,
      bottomInset: bottomInset,
      hideDemoContent: widget.hideDemoContent,
    );
    if (!mounted || _loadKey == null) return;

    if (kIsWeb) {
      final viewType = await registerStitchHtmlIframe(html);
      if (!mounted) return;
      setState(() {
        _webViewType = viewType;
        _controller = null;
        _loading = false;
      });
      widget.onLoaded?.call();
      return;
    }

    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(widget.backgroundColor)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() => _loading = false);
            widget.onLoaded?.call();
          },
        ),
      );

    await controller.loadHtmlString(html);

    if (!mounted) return;
    setState(() {
      _controller = controller;
      _webViewType = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: widget.backgroundColor,
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            fit: StackFit.expand,
            children: [
              kIsWeb && _webViewType != null
                  ? StitchHtmlIframe(viewType: _webViewType!)
                  : _controller != null
                      ? IgnorePointer(
                          ignoring: !widget.interactive,
                          child: WebViewWidget(controller: _controller!),
                        )
                      : const SizedBox.shrink(),
              if (_loading)
                Center(
                  child: SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: widget.backgroundColor.computeLuminance() > 0.5
                          ? const Color(0xFF0040A1)
                          : Colors.white,
                    ),
                  ),
                ),
              if (widget.overlay != null)
                Positioned.fill(child: widget.overlay!),
              ...widget.hotspots.map((h) {
                return Positioned(
                  left: h.left * constraints.maxWidth,
                  top: h.top * constraints.maxHeight,
                  width: h.width * constraints.maxWidth,
                  height: h.height * constraints.maxHeight,
                  child: Semantics(
                    button: true,
                    label: h.semanticLabel,
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(onTap: h.onTap),
                    ),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }
}

void ensureStitchWebViewInitialized() {}

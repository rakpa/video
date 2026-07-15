import 'package:flutter/material.dart';

import '../../../core/design/stitch_assets.dart';

/// Renders a full Stitch PNG screenshot with optional percentage-based hotspots.
///
/// Images are exported at 2× (1560px wide) from Stitch HTML for sharp display.
class StitchFrame extends StatelessWidget {
  const StitchFrame({
    super.key,
    required this.asset,
    this.hotspots = const [],
    this.overlay,
    this.backgroundColor = Colors.black,
    this.fit = BoxFit.cover,
  });

  final String asset;
  final List<StitchHotspot> hotspots;
  final Widget? overlay;
  final Color backgroundColor;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: backgroundColor,
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            fit: StackFit.expand,
            children: [
              Positioned.fill(
                child: Image.asset(
                  asset,
                  fit: fit,
                  alignment: Alignment.center,
                  filterQuality: FilterQuality.high,
                  isAntiAlias: true,
                  gaplessPlayback: true,
                  errorBuilder: (context, error, stack) => Center(
                    child: Text(
                      'Missing: $asset',
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 12),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ),
              if (overlay != null) Positioned.fill(child: overlay!),
              ...hotspots.map((h) {
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

/// Phone-width container for web preview (780px Stitch canvas).
class StitchPhoneShell extends StatelessWidget {
  const StitchPhoneShell({
    super.key,
    required this.child,
    this.maxWidth = 390,
  });

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: AspectRatio(
          aspectRatio: 780 / 1768,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: child,
          ),
        ),
      ),
    );
  }
}

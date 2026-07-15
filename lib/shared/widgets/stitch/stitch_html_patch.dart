/// Patches Stitch HTML exports so they render correctly inside a phone WebView.
///
/// The build script locks pages to 780×1768px for desktop preview. That makes
/// Tailwind's `md:` breakpoint fire on real phones and shows the desktop sidebar
/// instead of the mobile layout.
abstract final class StitchHtmlPatch {
  static String forDevice(
    String html, {
    required double topInset,
    required double bottomInset,
    bool hideDemoContent = false,
  }) {
    var out = html;

    // Fix UTF-8 mojibake from Stitch exports (bullet middle dot).
    out = out.replaceAll('â€¢', ' · ');
    out = out.replaceAll('â€"', '—');

    out = out.replaceFirst(
      RegExp(r'<meta[^>]*name="viewport"[^>]*>', caseSensitive: false),
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, '
      'maximum-scale=1.0, user-scalable=no, viewport-fit=cover">',
    );

    out = out.replaceAll(
      RegExp(r'<style id="stitch-flutter-fit">[\s\S]*?</style>'),
      '',
    );

    final safeTop = topInset.ceil();
    final safeBottom = bottomInset.ceil();

    final deviceCss = '''
<style id="stitch-device-fit">
  html, body {
    width: 100% !important;
    min-height: 100% !important;
    max-height: none !important;
    height: auto !important;
    margin: 0 !important;
    overflow-x: hidden !important;
    -webkit-text-size-adjust: 100%;
  }
  body {
    padding-top: ${safeTop}px !important;
    padding-bottom: ${safeBottom}px !important;
    box-sizing: border-box !important;
  }
  header[class*="top-0"], header.sticky {
    top: 0 !important;
  }
  .h-screen, main.h-screen, [class*="h-screen"] {
    min-height: calc(100dvh - ${safeTop + safeBottom}px) !important;
    height: auto !important;
  }
  /* Force mobile layout even if Tailwind md: would match. */
  aside.hidden, aside[class*="md:flex"] {
    display: none !important;
  }
  nav[class*="md:hidden"], nav.fixed.bottom-0 {
    display: flex !important;
  }
  ${hideDemoContent ? '''
  /* Demo cards + HTML FAB — replaced by native Flutter widgets. */
  main .grid.grid-cols-2 {
    visibility: hidden !important;
    height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  button.fixed.bottom-24,
  button[class*="bottom-24"][class*="right-"] {
    display: none !important;
  }
  ''' : ''}
</style>''';

    if (out.contains('</head>')) {
      out = out.replaceFirst('</head>', '$deviceCss</head>');
    } else {
      out = '$deviceCss$out';
    }

    return out;
  }
}

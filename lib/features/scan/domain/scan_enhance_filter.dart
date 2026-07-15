import '../../enhance/domain/doc_filter.dart';

/// Quick enhancement presets shown after a page is captured in the scanner.
enum ScanEnhanceFilter {
  color('Color', DocFilter.color, 'Natural color'),
  lighten('Lighten', DocFilter.lighten, 'Bright page'),
  grayscale('Grayscale', DocFilter.grayscale, 'Neutral gray'),
  sharp('Sharp', DocFilter.magic, 'High contrast'),
  blackWhite('B&W', DocFilter.blackWhite, 'Clean text');

  const ScanEnhanceFilter(this.label, this.docFilter, this.hint);

  final String label;
  final DocFilter docFilter;
  final String hint;

  static const carousel = [
    ScanEnhanceFilter.color,
    ScanEnhanceFilter.lighten,
    ScanEnhanceFilter.grayscale,
    ScanEnhanceFilter.sharp,
    ScanEnhanceFilter.blackWhite,
  ];
}

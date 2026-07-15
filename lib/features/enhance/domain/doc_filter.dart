/// The set of enhancement filters offered in the editor.
///
/// Order here is the order shown in the filter strip.
enum DocFilter {
  original('Original'),
  auto('Auto'),
  magic('Magic Color'),
  lighten('Lighten'),
  grayscale('Grayscale'),
  blackWhite('B&W'),
  color('Color');

  const DocFilter(this.label);

  /// Human-readable name shown under each filter chip.
  final String label;
}

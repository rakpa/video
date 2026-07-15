class OcrResult {
  const OcrResult({required this.text});

  final String text;

  bool get isEmpty => text.trim().isEmpty;
}

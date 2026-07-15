import 'package:flutter/foundation.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import '../domain/ocr_result.dart';

class OcrService {
  OcrService({TextRecognizer? recognizer})
      : _recognizer =
            recognizer ?? TextRecognizer(script: TextRecognitionScript.latin);

  final TextRecognizer _recognizer;

  Future<OcrResult> recognizeText(String imagePath) async {
    if (kIsWeb) {
      throw UnsupportedError(
          'Text recognition is available in the installed app.');
    }
    final inputImage = InputImage.fromFilePath(imagePath);
    final recognized = await _recognizer.processImage(inputImage);
    return OcrResult(text: recognized.text.trim());
  }

  Future<void> dispose() => _recognizer.close();
}

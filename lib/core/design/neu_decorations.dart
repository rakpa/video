import 'package:flutter/material.dart';

/// Neumorphic shadows matching the Stitch Dashboard design.
abstract final class NeuDecorations {
  static List<BoxShadow> flat({Color? highlight, Color? shadow}) {
    return [
      BoxShadow(
        color: shadow ?? const Color(0x0D000000),
        offset: const Offset(4, 4),
        blurRadius: 8,
      ),
      BoxShadow(
        color: highlight ?? Colors.white,
        offset: const Offset(-4, -4),
        blurRadius: 8,
      ),
    ];
  }

  static List<BoxShadow> pressed({Color? highlight, Color? shadow}) {
    return [
      BoxShadow(
        color: shadow ?? const Color(0x0D000000),
        offset: const Offset(2, 2),
        blurRadius: 4,
        spreadRadius: -1,
      ),
      BoxShadow(
        color: highlight ?? Colors.white,
        offset: const Offset(-2, -2),
        blurRadius: 4,
        spreadRadius: -1,
      ),
    ];
  }

  static BoxDecoration card({
    required Color color,
    BorderRadius? borderRadius,
    bool pressed = false,
  }) {
    return BoxDecoration(
      color: color,
      borderRadius: borderRadius ?? BorderRadius.circular(12),
      boxShadow: pressed ? NeuDecorations.pressed() : NeuDecorations.flat(),
    );
  }
}

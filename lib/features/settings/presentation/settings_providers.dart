import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../enhance/domain/doc_filter.dart';
import '../../export/domain/export_options.dart';

const defaultFileNamePatternPrefsKey = 'pref_default_file_name_pattern';
const defaultFileNamePatternValue = 'Scan {date}';

/// User-facing app preferences persisted across launches.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier() : super(ThemeMode.system) {
    _load();
  }

  static const _key = 'pref_theme_mode';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final index = prefs.getInt(_key);
    if (index != null && index >= 0 && index < ThemeMode.values.length) {
      state = ThemeMode.values[index];
    }
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key, mode.index);
  }
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier();
});

/// Whether new scan sessions start with auto-capture enabled.
class AutoCaptureDefaultNotifier extends StateNotifier<bool> {
  AutoCaptureDefaultNotifier() : super(true) {
    _load();
  }

  static const _key = 'pref_auto_capture_default';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = prefs.getBool(_key) ?? true;
  }

  Future<void> set(bool enabled) async {
    state = enabled;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, enabled);
  }
}

final autoCaptureDefaultProvider =
    StateNotifierProvider<AutoCaptureDefaultNotifier, bool>((ref) {
  return AutoCaptureDefaultNotifier();
});

class DefaultFilterNotifier extends StateNotifier<DocFilter> {
  DefaultFilterNotifier() : super(DocFilter.color) {
    _load();
  }

  static const _key = 'pref_default_filter';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final index = prefs.getInt(_key);
    if (index != null && index >= 0 && index < DocFilter.values.length) {
      state = DocFilter.values[index];
    }
  }

  Future<void> set(DocFilter filter) async {
    state = filter;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key, filter.index);
  }
}

final defaultFilterProvider =
    StateNotifierProvider<DefaultFilterNotifier, DocFilter>((ref) {
  return DefaultFilterNotifier();
});

class DefaultPageSizeNotifier extends StateNotifier<ExportPageSize> {
  DefaultPageSizeNotifier() : super(ExportPageSize.a4) {
    _load();
  }

  static const _key = 'pref_default_page_size';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final index = prefs.getInt(_key);
    if (index != null && index >= 0 && index < ExportPageSize.values.length) {
      state = ExportPageSize.values[index];
    }
  }

  Future<void> set(ExportPageSize size) async {
    state = size;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key, size.index);
  }
}

final defaultPageSizeProvider =
    StateNotifierProvider<DefaultPageSizeNotifier, ExportPageSize>((ref) {
  return DefaultPageSizeNotifier();
});

class DefaultFileNamePatternNotifier extends StateNotifier<String> {
  DefaultFileNamePatternNotifier() : super(defaultFileNamePatternValue) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = prefs.getString(defaultFileNamePatternPrefsKey) ??
        defaultFileNamePatternValue;
  }

  Future<void> set(String pattern) async {
    final normalized =
        pattern.trim().isEmpty ? defaultFileNamePatternValue : pattern.trim();
    state = normalized;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(defaultFileNamePatternPrefsKey, normalized);
  }
}

final defaultFileNamePatternProvider =
    StateNotifierProvider<DefaultFileNamePatternNotifier, String>((ref) {
  return DefaultFileNamePatternNotifier();
});

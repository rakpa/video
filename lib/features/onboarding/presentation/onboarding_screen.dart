import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/onboarding_store.dart';

/// Onboarding — three native slides in the Stitch "Onboarding - Auto-Crop"
/// layout: illustration card, bold title, muted subtitle, pill dots, a
/// full-width primary "Next →" button, and Skip below it.
///
/// Native Flutter (not WebView) so every slide matches the design reliably.
class _Slide {
  const _Slide({required this.image, required this.title, required this.body});

  final String image;
  final String title;
  final String body;
}

const _slides = <_Slide>[
  _Slide(
    image: 'assets/images/onboarding_autocrop.png',
    title: 'Smart Auto-Crop',
    body: 'Automatically detects and crops your documents perfectly.',
  ),
  _Slide(
    image: 'assets/images/onboarding_crop.png',
    title: 'Perfect Perspective',
    body: 'Skewed pages are straightened into clean, flat scans.',
  ),
  _Slide(
    image: 'assets/images/onboarding_export.png',
    title: 'Export & Share',
    body: 'Turn scans into polished PDFs and share them in two taps.',
  ),
];

// Stitch onboarding palette.
const _primary = Color(0xFF0040A1);
const _onSurface = Color(0xFF1A1C1D);
const _muted = Color(0xFF424654);
const _dotIdle = Color(0xFFE2E2E4);

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  bool get _isLast => _index == _slides.length - 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_isLast) {
      _finishOnboarding();
    } else {
      _controller.nextPage(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    }
  }

  Future<void> _finishOnboarding() async {
    final store = await ref.read(onboardingStoreProvider.future);
    await store.markComplete();
    if (!mounted) return;
    context.go('/home');
  }

  Future<void> _skip() async {
    final store = await ref.read(onboardingStoreProvider.future);
    await store.markComplete();
    if (!mounted) return;
    context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            children: [
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemCount: _slides.length,
                  itemBuilder: (context, i) => _SlideView(slide: _slides[i]),
                ),
              ),
              const SizedBox(height: 8),
              _Dots(count: _slides.length, index: _index),
              const SizedBox(height: 28),
              _NextButton(
                label: _isLast ? 'Get Started' : 'Next',
                onPressed: _next,
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: _skip,
                child: const Text(
                  'Skip',
                  style: TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});
  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Illustration card — rounded, soft shadow, like the design export.
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.14),
                      blurRadius: 32,
                      offset: const Offset(0, 14),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Image.asset(slide.image, fit: BoxFit.contain),
                ),
              ),
            ),
          ),
        ),
        // Copy block.
        Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            children: [
              Text(
                slide.title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: _onSurface,
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 300),
                child: Text(
                  slide.body,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 15,
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _NextButton extends StatelessWidget {
  const _NextButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _primary,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed,
        child: SizedBox(
          height: 56,
          width: double.infinity,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.arrow_forward_rounded,
                  color: Colors.white, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pagination dots: idle 8px circles, active 24px pill in primary.
class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});
  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        final active = i == index;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          height: 8,
          width: active ? 24 : 8,
          decoration: BoxDecoration(
            color: active ? _primary : _dotIdle,
            borderRadius: BorderRadius.circular(4),
          ),
        );
      }),
    );
  }
}

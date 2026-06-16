import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface StitchHtmlPageProps {
  html: string;
  className?: string;
  onMount?: (root: HTMLDivElement) => void | (() => void);
}

export function StitchHtmlPage({ html, className = '', onMount }: StitchHtmlPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const actionable = target.closest<HTMLElement>('[data-route]');
      if (!actionable?.dataset.route) return;

      const route = actionable.dataset.route;
      if (route.startsWith('/#')) {
        const id = route.slice(2);
        const el = document.getElementById(id);
        if (el) {
          event.preventDefault();
          el.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      }

      event.preventDefault();
      navigate(route);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const actionable = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-route]');
      if (!actionable?.dataset.route) return;
      event.preventDefault();
      const route = actionable.dataset.route;
      if (route.startsWith('/#')) {
        document.getElementById(route.slice(2))?.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate(route);
      }
    };

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeyDown);

    const nav = root.querySelector<HTMLElement>('#top-nav');
    const onScroll = () => {
      if (!nav) return;
      if (window.scrollY > 10) {
        nav.classList.add('shadow-md');
        nav.classList.replace('bg-surface/80', 'bg-surface/95');
      } else {
        nav.classList.remove('shadow-md');
        nav.classList.replace('bg-surface/95', 'bg-surface/80');
      }
    };
    window.addEventListener('scroll', onScroll);

    const cleanupMount = onMount?.(root);

    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll);
      cleanupMount?.();
    };
  }, [html, navigate, onMount]);

  return (
    <div
      ref={containerRef}
      className={`stitch-page ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

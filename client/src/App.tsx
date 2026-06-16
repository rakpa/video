import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { StaticPage } from './pages/StaticPage';
import { DetailPage } from './pages/DetailPage';
import { PricingPage } from './pages/PricingPage';
import { legacyLegalRedirects, staticRoutePaths } from './routing/routeMap';

function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '');
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [pathname, hash]);
  return null;
}

function LegacyRedirect({ from }: { from: string }) {
  const target = legacyLegalRedirects[from];
  return <Navigate to={target ?? '/'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToHash />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        {staticRoutePaths.map((path) => (
          <Route key={path} path={path} element={<StaticPage path={path} showContactForm={path === '/contact'} />} />
        ))}
        <Route path="/how-it-works/:slug" element={<DetailPage />} />
        {Object.keys(legacyLegalRedirects).map((from) => (
          <Route key={from} path={from} element={<LegacyRedirect from={from} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

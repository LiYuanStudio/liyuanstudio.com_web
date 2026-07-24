import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NewsDetailPage } from '../pages/NewsDetailPage.js';
import { SkipLink } from '../components/SkipLink.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkipLink />
    <NewsDetailPage />
  </StrictMode>,
);

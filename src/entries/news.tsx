import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NewsDetailPage } from '../pages/NewsDetailPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NewsDetailPage />
  </StrictMode>,
);

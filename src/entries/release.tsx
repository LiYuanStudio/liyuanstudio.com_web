import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkipLink } from '../components/SkipLink.js';
import { ReleasePage } from '../pages/ReleasePage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkipLink />
    <ReleasePage />
  </StrictMode>,
);

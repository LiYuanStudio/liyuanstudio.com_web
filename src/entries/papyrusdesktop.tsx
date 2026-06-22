import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PapyrusDesktopPage } from '../pages/PapyrusDesktopPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PapyrusDesktopPage />
  </StrictMode>,
);

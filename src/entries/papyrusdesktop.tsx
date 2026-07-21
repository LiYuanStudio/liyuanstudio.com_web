import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../context/AuthContext.js';
import { PapyrusDesktopPage } from '../pages/PapyrusDesktopPage.js';
import { SkipLink } from '../components/SkipLink.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SkipLink />
      <PapyrusDesktopPage />
    </AuthProvider>
  </StrictMode>,
);

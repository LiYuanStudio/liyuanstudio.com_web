import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../context/AuthContext.js';
import { LoginPage } from '../pages/LoginPage.js';
import { SkipLink } from '../components/SkipLink.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SkipLink />
      <LoginPage />
    </AuthProvider>
  </StrictMode>,
);

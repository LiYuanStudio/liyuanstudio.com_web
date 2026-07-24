import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../context/AuthContext.js';
import { ProfilePage } from '../pages/ProfilePage.js';
import { SkipLink } from '../components/SkipLink.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SkipLink />
      <ProfilePage />
    </AuthProvider>
  </StrictMode>,
);

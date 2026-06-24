import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../context/AuthContext.js';
import { RegisterPage } from '../pages/RegisterPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RegisterPage />
    </AuthProvider>
  </StrictMode>,
);

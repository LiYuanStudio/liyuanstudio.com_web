import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VerifyEmailPage } from '../pages/VerifyEmailPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VerifyEmailPage />
  </StrictMode>,
);

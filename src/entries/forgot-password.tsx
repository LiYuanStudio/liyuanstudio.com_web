import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage.js';
import { SkipLink } from '../components/SkipLink.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkipLink />
    <ForgotPasswordPage />
  </StrictMode>,
);

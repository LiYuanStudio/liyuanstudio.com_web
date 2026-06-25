import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ForgotPasswordPage />
  </StrictMode>,
);

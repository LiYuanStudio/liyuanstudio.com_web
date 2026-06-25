import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ResetPasswordPage } from '../pages/ResetPasswordPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ResetPasswordPage />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../context/AuthContext.js';
import { BlogPage } from '../pages/BlogPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BlogPage />
    </AuthProvider>
  </StrictMode>,
);

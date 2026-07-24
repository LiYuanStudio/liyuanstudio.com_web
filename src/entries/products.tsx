import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkipLink } from '../components/SkipLink.js';
import { ProductsPage } from '../pages/ProductsPage.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkipLink />
    <ProductsPage />
  </StrictMode>,
);

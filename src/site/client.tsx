import { hydrateRoot } from 'react-dom/client';
import { SitePage } from './SitePage.js';
import type { StaticSiteState } from './context.js';

const root = document.getElementById('root');
const data = document.getElementById('site-data');
if (root && data?.textContent) {
  const state = JSON.parse(data.textContent) as StaticSiteState;
  hydrateRoot(root, <SitePage state={state} />);
}

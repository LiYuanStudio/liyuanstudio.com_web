import { renderToString } from 'react-dom/server';
import { SitePage } from './SitePage.js';
import { getSitePages } from './pages.js';
import { parsePublicContent } from '../../server/src/lib/public-content.js';

export function renderSite(snapshot: unknown) {
  return getSitePages(parsePublicContent(snapshot)).map((page) => ({
    ...page,
    html: renderToString(<SitePage state={page.state} />),
  }));
}

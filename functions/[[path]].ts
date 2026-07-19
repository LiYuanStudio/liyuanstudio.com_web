import {
  getCanonicalProfileContentPath,
  matchProfileContentPath,
} from '../src/lib/profile-path.js';
import { proxyApiRequest } from '../src/lib/api-proxy.js';
import {
  getNewsContentPath,
  matchNewsContentPath,
} from '../src/lib/news-path.js';

type AssetFetcher = {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
};

export type PagesRoutingContext = {
  request: Request;
  env: {
    ASSETS: AssetFetcher;
    API_UPSTREAM_ORIGIN: string;
  };
  next(): Promise<Response>;
};

function isPageRequest(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

export async function onRequest(context: PagesRoutingContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
    return proxyApiRequest(context.request, context.env.API_UPSTREAM_ORIGIN);
  }

  if (!isPageRequest(context.request.method)) {
    return context.next();
  }

  const assetResponse = await context.next();
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const newsSlug = matchNewsContentPath(requestUrl.pathname);
  if (newsSlug) {
    const canonicalPath = getNewsContentPath(newsSlug);
    if (requestUrl.pathname !== canonicalPath) {
      requestUrl.pathname = canonicalPath;
      return Response.redirect(requestUrl.toString(), 301);
    }

    const newsUrl = new URL('/news/', requestUrl);
    newsUrl.search = '';
    return context.env.ASSETS.fetch(new Request(newsUrl, {
      method: context.request.method,
      headers: context.request.headers,
    }));
  }

  const route = matchProfileContentPath(requestUrl.pathname);
  if (!route) {
    return assetResponse;
  }

  const canonicalPath = getCanonicalProfileContentPath(route);
  if (requestUrl.pathname !== canonicalPath) {
    requestUrl.pathname = canonicalPath;
    return Response.redirect(requestUrl.toString(), 301);
  }

  const profileUrl = new URL('/profile/', requestUrl);
  profileUrl.search = '';
  return context.env.ASSETS.fetch(new Request(profileUrl, {
    method: context.request.method,
    headers: context.request.headers,
  }));
}

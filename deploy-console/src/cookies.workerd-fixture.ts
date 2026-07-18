import {
  SITE_CSRF_COOKIE,
  SITE_SESSION_COOKIE,
  cookieName,
  filterAllowedSiteSetCookies,
  getSetCookieHeaderValues,
  siteCookieNames,
} from './cookies.js';

const SESSION_SET_COOKIE = `${SITE_SESSION_COOKIE}=workerd-session; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
const CSRF_SET_COOKIE = `${SITE_CSRF_COOKIE}=workerd-csrf; Path=/; Secure; SameSite=Lax; Max-Age=604800`;

export default {
  fetch(): Response {
    const upstreamHeaders = new Headers({ 'Content-Type': 'application/json' });
    upstreamHeaders.append('Set-Cookie', SESSION_SET_COOKIE);
    upstreamHeaders.append('Set-Cookie', CSRF_SET_COOKIE);
    upstreamHeaders.append('Set-Cookie', 'untrusted_cookie=workerd-secret; Path=/; Secure');
    const upstreamResponse = new Response('upstream', { headers: upstreamHeaders });
    const upstreamSetCookies = getSetCookieHeaderValues(upstreamResponse.headers);
    const forwardedSetCookies = filterAllowedSiteSetCookies(upstreamSetCookies);
    const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
    for (const cookie of forwardedSetCookies) responseHeaders.append('Set-Cookie', cookie);

    return new Response(JSON.stringify({
      upstreamSetCookieNames: upstreamSetCookies
        .map(cookieName)
        .filter((name): name is string => Boolean(name)),
      forwardedSetCookieNames: siteCookieNames(forwardedSetCookies),
    }), {
      headers: responseHeaders,
    });
  },
};
